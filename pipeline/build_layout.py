#!/usr/bin/env python3
"""Extract the initial table layout of every scene for the goal schematics.

Writes ``site/src/data/layout.json``. For every scene and each of its eight starts, every object gets:

* ``x, y, z`` — the asset origin (rigid-body root) in the robot frame, metres. The scorer's directional relations
  compare these origins, not object centres.
* ``cx, cy`` — the centre of the object's scorer bounding box (used for ``on top``).
* ``box`` — the world-aligned scorer bounding box in the table plane, ``[x0, y0, x1, y1]``.
* ``poly`` — the exact top-down silhouette of the object's render mesh.

Also writes ``site/src/data/bodies.json`` for the replay minimap, which draws any later pose from the timelines. Per
scene and object, in the body frame (mm): ``parts`` (convex pieces whose projected union is the silhouette),
``corners`` (the scorer's eight local box corners; their posed min/max is the on-top footprint), ``c`` (the scorer's
box centre), ``hc`` (the hull-vertex centroid the containment check tests), ``label`` and, for bowls, ``bowl``
(opening axis, rim centre and rim radius). Each scene also gets a fixed ``view``: the table region (robot frame, m) that
holds the 1st-99th percentile of every object centroid on the table and of the gripper, over all of the scene's
rollouts, plus a margin.

The poses and boxes come from the logged tick-0 scorer state (``t0_geometry.json``); the silhouettes come from the
RoboLab meshes (``shapes.json``). Every model, goal and wording shares the same physical start, which is asserted here
against the compact replay timelines, together with the paper's list of goals that already hold at the start.
"""

from __future__ import annotations

import argparse
import json
import math
from itertools import accumulate
from pathlib import Path

SCENES = {"S1": "L", "S3": "L", "S4": "L", "S5": "LR"}
CHECK_GOALS = {"S1": ["L", "R", "F", "B"], "S3": ["TOP", "L", "R"], "S4": ["TOP", "L", "R"], "S5": ["LR", "RL"]}
DIRS = {"L": (0.0, 1.0), "R": (0.0, -1.0), "F": (-1.0, 0.0), "B": (1.0, 0.0)}
CONE_HALF_ANGLE = math.radians(45)
VIEW_MARGIN = {"objects": 0.09, "tcp": 0.03}
ON_TABLE_Z = -0.05


def rotate(q: list[float], v: list[float]) -> list[float]:
    w, x, y, z = q
    n = math.sqrt(w * w + x * x + y * y + z * z)
    w, x, y, z = w / n, x / n, y / n, z / n
    a, b, c = v
    return [
        (1 - 2 * (y * y + z * z)) * a + 2 * (x * y - w * z) * b + 2 * (x * z + w * y) * c,
        2 * (x * y + w * z) * a + (1 - 2 * (x * x + z * z)) * b + 2 * (y * z - w * x) * c,
        2 * (x * z - w * y) * a + 2 * (y * z + w * x) * b + (1 - 2 * (x * x + y * y)) * c,
    ]


def percentile(v: list[float], p: float) -> float:
    v = sorted(v)
    k = (len(v) - 1) * p / 100
    i = int(k)
    return v[i] + (v[min(i + 1, len(v) - 1)] - v[i]) * (k - i)


def poly_area(poly: list[list[float]]) -> float:
    return 0.5 * abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(poly, poly[1:] + poly[:1])))


def inside(pt: tuple[float, float], poly: list[list[float]]) -> bool:
    x, y = pt
    hit = False
    for (ax, ay), (bx, by) in zip(poly, poly[1:] + poly[:1]):
        if (ay > y) != (by > y) and x < ax + (y - ay) * (bx - ax) / (by - ay):
            hit = not hit
    return hit


def r4(v: float) -> float:
    return round(v, 4)


def timeline_pose(obj: dict) -> tuple[list[float], list[float]]:
    pos = [obj[k][0] / 1e3 for k in "xyz"]
    quat = [v * 1e-4 for v in list(accumulate(obj["q"]))[:4]]
    return pos, quat


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--media", type=Path, default=Path("site/public/media/ep"))
    ap.add_argument("--geometry", type=Path, default=Path("pipeline/sources/t0_geometry.json"))
    ap.add_argument("--shapes", type=Path, default=Path("pipeline/sources/shapes.json"))
    ap.add_argument("--bodies-out", type=Path, default=Path("site/src/data/bodies.json"))
    ap.add_argument("--study", type=Path, default=Path("site/src/data/study.json"))
    ap.add_argument("--out", type=Path, default=Path("site/src/data/layout.json"))
    args = ap.parse_args()

    geometry = json.loads(args.geometry.read_text())["scenes"]
    shapes = json.loads(args.shapes.read_text())["scenes"]
    study = json.loads(args.study.read_text())
    goals = {sc["id"]: sc["goals"] for sc in study["scenes"]}
    labels = study["objects"]

    out: dict = {}
    bodies: dict = {}
    checks = {"identical starts": 0, "timeline pose": 0, "silhouette area": 0, "initially true": 0}
    worst = {"pos_mm": 0.0, "quat": 0.0, "area_cm2": 0.0}
    for scene, goal in SCENES.items():
        starts = []
        centre = {n: [(a + b) / 2e3 for a, b in zip(o["lb_pred_mm"][:3], o["lb_pred_mm"][3:])] for n, o in shapes[scene]["objects"].items()}
        seen: dict[str, list[float]] = {"ox": [], "oy": [], "tx": [], "ty": []}
        for c in range(1, 9):
            ref = None
            for m in ("N3", "E3", "F3"):
                for g in CHECK_GOALS[scene]:
                    for f in "DSI":
                        tl = json.loads((args.media / f"RWS-{m}-{scene}-C{c:02d}-{g}-{f}" / "timeline.json").read_text())
                        sig = {k: (o["x"][0], o["y"][0], o["z"][0], tuple(o["q"][:4])) for k, o in tl["objects"].items()}
                        if ref is None:
                            ref = sig
                        assert sig == ref, f"{scene} C{c:02d}: initial state differs for {m}-{g}-{f}"
                        checks["identical starts"] += 1
                        for name, o in tl["objects"].items():
                            qs = list(accumulate(o["q"]))
                            for i, (x, y, z) in enumerate(zip(accumulate(o["x"]), accumulate(o["y"]), accumulate(o["z"]))):
                                d = rotate([v * 1e-4 for v in qs[4 * i : 4 * i + 4]], centre[name])
                                if z / 1e3 + d[2] > ON_TABLE_Z:
                                    seen["ox"].append(x / 1e3 + d[0])
                                    seen["oy"].append(y / 1e3 + d[1])
                        seen["tx"] += [v / 1e3 for v in accumulate(tl["tcp"]["x"])]
                        seen["ty"] += [v / 1e3 for v in accumulate(tl["tcp"]["y"])]

            ep = f"RWS-N3-{scene}-C{c:02d}-{goal}-D"
            geo = geometry[scene][c - 1]
            assert geo["ep"] == ep, (geo["ep"], ep)
            tl = json.loads((args.media / ep / "timeline.json").read_text())["objects"]
            sil = shapes[scene]["starts"][c - 1]
            assert set(tl) == set(geo["objects"]) == set(sil), (scene, c)

            objs = {}
            for name, g in geo["objects"].items():
                pos, quat = timeline_pose(tl[name])
                dp = max(abs(a - b) for a, b in zip(pos, g["pos"])) * 1e3
                dq = min(max(abs(a - s * b) for a, b in zip(quat, g["quat"])) for s in (1, -1))
                assert dp <= 0.51 and dq <= 0.6e-4, (scene, c, name, dp, dq)
                worst["pos_mm"] = max(worst["pos_mm"], dp)
                worst["quat"] = max(worst["quat"], dq)
                checks["timeline pose"] += 1

                poly = [[r4(px), r4(py)] for px, py in sil[name]["sil"]]
                da = abs(poly_area(poly) * 1e4 - sil[name]["area_cm2"])
                assert da < 0.2, (scene, c, name, da)
                worst["area_cm2"] = max(worst["area_cm2"], da)
                checks["silhouette area"] += 1

                w, qx, qy, qz = g["quat"]
                objs[name] = {
                    "x": r4(g["pos"][0]),
                    "y": r4(g["pos"][1]),
                    "z": r4(g["pos"][2]),
                    "yaw": r4(math.atan2(2 * (w * qz + qx * qy), 1 - 2 * (qy * qy + qz * qz))),
                    "cx": r4(g["centroid"][0]),
                    "cy": r4(g["centroid"][1]),
                    "box": [r4(g["bbox_min"][0]), r4(g["bbox_min"][1]), r4(g["bbox_max"][0]), r4(g["bbox_max"][1])],
                    "poly": poly,
                }

            # The directional relations compare asset origins inside a 45-degree cone; this must reproduce exactly the
            # goals that the paper reports as already true at the start, at every start.
            for gl in goals[scene]:
                d = DIRS.get(gl["relation"])
                if d is None:
                    continue
                mv, rf = objs[gl["mover"]], objs[gl["reference"]]
                vx, vy = mv["x"] - rf["x"], mv["y"] - rf["y"]
                holds = vx * d[0] + vy * d[1] >= math.hypot(vx, vy) * math.cos(CONE_HALF_ANGLE)
                assert holds == gl["initiallyTrue"], (scene, c, gl["id"], holds)
                checks["initially true"] += 1
            starts.append(objs)

        names = sorted(starts[0])
        mean = {n: (sum(s[n]["cx"] for s in starts) / 8, sum(s[n]["cy"] for s in starts) / 8) for n in names}
        rep = min(
            range(8),
            key=lambda i: sum((starts[i][n]["cx"] - mean[n][0]) ** 2 + (starts[i][n]["cy"] - mean[n][1]) ** 2 for n in names),
        )
        out[scene] = {"rep": rep + 1, "starts": starts}
        view = {}
        for ax in "xy":
            lo = min(percentile(seen["o" + ax], 1) - VIEW_MARGIN["objects"], percentile(seen["t" + ax], 1) - VIEW_MARGIN["tcp"])
            hi = max(percentile(seen["o" + ax], 99) + VIEW_MARGIN["objects"], percentile(seen["t" + ax], 99) + VIEW_MARGIN["tcp"])
            view[ax] = [math.floor(lo * 100) / 100, math.ceil(hi * 100) / 100]
        print(f"  {scene} view x {view['x']} y {view['y']} from {len(seen['ox'])} object and {len(seen['tx'])} gripper samples")
        bodies[scene] = {"view": view, "objects": {}}
        bodies[scene]["objects"] = {
            n: {
                "label": labels[n],
                "parts": o["parts"],
                "corners": o["corners"],
                "c": [round((a + b) / 2, 2) for a, b in zip(o["lb_pred_mm"][:3], o["lb_pred_mm"][3:])],
                "hc": o["hc"],
                **({"bowl": o["bowl"]} if "bowl" in o else {}),
            }
            for n, o in shapes[scene]["objects"].items()
        }

        for n in names:
            o = starts[rep][n]
            off = math.hypot(o["x"] - o["cx"], o["y"] - o["cy"]) * 1e3
            where = "inside" if inside((o["x"], o["y"]), o["poly"]) else "OUTSIDE"
            print(f"  {scene} {n:15s} origin {off:5.1f} mm from box centre, {where} the silhouette (start {rep + 1})")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, separators=(",", ":")))
    args.bodies_out.write_text(json.dumps(bodies, separators=(",", ":")))
    print(f"wrote {args.out} ({args.out.stat().st_size} bytes), {args.bodies_out} ({args.bodies_out.stat().st_size} bytes)")
    print("checks:", checks)
    print("worst:", {k: round(v, 6) for k, v in worst.items()})
    for s, v in out.items():
        print(s, "representative start", v["rep"])


if __name__ == "__main__":
    main()
