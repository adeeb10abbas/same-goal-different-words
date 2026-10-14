"""Encode a window re-render (560x552 window of the 1280x720 head camera at 3x) into home-page display media.

top_hq.mp4   the paper's close-view crop (380,100,540x536 of 1280x720), rotated 90 degrees counter-clockwise like
             top.mp4, at 2x its pixels (1072x1080), 30 fps (two frames per 15 Hz control tick); the last frame is
             held one extra frame so the duration equals the 15 fps top.mp4.
first_hq.webp  frame 0 of the same view.
"""
import hashlib, json, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image

FF = "/data/users/ali/vla_wam/envs/robolab-v2-isaac50/lib/python3.11/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
S = 3
CROP = f"crop={540*S}:{536*S}:{(380-360)*S}:{(100-84)*S}"  # window origin (360,84) in 1280x720 pixels
VIEW = f"{CROP},transpose=2,scale=1072:1080:flags=lanczos"
YUV = "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p"
TAGS = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"]

def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()

def main(src, out_dir, crf=18):
    src, out = Path(src), Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    rec = json.loads(src.with_suffix(".json").read_text())
    if rec.get("window_of_1280x720") != [560, 552] or rec["width"] != 560 * S or rec["fps"] != 30:
        raise SystemExit(f"unexpected source geometry {rec.get('window_of_1280x720')} {rec['width']} {rec['fps']}")
    mp4 = out / "top_hq.mp4"
    tmp = out / "top_hq.tmp.mp4"
    subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", str(src), "-vf",
                    f"{VIEW},tpad=stop_mode=clone:stop=1,{YUV}", "-r", "30", "-c:v", "libx264", "-preset", "slow",
                    "-crf", str(crf), "-profile:v", "high", "-g", "60", "-keyint_min", "60", "-sc_threshold", "0",
                    *TAGS, "-movflags", "+faststart", "-an", str(tmp)], check=True)
    tmp.replace(mp4)
    raw = subprocess.run([FF, "-v", "error", "-i", str(src), "-vf", VIEW, "-frames:v", "1", "-f", "rawvideo",
                          "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    Image.fromarray(np.frombuffer(raw, np.uint8).reshape(1080, 1072, 3)).save(out / "first_hq.webp", quality=90, method=6)
    meta = {"episode_id": rec["episode_id"], "source": str(src), "source_sha256": rec["output_sha256"],
            "render": {k: rec[k] for k in ("renderer", "rendering_mode", "renders_per_frame", "pathtracing_spp", "width",
                                           "height", "window_of_1280x720", "frames_per_tick", "interpolation",
                                           "max_joint_write_error", "max_object_write_error_m", "physics_stepped",
                                           "policy_queried", "tick_range", "ticks_logged")},
            "display": {"view": VIEW, "crf": crf, "fps": 30, "hold_last_frame": 1},
            "files": {p.name: {"bytes": p.stat().st_size, "sha256": sha(p)} for p in (mp4, out / "first_hq.webp")}}
    (out / "hq.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps({"episode": rec["episode_id"], **meta["files"]}))

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 18)
