"""Re-render an executed rollout from its logged simulator states, for display only.

Kinematic replay of one valid attempt: restore the attempt's initial state slot, then for every logged 15 Hz
control tick write the logged robot joint positions and the logged root poses of every movable object, render,
and capture the exterior head camera. No physics is stepped and no policy is queried, so the replay cannot
change what happened. Optional in-between frames (--sub > 1) interpolate between consecutive logged ticks:
cubic Hermite on joint positions and object positions using the logged velocities, slerp on orientations.

Frames are written losslessly (libx264rgb, qp 0) together with a JSON receipt.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
import os
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

FFMPEG = "/data/users/ali/vla_wam/envs/robolab-v2-isaac50/lib/python3.11/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
CONTROL_DT = 1.0 / 15.0


def hermite(p0, p1, v0, v1, dt, s):
    h00 = 2 * s**3 - 3 * s**2 + 1
    h10 = s**3 - 2 * s**2 + s
    h01 = -2 * s**3 + 3 * s**2
    h11 = s**3 - s**2
    return h00 * p0 + h10 * dt * v0 + h01 * p1 + h11 * dt * v1


def slerp(q0, q1, s):
    q0 = q0 / np.linalg.norm(q0)
    q1 = q1 / np.linalg.norm(q1)
    d = float(np.dot(q0, q1))
    if d < 0:
        q1, d = -q1, -d
    if d > 0.9995:
        q = q0 + s * (q1 - q0)
        return q / np.linalg.norm(q)
    th = math.acos(d)
    return (math.sin((1 - s) * th) * q0 + math.sin(s * th) * q1) / math.sin(th)


def load_ticks(attempt: Path) -> list[dict]:
    with gzip.open(attempt / "states.jsonl.gz", "rt") as f:
        return [json.loads(line) for line in f if line.strip()]


def pose_at(ticks, names, i, s):
    a = ticks[i]
    if s == 0.0:
        q = np.asarray(a["joint_pos"], dtype=np.float64)
        objs = {n: (np.asarray(a["objects"][n]["pos"]), np.asarray(a["objects"][n]["quat"])) for n in names}
        return q, objs
    b = ticks[i + 1]
    q = hermite(np.asarray(a["joint_pos"]), np.asarray(b["joint_pos"]), np.asarray(a["joint_vel"]),
                np.asarray(b["joint_vel"]), CONTROL_DT, s)
    objs = {}
    for n in names:
        oa, ob = a["objects"][n], b["objects"][n]
        p = hermite(np.asarray(oa["pos"]), np.asarray(ob["pos"]), np.asarray(oa["lin_vel"]), np.asarray(ob["lin_vel"]),
                    CONTROL_DT, s)
        objs[n] = (p, slerp(np.asarray(oa["quat"]), np.asarray(ob["quat"]), s))
    return q, objs


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--attempt", type=Path, required=True)
    ap.add_argument("--scene", required=True)
    ap.add_argument("--out", type=Path, required=True, help="output .mkv path")
    ap.add_argument("--state-root", type=Path, default=Path("/data/users/ali/rws-20260926/states"))
    ap.add_argument("--robolab-root", type=Path, default=Path("/data/users/ali/rws-20260926/external/RoboLab-0aef241"))
    ap.add_argument("--scale", type=float, default=3.0, help="head camera resolution multiple of 1280x720")
    ap.add_argument("--sub", type=int, default=2, help="frames per control tick (1 = logged ticks only)")
    ap.add_argument("--accum", type=int, default=16, help="renders per output frame (static scene; converges denoisers)")
    ap.add_argument("--renderer", default="realtime", choices=["realtime", "pathtracing"])
    ap.add_argument("--mode", default="quality", choices=["performance", "balanced", "quality"])
    ap.add_argument("--aa", default="DLAA", help="antialiasing mode (Off/FXAA/DLSS/TAA/DLAA) or '' to keep preset")
    ap.add_argument("--spp", type=int, default=0, help="path tracer samples per render (0 = default)")
    ap.add_argument("--ticks", default="", help="optional tick range a:b for tests")
    ap.add_argument("--warmup", type=int, default=60)
    ap.add_argument("--window", default="", help="render only a centered WxH window of the 1280x720 view (same pixel density)")
    ap.add_argument("--device", default="cuda:0")
    ap.add_argument("--keep-other-cameras", action="store_true", help="do not shrink the undisplayed policy cameras")
    args = ap.parse_args()

    from isaaclab.app import AppLauncher

    app = AppLauncher({"headless": True, "enable_cameras": True, "device": args.device,
                       "kit_args": "--/renderer/multiGpu/enabled=false"}).app
    code = 0
    try:
        run(args)
    except BaseException:
        import traceback

        traceback.print_exc()
        code = 1
    finally:
        sys.stdout.flush()
        app.close()
    sys.exit(code)


def run(args) -> None:
    import torch
    import robolab.core.environments.config as rcfg
    import robolab.core.environments.runtime as rrt
    from experiments.robolab_workshop import sim_env
    from experiments.robolab_workshop.states import load_state

    win = [int(v) for v in args.window.split("x")] if args.window else [1280, 720]
    W, H = int(round(win[0] * args.scale)), int(round(win[1] * args.scale))
    orig_parse, orig_create = rcfg.parse_env_cfg, rrt.create_env
    shrunk: list[str] = []
    aperture: dict = {}

    def shrink(cfg):
        for name, val in vars(cfg.scene).items():
            if name != "head_camera" and hasattr(val, "width") and hasattr(val, "height") and hasattr(val, "prim_path"):
                val.width, val.height = 64, 36
                if name not in shrunk:
                    shrunk.append(name)

    def parse(*a, **k):
        cfg = orig_parse(*a, **k)
        hc = cfg.scene.head_camera
        if (hc.width, hc.height) != (1280, 720):
            raise RuntimeError(f"unexpected head camera {hc.width}x{hc.height}")
        if args.window:
            ha = float(hc.spawn.horizontal_aperture)
            va = float(hc.spawn.vertical_aperture or ha * 720 / 1280)
            hc.spawn.horizontal_aperture = ha * win[0] / 1280
            hc.spawn.vertical_aperture = va * win[1] / 720
            aperture.update(original=[ha, va], window=[hc.spawn.horizontal_aperture, hc.spawn.vertical_aperture])
        hc.width, hc.height = W, H
        if not args.keep_other_cameras:
            shrink(cfg)
        if args.aa:
            cfg.sim.render.antialiasing_mode = args.aa
        if args.renderer == "pathtracing" and args.spp:
            carb = dict(cfg.sim.render.carb_settings or {})
            carb["/rtx/pathtracing/spp"] = args.spp
            carb["/rtx/pathtracing/totalSpp"] = args.spp * args.accum
            carb["/rtx/pathtracing/optixDenoiser/enabled"] = True
            cfg.sim.render.carb_settings = carb
        return cfg

    def create(cfg, **k):
        k["renderer"], k["rendering_mode"] = args.renderer, args.mode
        if not args.keep_other_cameras:
            shrink(cfg)
        return orig_create(cfg, **k)

    rcfg.parse_env_cfg, rrt.create_env = parse, create

    attempt = args.attempt
    intent = json.loads((attempt / "intent.json").read_text())
    initial = json.loads((attempt / "initial_state.json").read_text())
    slot = initial["state_slot"]
    ticks = load_ticks(attempt)
    state, _first, receipt = load_state(args.state_root / slot)
    if receipt.get("state_sha256") != initial.get("state_sha256"):
        raise RuntimeError(f"state slot hash {receipt.get('state_sha256')} != attempt {initial.get('state_sha256')}")

    t0 = time.time()
    env = sim_env.StudyEnv(args.scene, robolab_root=args.robolab_root,
                           output_dir=Path(f"/tmp/sgdw-rr-{os.getpid()}"), device=args.device,
                           warmup_renders=args.warmup)
    print(json.dumps({"event": "env_ready", "s": round(time.time() - t0, 1), "W": W, "H": H}), flush=True)
    env.restore_state(state, renders=args.warmup)
    names = list(env.named_objects)
    if sorted(names) != sorted(ticks[0]["objects"].keys()):
        raise RuntimeError(f"object set {names} != logged {list(ticks[0]['objects'])}")
    if sorted(env.movable) != sorted(names):
        raise RuntimeError(f"movable {env.movable} not all logged ({names})")

    scene = env.env.scene
    robot = env.robot
    dev = env.env.device
    origin = scene.env_origins[0]
    cam = scene["head_camera"]

    def apply(q, objs):
        jp = torch.as_tensor(q, dtype=torch.float32, device=dev).reshape(1, -1)
        robot.write_joint_state_to_sim(jp, torch.zeros_like(jp))
        robot.set_joint_position_target(jp)
        robot.write_data_to_sim()
        for n, (p, qq) in objs.items():
            pose = torch.cat([torch.as_tensor(p, dtype=torch.float32, device=dev) + origin,
                              torch.as_tensor(qq, dtype=torch.float32, device=dev)]).reshape(1, 7)
            scene[n].write_root_pose_to_sim(pose)
            scene[n].write_root_velocity_to_sim(torch.zeros(1, 6, device=dev))
        env.env.sim.forward()
        scene.update(dt=0.0)

    def grab():
        for _ in range(args.accum):
            env.env.sim.render()
        cam.update(0.0, force_recompute=True)
        return cam.data.output["rgb"][0, ..., :3].detach().cpu().numpy().astype(np.uint8)

    lo, hi = 0, len(ticks) - 1
    if args.ticks:
        a, b = args.ticks.split(":")
        lo, hi = int(a), min(int(b), hi)
    frames = [(i, j / args.sub) for i in range(lo, hi) for j in range(args.sub)] + [(hi, 0.0)]

    args.out.parent.mkdir(parents=True, exist_ok=True)
    tmp = args.out.with_suffix(".partial.mkv")
    fps = 15 * args.sub
    ff = subprocess.Popen([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
                           "-s", f"{W}x{H}", "-r", str(fps), "-i", "-", "-c:v", "libx264rgb", "-qp", "0",
                           "-preset", "ultrafast", "-pix_fmt", "rgb24", str(tmp)], stdin=subprocess.PIPE)
    joint_err = 0.0
    obj_err = 0.0
    t1 = time.time()
    for k, (i, s) in enumerate(frames):
        q, objs = pose_at(ticks, names, i, s)
        apply(q, objs)
        if s == 0.0 and k % 50 == 0:
            got = robot.data.joint_pos[0].detach().cpu().numpy()
            joint_err = max(joint_err, float(np.abs(got - q).max()))
            for n, (p, _qq) in objs.items():
                gp = (scene[n].data.root_pos_w[0] - origin).detach().cpu().numpy()
                obj_err = max(obj_err, float(np.abs(gp - p).max()))
        ff.stdin.write(grab().tobytes())
        if k % 100 == 0:
            el = time.time() - t1
            print(json.dumps({"event": "frame", "k": k, "n": len(frames), "s_per_frame": round(el / (k + 1), 3)}), flush=True)
    ff.stdin.close()
    if ff.wait() != 0:
        raise RuntimeError("ffmpeg failed")
    tmp.rename(args.out)
    h = hashlib.sha256()
    with open(args.out, "rb") as f:
        for blk in iter(lambda: f.read(1 << 20), b""):
            h.update(blk)
    receipt_out = {
        "kind": "display_rerender_from_logged_states",
        "episode_id": intent["episode_id"], "attempt_dir": str(attempt), "state_slot": slot,
        "state_sha256": initial["state_sha256"], "ticks_logged": len(ticks), "tick_range": [lo, hi],
        "frames": len(frames), "fps": fps, "frames_per_tick": args.sub,
        "interpolation": None if args.sub == 1 else "cubic Hermite (joint and object positions, logged velocities), slerp (orientations)",
        "camera": "head_camera", "width": W, "height": H,
        "window_of_1280x720": win, "head_camera_apertures_mm": aperture or None, "undisplayed_cameras_shrunk": shrunk, "renderer": args.renderer, "rendering_mode": args.mode,
        "antialiasing": args.aa or None, "renders_per_frame": args.accum, "pathtracing_spp": args.spp or None,
        "max_joint_write_error": joint_err, "max_object_write_error_m": obj_err,
        "physics_stepped": False, "policy_queried": False,
        "output": str(args.out), "output_sha256": h.hexdigest(), "wall_s": round(time.time() - t0, 1),
    }
    args.out.with_suffix(".json").write_text(json.dumps(receipt_out, indent=2))
    print(json.dumps({"event": "done", **{k: receipt_out[k] for k in ("frames", "max_joint_write_error", "max_object_write_error_m", "wall_s")}}), flush=True)
    env.close()


if __name__ == "__main__":
    main()
