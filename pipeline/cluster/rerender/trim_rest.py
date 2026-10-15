"""Cut a home-page display video so it ends shortly after its objects come to rest: top_hq.mp4 -> top_hq_trim.mp4.

A rollout runs to its time limit, so its last seconds often show only the arm moving. The cut ends PAD_S seconds of
rollout (1.25 s on screen at the home page's 2x) after every object has settled, meaning that from that tick on each
object stays within TOL_MM and TOL_DEG of the pose it ends the rollout in. Rest is read from the logged object poses
in timeline.json; the arm is ignored, and no motion of an object beyond that tolerance is cut. Media time is
rollout time. The cut is encoded like top_hq_web.mp4 (CRF 26) and recorded under "trim" in hq.json. Its length is
written to site/src/data/clips.json, which the home page reads for its progress bars.

Runs locally: python trim_rest.py <media>/ep/<EP> [<media>/ep/<EP> ...]   (ffmpeg/ffprobe with libx264 on PATH)
"""
import itertools, json, math, subprocess, sys
from pathlib import Path

from web_encode import FF, TAGS, sha, ssim, timing

TOL_MM, TOL_DEG, PAD_S, CRF = 3.0, 3.0, 2.5, 26
OUT = "top_hq_trim.mp4"
CLIPS = Path(__file__).resolve().parents[3] / "site" / "src" / "data" / "clips.json"
RULE = (f"Ends {PAD_S:g} s of rollout ({PAD_S / 2:g} s on screen at 2x) after the last tick at which any object is more "
        f"than {TOL_MM:g} mm or {TOL_DEG:g} degrees from the pose it ends the rollout in.")


def rest_s(timeline):
    """First time from which every object stays within tolerance of its final pose."""
    n, last = timeline["n"], -1
    for o in timeline["objects"].values():
        p = list(zip(*(itertools.accumulate(o[a]) for a in "xyz")))
        qs = list(itertools.accumulate(o["q"]))
        q = [qs[4 * k:4 * k + 4] for k in range(n)]
        qn = [math.sqrt(sum(c * c for c in v)) for v in q]
        for k in range(n):
            dot = abs(sum(a * b for a, b in zip(q[k], q[-1]))) / (qn[k] * qn[-1])
            if math.dist(p[k], p[-1]) > TOL_MM or math.degrees(2 * math.acos(min(1.0, dot))) > TOL_DEG:
                last = max(last, k)
    return (last + 1) / timeline["fps"]


def count(p):
    """Decoded frame count and duration."""
    dur, n = timing(p).split(",")
    return int(n), float(dur)


def main(ep_dir):
    d = Path(ep_dir)
    src, out, tmp = d / "top_hq.mp4", d / OUT, d / f"{OUT}.tmp.mp4"
    meta = json.loads((d / "hq.json").read_text())
    fps = meta["display"]["fps"]
    full = count(src)[0]
    rest = rest_s(json.loads((d / "timeline.json").read_text()))
    frames = min(full, round((rest + PAD_S) * fps) + 1)
    subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", str(src), "-frames:v", str(frames),
                    "-c:v", "libx264", "-preset", "veryslow", "-crf", str(CRF), "-profile:v", "high", "-pix_fmt", "yuv420p",
                    "-g", "60", "-keyint_min", "60", "-sc_threshold", "0", "-fps_mode", "passthrough", *TAGS,
                    "-movflags", "+faststart", "-an", str(tmp)], check=True)
    got = count(tmp)
    if got[0] != frames or abs(got[1] - frames / fps) > 1e-3:
        raise SystemExit(f"{d.name}: expected {frames} frames, got {got}")
    tmp.replace(out)
    ref = d / f"{OUT}.ref.mkv"
    subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", str(src), "-frames:v", str(frames),
                    "-c:v", "ffv1", str(ref)], check=True)
    try:
        score = ssim(out, ref)
    finally:
        ref.unlink()
    version = subprocess.run([FF, "-version"], capture_output=True, text=True, check=True).stdout.split("\n")[0]
    meta["trim"] = {"file": out.name, "from": src.name, "rule": RULE, "tol_mm": TOL_MM, "tol_deg": TOL_DEG,
                    "rest_s": round(rest, 3), "pad_s": PAD_S, "frames": frames, "duration_s": round(frames / fps, 3),
                    "full_frames": full, "full_duration_s": round(full / fps, 3), "ffmpeg": version,
                    "encoder": "libx264 -preset veryslow", "crf": CRF, "ssim_vs_from": round(score, 4),
                    "bytes": out.stat().st_size, "sha256": sha(out)}
    (d / "hq.json").write_text(json.dumps(meta, indent=2))
    known = json.loads(CLIPS.read_text())["clips"] if CLIPS.exists() else {}
    known[meta["episode_id"]] = {"rest": round(rest, 3), "end": round(frames / fps, 3), "full": round(full / fps, 3)}
    clips = {"file": OUT, "rule": RULE, "clips": dict(sorted(known.items()))}
    CLIPS.write_text(json.dumps(clips, indent=2) + "\n")
    print(json.dumps({"episode": meta["episode_id"], **meta["trim"]}))


if __name__ == "__main__":
    for a in sys.argv[1:]:
        main(a)
