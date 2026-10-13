/**
 * Verifies the minimap geometry (site/src/lib/pose.ts) against the study's logged scorer state.
 *
 *   node pipeline/check_minimap.ts
 *
 * 1. At every start, the posed local box corners reproduce the logged world box, the posed box centre reproduces the
 *    logged centroid, and the union of posed convex parts reproduces the exact mesh silhouette (raster comparison).
 * 2. At every tick of every rollout, the directional and "on top" relations recomputed from the decoded poses agree
 *    with the logged relation flags. Disagreements are only allowed within the quantisation of the compact timelines.
 */
import { readFileSync, readdirSync } from 'node:fs';
import {
  DIRS,
  directionHolds,
  footprint,
  insideConvex,
  onTopHolds,
  place,
  poseAt,
  silhouette,
  type Pt,
  type SceneBodies,
  type Track,
} from '../site/src/lib/pose.ts';

const root = new URL('../', import.meta.url).pathname;
const bodies: Record<string, SceneBodies> = JSON.parse(readFileSync(`${root}site/src/data/bodies.json`, 'utf8'));
const layout = JSON.parse(readFileSync(`${root}site/src/data/layout.json`, 'utf8'));
const mediaDir = `${root}site/public/media/ep`;

function cum(d: number[], scale: number): Float64Array {
  const out = new Float64Array(d.length);
  let s = 0;
  for (let i = 0; i < d.length; i++) out[i] = (s += d[i]) * scale;
  return out;
}

const decode = (o: any): Track => ({ x: cum(o.x, 1e-3), y: cum(o.y, 1e-3), z: cum(o.z, 1e-3), q: cum(o.q, 1e-4) });

function insidePoly(poly: number[][], x: number, y: number): boolean {
  let hit = false;
  for (let k = 0, j = poly.length - 1; k < poly.length; j = k++) {
    const [ax, ay] = poly[k], [bx, by] = poly[j];
    if (ay > y !== by > y && x < ax + ((y - ay) * (bx - ax)) / (by - ay)) hit = !hit;
  }
  return hit;
}

const perimeter = (poly: number[][]) => poly.reduce((s, p, k) => s + Math.hypot(...poly[(k + 1) % poly.length].map((v, d) => v - p[d])), 0);

// 1. starts
let worstBox = 0, worstCentre = 0, worstSil = 0;
const STEP = 0.0005;
for (const [scene, S] of Object.entries<any>(layout)) {
  for (const [c, start] of (S.starts as any[]).entries()) {
    const ep = readdirSync(mediaDir).find((e) => e.startsWith(`RWS-N3-${scene}-C${String(c + 1).padStart(2, '0')}-`))!;
    const tl = JSON.parse(readFileSync(`${mediaDir}/${ep}/timeline.json`, 'utf8'));
    for (const [name, o] of Object.entries<any>(start)) {
      const body = bodies[scene].objects[name];
      const T = poseAt(decode(tl.objects[name]), 0);
      const fp = footprint(body, T);
      worstBox = Math.max(worstBox, ...fp.map((v, k) => Math.abs(v - o.box[k]) * 1e3));
      const ctr = place(T, body.c);
      worstCentre = Math.max(worstCentre, Math.hypot(ctr[0] - o.cx, ctr[1] - o.cy) * 1e3);
      const parts = silhouette(body, T);
      let diff = 0;
      for (let x = fp[0] - 0.01; x <= fp[2] + 0.01; x += STEP) {
        for (let y = fp[1] - 0.01; y <= fp[3] + 0.01; y += STEP) {
          const a = parts.some((p) => insideConvex(p, [x, y] as Pt));
          if (a !== insidePoly(o.poly, x, y)) diff++;
        }
      }
      const meanErr = ((diff * STEP * STEP) / perimeter(o.poly)) * 1e3;
      worstSil = Math.max(worstSil, meanErr);
    }
  }
}
console.log(`starts: worst box ${worstBox.toFixed(3)} mm, centre ${worstCentre.toFixed(3)} mm, silhouette mean boundary error ${worstSil.toFixed(2)} mm`);
if (worstBox > 1 || worstCentre > 1 || worstSil > 1) throw new Error('start geometry check failed');

// 2. every tick
const inRuns = (runs: number[][], i: number) => runs.some(([a, b]) => i >= a && i <= b);
const tally: Record<string, { ticks: number; agree: number; worstMargin: number }> = {};
for (const ep of readdirSync(mediaDir).filter((e) => e.startsWith('RWS-'))) {
  const tl = JSON.parse(readFileSync(`${mediaDir}/${ep}/timeline.json`, 'utf8'));
  const scene = ep.split('-')[2];
  const goal: string = tl.goal;
  if (goal === 'LR' || goal === 'RL') continue;
  const kind = goal === 'TOP' ? 'on top' : 'direction';
  const mover = decode(tl.objects[tl.mover]);
  const ref = decode(tl.objects[tl.reference]);
  const mb = bodies[scene].objects[tl.mover];
  const rb = bodies[scene].objects[tl.reference];
  const t = (tally[kind] ??= { ticks: 0, agree: 0, worstMargin: 0 });
  for (let i = 0; i < tl.n; i++) {
    const M = poseAt(mover, i), R = poseAt(ref, i);
    let holds: boolean, margin: number;
    if (kind === 'direction') {
      const d = DIRS[goal];
      holds = directionHolds(d, M.p, R.p);
      const vx = M.p[0] - R.p[0], vy = M.p[1] - R.p[1];
      // distance (m) of the mover origin from the nearest cone edge
      const r = Math.hypot(vx, vy);
      const ang = Math.acos(Math.max(-1, Math.min(1, (vx * d[0] + vy * d[1]) / (r || 1))));
      margin = Math.abs(Math.sin(ang - Math.PI / 4)) * r;
    } else {
      const fp = footprint(rb, R);
      const ctr = place(M, mb.c);
      holds = onTopHolds(ctr, fp);
      margin = Math.min(...[ctr[0] - fp[0], fp[2] - ctr[0], ctr[1] - fp[1], fp[3] - ctr[1]].map((v) => Math.abs(v + 0.01)));
    }
    t.ticks++;
    if (holds === inRuns(tl.flags.relation, i)) t.agree++;
    else t.worstMargin = Math.max(t.worstMargin, margin * 1e3);
  }
}
for (const [k, v] of Object.entries(tally)) {
  console.log(`${k}: ${v.agree}/${v.ticks} ticks agree with the logged relation; disagreements lie within ${v.worstMargin.toFixed(2)} mm of the boundary`);
  if (v.worstMargin > 1.5) throw new Error(`${k}: disagreement away from the boundary`);
}
console.log('minimap geometry OK');
