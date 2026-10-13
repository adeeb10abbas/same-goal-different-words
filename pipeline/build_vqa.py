"""Backbone instruction-understanding data (paper Section 4 and Appendix F).

Called from build_data.py. Returns two parts:
  study    compact numbers rendered server-side (contrasts, controls, error classes, C2, token sizes)
  public   site/public/data/vqa.json for the interactive console (exact prompts, schemas, every
           answer with its exact output tokens), fetched lazily by the browser

Sources (pipeline/sources/):
  vqa_b2_items.csv        scored B2/PB2 items (r2-final analysis_original/b2_items.csv)
  vqa_metrics_long.csv    released metrics with bootstrap intervals (analysis_original/metrics_long_v2.csv)
  vqa_c2_items.csv        scored C2 items (analysis_original/c2_items.csv)
  vqa_c2_truth_pairs.csv  same-start same-goal pairs whose label changes (analysis_original/c2_truth_pairs.csv)
  vqa_prompts.json        exact templates, schemas, instructions, image hashes (cluster/extract_vqa.py)
  vqa_tokens.json         exact output tokens of every delivered response (cluster/extract_vqa_tokens.py)
  vqa_c2_frames.json      saved-rollout frames shown with the C2 pairs (cluster/extract_c2_frames.py)

Every point estimate is recomputed from the item table and must equal the released metric; every
number the paper reports is then checked against the paper.
"""
from __future__ import annotations

import csv
import json
import statistics
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

FORM_CODE = {"DIR": "D", "TF": "S", "RF": "I"}
CONTRASTS = {  # released metric family -> (image condition, comparison condition)
    "image_I_minus_T": ("I", "T"),
    "image_IH_minus_H": ("IH", "H"),
    "header_IH_minus_I": ("IH", "I"),
}
ERROR_GROUPS = {  # item error_class -> displayed class
    "correct": "correct",
    "converse_relation": "reversed",
    "target_reference_swapped+converse_relation": "swappedReversed",
    "target_reference_swapped": "swapped",
    "target_reference_swapped+other_relation": "other",
    "other_relation": "other",
    "support_label_swap": "support",
    "object_error+support_label_swap": "other",
}


def _metrics(path: Path) -> dict:
    out = {}
    with open(path) as fh:
        for r in csv.DictReader(fh):
            if r["estimate"] == "":
                continue
            out[r["metric"]] = (float(r["estimate"]), float(r["ci_low"]), float(r["ci_high"]))
    return out


def _pp(x: float) -> float:
    return round(100 * x, 1)


def build(check, items: list[dict], src: Path, models: list[dict]):
    lane_of = {m["id"]: m["vqa"] for m in models}
    model_of = {m["vqa"]: m["id"] for m in models}
    prompts = json.loads((src / "vqa_prompts.json").read_text())
    tokens = json.loads((src / "vqa_tokens.json").read_text())
    frames = json.loads((src / "vqa_c2_frames.json").read_text())
    met = _metrics(src / "vqa_metrics_long.csv")

    # ---- per-item correctness, keyed for the contrasts
    ok_text = {}  # (m, cond, pid) -> 0/1         (T, H)
    ok_img = defaultdict(dict)  # (m, cond, pid) -> {start: 0/1}   (I, IH)
    place = {}  # (m, 'T', pid) -> ok ; (m, 'IH', pid) -> {start: ok}
    for it in items:
        m, ok = model_of[it["lane"]], float(it["tuple"])
        if it["family"] == "original":
            if it["condition"] in ("T", "H"):
                ok_text[(m, it["condition"], it["prompt_id"])] = ok
            else:
                ok_img[(m, it["condition"], it["prompt_id"])][it["start"]] = ok
        elif it["condition"] == "T":
            place[(m, "T", it["prompt_id"])] = ok
        else:
            place.setdefault((m, "IH", it["prompt_id"]), {})[it["start"]] = ok

    def balanced(per_goal: dict[str, list[float]]) -> float:
        """per_goal: pid -> per-start values. Mean over starts, then goals within scene, then scenes."""
        by_scene = defaultdict(list)
        for pid, vals in per_goal.items():
            by_scene[pid.split("-")[0]].append(float(np.mean(vals)))
        return float(np.mean([np.mean(v) for v in by_scene.values()]))

    pids = sorted(prompts["prompts"])

    # ---- image-versus-text contrasts (Appendix F, "Interpretation errors and the effect of images")
    contrasts = {}
    for m in lane_of:
        contrasts[m] = {}
        for fam, (a, b) in CONTRASTS.items():
            contrasts[m][fam] = {}
            for form, code in FORM_CODE.items():
                per_goal = {}
                for pid in pids:
                    if not pid.endswith("-" + code):
                        continue
                    img = ok_img[(m, a, pid)]
                    if b in ("T", "H"):
                        per_goal[pid] = [v - ok_text[(m, b, pid)] for v in img.values()]
                    else:
                        other = ok_img[(m, b, pid)]
                        per_goal[pid] = [img[s] - other[s] for s in img]
                est = balanced(per_goal)
                rel = met[f"lanes/{lane_of[m]}/b2_contrasts/{fam}/all_goals/tuple_{form}"]
                check.eq(f"VQA contrast {m} {fam} {form} recomputed", round(est, 9), round(rel[0], 9))
                contrasts[m][fam][form] = {"est": _pp(est), "ci": [_pp(rel[1]), _pp(rel[2])]}
    paper = {"image_IH_minus_H": (-10.1, [-14.6, -5.2]), "image_I_minus_T": (-6.9, [-12.5, -1.4]),
             "header_IH_minus_I": (-3.1, [-8.0, 1.7])}
    for fam, (est, ci) in paper.items():
        got = contrasts["N3"][fam]["RF"]
        check.eq(f"Nano RF {fam}", (got["est"], got["ci"]), (est, ci))
    for fam in CONTRASTS:
        for form in ("DIR", "TF"):
            check.eq(f"Nano {form} {fam} is zero", contrasts["N3"][fam][form]["est"], 0.0)
    check.eq("camera descriptions alone change no Nano answers",
             all(ok_text[("N3", "T", p)] == ok_text[("N3", "H", p)] for p in pids), True)

    # ---- reference-clause placement controls
    placement = {}
    for m in lane_of:
        txt = {pos: int(sum(v for (mm, c, pid), v in place.items() if mm == m and c == "T" and pid.endswith(pos)))
               for pos in ("reference_early", "reference_late")}
        img = {pos: balanced({pid: list(v.values()) for (mm, c, pid), v in place.items()
                              if mm == m and c == "IH" and pid.endswith(pos)})
               for pos in ("reference_early", "reference_late")}
        both = balanced({pid: list(v.values()) for (mm, c, pid), v in place.items() if mm == m and c == "IH"})
        gap = met[f"lanes/{lane_of[m]}/b2_placement_image/all_goals/gap_reference_early_minus_reference_late"]
        check.eq(f"placement gap {m} recomputed", round(img["reference_early"] - img["reference_late"], 9),
                 round(gap[0], 9))
        placement[m] = {"textEarly": txt["reference_early"], "textLate": txt["reference_late"],
                        "images": _pp(both), "imagesEarly": _pp(img["reference_early"]),
                        "imagesLate": _pp(img["reference_late"]),
                        "gap": {"est": _pp(gap[0]), "ci": [_pp(gap[1]), _pp(gap[2])]}}
    check.eq("placement text (out of 16)", [placement[m]["textEarly"] + placement[m]["textLate"] for m in lane_of],
             [16, 13, 16])
    check.eq("Edge placement text early/late", (placement["E3"]["textEarly"], placement["E3"]["textLate"]), (5, 8))
    check.eq("placement images", [placement[m]["images"] for m in lane_of], [100.0, 50.5, 100.0])
    check.eq("Edge early-late gap", (placement["E3"]["gap"]["est"], placement["E3"]["gap"]["ci"]),
             (-17.7, [-25.0, -10.4]))

    # ---- how answers go wrong (original family)
    errors = {}
    for it in items:
        if it["family"] != "original":
            continue
        m = model_of[it["lane"]]
        e = errors.setdefault(m, {}).setdefault(it["condition"], {}).setdefault(it["form"], Counter())
        e[ERROR_GROUPS[it["error_class"]]] += 1
    errors = {m: {c: {f: dict(v) for f, v in fv.items()} for c, fv in cv.items()} for m, cv in errors.items()}
    check.eq("FLUX text RF reversed", errors["F3"]["T"]["RF"].get("reversed"), 6)
    check.eq("Nano IH reversals", sum(errors["N3"]["IH"][f].get("reversed", 0) for f in FORM_CODE), 8)
    check.eq("Nano I reversals + support", (errors["N3"]["I"]["RF"].get("reversed"), errors["N3"]["I"]["RF"].get("support")),
             (4, 1))
    nano_ih = Counter((it["scene"], it["goal"]) for it in items
                      if it["lane"] == "N3-policy" and it["family"] == "original" and it["condition"] == "IH"
                      and it["tuple"] != "1.0")
    check.eq("Nano IH reversal goals", dict(nano_ih), {("S3", "R"): 5, ("S1", "B"): 3})

    # ---- judging the visible arrangement (C2)
    with open(src / "vqa_c2_items.csv") as fh:
        c2rows = list(csv.DictReader(fh))
    c2 = {}
    for m in lane_of:
        lane = lane_of[m]
        rec = {}
        for bank in ("initial", "secondary"):
            base = f"lanes/{lane}/c2/original/{bank}/balanced_accuracy_all_forms/"
            ans = Counter()
            ans_ok = Counter()
            for r in c2rows:
                if r["lane"] == lane and r["bank"] == bank:
                    ans[r["answer_o0"]] += 1
                    ans[r["answer_o1"]] += 1
                    if r["answerable"] == "True":
                        ans_ok[r["answer_o0"]] += 1
                        ans_ok[r["answer_o1"]] += 1
            rec[bank] = {k: {"est": _pp(met[base + k][0]), "ci": [_pp(met[base + k][1]), _pp(met[base + k][2])]}
                         for k in ("balanced_accuracy", "recall_match", "recall_nonmatch")}
            rec[bank]["answers"] = {k: ans.get(k, 0) for k in ("match", "nonmatch", "unknown")}
            # Answers to answerable items only (both code orders), and how many of those items truly show the relation.
            rec[bank]["answersAnswerable"] = {k: ans_ok.get(k, 0) for k in ("match", "nonmatch", "unknown")}
            rec[bank]["items"] = sum(1 for r in c2rows if r["lane"] == lane and r["bank"] == bank)
            rec[bank]["answerable"] = sum(1 for r in c2rows if r["lane"] == lane and r["bank"] == bank
                                          and r["answerable"] == "True")
            rec[bank]["goldMatch"] = sum(1 for r in c2rows if r["lane"] == lane and r["bank"] == bank
                                         and r["answerable"] == "True" and r["gold"] == "match")
        mapping = {f"{b}|{o}": prompts["c2"][f"{b}|{o}"]["mapping"] for b in ("initial", "secondary") for o in (0, 1)}
        noimg = Counter()
        for q, (_p, _o, kind, i) in tokens[lane]["items"].items():
            if kind == "C2" and ".no_image." in q:
                order = int(q.split(".")[2][1])
                letter = "".join(tokens[lane]["seqs"][i]).replace("<|im_end|>", "")
                noimg[mapping[f"initial|{order}"][letter]] += 1
        rec["noImage"] = {k: noimg.get(k, 0) for k in ("match", "nonmatch", "unknown")}
        c2[m] = rec
    bas = [c2[m][b]["balanced_accuracy"]["est"] for m in lane_of for b in ("initial", "secondary")]
    check.eq("C2 balanced accuracy range", (min(bas), max(bas)), (48.5, 50.1))
    check.eq("C2 answerable items that show the relation",
             [(c2[m]["initial"]["goldMatch"], c2[m]["secondary"]["goldMatch"]) for m in lane_of], [(66, 90)] * 3)
    check.eq("C2 no-image prompts per component", [sum(c2[m]["noImage"].values()) for m in lane_of], [60, 60, 60])

    with open(src / "vqa_c2_truth_pairs.csv") as fh:
        tp = list(csv.DictReader(fh))
    key_of = {(r["lane"], r["frame"], r["prompt_id"]): r for r in c2rows}
    pairs = {}
    for r in tp:
        k = (r["scene"], r["goal"], r["start"])
        p = pairs.setdefault(k, {"scene": r["scene"], "goal": r["goal"], "start": r["start"],
                                 "match": r["match_frame"], "nonmatch": r["nonmatch_frame"], "lanes": {}})
        assert (p["match"], p["nonmatch"]) == (r["match_frame"], r["nonmatch_frame"])
        m = model_of[r["lane"]]
        per = {}
        for form, code in FORM_CODE.items():
            pid = f"{r['scene']}-{r['goal']}-{code}"
            fm = key_of[(r["lane"], r["match_frame"], pid)]
            fn = key_of[(r["lane"], r["nonmatch_frame"], pid)]
            assert fm["gold"] == "match" and fn["gold"] == "nonmatch", (r, pid)
            both = int(float(r[f"both_correct_{form}"]))
            check.eq(f"pair {k} {m} {form} both", both, int(float(fm["correct"]) == 1.0 and float(fn["correct"]) == 1.0))
            per[form] = {"match": [fm["answer_o0"], fm["answer_o1"]], "nonmatch": [fn["answer_o0"], fn["answer_o1"]],
                         "both": both}
        p["lanes"][m] = per
    pairs = sorted(pairs.values(), key=lambda p: (p["scene"], p["goal"], p["start"]))
    check.eq("C2 changing-relation pairs", len(pairs), 11)
    best = max(sum(p["lanes"][m][f]["both"] for p in pairs) for m in lane_of for f in FORM_CODE)
    check.eq("at most one pair correct on both frames", best, 1)
    for p in pairs:
        for fr in (p["match"], p["nonmatch"]):
            if "secondary" in fr:
                assert fr in frames, fr

    # ---- prompt and answer sizes (tokens)
    size = {}
    for m in lane_of:
        per = defaultdict(list)
        out = defaultdict(list)
        for q, (pt, ot, kind, _i) in tokens[lane_of[m]]["items"].items():
            if q.startswith("B2."):
                per[q.split(".")[1]].append(pt)
                out[q.split(".")[1]].append(ot)
            elif q.startswith("C2."):
                per["C2" + {"initial": "Initial", "secondary": "Secondary", "no_image": "NoImage"}[q.split(".")[1]]].append(pt)
        size[m] = {c: {"prompt": statistics.median(v), "min": min(v), "max": max(v)} for c, v in per.items()}
        size[m]["answerTokens"] = statistics.median([x for v in out.values() for x in v])
    check.eq("B2 delivered per component", [sum(1 for q in tokens[lane_of[m]]["items"] if "B2." in q) for m in lane_of],
             [684, 684, 684])

    study = {"contrasts": contrasts, "placement": placement, "errors": errors,
             "c2": c2, "pairs": pairs, "tokens": size}

    # ---- public console data: exact prompts and every answer with its exact output tokens
    err_of = {(it["lane"], it["query_id"]): it["error_class"] for it in items}
    lanes = {}
    for m in lane_of:
        t = tokens[lane_of[m]]
        b2, c2q = {}, {}
        for q, (pt, _ot, kind, i) in t["items"].items():
            if kind == "B2":
                b2[q] = [pt, i, err_of[(lane_of[m], q)]]
            else:
                parts = q.split(".")
                frame = parts[3] if len(parts) > 4 else None
                if frame is None or "initial" in frame or frame in frames:
                    c2q[q] = [pt, i]
        check.eq(f"{m} B2 answers scored", len(b2), 684)
        lanes[m] = {"processor": next(iter(t["processors"])), "tokenizer": t["tokenizer"], "seqs": t["seqs"],
                    "multiSplit": t["multiSplit"], "b2": b2, "c2": c2q}
    c2_items = {}
    for r in c2rows:
        if r["lane"] != "N3-policy":
            continue
        if "initial" in r["frame"] or r["frame"] in frames:
            c2_items[r["item_key"]] = {"gold": r["gold"], "answerable": r["answerable"] == "True",
                                       "excluded": r["exclusion_reason"] or None, "t": float(r["observed_time_s"])}
    sample = prompts["responseSample"]["effective_decoding"]
    public = {
        "templates": prompts["templates"], "c2": prompts["c2"], "schemas": prompts["schemas"],
        "prompts": prompts["prompts"], "placement": prompts["placement"],
        "images": {k: v["size"] for k, v in prompts["images"].items()},
        "frames": {k: {"episode": v["episode"], "t": v["observed_s"], "size": v["size"]} for k, v in frames.items()},
        "c2Items": c2_items,
        "decoding": {"greedy": sample["greedy"], "temperature": sample["temperature"], "maxTokens": sample["max_tokens"],
                     "thinking": sample["chat_template_kwargs"]["enable_thinking"],
                     "backend": sample["structured_outputs"]["backend"]},
        "lanes": lanes,
    }
    return study, public
