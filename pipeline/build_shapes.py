#!/usr/bin/env python3
"""Recover exact object shapes for the top-down schematics from RoboLab's scene and object USDs.

The rollout logs record each object's rigid-body root pose and the scorer's box geometry, but not the mesh. Here
every study scene is composed from its native RoboLab scene file (with object payloads) and every mesh is
expressed in its rigid-body root frame. This gives, per scene and object,

* ``parts``: a few convex pieces of the mesh in the root frame (mm). The union of their projected hulls is the
  top-down silhouette at any pose, concavities included, so the replay minimap can draw tipped or lifted objects;
* ``corners``: the eight local corners the scorer's ``get_bbox`` transforms by the live pose (mm). Their world
  min/max is the footprint used by the on-top check;
* ``hc``: the hull-vertex centroid the containment check tests (mm);
* ``bowl``: for bowls, the opening axis, rim centre and rim radius (mm); and
* per start, ``sil``: the exact top-down silhouette at tick 0 (robot frame, m), concavities included.

Checks tie the meshes to the logged geometry before anything is written:

1. the scorer's local box, predicted as the world-aligned bound of the mesh at the scene's authored pose mapped
   into the root frame, must equal the logged ``local_bbox_min/max``;
2. the logged centroid must equal the root pose applied to the centre of that box;
3. the logged world box must equal the min/max of the posed ``corners``; and
4. the convex parts must reproduce the exact silhouette (IoU) at every logged start and at random 3D rotations.

Requires ``usd-core``, ``numpy``, ``scipy`` and ``shapely``. Usage::

    python pipeline/build_shapes.py --robolab /path/to/RoboLab/assets
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from pxr import Gf, Usd, UsdGeom
from scipy.spatial import ConvexHull
from scipy.spatial.transform import Rotation
from shapely import affinity, union_all
from shapely.geometry import MultiPoint, MultiPolygon, Polygon

SCENE_FILES = {
    "S1": "rubiks_cube_banana_bowl.usda",
    "S3": "butter_raisin_box.usda",
    "S4": "mustard_raisin_box.usda",
    "S5": "bowls_2_table.usda",
}
SUPPORT_DIRS = 96
MAX_PARTS = 12
MEAN_ERR_MM = 0.7
MAX_ERR_MM = 5.0
RANDOM_POSES = 8


def mat(m: Gf.Matrix4d) -> np.ndarray:
    """USD row-vector matrix to a column-vector 4x4."""
    return np.array(m, dtype=float).T


def quat_rot(q: list[float]) -> np.ndarray:
    w, x, y, z = np.asarray(q, dtype=float) / np.linalg.norm(q)
    return np.array(
        [
            [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
            [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
            [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
        ]
    )


def farthest(points: np.ndarray, k: int) -> np.ndarray:
    """Farthest-point subsample, which keeps the extremes of a hull."""
    if len(points) <= k:
        return points
    idx = [int(np.argmax(np.linalg.norm(points - points.mean(0), axis=1)))]
    d = np.linalg.norm(points - points[idx[0]], axis=1)
    while len(idx) < k:
        i = int(np.argmax(d))
        idx.append(i)
        d = np.minimum(d, np.linalg.norm(points - points[i], axis=1))
    return points[idx]


def silhouette(tris_xy: np.ndarray) -> Polygon:
    polys = [Polygon(t) for t in tris_xy]
    shape = union_all([p for p in polys if p.is_valid and p.area > 1e-12]).buffer(0)
    if isinstance(shape, MultiPolygon):
        shape = max(shape.geoms, key=lambda g: g.area)
    return Polygon(shape.exterior).simplify(0.0004, preserve_topology=True)


def sphere(m: int) -> np.ndarray:
    i = np.arange(m) + 0.5
    phi, th = np.arccos(1 - 2 * i / m), np.pi * (1 + 5**0.5) * i
    return np.c_[np.cos(th) * np.sin(phi), np.sin(th) * np.sin(phi), np.cos(phi)]


DIRS = sphere(SUPPORT_DIRS)


def support_points(P: np.ndarray) -> np.ndarray:
    """Hull vertices that are extreme along some sampled direction; bounds the error by direction spacing."""
    H = P[ConvexHull(P, qhull_options="QJ").vertices]
    return H[np.unique((H @ DIRS.T).argmax(0))]


def convex_parts(V: np.ndarray, F: np.ndarray, k: int) -> list[np.ndarray]:
    """Split the surface into k patches by k-means on triangle centroids and keep each patch's hull."""
    if k == 1:
        return [support_points(V)]
    C = V[F].mean(1)
    centres = farthest(C, k)
    for _ in range(50):
        lab = ((C[:, None, :] - centres[None]) ** 2).sum(-1).argmin(1)
        new = np.array([C[lab == j].mean(0) if (lab == j).any() else centres[j] for j in range(k)])
        if np.allclose(new, centres, atol=1e-7):
            break
        centres = new
    parts = []
    for j in range(k):
        # Whole triangles go to one patch, so neighbouring hulls share edges and their union has no gaps.
        P = V[np.unique(F[lab == j])]
        if len(P) >= 4:
            parts.append(support_points(P))
    return parts


def parts_outline(parts: list[np.ndarray], R: np.ndarray):
    return union_all([MultiPoint((p @ R.T)[:, :2]).convex_hull for p in parts])


def outline_error_mm(exact: Polygon, approx) -> tuple[float, float]:
    """Mean boundary error (symmetric-difference area per unit perimeter) and Hausdorff distance, in mm."""
    mean = exact.symmetric_difference(approx).area / exact.length
    return mean * 1e3, exact.exterior.hausdorff_distance(approx.boundary) * 1e3


def bowl_rim(V: np.ndarray) -> dict:
    """Opening axis (smallest spread, signed toward the wider end), rim centre and rim radius."""
    c = V.mean(0)
    w, vecs = np.linalg.eigh(np.cov((V - c).T))
    a = vecs[:, 0]
    t = (V - c) @ a
    radial = np.linalg.norm((V - c) - np.outer(t, a), axis=1)
    if radial[t < t.min() + 0.003].max() > radial[t > t.max() - 0.003].max():
        a, t = -a, -t
    rim = t > t.max() - 0.003
    return {"axis": np.round(a, 4).tolist(), "c": np.round((c + a * t.max()) * 1e3, 1).tolist(),
            "r": round(float(radial[rim].max() * 1e3), 1)}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--robolab", type=Path, required=True, help="RoboLab assets directory (with scenes/ and objects/)")
    ap.add_argument("--t0", type=Path, default=Path("pipeline/sources/t0_geometry.json"))
    ap.add_argument("--out", type=Path, default=Path("pipeline/sources/shapes.json"))
    args = ap.parse_args()

    t0 = json.loads(args.t0.read_text())
    out: dict = {
        "source": "RoboLab scene USDA + object USD meshes, composed with usd-core; root frame = logged rigid-body pose",
        "units": {"parts, corners, hc, bowl": "mm, root frame", "sil": "m, robot frame at tick 0"},
        "scenes": {},
    }
    worst = {"lb_mm": 0.0, "centroid_mm": 0.0, "world_box_mm": 0.0}
    fits: dict = {}
    randoms = list(Rotation.random(RANDOM_POSES, random_state=11).as_matrix())
    for sid, fname in SCENE_FILES.items():
        stage = Usd.Stage.Open(str(args.robolab / "scenes" / fname))
        cache = UsdGeom.XformCache()
        bbc = UsdGeom.BBoxCache(Usd.TimeCode.Default(), [UsdGeom.Tokens.default_])
        starts = t0["scenes"][sid]
        names = list(starts[0]["objects"])
        objs: dict = {}
        exact_at_start: dict = {}
        for name in names:
            root = next(p for p in stage.Traverse() if p.GetName() == name and p.GetParent() == stage.GetDefaultPrim())
            X_root = mat(cache.GetLocalToWorldTransform(root))
            assert np.allclose(np.linalg.norm(X_root[:3, :3], axis=0), 1, atol=1e-6), f"{sid}/{name}: scaled root"
            inv_root = np.linalg.inv(X_root)
            verts, tris = [], []
            for prim in Usd.PrimRange(root):
                if not prim.IsA(UsdGeom.Mesh):
                    continue
                mesh = UsdGeom.Mesh(prim)
                # The scorer reads default-purpose meshes only.
                if mesh.GetPurposeAttr().Get() not in (None, UsdGeom.Tokens.default_):
                    continue
                pts = np.array(mesh.GetPointsAttr().Get(), dtype=float)
                T = inv_root @ mat(cache.GetLocalToWorldTransform(prim))
                body = (T[:3, :3] @ pts.T).T + T[:3, 3]
                base = sum(len(v) for v in verts)
                verts.append(body)
                counts = mesh.GetFaceVertexCountsAttr().Get()
                idx = mesh.GetFaceVertexIndicesAttr().Get()
                k = 0
                for c in counts:
                    for j in range(1, c - 1):
                        tris.append((base + idx[k], base + idx[k + j], base + idx[k + j + 1]))
                    k += c
            V = np.vstack(verts)
            F = np.array(tris)

            # Scorer box: world-aligned bound at the authored pose, mapped into the root frame. get_bbox later
            # applies the live pose to these eight corners, so they are not an axis-aligned box in this frame.
            rng = bbc.ComputeWorldBound(root).ComputeAlignedRange()
            lo, hi = np.array(rng.GetMin()), np.array(rng.GetMax())
            corners = np.array([[a, b, c, 1.0] for a in (lo[0], hi[0]) for b in (lo[1], hi[1]) for c in (lo[2], hi[2])])
            local = (inv_root @ corners.T).T[:, :3]
            lb_pred = np.r_[local.min(0), local.max(0)]
            for st in starts:
                o = st["objects"][name]
                lb_log = np.r_[o["local_bbox_min"], o["local_bbox_max"]]
                worst["lb_mm"] = max(worst["lb_mm"], float(np.abs(lb_pred - lb_log).max() * 1e3))
                R = quat_rot(o["quat"])
                cen = np.asarray(o["pos"]) + R @ ((lb_log[:3] + lb_log[3:]) / 2)
                worst["centroid_mm"] = max(worst["centroid_mm"], float(np.linalg.norm(cen - o["centroid"]) * 1e3))
                W = local @ R.T + np.asarray(o["pos"])
                box_log = np.r_[o["bbox_min"], o["bbox_max"]]
                worst["world_box_mm"] = max(worst["world_box_mm"], float(np.abs(np.r_[W.min(0), W.max(0)] - box_log).max() * 1e3))

            Rs = [quat_rot(st["objects"][name]["quat"]) for st in starts] + randoms
            exact = [silhouette((V @ R.T)[F][:, :, :2]) for R in Rs]
            best = None
            for k in range(1, MAX_PARTS + 1):
                parts = convex_parts(V, F, k)
                errs = np.array([outline_error_mm(e, parts_outline(parts, R)) for e, R in zip(exact, Rs)]).max(0)
                if best is None or tuple(errs[::-1]) < tuple(best[1][::-1]):
                    best = (parts, errs)
                if errs[0] <= MEAN_ERR_MM and errs[1] <= MAX_ERR_MM:
                    break
            parts, errs = best
            fits[f"{sid}/{name}"] = {"parts": len(parts), "points": sum(len(p) for p in parts),
                                     "mean_mm": round(float(errs[0]), 2), "max_mm": round(float(errs[1]), 1)}
            objs[name] = {
                "parts": [np.round(p * 1e3, 1).tolist() for p in parts],
                "corners": np.round(local * 1e3, 2).tolist(),
                "hc": np.round(V[ConvexHull(V).vertices].mean(0) * 1e3, 2).tolist(),
                "mesh_centre_mm": np.round((V.min(0) + V.max(0)) / 2 * 1e3, 2).tolist(),
                "lb_pred_mm": np.round(lb_pred * 1e3, 2).tolist(),
            }
            if "bowl" in name:
                objs[name]["bowl"] = bowl_rim(V)
            exact_at_start[name] = exact[: len(starts)]
            print(f"{sid} {name:15s} verts={len(V):6d} tris={len(F):6d} {fits[f'{sid}/{name}']}", flush=True)

        sil_starts = []
        for i, st in enumerate(starts):
            row = {}
            for name in names:
                x, y = st["objects"][name]["pos"][:2]
                poly = affinity.translate(exact_at_start[name][i], x, y)
                xs, ys = poly.exterior.coords.xy
                row[name] = {
                    "sil": [[round(a, 4), round(b, 4)] for a, b in list(zip(xs, ys))[:-1]],
                    "area_cm2": round(poly.area * 1e4, 1),
                }
            sil_starts.append(row)
        out["scenes"][sid] = {"objects": objs, "starts": sil_starts}

    assert worst["lb_mm"] < 0.5, f"scorer box mismatch {worst['lb_mm']:.3f} mm"
    assert worst["centroid_mm"] < 0.5, f"centroid mismatch {worst['centroid_mm']:.3f} mm"
    assert worst["world_box_mm"] < 0.5, f"world box mismatch {worst['world_box_mm']:.3f} mm"
    low = {k: v for k, v in fits.items() if v["mean_mm"] > MEAN_ERR_MM or v["max_mm"] > MAX_ERR_MM}
    assert not low, f"convex parts outside {MEAN_ERR_MM} mm mean / {MAX_ERR_MM} mm max: {low}"
    out["checks"] = {**{k: round(v, 4) for k, v in worst.items()}, "parts": fits}
    args.out.write_text(json.dumps(out, separators=(",", ":")))
    print(f"wrote {args.out} ({args.out.stat().st_size} bytes); worst lb {worst['lb_mm']:.4f} mm, "
          f"centroid {worst['centroid_mm']:.4f} mm, world box {worst['world_box_mm']:.4f} mm")

if __name__ == "__main__":
    main()
