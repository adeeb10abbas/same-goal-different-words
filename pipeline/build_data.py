#!/usr/bin/env python3
"""Build the website's compact data files from the study's public artifacts.

usage:
  python pipeline/build_data.py --paper-repo <checkout of world-action-model-steerability at 9a6fcde> \
      --vqa-items pipeline/sources/vqa_b2_items.csv --out site

Reads the released evaluation artifacts (paper repository, commit 9a6fcde) and
the instruction-understanding item table, then writes:
  site/src/data/study.json      everything the narrative figures need
  site/public/data/episodes.json  one compact record per rollout (explorer)
  site/public/data/vqa.json     exact backbone prompts and output tokens (language console; see build_vqa.py)

Every statistic quoted on the site is recomputed here with the paper's
estimators and seeds, and checked against the submitted paper. Any mismatch
aborts the build.
"""
from __future__ import annotations

import argparse
import csv
import glob
import json
import os
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

ART = "artifacts/robolab_workshop_20260926"
SEED_BOOT = 8401
SEED_FLIP = 8402

MODELS = [
    {"id": "N3", "short": "Nano", "name": "Cosmos3 Nano", "lm": "Qwen3-VL-8B-Instruct", "vqa": "N3-policy"},
    {"id": "E3", "short": "Edge", "name": "Cosmos3 Edge", "lm": "Cosmos3-Edge reasoner", "vqa": "E3-policy"},
    {"id": "F3", "short": "FLUX", "name": "FLUX 3 Action", "lm": "Qwen3-VL-4B-Instruct", "vqa": "F3-qwen3vl4b"},
]
FORMS = [
    {"id": "D", "short": "DIR", "name": "Direct"},
    {"id": "S", "short": "TF", "name": "Target-first"},
    {"id": "I", "short": "RF", "name": "Reference-first"},
]
SCENES = {
    "S1": {"short": "Cube", "title": "Cube, bowl and banana", "seconds": 30},
    "S3": {"short": "Butter", "title": "Butter box and raisin box", "seconds": 40},
    "S4": {"short": "Mustard", "title": "Mustard bottle and raisin box", "seconds": 40},
    "S5": {"short": "Bowls", "title": "Two bowls", "seconds": 20},
}
GOAL_SHORT = {
    ("S1", "L"): "cube-left", ("S1", "R"): "cube-right", ("S1", "F"): "cube-front", ("S1", "B"): "cube-behind",
    ("S3", "TOP"): "butter-on", ("S3", "L"): "butter-left", ("S3", "R"): "butter-right",
    ("S4", "TOP"): "mustard-on", ("S4", "L"): "mustard-left", ("S4", "R"): "mustard-right",
    ("S5", "LR"): "left-bowl-on-right", ("S5", "RL"): "right-bowl-on-left",
}
OBJECT_NAMES = {
    "rubiks_cube": "Rubik's cube", "bowl": "bowl", "banana": "banana", "butter": "butter box",
    "raisin_box": "raisin box", "mustard_bottle": "mustard bottle", "bowl_1": "right bowl", "bowl_2": "left bowl",
}

# Submitted paper (rev_with_vqa.tex), appendix count tables: goal -> {form: (any-time, end)} per model.
PAPER_COUNTS = {
    "N3": {"S1-L": "8/2 6/3 0/0", "S1-R": "8/3 8/2 8/0", "S1-F": "1/1 1/1 0/0", "S1-B": "0/0 0/0 7/6",
           "S3-TOP": "6/5 6/5 2/1", "S3-L": "0/0 0/0 0/0", "S3-R": "8/5 8/4 8/6", "S4-TOP": "5/5 6/5 4/2",
           "S4-L": "8/5 8/5 8/0", "S4-R": "7/3 8/6 0/0", "S5-LR": "0/0 0/0 0/0", "S5-RL": "1/1 1/1 1/0"},
    "E3": {"S1-L": "3/1 2/1 0/0", "S1-R": "8/4 8/3 8/0", "S1-F": "0/0 1/0 0/0", "S1-B": "1/0 0/0 0/0",
           "S3-TOP": "3/2 0/0 0/0", "S3-L": "0/0 0/0 0/0", "S3-R": "8/5 8/3 8/7", "S4-TOP": "0/0 0/0 0/0",
           "S4-L": "8/3 8/4 8/3", "S4-R": "4/3 4/4 0/0", "S5-LR": "0/0 0/0 0/0", "S5-RL": "2/1 1/1 0/0"},
    "F3": {"S1-L": "1/0 0/0 4/3", "S1-R": "8/2 8/2 8/8", "S1-F": "0/0 0/0 0/0", "S1-B": "2/0 1/0 0/0",
           "S3-TOP": "2/2 0/0 0/0", "S3-L": "0/0 0/0 0/0", "S3-R": "8/4 8/6 8/3", "S4-TOP": "7/2 5/2 6/2",
           "S4-L": "8/6 8/4 8/0", "S4-R": "8/8 8/3 2/0", "S5-LR": "7/6 8/5 1/1", "S5-RL": "6/0 4/0 4/0"},
}

# Tables reported in the submitted paper that are not recomputable from the public artifacts.
# Goals already satisfied in all eight saved starting states (identified from the saved physical states).
INITIALLY_TRUE = {"S1-R", "S3-R", "S4-L"}


def is_init(r: dict) -> bool:
    return f"{r['scene_id']}-{r['goal_id']}" in INITIALLY_TRUE


FORECAST_AGREEMENT = [  # Table: agreement between the two independent video annotators (864 forecasts)
    ["Moving object", 59.1, 0.398], ["Motion direction", 48.6, 0.108], ["Final spatial relation", 20.1, 0.077],
    ["Comparison object", 33.3, 0.111], ["Possible release", 93.4, 0.026], ["Missing object", 97.7, 0.000],
    ["Hallucinated object", 98.5, 0.231],
]
FORECAST_UTILITY = [  # Table: held-out Brier error for predicting detected manipulation errors
    {"model": "All", "events": 47, "n": 864, "baseline": 0.04012, "video": 0.04085, "delta": -0.00073},
    {"model": "N3", "events": 15, "n": 288, "baseline": 0.04012, "video": 0.04151, "delta": -0.00139},
    {"model": "E3", "events": 8, "n": 288, "baseline": 0.02491, "video": 0.02530, "delta": -0.00040},
    {"model": "F3", "events": 24, "n": 288, "baseline": 0.06210, "video": 0.06104, "delta": +0.00106},
]
FORECAST_UTILITY_CI = [-0.00177, 0.00016]

# Appendix B, "Inference settings used for the three evaluated policies" (reported configuration).
SETTINGS = {
    "rows": [
        ["Arithmetic", "bfloat16", "bfloat16", "bfloat16"],
        ["Sampling steps", "4", "4", "4"],
        ["Sampler", "UniPC", "UniPC", "Cosmos UniPC"],
        ["Noise shift", "5.0", "5.0", "5.0"],
        ["Visual guidance", "3.0", "3.0", "4.0"],
        ["Action guidance", "—", "—", "1.0"],
        ["Observation history", "1", "1", "1"],
        ["Actions per request", "32", "32", "32"],
        ["Control frequency", "15 Hz", "15 Hz", "15 Hz"],
        ["Prompt JSON formatting", "No", "Yes", "No"],
        ["Input/canvas setting", "540×640", "540×640", "544×736"],
    ],
    "seed": 6100,
    "actionsPerRequest": 32,
    "hz": 15,
    "notes": [
        "The Cosmos models use joint-position actions and a resolution setting of 480; Edge's guidance interval is [960, 1001].",
        "FLUX uses its DROID camera layout and absolute actions with a scale of 2.0.",
        "Different input dimensions reflect image preprocessing; the simulated cameras are unchanged.",
        "The exact full-policy revision for FLUX was not recorded; its text encoder was verified separately.",
    ],
    # Placement criteria (Appendix B.1)
    "scoring": {"coneDeg": 45, "footprintCm": 1, "speedCmS": 2, "holdS": 1, "referenceMovedCm": 2},
    # Statistical comparison (Appendix B.1): bootstrap of the eight starts within each scene; sign-flip test over the
    # 32 physical-start means for the original family (TF-RF and DIR-TF, Holm-adjusted). Everything else is descriptive.
    "stats": {"bootstrapDraws": 10000, "signFlipDraws": 100000, "starts": 32, "holmFamily": ["TF_RF", "DIR_TF"]},
}

# Appendix E values reported in the submitted paper that are not recomputable from the public artifacts.
FORECAST_REPORTED = {
    "allFieldsAgree": 5.9,  # % of the 864 forecasts on which the two annotators agreed on every field
    "startForecasts": 862,  # additional episode-start forecasts, all with kappa below startKappaMax
    "startKappaMax": 0.115,
    "controls": {"missingIndicators": 0.000011, "noMotion": 0.000009},  # change in Brier error (positive favours video)
    "permutation": {"seeds": 100, "mean": -0.00053, "p025": -0.00177, "p975": 0.00049},  # not a confidence interval
    "selection": {"gripperCm": 10, "fallbacks": 2, "actions": 32, "hz": 15, "frames": 8},
    "events": {"contactS": 0.2, "displacementCm": 2, "supportedS": 0.2},
    "classifier": {"C": 1, "folds": 8},
    "annotators": ["Qwen3-VL-235B-A22B-Instruct-FP8", "GLM-4.5V-FP8"],
}


def load_jsonl(path: Path) -> list[dict]:
    return [json.loads(x) for x in path.read_text().splitlines() if x.strip()]


def r1(x, nd=3):
    return None if x is None else round(float(x), nd)


class Check:
    def __init__(self):
        self.n = 0

    def eq(self, label, got, want, tol=0.0):
        self.n += 1
        ok = abs(got - want) <= tol + 1e-9 if isinstance(want, float) or tol else got == want
        if not ok:
            raise SystemExit(f"CHECK FAILED: {label}: got {got!r}, paper reports {want!r}")


# ---------------------------------------------------------------- paper estimators (analyze.py)
def cluster_means(rows, a, b, outcome="stable_ever", keep=lambda r: True):
    """Mean paired difference a-b within each physical start (scene x slot), over models and goals."""
    pairs = defaultdict(dict)
    for r in rows:
        if keep(r):
            pairs[(r["model_id"], r["scene_id"], r["state_slot"], r["goal_id"])][r["form"]] = r
    diffs = defaultdict(list)
    for (m, s, slot, g), f in pairs.items():
        if a in f and b in f:
            diffs[(s, slot)].append(float(f[a][outcome]) - float(f[b][outcome]))
    return {k: float(np.mean(v)) for k, v in sorted(diffs.items())}


def bootstrap(cm: dict, draws=10000, seed=SEED_BOOT):
    """analyze.cluster_bootstrap: resample the starts within each scene, same RNG call order."""
    rng = np.random.default_rng(seed)
    by_scene = defaultdict(list)
    for key in sorted(cm):
        by_scene[key[0]].append(cm[key])
    arrs = {s: np.array(v) for s, v in by_scene.items()}
    vals = np.empty(draws)
    for d in range(draws):
        sel = []
        for s, arr in arrs.items():
            sel.append(arr[rng.choice(len(arr), size=len(arr), replace=True)])
        vals[d] = np.concatenate(sel).mean()
    return [float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))]


def sign_flip(cm: dict, n=100000, seed=SEED_FLIP):
    cl = np.array([cm[k] for k in cm])
    obs = float(cl.mean())
    rng = np.random.default_rng(seed)
    flips = rng.choice([-1.0, 1.0], size=(n, cl.size))
    null = np.abs((flips * cl).mean(axis=1))
    return float((np.sum(null >= abs(obs) - 1e-12) + 1) / (n + 1))


def holm(ps):
    order = np.argsort(ps)
    adj, running = [0.0] * len(ps), 0.0
    for k, i in enumerate(order):
        running = max(running, min(1.0, (len(ps) - k) * ps[i]))
        adj[i] = running
    return adj


def balanced_rate(rows, outcome, keep=lambda r: True):
    """Scene-balanced rate: goals equal within scene, scenes equal, models equal."""
    cell = defaultdict(list)
    for r in rows:
        if keep(r):
            cell[(r["model_id"], r["scene_id"], r["goal_id"])].append(float(r[outcome]))
    by_ms = defaultdict(list)
    for (m, s, g), v in cell.items():
        by_ms[(m, s)].append(np.mean(v))
    by_m = defaultdict(list)
    for (m, s), v in by_ms.items():
        by_m[m].append(np.mean(v))
    return float(np.mean([np.mean(v) for v in by_m.values()]))


# ---------------------------------------------------------------- build
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--paper-repo", type=Path, required=True)
    ap.add_argument("--vqa-items", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True, help="site directory")
    ap.add_argument("--draws", type=int, default=10000)
    args = ap.parse_args()
    root, check = args.paper_repo, Check()
    check.eq("bootstrap draws as reported", args.draws, SETTINGS["stats"]["bootstrapDraws"])
    check.eq("sign-flip draws as reported", sign_flip.__defaults__[0], SETTINGS["stats"]["signFlipDraws"])

    rows = [r for r in load_jsonl(root / ART / "analysis/conf_features.jsonl")
            if r["status"] == "valid" and r["phase"] == "confirmation"]
    check.eq("valid confirmation episodes", len(rows), 864)
    by_ep = {r["episode_id"]: r for r in rows}

    scores = {}
    for p in glob.glob(str(root / ART / "runs/episodes/*/attempts/*/result.json")):
        res = json.loads(Path(p).read_text())
        if res.get("phase") == "confirmation" and res["episode_id"] in by_ep:
            scores[res["episode_id"]] = res["score"]
    check.eq("result.json per episode", len(scores), 864)
    for e, r in by_ep.items():
        s = scores[e]
        check.eq(f"{e} stable_ever", bool(s["stable_ever"]), bool(r["stable_ever"]))
        check.eq(f"{e} stable_at_final", bool(s["stable_at_final"]), bool(r["stable_at_final"]))

    labels = {x["episode_id"]: x for x in load_jsonl(root / ART / "analysis/forecast_labels_vlm.jsonl")}
    check.eq("forecast labels", len(labels), 864)
    matrix = json.loads((root / "docs/robolab-workshop-20260926/prompt_matrix.json").read_text())

    # ---- scenes, goals, exact prompts
    scenes = []
    for sc in matrix["scenes"]:
        if sc["id"] not in SCENES:
            continue
        goals = []
        for g in sc["goals"]:
            goals.append({
                "id": g["id"], "key": f"{sc['id']}-{g['id']}", "short": GOAL_SHORT[(sc["id"], g["id"])],
                "label": g["label"], "mover": g["mover"], "reference": g["reference"],
                "moverName": OBJECT_NAMES[g["mover"]], "referenceName": OBJECT_NAMES[g["reference"]],
                "relation": g["relation"], "native": g["origin"].startswith("native"),
                "initiallyTrue": f"{sc['id']}-{g['id']}" in INITIALLY_TRUE,
                "prompts": {p["form"]: p["text"] for p in g["prompts"]},
            })
        scenes.append({"id": sc["id"], **SCENES[sc["id"]], "ticks": SCENES[sc["id"]]["seconds"] * 15 + 1,
                       "goals": goals})

    # ---- goal x form cells, checked against the appendix tables
    cells = defaultdict(lambda: [0, 0, 0])
    for r in rows:
        c = cells[f"{r['model_id']}|{r['scene_id']}-{r['goal_id']}|{r['form']}"]
        c[0] += int(r["stable_ever"])
        c[1] += int(r["stable_at_final"])
        c[2] += 1
    for m, table in PAPER_COUNTS.items():
        for goal, txt in table.items():
            for form, pair in zip("DSI", txt.split()):
                a, e = map(int, pair.split("/"))
                got = cells[f"{m}|{goal}|{form}"]
                check.eq(f"count {m} {goal} {form}", (got[0], got[1], got[2]), (a, e, 8))

    # ---- headline counts
    n_any = sum(int(r["stable_ever"]) for r in rows)
    n_end = sum(int(r["stable_at_final"]) for r in rows)
    ach = [r for r in rows if not is_init(r)]
    mnt = [r for r in rows if is_init(r)]
    flow = {
        "total": len(rows), "anytime": n_any, "end": n_end,
        "achievement": {"n": len(ach), "anytime": sum(int(r["stable_ever"]) for r in ach),
                        "end": sum(int(r["stable_at_final"]) for r in ach)},
        "maintenance": {"n": len(mnt), "anytime": sum(int(r["stable_ever"]) for r in mnt),
                        "end": sum(int(r["stable_at_final"]) for r in mnt)},
        "stages": dict(Counter(r["failure_stage"] for r in rows)),
    }
    check.eq("any-time passes", n_any, 383)
    check.eq("end passes", n_end, 191)
    check.eq("lost", n_any - n_end, 192)
    check.eq("not-initially-true episodes", flow["achievement"]["n"], 648)
    check.eq("not-initially-true reach", flow["achievement"]["anytime"], 167)
    check.eq("not-initially-true end", flow["achievement"]["end"], 94)
    check.eq("initially-true end", (flow["maintenance"]["end"], flow["maintenance"]["n"]), (97, 216))
    for m in MODELS:
        flow.setdefault("byModel", {})[m["id"]] = {
            f["id"]: {"n": sum(1 for r in rows if r["model_id"] == m["id"] and r["form"] == f["id"]),
                      "anytime": sum(int(r["stable_ever"]) for r in rows if r["model_id"] == m["id"] and r["form"] == f["id"]),
                      "end": sum(int(r["stable_at_final"]) for r in rows if r["model_id"] == m["id"] and r["form"] == f["id"]),
                      "stages": dict(Counter(r["failure_stage"] for r in rows if r["model_id"] == m["id"] and r["form"] == f["id"]))}
            for f in FORMS}

    rates = {"anytime": balanced_rate(rows, "stable_ever"), "end": balanced_rate(rows, "stable_at_final")}
    check.eq("scene-balanced any-time rate", round(100 * rates["anytime"], 1), 43.2)
    check.eq("scene-balanced end rate", round(100 * rates["end"], 1), 21.8)
    rates["byModelForm"] = {
        m["id"]: {f["id"]: {o: balanced_rate(rows, k, lambda r, m=m, f=f: r["model_id"] == m["id"] and r["form"] == f["id"])
                            for o, k in (("anytime", "stable_ever"), ("end", "stable_at_final"))}
                  for f in FORMS} for m in MODELS}
    rates["byModelFormExcl"] = {
        m["id"]: {f["id"]: {o: balanced_rate(rows, k, lambda r, m=m, f=f: r["model_id"] == m["id"] and r["form"] == f["id"]
                                             and not is_init(r))
                            for o, k in (("anytime", "stable_ever"), ("end", "stable_at_final"))}
                  for f in FORMS} for m in MODELS}
    rates["excl"] = {"anytime": balanced_rate(rows, "stable_ever", lambda r: not is_init(r)),
                     "end": balanced_rate(rows, "stable_at_final", lambda r: not is_init(r))}

    # ---- wording contrasts
    contrasts = {}
    spec = {"TF_RF": ("S", "I"), "DIR_TF": ("D", "S"), "DIR_RF": ("D", "I")}
    for name, (a, b) in spec.items():
        c = {}
        for oname, outcome in (("anytime", "stable_ever"), ("end", "stable_at_final")):
            per = {}
            for m in [None] + [x["id"] for x in MODELS]:
                keep = (lambda r: True) if m is None else (lambda r, m=m: r["model_id"] == m)
                cm = cluster_means(rows, a, b, outcome, keep)
                per[m or "All"] = {"est": float(np.mean(list(cm.values()))), "ci": bootstrap(cm, args.draws),
                                   "starts": [{"scene": k[0], "slot": int(k[1].split("-C")[-1]), "d": round(v, 4)}
                                              for k, v in cm.items()]}
            c[oname] = per
        cm_nb = cluster_means(rows, a, b, "stable_ever", lambda r: r["scene_id"] != "S5")
        c["anytimeNoBowls"] = {"est": float(np.mean(list(cm_nb.values()))), "ci": bootstrap(cm_nb, args.draws)}
        pairs = defaultdict(dict)
        for r in rows:
            pairs[(r["model_id"], r["scene_id"], r["state_slot"], r["goal_id"])][r["form"]] = r
        c["discordant"] = {"aOnly": sum(1 for f in pairs.values() if f[a]["stable_ever"] and not f[b]["stable_ever"]),
                           "bOnly": sum(1 for f in pairs.values() if f[b]["stable_ever"] and not f[a]["stable_ever"])}
        contrasts[name] = c
    p_raw = [sign_flip(cluster_means(rows, "S", "I")), sign_flip(cluster_means(rows, "D", "S"))]
    contrasts["TF_RF"]["pHolm"], contrasts["DIR_TF"]["pHolm"] = holm(p_raw)

    t = contrasts["TF_RF"]
    check.eq("TF-RF any-time", round(100 * t["anytime"]["All"]["est"], 2), 12.15)
    check.eq("TF-RF CI", [round(100 * x, 1) for x in t["anytime"]["All"]["ci"]], [8.6, 15.4])
    check.eq("TF-RF Holm p < 0.001", t["pHolm"] < 0.001, True)
    check.eq("TF-RF end", round(100 * t["end"]["All"]["est"], 2), 11.20)
    check.eq("TF-RF without bowls", round(100 * t["anytimeNoBowls"]["est"], 2), 10.65)
    d = contrasts["DIR_TF"]
    check.eq("DIR-TF", round(100 * d["anytime"]["All"]["est"], 2), 4.08)
    check.eq("DIR-TF CI", [round(100 * x, 1) for x in d["anytime"]["All"]["ci"]], [-0.2, 8.4])
    check.eq("DIR-TF Holm p", round(d["pHolm"], 3), 0.089)
    paper_dr = {"All": ("16.2 11.7 20.4", "14.4 10.0 18.9"), "N3": ("14.1 7.0 20.8", "16.1 4.2 27.6"),
                "E3": ("13.5 7.8 19.5", "8.6 0.0 17.7"), "F3": ("21.1 10.4 30.7", "18.5 9.1 27.6")}
    for m, (pa, pe) in paper_dr.items():
        for oname, txt in (("anytime", pa), ("end", pe)):
            want = [float(x) for x in txt.split()]
            got = contrasts["DIR_RF"][oname][m]
            check.eq(f"DIR-RF {m} {oname}", round(100 * got["est"], 1), want[0])
            check.eq(f"DIR-RF {m} {oname} CI", [round(100 * x, 1) for x in got["ci"]], want[1:])

    # ---- per-relation TF-RF (pooled over models; bootstrap over the scene's eight starts)
    relation = []
    for s in scenes:
        for g in s["goals"]:
            cm = cluster_means(rows, "S", "I", keep=lambda r, s=s, g=g: r["scene_id"] == s["id"] and r["goal_id"] == g["id"])
            byM = {m["id"]: [cells[f"{m['id']}|{g['key']}|{f}"][0] for f in "DSI"] for m in MODELS}
            relation.append({"key": g["key"], "est": float(np.mean(list(cm.values()))), "ci": bootstrap(cm, args.draws),
                             "tf": sum(v[1] for v in byM.values()), "rf": sum(v[2] for v in byM.values()),
                             "dir": sum(v[0] for v in byM.values()), "byModel": byM})
    mr = next(x for x in relation if x["key"] == "S4-R")
    check.eq("mustard-right TF vs RF", (mr["tf"], mr["rf"]), (20, 2))
    check.eq("mustard-right per model", [mr["byModel"][m][1:] for m in ("N3", "E3", "F3")], [[8, 0], [4, 0], [8, 2]])
    cube = cluster_means(rows, "S", "I", keep=lambda r: r["scene_id"] == "S1")
    check.eq("cube scene net TF-RF", round(float(np.mean(list(cube.values()))), 9), 0.0)

    # ---- forecasts
    fc_keys = ["fc_direction", "fc_visible_final_relation", "fc_moving_object_role", "fc_possible_release",
               "fc_hallucinated_object", "fc_missing_object"]
    forecast = {"labels": {k: dict(Counter(x[k] for x in labels.values()).most_common()) for k in fc_keys}}
    forecast["labelsByModel"] = {m["id"]: {k: dict(Counter(labels[e][k] for e, r in by_ep.items()
                                                           if r["model_id"] == m["id"]).most_common())
                                           for k in fc_keys} for m in MODELS}
    check.eq("upward-only %", round(100 * forecast["labels"]["fc_direction"]["up_only"] / 864, 1), 77.9)
    check.eq("requested relation %", round(100 * forecast["labels"]["fc_visible_final_relation"]["goal"] / 864, 1), 4.5)
    check.eq("alternative relation %", round(100 * forecast["labels"]["fc_visible_final_relation"]["alternative_goal"] / 864, 1), 11.5)
    check.eq("neither %", round(100 * forecast["labels"]["fc_visible_final_relation"]["not_goal"] / 864, 1), 70.4)
    check.eq("unknown %", round(100 * forecast["labels"]["fc_visible_final_relation"]["unknown"] / 864, 1), 13.7)
    with open(root / ART / "results/forecast_events.csv") as fh:
        ev_rows = list(csv.DictReader(fh))
    forecast["events"] = [{k: (v if k in ("model", "scene") else int(v)) for k, v in x.items()} for x in ev_rows]
    check.eq("detected manipulation errors", sum(int(x["event_positive"]) for x in ev_rows), 47)
    check.eq("wrong-object detections", sum(int(x["wrong_object"]) for x in ev_rows), 14)
    check.eq("contradictory-release detections", sum(int(x["contradictory_release"]) for x in ev_rows), 33)
    ref_moving = [e for e in by_ep if labels[e]["fc_moving_object_role"] == "reference"]
    mov_moving = [e for e in by_ep if labels[e]["fc_moving_object_role"] == "mover"]
    forecast["roleEvents"] = {"reference": [sum(by_ep[e]["event"] for e in ref_moving), len(ref_moving)],
                              "mover": [sum(by_ep[e]["event"] for e in mov_moving), len(mov_moving)]}
    check.eq("errors when reference named moving", forecast["roleEvents"]["reference"], [23, 247])
    check.eq("errors when target named moving", forecast["roleEvents"]["mover"], [19, 540])
    forecast["agreement"] = FORECAST_AGREEMENT
    forecast["utility"] = {"rows": FORECAST_UTILITY, "ci": FORECAST_UTILITY_CI}
    forecast["reported"] = FORECAST_REPORTED

    # ---- instruction understanding (VQA)
    with open(args.vqa_items) as fh:
        items = list(csv.DictReader(fh))
    lane_model = {m["vqa"]: m["id"] for m in MODELS}
    form_code = {"DIR": "D", "TF": "S", "RF": "I"}
    vqa = {"text": {}, "camera": {}, "images": {}, "imagesCamera": {}, "placementText": {}, "placementImages": {},
           "summary": {}}
    cond_key = {"T": "text", "H": "camera", "I": "images", "IH": "imagesCamera"}
    for it in items:
        m = lane_model[it["lane"]]
        ans = json.loads(it["answer"]) if it["answer"] else None
        rec = {"ok": it["tuple"] == "1.0", "err": it["error_class"], "ans": ans}
        if it["family"] == "original":
            key = f"{m}|{it['prompt_id']}"
            if it["condition"] in ("T", "H"):
                vqa[cond_key[it["condition"]]][key] = rec
            else:
                vqa[cond_key[it["condition"]]].setdefault(key, {})[it["start"]] = rec
        else:
            key = f"{m}|{it['prompt_id']}"
            if it["condition"] == "T":
                vqa["placementText"][key] = rec
            else:
                vqa["placementImages"].setdefault(key, {})[it["start"]] = rec
    paper_vqa = {"text": {"N3": (10, 10, 10), "E3": (6, 8, 4), "F3": (10, 10, 4)},
                 "camera": {"N3": (10, 10, 10), "E3": (5, 10, 4), "F3": (10, 10, 3)},
                 "imagesCamera": {"N3": (100.0, 100.0, 89.9), "E3": (30.6, 48.3, 23.3), "F3": (100.0, 100.0, 41.7)},
                 "images": {"N3": (100.0, 100.0, 93.1), "E3": (38.9, 46.2, 23.3), "F3": (97.2, 100.0, 41.7)}}
    for cond, per in paper_vqa.items():
        for m, want in per.items():
            got = []
            for f in "DSI":
                keys = [k for k in vqa[cond] if k.startswith(m + "|") and k.endswith("-" + f)]
                if cond in ("text", "camera"):
                    got.append(sum(vqa[cond][k]["ok"] for k in keys))
                else:
                    by = defaultdict(list)
                    for k in keys:
                        sc = k.split("|")[1].split("-")[0]
                        by[sc].append(np.mean([v["ok"] for v in vqa[cond][k].values()]))
                    got.append(round(100 * float(np.mean([np.mean(v) for v in by.values()])), 1))
            vqa["summary"].setdefault(cond, {})[m] = got
            check.eq(f"VQA {cond} {m}", tuple(got), want)
    flux_rf = [v for k, v in vqa["text"].items() if k.startswith("F3|") and k.endswith("-I") and not v["ok"]]
    check.eq("FLUX text-only RF errors", len(flux_rf), 6)
    check.eq("FLUX RF errors all reverse the relation", all(v["err"] == "converse_relation" for v in flux_rf), True)
    from build_vqa import build as build_vqa  # noqa: E402  (sibling module)
    vqa_study, vqa_public = build_vqa(check, items, args.vqa_items.parent, MODELS)
    vqa.update(vqa_study)
    # The per-item tables are served lazily from public/data/vqa.json, whose lanes carry every scored
    # answer with its exact output tokens; check that the tokens reproduce each scored answer first.
    decoded_ok = True
    for it in items:
        lane = vqa_public["lanes"][lane_model[it["lane"]]]
        _pt, seq, err = lane["b2"][it["query_id"]]
        text = "".join(lane["seqs"][seq]).replace("<|im_end|>", "")
        decoded_ok &= err == it["error_class"] and json.loads(text) == (json.loads(it["answer"]) if it["answer"] else None)
    check.eq("console tokens reproduce every scored VQA answer", decoded_ok, True)
    for k in ("text", "camera", "images", "imagesCamera", "placementText", "placementImages"):
        del vqa[k]
    vqa_public["pairs"] = vqa.pop("pairs")

    # ---- episodes
    episodes = []
    for e in sorted(by_ep):
        r, s, lb = by_ep[e], scores[e], labels[e]
        w = r.get("window_primary") or {}
        episodes.append({
            "id": e, "m": r["model_id"], "s": r["scene_id"], "c": int(r["state_slot"].split("-C")[-1]),
            "g": r["goal_id"], "f": r["form"],
            "se": int(r["stable_ever"]), "sf": int(r["stable_at_final"]), "stage": r["failure_stage"],
            "init": int(is_init(r)), "n": s["n_ticks"],
            "tHit": r1(r["study_goal_first_hit"], 2),
            "tStable": r1((s.get("stable") or {}).get("start_t"), 2),
            "tStableDone": r1((s.get("stable") or {}).get("complete_t"), 2),
            "tFinal": r1((s["final_stable_run"]["start_tick"] / 15) if s.get("stable_at_final") and s.get("final_stable_run") else None, 2),
            "tLift": r1((s.get("lift") or {}).get("start_t"), 2),
            "disp": r1(s["mover_final_displacement_m"]),
            "refMax": r1(s["reference_disturbance"]["max_displacement_m"]),
            "refMoved": int(bool(s["reference_disturbance"]["disturbed"])),
            "pr": r["primary_window"]["request_index"], "pre": r["primary_window"]["pre_tick"],
            "nx": w.get("n_executed"), "fallback": int(bool(r["primary_window"].get("fallback"))),
            "ev": int(r["event"] or 0), "evWrong": int(bool(w.get("wrong_object"))),
            "evRelease": int(bool(w.get("contradictory_release"))),
            "fc": {"dir": lb["fc_direction"], "rel": lb["fc_visible_final_relation"],
                   "role": lb["fc_moving_object_role"], "release": lb["fc_possible_release"],
                   "hall": lb["fc_hallucinated_object"]},
        })
    check.eq("primary fallbacks", sum(x["fallback"] for x in episodes), 2)

    study = {
        "title": "Same Goal, Different Words: Spatial Instruction Sensitivity in World-Action Models",
        "venue": "CoRL 2026 Workshop: Do Robots Need World Models?",
        "models": MODELS, "forms": FORMS, "scenes": scenes, "objects": OBJECT_NAMES,
        "flow": flow, "rates": rates, "contrasts": contrasts, "relation": relation,
        "cells": {k: v for k, v in sorted(cells.items())},
        "forecast": forecast, "vqa": vqa, "settings": SETTINGS,
        "source": {"paperRepo": "https://github.com/adeeb10abbas/world-action-model-steerability",
                   "commit": os.popen(f"git -C {root} rev-parse HEAD").read().strip()},
        "checks": check.n,
    }
    (args.out / "src/data").mkdir(parents=True, exist_ok=True)
    (args.out / "public/data").mkdir(parents=True, exist_ok=True)
    (args.out / "src/data/study.json").write_text(json.dumps(study, separators=(",", ":")))
    (args.out / "public/data/episodes.json").write_text(json.dumps(episodes, separators=(",", ":")))
    (args.out / "public/data/vqa.json").write_text(json.dumps(vqa_public, separators=(",", ":"), ensure_ascii=False))
    print(f"ok: {check.n} checks against the submitted paper; {len(episodes)} episodes")


if __name__ == "__main__":
    main()
