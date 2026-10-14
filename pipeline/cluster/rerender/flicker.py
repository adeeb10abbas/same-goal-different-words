"""Temporal flicker in static regions of the displayed top view (2x display pixels)."""
import subprocess, sys
import numpy as np

FF = "/data/users/ali/vla_wam/envs/robolab-v2-isaac50/lib/python3.11/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
DEN = ",atadenoise=0a=0.05:0b=0.10:1a=0.05:1b=0.10:2a=0.05:2b=0.10:s=9,removegrain=1"

def frames(path, s, a, b, extra=""):
    w, h = 1072, 1080
    vf = f"crop={int(540*s)}:{int(536*s)}:{int(380*s)}:{int(100*s)},transpose=2{extra},scale={w}:{h}:flags=lanczos,select='between(n\\,{a}\\,{b})'"
    raw = subprocess.run([FF, "-v", "error", "-i", path, "-vf", vf, "-fps_mode", "passthrough",
                          "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w).astype(np.float32)

# static regions in 1072x1080 display space: table near camera (bottom-left), floor/background (top-left)
REG = {"table": (np.s_[880:1060, 40:500]), "background": (np.s_[20:300, 20:300])}
if __name__ == "__main__":
    for spec in sys.argv[1:]:
        name, path, s, a, b, den = spec.split("|")
        f = frames(path, float(s), int(a), int(b), DEN if den == "1" else "")
        d = np.abs(np.diff(f, axis=0))
        out = {k: round(float(d[(slice(None),) + v].mean()), 3) for k, v in REG.items()}
        sd = {k + "_std": round(float(f[(slice(None),) + v].std(axis=0).mean()), 3) for k, v in REG.items()}
        print(name, len(f), out, sd)
