"""Compare a re-render against the originally recorded head-camera frames."""
import json, subprocess, sys
import numpy as np, cv2

FF = "/data/users/ali/vla_wam/envs/robolab-v2-isaac50/lib/python3.11/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"

def probe(path):
    out = subprocess.run([FF, "-hide_banner", "-i", path], capture_output=True, text=True).stderr
    import re
    m = re.search(r"Video:.*?(\d{3,5})x(\d{3,5})", out)
    return int(m.group(1)), int(m.group(2))

def frames(path, n, vf=None):
    w, h = probe(path)
    cmd = [FF, "-v", "error", "-i", path]
    if vf:
        cmd += ["-vf", vf]
    cmd += ["-frames:v", str(n), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    if vf:
        w, h = [int(x) for x in vf.split("scale=")[1].split(":")[:2]] if "scale=" in vf else (w, h)
    a = np.frombuffer(raw, np.uint8)
    return a.reshape(-1, h, w, 3)

def grain(img):
    g = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY).astype(np.float32)
    return float(np.abs(g - cv2.GaussianBlur(g, (0, 0), 1.0)).mean())

def main(orig, new, out_png, n, idx):
    a = frames(orig, n)
    b = frames(new, n)
    if b.shape[1:] != a.shape[1:]:
        b = np.stack([cv2.resize(x, (a.shape[2], a.shape[1]), interpolation=cv2.INTER_AREA) for x in b])
    k = min(len(a), len(b))
    rows, stats = [], []
    for i in range(k):
        d = np.abs(a[i].astype(np.int16) - b[i].astype(np.int16)).mean()
        ab = cv2.GaussianBlur(a[i], (0, 0), 3).astype(np.int16)
        bb = cv2.GaussianBlur(b[i], (0, 0), 3).astype(np.int16)
        db = np.abs(ab - bb).mean()
        stats.append((i, float(d), float(db), grain(a[i]), grain(b[i])))
    s = np.array([x[1:] for x in stats])
    print(json.dumps({"frames": k, "orig_shape": a.shape[1:], "mad_raw_mean": s[:, 0].mean(), "mad_raw_max": s[:, 0].max(),
                      "mad_blur_mean": s[:, 1].mean(), "mad_blur_max": s[:, 1].max(),
                      "grain_orig": s[:, 2].mean(), "grain_new": s[:, 3].mean()}, default=str))
    for i in idx:
        if i >= k:
            continue
        diff = np.clip(np.abs(a[i].astype(np.int16) - b[i].astype(np.int16)) * 4, 0, 255).astype(np.uint8)
        rows.append(np.concatenate([a[i], b[i], diff], axis=1))
    sheet = np.concatenate(rows, axis=0)
    cv2.imwrite(out_png, cv2.cvtColor(sheet, cv2.COLOR_RGB2BGR))
    print("worst blur frames:", sorted(stats, key=lambda x: -x[2])[:5])

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), [int(x) for x in sys.argv[5].split(",")])
