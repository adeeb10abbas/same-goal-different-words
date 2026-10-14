"""Re-encode a home-page display video (top_hq.mp4, CRF 18) into the copy the site streams, top_hq_web.mp4.

top_hq.mp4 needs about 1.75 Mbit/s. The home hero plays two of them side by side at 2x, which needs about 0.9 MB/s and
stalls on slower connections. top_hq_web.mp4 keeps every frame, the 1072x1080 size, and the 30 fps timing, and encodes
at CRF 26 (about 0.7 Mbit/s). The result is recorded under "web" in hq.json, with its SSIM against top_hq.mp4.

Runs locally: python web_encode.py <media>/ep/<EP> [crf]   (ffmpeg/ffprobe with libx264 on PATH, or FFMPEG/FFPROBE)
"""
import hashlib, json, os, re, subprocess, sys
from pathlib import Path

FF = os.environ.get("FFMPEG", "ffmpeg")
FP = os.environ.get("FFPROBE", "ffprobe")
TAGS = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"]


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def timing(p):
    """Frame count and duration, decoded."""
    return subprocess.run([FP, "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries",
                           "stream=nb_read_frames,duration", "-of", "csv=p=0", str(p)],
                          capture_output=True, text=True, check=True).stdout.strip()


def ssim(a, b):
    err = subprocess.run([FF, "-hide_banner", "-nostdin", "-i", str(a), "-i", str(b), "-lavfi", "[0:v][1:v]ssim",
                          "-f", "null", "-"], capture_output=True, text=True, check=True).stderr
    return float(re.findall(r"All:([0-9.]+)", err)[-1])


def main(ep_dir, crf=26):
    d = Path(ep_dir)
    src, out, tmp = d / "top_hq.mp4", d / "top_hq_web.mp4", d / "top_hq_web.tmp.mp4"
    subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", str(src), "-c:v", "libx264",
                    "-preset", "veryslow", "-crf", str(crf), "-profile:v", "high", "-pix_fmt", "yuv420p", "-g", "60",
                    "-keyint_min", "60", "-sc_threshold", "0", "-fps_mode", "passthrough", *TAGS,
                    "-movflags", "+faststart", "-an", str(tmp)], check=True)
    if timing(tmp) != timing(src):
        raise SystemExit(f"frame count or duration changed: {timing(src)} -> {timing(tmp)}")
    tmp.replace(out)
    meta = json.loads((d / "hq.json").read_text())
    version = subprocess.run([FF, "-version"], capture_output=True, text=True, check=True).stdout.split("\n")[0]
    meta["web"] = {"file": out.name, "from": src.name, "ffmpeg": version, "encoder": "libx264 -preset veryslow",
                   "crf": crf, "ssim_vs_from": round(ssim(out, src), 4), "bytes": out.stat().st_size, "sha256": sha(out)}
    (d / "hq.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps({"episode": meta["episode_id"], **meta["web"]}))


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 26)
