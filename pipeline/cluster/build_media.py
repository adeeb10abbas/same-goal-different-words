#!/usr/bin/env python3
"""Encode compact web media for every rollout listed in a manifest.

Run on a machine where the raw rollout directories are mounted. Each manifest row is
{"ep", "dir", "n", "model", "scene", "goal", "form", "primary"}; "dir" is the attempt directory
holding exec_*.mkv, states.jsonl.gz, requests.jsonl and futures/.

Per episode this writes OUT/ep/<ep>/:
  top.mp4         head camera with the paper's close-view crop, rotated upright (536x540, native pixels)
  front.mp4       viewport camera facing the robot (864x480, native pixels); never mirrored
  first.webp      top-view poster at tick 0
  last.webp       top-view poster at the final tick
  sprite.webp     SPRITE_N evenly spaced top-view frames in one row (SPRITE_W x SPRITE_H each)
  timeline.json   per-tick simulator signals (scoring-only) for overlays and the top-down map
  forecast.mp4    [generated | executed] model-view composite over the primary request window
  done.json       sizes and sha256 of every output
Curated episodes (--tier b) also get dream.mp4: [imagined | executed] model-view composite over the
whole episode, where tick pre+k shows frame k of the future generated at the request issued at tick pre.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json

import subprocess
import sys
import time
import traceback
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import numpy as np
from PIL import Image

FPS = 15
HEAD_W, HEAD_H = 1280, 720
# The paper's close view (generate_execution_examples.py: crop (380, 100, 920, 635), then 90 degrees
# counter-clockwise), extended by one row so both sides are even. Upright: the camera faces the robot,
# so the robot is at the top and the robot's left is image right.
TOP_VF = "crop=540:536:380:100,transpose=2"
TOP_W, TOP_H = 536, 540
FRONT_VF = "null"  # 864x480 viewport, native pixels
VIDEO_CRF, MODEL_CRF, KEYINT = 18, 20, 30
COMP_H, COMP_W = 540, 640
SPRITE_N, SPRITE_W, SPRITE_H = 12, 180, 181
STABLE_SPEED, LIFT_M = 0.02, 0.02  # scorer thresholds (m/s, m)
YUV = "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p"
TAGS = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"]
FFMPEG = "ffmpeg"
THREADS = 4


def x264(crf: int, gop: int = KEYINT) -> list[str]:
    return ["-c:v", "libx264", "-preset", "slow", "-crf", str(crf), "-profile:v", "high", "-g", str(gop),
            "-keyint_min", str(gop), "-sc_threshold", "0", "-threads", str(THREADS), *TAGS,
            "-movflags", "+faststart", "-an"]


def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    p = subprocess.run(cmd, capture_output=True, **kw)
    if p.returncode != 0:
        raise RuntimeError(f"{cmd[:6]}... exited {p.returncode}: {p.stderr[-800:].decode(errors='replace')}")
    return p


def ff(*args: str) -> list[str]:
    return [FFMPEG, "-hide_banner", "-loglevel", "error", "-nostdin", "-y", *args]


def atomic(path: Path):
    tmp = path.with_name(path.stem + ".tmp" + path.suffix)
    return tmp


def done_file(path: Path) -> bool:
    return path.exists() and path.stat().st_size > 0


def encode_file(src: Path, vf: str, out: Path, crf: int) -> None:
    if done_file(out):
        return
    tmp = atomic(out)
    run(ff("-threads", str(THREADS), "-i", str(src), "-vf", f"{vf},{YUV}", *x264(crf), str(tmp)))
    tmp.replace(out)


class RawEncoder:
    """Pipe RGB frames into libx264."""

    def __init__(self, out: Path, w: int, h: int, crf: int, gop: int = KEYINT):
        self.out, self.tmp = out, atomic(out)
        cmd = ff("-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}", "-r", str(FPS), "-i", "-",
                 "-vf", YUV, *x264(crf, gop), str(self.tmp))
        self.p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)

    def write(self, frame: np.ndarray) -> None:
        self.p.stdin.write(np.ascontiguousarray(frame, dtype=np.uint8).tobytes())

    def close(self) -> None:
        self.p.stdin.close()
        err = self.p.stderr.read()
        if self.p.wait() != 0:
            raise RuntimeError(f"encoder failed for {self.out}: {err[-800:].decode(errors='replace')}")
        self.tmp.replace(self.out)


def decode_frames(src: Path, w: int, h: int, start: int = 0, count: int | None = None, vf: str | None = None):
    """Yield RGB frames [start, start+count) of a video, optionally after a filter."""
    filters = []
    if start or count is not None:
        end = f":end_frame={start + count}" if count is not None else ""
        filters.append(f"trim=start_frame={start}{end},setpts=PTS-STARTPTS")
    if vf:
        filters.append(vf)
    cmd = ff("-threads", str(THREADS), "-i", str(src), *(["-vf", ",".join(filters)] if filters else []),
             "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgb24", "-")
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    size = w * h * 3
    try:
        while True:
            buf = p.stdout.read(size)
            if len(buf) < size:
                break
            yield np.frombuffer(buf, np.uint8).reshape(h, w, 3)
    finally:
        p.stdout.close()
        err = p.stderr.read()
        rc = p.wait()
        if rc not in (0, -13):  # -13: SIGPIPE when the consumer stops early
            raise RuntimeError(f"decode failed for {src}: {err[-800:].decode(errors='replace')}")


def fit_rows(video: np.ndarray) -> np.ndarray:
    """Align decoded futures with the 540x640 composite: crop reflect padding or pad missing rows in black."""
    h = video.shape[1]
    if h >= COMP_H:
        return video[:, :COMP_H]
    pad = np.zeros((video.shape[0], COMP_H - h) + video.shape[2:], np.uint8)
    return np.concatenate([video, pad], axis=1)


def posters(adir: Path, n: int, out: Path) -> None:
    targets = [out / "first.webp", out / "last.webp", out / "sprite.webp"]
    if all(done_file(t) for t in targets):
        return
    idx = sorted(set(np.linspace(0, n - 1, SPRITE_N).round().astype(int).tolist()) | {0, n - 1})
    sel = "+".join(f"eq(n\\,{i})" for i in idx)
    cmd = ff("-threads", str(THREADS), "-i", str(adir / "exec_head_camera.mkv"), "-vf",
             f"{TOP_VF},select='{sel}'", "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgb24", "-")
    raw = run(cmd).stdout
    frames = np.frombuffer(raw, np.uint8).reshape(-1, TOP_H, TOP_W, 3)
    if len(frames) != len(idx):
        raise RuntimeError(f"poster frames {len(frames)} != {len(idx)}")
    by = dict(zip(idx, frames))
    Image.fromarray(by[0]).save(atomic(out / "first.webp"), quality=90, method=6)
    Image.fromarray(by[n - 1]).save(atomic(out / "last.webp"), quality=90, method=6)
    strip_idx = np.linspace(0, n - 1, SPRITE_N).round().astype(int)
    strip = Image.new("RGB", (SPRITE_W * SPRITE_N, SPRITE_H))
    for j, i in enumerate(strip_idx):
        strip.paste(Image.fromarray(by[int(i)]).resize((SPRITE_W, SPRITE_H), Image.LANCZOS), (j * SPRITE_W, 0))
    strip.save(atomic(out / "sprite.webp"), quality=84, method=6)
    for t in targets:
        atomic(t).replace(t)


def runs(mask: np.ndarray) -> list[list[int]]:
    """Inclusive [start, end] tick runs where mask is true."""
    m = np.concatenate([[False], np.asarray(mask, bool), [False]])
    d = np.flatnonzero(m[1:] != m[:-1])
    return [[int(a), int(b) - 1] for a, b in zip(d[::2], d[1::2])]


def delta(values: np.ndarray) -> list[int]:
    v = np.asarray(values).round().astype(np.int64)
    return [int(v[0])] + np.diff(v).tolist() if len(v) else []


def timeline(adir: Path, row: dict, out: Path) -> None:
    target = out / "timeline.json"
    if done_file(target):
        return
    with gzip.open(adir / "states.jsonl.gz", "rt") as f:
        ticks = [json.loads(line) for line in f]
    n = len(ticks)
    steps = [k["step"] for k in ticks]
    if steps != list(range(n)):
        raise RuntimeError("non-contiguous ticks in states.jsonl.gz")
    t0, goal = ticks[0], row["goal"]
    mover, ref = t0["study"][goal]["mover"], t0["study"][goal]["reference"]
    names = list(t0["objects"])
    t = np.array([k["t"] for k in ticks])
    pos = {o: np.array([k["objects"][o]["pos"] for k in ticks]) for o in names}
    objects = {}
    for o in names:
        q = np.array([k["objects"][o]["quat"] for k in ticks])  # w, x, y, z
        lb = t0["objects"][o]["local_bbox_min"] + t0["objects"][o]["local_bbox_max"]
        objects[o] = {
            "role": "mover" if o == mover else "reference" if o == ref else "other",
            "lb": [round(v * 1000, 1) for v in lb],
            "x": delta(pos[o][:, 0] * 1000), "y": delta(pos[o][:, 1] * 1000), "z": delta(pos[o][:, 2] * 1000),
            "q": delta((q * 10000).reshape(-1)),
        }
    contact = lambda a, b: np.array([bool(k["contacts"].get(f"{a}__{b}", k["contacts"].get(f"{b}__{a}", {}))
                                          .get("in_contact")) for k in ticks])
    study = t0["study"]
    flag = lambda g, f: np.array([bool(k["study"][g][f]) for k in ticks])
    speed = np.zeros(n)
    if n > 1:
        speed[1:] = np.linalg.norm(np.diff(pos[mover], axis=0), axis=1) / np.maximum(np.diff(t), 1e-9)
    goal_mask = flag(goal, "goal")
    flags = {f: runs(flag(goal, f)) for f in ("goal", "relation", "support", "detached")}
    flags["stable"] = runs(goal_mask & (speed < STABLE_SPEED))
    flags["lift"] = runs(pos[mover][:, 2] - pos[mover][0, 2] >= LIFT_M)
    flags["grip_mover"] = runs(contact("gripper", mover))
    flags["grip_reference"] = runs(contact("gripper", ref))
    flags["mover_reference"] = runs(contact(mover, ref))
    others = [o for o in names if o not in (mover, ref)]
    flags["grip_other"] = {o: runs(contact("gripper", o)) for o in others}
    flags["grip_table"] = runs(contact("gripper", "table"))
    reqs = [json.loads(line) for line in open(adir / "requests.jsonl")]
    data = {
        "v": 1, "ep": row["ep"], "n": n, "fps": FPS, "goal": goal, "mover": mover, "reference": ref,
        "encoding": "x/y/z/q/tcp/grip are delta-encoded integers (cumulative sum to decode); positions in mm, "
                    "quaternions (w,x,y,z interleaved) x1e4, gripper closed fraction x100; runs are inclusive ticks",
        "objects": objects,
        "tcp": {a: delta(np.array([k["tcp"][i] for k in ticks]) * 1000) for i, a in enumerate("xyz")},
        "grip": delta(np.array([k["gripper_closed_fraction"] for k in ticks]) * 100),
        "flags": flags,
        "goals": {g: {f: runs(flag(g, f)) for f in ("goal", "relation")} for g in study},
        "native": {task: runs([bool(k["native"].get(task)) for k in ticks]) for task in t0["native"]},
        "requests": [[int(r["pre_tick"]), int(r["n_executed"])] for r in sorted(reqs, key=lambda r: r["request_index"])],
        "speed_max": round(float(speed.max()), 3),
    }
    tmp = atomic(target)
    tmp.write_text(json.dumps(data, separators=(",", ":")))
    tmp.replace(target)


def request_rows(adir: Path) -> list[dict]:
    return sorted((json.loads(line) for line in open(adir / "requests.jsonl")), key=lambda r: r["request_index"])


def forecast(adir: Path, row: dict, out: Path, crf: int) -> None:
    target = out / "forecast.mp4"
    if done_file(target):
        return
    q = next(r for r in request_rows(adir) if r["request_index"] == row["primary"])
    pre, n = int(q["pre_tick"]), int(q["n_executed"])
    with np.load(adir / "futures" / f"r{row['primary']:02d}.npz") as z:
        pred = fit_rows(z["video"][: n + 1])
    exe = list(decode_frames(adir / "exec_composite.mkv", COMP_W, COMP_H, pre, n + 1))
    if len(exe) != n + 1 or len(pred) != n + 1:
        raise RuntimeError(f"forecast window mismatch: pred {len(pred)} exec {len(exe)} expected {n + 1}")
    enc = RawEncoder(target, 2 * COMP_W, COMP_H, crf, gop=n + 1)
    for p, e in zip(pred, exe):
        enc.write(np.concatenate([p, e], axis=1))
    enc.close()


def dream(adir: Path, row: dict, out: Path, crf: int) -> None:
    """Whole-episode imagination track: tick pre+k shows frame k of the future predicted at request pre."""
    target = out / "dream.mp4"
    if done_file(target):
        return
    reqs = request_rows(adir)
    exe = decode_frames(adir / "exec_composite.mkv", COMP_W, COMP_H)
    enc = RawEncoder(target, 2 * COMP_W, COMP_H, crf)
    written = 0
    for r in reqs:
        pre, n, ri = int(r["pre_tick"]), int(r["n_executed"]), int(r["request_index"])
        path = adir / "futures" / f"r{ri:02d}.npz"
        fut = None
        if path.exists():
            with np.load(path) as z:
                fut = fit_rows(z["video"])
        for k in range(0 if written == 0 else 1, n + 1):
            if pre + k != written:
                raise RuntimeError(f"dream track gap at tick {written} (request {ri}, k={k})")
            e = next(exe)
            p = fut[k] if fut is not None and k < len(fut) else np.zeros_like(e)
            enc.write(np.concatenate([p, e], axis=1))
            written += 1
    for _ in exe:
        pass
    enc.close()
    if written != row["n"]:
        raise RuntimeError(f"dream track wrote {written} frames, expected {row['n']}")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


TIER_A = ["top.mp4", "front.mp4", "first.webp", "last.webp", "sprite.webp", "timeline.json", "forecast.mp4"]
TIER_B = ["dream.mp4"]


def build(row: dict, root: Path, tier: str) -> dict:
    adir, out = Path(row["dir"]), root / "ep" / row["ep"]
    out.mkdir(parents=True, exist_ok=True)
    expected = TIER_A + (TIER_B if tier == "b" else [])
    marker = out / ("done.json" if tier == "a" else "done_b.json")
    if done_file(marker) and all(done_file(out / f) for f in expected):
        return {"ep": row["ep"], "skipped": True}
    timing = {}

    def step(name, fn, *a):
        s = time.time()
        fn(*a)
        timing[name] = round(time.time() - s, 2)

    step("timeline", timeline, adir, row, out)
    step("top", encode_file, adir / "exec_head_camera.mkv", TOP_VF, out / "top.mp4", VIDEO_CRF)
    step("front", encode_file, adir / "exec_viewport.mkv", FRONT_VF, out / "front.mp4", VIDEO_CRF)
    step("posters", posters, adir, row["n"], out)
    step("forecast", forecast, adir, row, out, MODEL_CRF)
    if tier == "b":
        step("dream", dream, adir, row, out, MODEL_CRF)
    files = {f: {"bytes": (out / f).stat().st_size, "sha256": sha256(out / f)} for f in expected}
    rec = {"ep": row["ep"], "tier": tier, "files": files, "timing_s": timing}
    tmp = atomic(marker)
    tmp.write_text(json.dumps(rec, indent=1))
    tmp.replace(marker)
    return rec


def worker(row: dict, root: str, tier: str) -> dict:
    try:
        return build(row, Path(root), tier)
    except Exception as e:  # keep the batch going; failures are logged and retried on the next run
        return {"ep": row["ep"], "error": f"{type(e).__name__}: {e}", "trace": traceback.format_exc()[-2000:]}


def main() -> None:
    global FFMPEG, THREADS
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--manifest", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--ffmpeg", default="ffmpeg")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--tier", choices=["a", "b"], default="a")
    ap.add_argument("--only", nargs="*", help="episode ids to process (default: all rows)")
    args = ap.parse_args()
    FFMPEG, THREADS = args.ffmpeg, args.threads
    rows = [json.loads(line) for line in open(args.manifest)]
    if args.only:
        rows = [r for r in rows if r["ep"] in set(args.only)]
    (args.out / "logs").mkdir(parents=True, exist_ok=True)
    log = open(args.out / "logs" / f"build_{args.tier}.jsonl", "a")
    t0, ok, fail = time.time(), 0, 0
    with ProcessPoolExecutor(args.workers, initializer=_init, initargs=(FFMPEG, THREADS)) as ex:
        futs = {ex.submit(worker, r, str(args.out), args.tier): r["ep"] for r in rows}
        for i, fut in enumerate(as_completed(futs), 1):
            rec = fut.result()
            ok += "error" not in rec
            fail += "error" in rec
            log.write(json.dumps({**rec, "t": round(time.time() - t0, 1)}) + "\n")
            log.flush()
            status = "FAIL " + rec["error"][:160] if "error" in rec else ("skip" if rec.get("skipped") else rec["timing_s"])
            print(f"[{i}/{len(rows)} {time.time() - t0:7.0f}s] {rec['ep']} {status}", flush=True)
    print(f"done: {ok} ok, {fail} failed in {time.time() - t0:.0f}s", flush=True)
    sys.exit(1 if fail else 0)


def _init(ffmpeg: str, threads: int) -> None:
    global FFMPEG, THREADS
    FFMPEG, THREADS = ffmpeg, threads


if __name__ == "__main__":
    main()
