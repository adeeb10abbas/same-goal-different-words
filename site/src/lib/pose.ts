/**
 * Rigid-body geometry for the replay minimap. Everything here mirrors the study scorer: poses are asset origins plus
 * (w, x, y, z) quaternions in the robot frame (m); body-frame shapes come from `bodies.json` (mm).
 */

export type V3 = [number, number, number];
export type Pt = [number, number];
/** Row-major 3x3 rotation. */
export type M3 = [number, number, number, number, number, number, number, number, number];
export interface Pose {
  p: V3;
  R: M3;
}

export interface Body {
  label: string;
  /** Convex pieces (body frame, mm) whose projected union is the silhouette. */
  parts: number[][][];
  /** The scorer's eight local box corners (mm); their posed min/max is the "on top" footprint. */
  corners: number[][];
  /** The scorer's box centre (mm). */
  c: number[];
  /** Hull-vertex centroid (mm), the point the containment check tests. */
  hc: number[];
  bowl?: { axis: number[]; c: number[]; r: number };
}

export interface SceneBodies {
  view: { x: [number, number]; y: [number, number] };
  objects: Record<string, Body>;
}

/** Anything with per-tick origin coordinates (m) and interleaved (w, x, y, z) quaternions. */
export interface Track {
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  z: ArrayLike<number>;
  q: ArrayLike<number>;
}

export function quatToMat(w: number, x: number, y: number, z: number): M3 {
  const n = Math.hypot(w, x, y, z) || 1;
  w /= n;
  x /= n;
  y /= n;
  z /= n;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
  ];
}

/** Pose at a possibly fractional tick: positions are interpolated linearly, orientations by normalised lerp. */
export function poseAt(o: Track, t: number): Pose {
  const n = o.x.length;
  const tt = Math.max(0, Math.min(n - 1, t));
  const i = Math.floor(tt);
  const j = Math.min(n - 1, i + 1);
  const f = tt - i;
  const q = o.q;
  let w = q[4 * i], x = q[4 * i + 1], y = q[4 * i + 2], z = q[4 * i + 3];
  if (f > 0) {
    const s = w * q[4 * j] + x * q[4 * j + 1] + y * q[4 * j + 2] + z * q[4 * j + 3] < 0 ? -1 : 1;
    w += (s * q[4 * j] - w) * f;
    x += (s * q[4 * j + 1] - x) * f;
    y += (s * q[4 * j + 2] - y) * f;
    z += (s * q[4 * j + 3] - z) * f;
  }
  return {
    p: [o.x[i] + (o.x[j] - o.x[i]) * f, o.y[i] + (o.y[j] - o.y[i]) * f, o.z[i] + (o.z[j] - o.z[i]) * f],
    R: quatToMat(w, x, y, z),
  };
}

/** World position (m) of a body-frame point given in mm. */
export function place(T: Pose, v: ArrayLike<number>): V3 {
  const a = v[0] / 1000, b = v[1] / 1000, c = v[2] / 1000;
  const R = T.R;
  return [
    T.p[0] + R[0] * a + R[1] * b + R[2] * c,
    T.p[1] + R[3] * a + R[4] * b + R[5] * c,
    T.p[2] + R[6] * a + R[7] * b + R[8] * c,
  ];
}

/** World direction of a body-frame direction. */
export function turn(T: Pose, v: ArrayLike<number>): V3 {
  const R = T.R;
  return [
    R[0] * v[0] + R[1] * v[1] + R[2] * v[2],
    R[3] * v[0] + R[4] * v[1] + R[5] * v[2],
    R[6] * v[0] + R[7] * v[1] + R[8] * v[2],
  ];
}

const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Convex hull (Andrew's monotone chain), counter-clockwise, without repeated end point. */
export function hull2d(pts: Pt[]): Pt[] {
  if (pts.length < 3) return pts.slice();
  const s = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const lo: Pt[] = [];
  for (const p of s) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop();
    lo.push(p);
  }
  const up: Pt[] = [];
  for (let k = s.length - 1; k >= 0; k--) {
    const p = s[k];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop();
    up.push(p);
  }
  lo.pop();
  up.pop();
  return lo.concat(up);
}

/** Top-down silhouette as convex polygons in the table plane (m); their union is the object's outline. */
export function silhouette(body: Body, T: Pose): Pt[][] {
  const R = T.R;
  return body.parts.map((part) =>
    hull2d(
      part.map((v) => {
        const a = v[0] / 1000, b = v[1] / 1000, c = v[2] / 1000;
        return [T.p[0] + R[0] * a + R[1] * b + R[2] * c, T.p[1] + R[3] * a + R[4] * b + R[5] * c] as Pt;
      }),
    ),
  );
}

/** The scorer's "on top" footprint: min/max of the posed local box corners in the table plane, [x0, y0, x1, y1]. */
export function footprint(body: Body, T: Pose): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const v of body.corners) {
    const [x, y] = place(T, v);
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}

/** Point inside a counter-clockwise convex polygon (boundary included). */
export function insideConvex(poly: Pt[], p: Pt): boolean {
  if (poly.length < 3) return false;
  for (let k = 0; k < poly.length; k++) {
    if (cross(poly[k], poly[(k + 1) % poly.length], p) < 0) return false;
  }
  return true;
}

/** Nearest point on the boundary of any of the polygons. */
export function nearestOnPolys(polys: Pt[][], p: Pt): Pt {
  let best: Pt = p;
  let bd = Infinity;
  for (const poly of polys) {
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const L = dx * dx + dy * dy;
      const u = L > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
      const q: Pt = [a[0] + u * dx, a[1] + u * dy];
      const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
  }
  return best;
}

export const DIRS: Record<string, Pt> = { L: [0, 1], R: [0, -1], F: [-1, 0], B: [1, 0] };
export const CONE_HALF_ANGLE = Math.PI / 4;
export const FOOTPRINT_TOL = 0.01;

/** Directional relation as scored: the mover's origin lies within 45 degrees of the direction from the reference's origin. */
export function directionHolds(dir: Pt, mover: V3 | Pt, ref: V3 | Pt): boolean {
  const vx = mover[0] - ref[0], vy = mover[1] - ref[1];
  return vx * dir[0] + vy * dir[1] >= Math.hypot(vx, vy) * Math.cos(CONE_HALF_ANGLE);
}

/** "On top" relation as scored: the mover's box centre lies over the reference footprint, give or take 1 cm. */
export function onTopHolds(moverCentre: V3 | Pt, refFootprint: [number, number, number, number]): boolean {
  const [x0, y0, x1, y1] = refFootprint;
  const [x, y] = moverCentre;
  return x >= x0 - FOOTPRINT_TOL && x <= x1 + FOOTPRINT_TOL && y >= y0 - FOOTPRINT_TOL && y <= y1 + FOOTPRINT_TOL;
}
