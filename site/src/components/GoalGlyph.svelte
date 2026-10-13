<script lang="ts">
  import layoutRaw from '../data/layout.json';
  import { fade, draw } from 'svelte/transition';
  import { cubicInOut } from 'svelte/easing';
  import { study, type Goal, type Scene } from '../lib/study';

  type Pt = [number, number];
  /** Tick-0 pose in the robot frame (metres): asset origin, scorer-box centre and footprint box, exact silhouette. */
  type Obj = {
    x: number;
    y: number;
    z: number;
    yaw: number;
    cx: number;
    cy: number;
    box: [number, number, number, number];
    poly: Pt[];
  };
  const LAYOUT = layoutRaw as unknown as Record<string, { rep: number; starts: Record<string, Obj>[] }>;

  let {
    goal,
    dark = false,
    start = null,
    showGoal = true,
  }: { goal: Goal & { scene: Scene }; dark?: boolean; start?: number | null; showGoal?: boolean } = $props();

  const uid = $props.id();
  const W = 360;
  const H = 264;
  const TOP = 30;
  const BOTTOM = 20;
  const SIDE = 16;
  const GAP = 0.035;
  const TOL = 0.01;
  const COS_MARGIN = Math.cos((38 * Math.PI) / 180);
  const DIRS: Record<string, Pt> = { L: [0, 1], R: [0, -1], F: [-1, 0], B: [1, 0] };

  const dot = (p: Pt, d: Pt) => p[0] * d[0] + p[1] * d[1];

  // Text sizes are in viewBox units. When the drawing is shown small they grow, so labels stay at least 11 CSS px and
  // the robot marker 9.5 CSS px; the top margin grows with the marker.
  let cw = $state(0);
  const k = $derived(cw ? W / cw : 1);
  const ls = $derived(Math.max(1, (11 * k) / 11.5));
  const rs = $derived(Math.max(1, (9.5 * k) / 8.5));
  const top = $derived(TOP + 26 * (rs - 1));

  function insidePoly(poly: Pt[], [x, y]: Pt) {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ax, ay] = poly[i];
      const [bx, by] = poly[j];
      if (ay > y !== by > y && x < ax + ((y - ay) * (bx - ax)) / (by - ay)) hit = !hit;
    }
    return hit;
  }

  function nearest(poly: Pt[], p: Pt): Pt {
    let best: Pt = poly[0];
    let bd = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const ex = b[0] - a[0];
      const ey = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / (ex * ex + ey * ey || 1)));
      const q: Pt = [a[0] + t * ex, a[1] + t * ey];
      const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
      if (d < bd) [bd, best] = [d, q];
    }
    return best;
  }

  /**
   * Robot-frame shift that moves the target to one example position satisfying the goal as the scorer defines it.
   * Directional relations compare asset origins: the target goes straight out along the cone axis, clear of the
   * reference, and far enough that its origin sits inside the cone with a margin. "On top" checks the target's box
   * centre against the reference's footprint box; "stacked" nests the bowls.
   */
  function shiftFor(objs: Record<string, Obj>, g: Goal): Pt {
    const m = objs[g.mover];
    const r = objs[g.reference];
    const d = DIRS[g.relation];
    if (d) {
      const off: Pt = [m.x - m.cx, m.y - m.cy];
      const reach = Math.max(...r.poly.map((p) => dot(p, d))) - dot([r.x, r.y], d);
      const back = Math.min(...m.poly.map(([px, py]) => dot([px - m.cx, py - m.cy], d)));
      let t = Math.max(0.04, reach - back + GAP);
      const inCone = (t: number) => {
        const v: Pt = [d[0] * t + off[0], d[1] * t + off[1]];
        return dot(v, d) >= Math.hypot(...v) * COS_MARGIN;
      };
      while (!inCone(t) && t < 1) t += 0.005;
      return [r.x + d[0] * t - m.cx, r.y + d[1] * t - m.cy];
    }
    if (g.relation === 'supported_on') return [(r.box[0] + r.box[2]) / 2 - m.cx, (r.box[1] + r.box[3]) / 2 - m.cy];
    return [r.cx - m.cx, r.cy - m.cy];
  }

  const scene = $derived(goal.scene);
  const sl = $derived(LAYOUT[scene.id]);
  const startNo = $derived(start ?? sl.rep);
  const objs = $derived(sl.starts[startNo - 1]);

  // One frame per scene, covering every start and every example placement, so switching goals or starts never rescales.
  const fit = $derived.by(() => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const add = (px: number, py: number) => {
      x0 = Math.min(x0, px); x1 = Math.max(x1, px);
      y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    };
    for (const st of sl.starts) {
      for (const o of Object.values(st)) {
        for (const [px, py] of o.poly) add(px, py);
        add(o.x, o.y);
      }
      for (const g of scene.goals) {
        const r = st[g.reference];
        if (g.relation === 'supported_on') {
          add(r.box[0] - TOL, r.box[1] - TOL);
          add(r.box[2] + TOL, r.box[3] + TOL);
        }
        if (g.initiallyTrue) continue;
        const m = st[g.mover];
        const [dx, dy] = shiftFor(st, g);
        for (const [px, py] of m.poly) add(px + dx, py + dy);
        add(m.x + dx, m.y + dy);
      }
    }
    const pad = 0.02;
    x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    const s = Math.min((W - 2 * SIDE) / (y1 - y0), (H - top - BOTTOM) / (x1 - x0));
    return { s, ox: W / 2 - ((y0 + y1) / 2) * s, oy: top + (H - top - BOTTOM) / 2 - ((x0 + x1) / 2) * s };
  });

  // Camera orientation, as in the videos: the robot is at the top facing the viewer, so x (away from the robot) is
  // screen down and y (the robot's left) is screen right.
  const P = (x: number, y: number): Pt => [fit.ox + y * fit.s, fit.oy + x * fit.s];
  const f1 = (v: number) => v.toFixed(1);
  const polyPath = (poly: Pt[], dx = 0, dy = 0) =>
    'M' + poly.map(([x, y]) => P(x + dx, y + dy).map(f1).join(',')).join('L') + 'Z';
  const isBowl = (name: string) => /bowl/.test(name);

  /** Distance from the box centre to the nearest silhouette edge, in pixels. */
  function inradius(o: Obj) {
    let r = Infinity;
    const n = o.poly.length;
    for (let i = 0; i < n; i++) {
      const [ax, ay] = o.poly[i];
      const [bx, by] = o.poly[(i + 1) % n];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      r = Math.min(r, Math.abs((bx - ax) * (ay - o.cy) - (ax - o.cx) * (by - ay)) / len);
    }
    return r * fit.s;
  }

  /** Mean distance from the box centre to the silhouette, in pixels (bowls are round). */
  const meanRadius = (o: Obj) => (o.poly.reduce((a, [x, y]) => a + Math.hypot(x - o.cx, y - o.cy), 0) / o.poly.length) * fit.s;

  function sbox(o: Obj, dx = 0, dy = 0) {
    const pts = o.poly.map(([x, y]) => P(x + dx, y + dy));
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  }

  const role = (name: string) => (name === goal.mover ? 'mover' : name === goal.reference ? 'ref' : 'other');
  const order = $derived(
    Object.keys(objs).sort((a, b) => ({ other: 0, ref: 1, mover: 2 })[role(a)] - ({ other: 0, ref: 1, mover: 2 })[role(b)]),
  );

  const dir = $derived(DIRS[goal.relation] ?? null);
  const mover = $derived(objs[goal.mover]);
  const ref = $derived(objs[goal.reference]);
  const shift = $derived(shiftFor(objs, goal));
  const apex = $derived(P(ref.x, ref.y));
  const R = $derived(0.24 * fit.s);
  const ang = $derived(dir ? Math.atan2(dir[0], dir[1]) : 0);
  const cone = $derived.by(() => {
    if (!dir) return '';
    const a0 = ang - Math.PI / 4;
    const a1 = ang + Math.PI / 4;
    const [x, y] = apex;
    return `M${f1(x)},${f1(y)}L${f1(x + R * Math.cos(a0))},${f1(y + R * Math.sin(a0))}A${f1(R)},${f1(R)} 0 0 1 ${f1(
      x + R * Math.cos(a1),
    )},${f1(y + R * Math.sin(a1))}Z`;
  });

  // "On top": the target's box centre must lie over the reference's footprint box, give or take 1 cm.
  const zone = $derived.by(() => {
    if (goal.relation !== 'supported_on') return null;
    const [ax, ay] = P(ref.box[0] - TOL, ref.box[1] - TOL);
    const [bx, by] = P(ref.box[2] + TOL, ref.box[3] + TOL);
    return { x: ax, y: ay, w: bx - ax, h: by - ay };
  });

  // The points the scorer compares: asset origins for directions, the box centre for "on top". An origin outside its
  // object gets a short tether to the nearest edge so it reads as belonging to that object.
  type Mark = { key: string; x: number; y: number; cls: string; tether: string | null; ghost: boolean };
  const marks = $derived.by(() => {
    const out: Mark[] = [];
    if (!showGoal) return out;
    const mk = (key: string, o: Obj, px: number, py: number, cls: string, dx = 0, dy = 0) => {
      const poly = o.poly.map(([a, b]) => [a + dx, b + dy] as Pt);
      const p: Pt = [px + dx, py + dy];
      const [sx, sy] = P(...p);
      let tether: string | null = null;
      if (!insidePoly(poly, p)) {
        const [qx, qy] = P(...nearest(poly, p));
        const len = Math.hypot(qx - sx, qy - sy);
        if (len > 5) {
          const k = 4.5 / len;
          tether = `M${f1(sx + (qx - sx) * k)},${f1(sy + (qy - sy) * k)}L${f1(qx)},${f1(qy)}`;
        }
      }
      out.push({ key, x: sx, y: sy, cls, tether, ghost: dx !== 0 || dy !== 0 });
    };
    if (dir) {
      mk('r', ref, ref.x, ref.y, 'ref');
      mk('m', mover, mover.x, mover.y, 'mover');
      if (!goal.initiallyTrue) mk('g', mover, mover.x, mover.y, 'mover', shift[0], shift[1]);
    } else if (zone) {
      mk('m', mover, mover.cx, mover.cy, 'mover');
      if (!goal.initiallyTrue) mk('g', mover, mover.cx, mover.cy, 'mover', shift[0], shift[1]);
    }
    return out;
  });

  // Example move: a quadratic arc from the target to its example placement, bowed away from the reference. For the
  // directional goals the bow grows until the arc clears the reference (and, if possible, every other object).
  const arc = $derived.by(() => {
    if (goal.initiallyTrue || !showGoal) return null;
    const a = P(mover.cx, mover.cy);
    const b = P(mover.cx + shift[0], mover.cy + shift[1]);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    let n: Pt = [-dy / len, dx / len];
    const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const rc = P(ref.cx, ref.cy);
    const side = (mid[0] - rc[0]) * n[0] + (mid[1] - rc[1]) * n[1];
    if (Math.abs(side) < 8) {
      if (n[1] < 0) n = [-n[0], -n[1]];
    } else if (side < 0) n = [-n[0], -n[1]];
    const quad =
      (c: Pt) =>
      (t: number): Pt => [
        (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0],
        (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1],
      ];
    const k0 = Math.min(60, 0.32 * len);
    let c: Pt = [mid[0] + n[0] * k0, mid[1] + n[1] * k0];
    if (dir) {
      const px = (o: Obj) => o.poly.map(([x, y]) => P(x, y));
      const refPoly = px(ref);
      const others = Object.keys(objs)
        .filter((k) => k !== goal.mover && k !== goal.reference)
        .map((k) => px(objs[k]));
      const clears = (cc: Pt, polys: Pt[][]) => {
        const B = quad(cc);
        for (let t = 0.05; t <= 0.95; t += 0.025) {
          const p = B(t);
          if (p[0] < 6 || p[0] > W - 6 || p[1] < top || p[1] > H - 6) return false;
          for (const poly of polys) {
            const q = nearest(poly, p);
            if (insidePoly(poly, p) || Math.hypot(q[0] - p[0], q[1] - p[1]) < 8) return false;
          }
        }
        return true;
      };
      search: for (const polys of [[refPoly, ...others], [refPoly]]) {
        for (let k = k0; k <= 180; k += 4) {
          for (const sgn of [1, -1]) {
            const cc: Pt = [mid[0] + sgn * n[0] * k, mid[1] + sgn * n[1] * k];
            if (clears(cc, polys)) {
              c = cc;
              break search;
            }
          }
        }
      }
    }
    const B = quad(c);
    // trim the curve so it leaves from the object's edge and stops short of the example position
    const body = mover.poly.map(([x, y]) => P(x, y));
    let t0 = 0.04;
    if (insidePoly(body, a)) {
      for (let t = 0; t < 0.5; t += 0.005) {
        if (!insidePoly(body, B(t))) {
          t0 = t + 5 / len;
          break;
        }
      }
    }
    t0 = Math.min(0.45, t0);
    const t1 = 1 - Math.min(0.25, 10 / len);
    const blossom: Pt = [
      (1 - t0) * (1 - t1) * a[0] + ((1 - t0) * t1 + t0 * (1 - t1)) * c[0] + t0 * t1 * b[0],
      (1 - t0) * (1 - t1) * a[1] + ((1 - t0) * t1 + t0 * (1 - t1)) * c[1] + t0 * t1 * b[1],
    ];
    const pts = Array.from({ length: 25 }, (_, i) => B(t0 + ((t1 - t0) * i) / 24));
    return { d: `M${B(t0).map(f1)}Q${blossom.map(f1)} ${B(t1).map(f1)}`, pts };
  });
  const arrow = $derived(arc?.d ?? '');

  // Already-true check badge: the diagonal corner of the target farthest from its origin marker.
  const badge = $derived.by(() => {
    const [cx, cy] = P(mover.cx, mover.cy);
    const k = inradius(mover) * 0.72;
    const o = P(mover.x, mover.y);
    const corners: Pt[] = [[cx + k, cy - k], [cx - k, cy - k], [cx + k, cy + k], [cx - k, cy + k]];
    return corners.reduce((a, b) => (Math.hypot(b[0] - o[0], b[1] - o[1]) > Math.hypot(a[0] - o[0], a[1] - o[1]) + 6 ? b : a));
  });

  // Label placement. Each label tries slots around its own footprint (above or below, centred or slid toward either
  // end; beside it, centred or flush with its top or bottom; off its corners), then the same slots around its union
  // with anything it overlaps, such as the example placement. A slot costs the area its padded box covers of the
  // silhouettes (clipped exactly, so a rotated object isn't inflated to its bounding box), the arc, the markers, the
  // robot and earlier labels, plus small preferences that keep a label centred above or below its object when free.
  type Box = { x0: number; x1: number; y0: number; y1: number };
  type Slot = { x: number; y: number; anchor: string; box: Box; pen: number };
  const rectPoly = (b: Box): Pt[] => [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];
  const boundsOf = (pts: Pt[]): Box => {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  };
  const hit = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  const area = (a: Box, b: Box) =>
    Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

  /** Area of a polygon inside a box: Sutherland–Hodgman clipping, then the shoelace formula. */
  function clipArea(poly: Pt[], b: Box) {
    const sides: [(p: Pt) => boolean, (p: Pt, q: Pt) => Pt][] = [
      [(p) => p[0] >= b.x0, (p, q) => [b.x0, p[1] + ((q[1] - p[1]) * (b.x0 - p[0])) / (q[0] - p[0])]],
      [(p) => p[0] <= b.x1, (p, q) => [b.x1, p[1] + ((q[1] - p[1]) * (b.x1 - p[0])) / (q[0] - p[0])]],
      [(p) => p[1] >= b.y0, (p, q) => [p[0] + ((q[0] - p[0]) * (b.y0 - p[1])) / (q[1] - p[1]), b.y0]],
      [(p) => p[1] <= b.y1, (p, q) => [p[0] + ((q[0] - p[0]) * (b.y1 - p[1])) / (q[1] - p[1]), b.y1]],
    ];
    let pts = poly;
    for (const [inside, cut] of sides) {
      const next: Pt[] = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const q = pts[(i + 1) % pts.length];
        if (inside(p)) next.push(p);
        if (inside(p) !== inside(q)) next.push(cut(p, q));
      }
      if (!next.length) return 0;
      pts = next;
    }
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const [px, py] = pts[i];
      const [qx, qy] = pts[(i + 1) % pts.length];
      a += px * qy - qx * py;
    }
    return Math.abs(a) / 2;
  }

  const labels = $derived.by(() => {
    const u = ls;
    const screen = (o: Obj, dx = 0, dy = 0) => o.poly.map(([x, y]) => P(x + dx, y + dy));
    const obs: { n: string; poly: Pt[]; box: Box }[] = [];
    const add = (n: string, poly: Pt[]) => obs.push({ n, poly, box: boundsOf(poly) });
    const square = (x: number, y: number, r: number) => rectPoly({ x0: x - r, x1: x + r, y0: y - r, y1: y + r });
    for (const [n, o] of Object.entries(objs)) add(n, screen(o));
    if (showGoal && !goal.initiallyTrue) add('__ghost', screen(mover, shift[0], shift[1]));
    if (showGoal && goal.initiallyTrue) add('__badge', square(badge[0], badge[1], 9));
    for (const m of marks) add('__mark' + m.key, square(m.x, m.y, 6));
    if (showGoal && zone) add('__zone', rectPoly({ x0: zone.x, x1: zone.x + zone.w, y0: zone.y, y1: zone.y + zone.h }));
    if (arc) arc.pts.forEach(([x, y], i) => add('__arc' + i, square(x, y, 4 * u)));
    add('__robot', rectPoly({ x0: robotX - 18 * rs, x1: robotX + 18 * rs, y0: 0, y1: 27 * rs }));

    const [X0, X1, Y0, Y1] = [4, W - 4, 2, H - 2];
    // text box: 11 units above the baseline to 3 below; start/end anchors keep 2 units of slack on the anchor side
    const at = (x: number, y: number, anchor: string, w: number, pen: number): Slot => ({
      x,
      y,
      anchor,
      pen,
      box: {
        x0: anchor === 'middle' ? x - w / 2 : anchor === 'start' ? x - 2 * u : x - w,
        x1: anchor === 'middle' ? x + w / 2 : anchor === 'start' ? x + w : x + 2 * u,
        y0: y - 11 * u,
        y1: y + 3 * u,
      },
    });
    const slots = (b: Box, w: number, base: number) => {
      const cx = (b.x0 + b.x1) / 2;
      const cy = (b.y0 + b.y1) / 2;
      const slide = Math.abs(w - (b.x1 - b.x0)) / 2;
      const out: Slot[] = [];
      for (const [y, pen] of [[b.y0 - 7 * u, 0], [b.y1 + 14 * u, 2]]) {
        for (const t of [0, -0.5, 0.5, -1, 1]) {
          const x = Math.min(X1 - w / 2, Math.max(X0 + w / 2, cx + slide * t));
          out.push(at(x, y, 'middle', w, base + pen + 0.15 * Math.abs(x - cx)));
        }
      }
      for (const [y, pen] of [[cy, 4], [b.y0 + 7 * u, 8], [b.y1 - 7 * u, 8]]) {
        out.push(at(b.x1 + 6 * u, y + 4 * u, 'start', w, base + pen));
        out.push(at(b.x0 - 6 * u, y + 4 * u, 'end', w, base + pen + 2));
      }
      for (const y of [b.y0 - 7 * u, b.y1 + 14 * u]) {
        out.push(at(b.x1 + 2 * u, y, 'start', w, base + 40));
        out.push(at(b.x0 - 2 * u, y, 'end', w, base + 40));
      }
      return out;
    };

    const placed: Box[] = [];
    const out: { name: string; text: string; x: number; y: number; anchor: string; cls: string }[] = [];
    for (const name of [goal.mover, goal.reference, ...Object.keys(objs).filter((n) => n !== goal.mover && n !== goal.reference)]) {
      const text = study.objects[name] ?? name.replace(/_/g, ' ');
      const w = (text.length * 6.1 + 4) * u;
      const self = obs.find((o) => o.n === name)!.box;
      const union = obs
        .filter((o) => o.n !== name && !o.n.startsWith('__arc') && hit(o.box, self))
        .reduce<Box>(
          (a, o) => ({ x0: Math.min(a.x0, o.box.x0), x1: Math.max(a.x1, o.box.x1), y0: Math.min(a.y0, o.box.y0), y1: Math.max(a.y1, o.box.y1) }),
          self,
        );
      const cost = ({ box: b, pen }: Slot) => {
        if (b.x0 < X0 || b.x1 > X1 || b.y0 < Y0 || b.y1 > Y1) return Infinity;
        const q = { x0: b.x0 - 2 * u, x1: b.x1 + 2 * u, y0: b.y0 - 2 * u, y1: b.y1 + 2 * u };
        // labels also keep about a word space apart, so neighbours never read as one phrase, and keep clear of other
        // objects' surroundings, so each label stays nearest its own object
        const near = { x0: b.x0 - 8 * u, x1: b.x1 + 8 * u, y0: b.y0 - 3 * u, y1: b.y1 + 3 * u };
        const wide = { x0: b.x0 - 7 * u, x1: b.x1 + 7 * u, y0: b.y0 - 7 * u, y1: b.y1 + 7 * u };
        let s = pen;
        for (const o of obs) {
          if (o.n === name) continue;
          if (hit(q, o.box)) s += clipArea(o.poly, q);
          if (!o.n.startsWith('__') && hit(wide, o.box)) s += 0.5 * clipArea(o.poly, wide);
        }
        for (const p of placed) s += 3 * area(q, p) + area(near, p);
        return s;
      };
      let best: Slot | null = null;
      let bestCost = Infinity;
      for (const c of [...slots(self, w, 0), ...slots(union, w, 20)]) {
        const k = cost(c);
        if (k < bestCost) [best, bestCost] = [c, k];
      }
      const c = best ?? at((self.x0 + self.x1) / 2, self.y0 - 7 * u, 'middle', w, 0);
      placed.push(c.box);
      out.push({ name, text, x: c.x, y: c.y, anchor: c.anchor, cls: role(name) });
    }
    return out;
  });

  const grid = $derived.by(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    const yA = -fit.ox / fit.s, yB = (W - fit.ox) / fit.s;
    const xA = -fit.oy / fit.s, xB = (H - fit.oy) / fit.s;
    for (let v = Math.ceil(yA / 0.05) * 0.05; v <= yB; v += 0.05) xs.push(fit.ox + v * fit.s);
    for (let v = Math.ceil(xA / 0.05) * 0.05; v <= xB; v += 0.05) ys.push(fit.oy + v * fit.s);
    return { xs, ys };
  });

  const robotX = $derived(Math.max(34, Math.min(W - 34, fit.ox)));
  const relText: Record<string, string> = {
    L: 'to the left of',
    R: 'to the right of',
    F: 'in front of',
    B: 'behind',
    supported_on: 'on top of',
    stacked_in: 'stacked on',
  };
  const desc = $derived(
    `Top-down schematic oriented like the camera, robot at the top: ${goal.initiallyTrue ? 'already at the start, ' : ''}the ${
      study.objects[goal.mover]
    } ${goal.initiallyTrue ? 'is' : 'should end'} ${relText[goal.relation]} the ${study.objects[goal.reference]}.`,
  );
</script>

<div class="gg" class:dark bind:clientWidth={cw}>
<svg class="glyph" class:dark viewBox="0 0 {W} {H}" role="img" aria-label={desc} style:--ls={ls}>
  <defs>
    <radialGradient id="{uid}-cone" gradientUnits="userSpaceOnUse" cx={apex[0]} cy={apex[1]} r={R}>
      <stop offset="0" class="c0" />
      <stop offset="0.7" class="c1" />
      <stop offset="1" class="c2" />
    </radialGradient>
    <marker id="{uid}-head" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
      <path d="M0,0.8 L9,5 L0,9.2 L2.2,5 Z" class="head" />
    </marker>
    <clipPath id="{uid}-clip"><rect x="0" y="0" width={W} height={H} rx="12" /></clipPath>
  </defs>

  <g clip-path="url(#{uid}-clip)">
    <rect class="table" x="0" y="0" width={W} height={H} />
    <g class="grid">
      {#each grid.xs as x}<line x1={x} x2={x} y1="0" y2={H} />{/each}
      {#each grid.ys as y}<line x1="0" x2={W} y1={y} y2={y} />{/each}
    </g>

    {#if showGoal}
      {#key goal.key + startNo}
        <g in:fade={{ duration: 450 }}>
          {#if dir}
            <path d={cone} fill="url(#{uid}-cone)" />
            <path d={cone} class="cone-edge" />
          {:else if zone}
            <rect class="zone" data-qa-shape x={zone.x} y={zone.y} width={zone.w} height={zone.h} rx="3" />
          {/if}
        </g>
      {/key}
    {/if}

    {#key scene.id + startNo}
      <g in:fade={{ duration: 350 }}>
        {#each order as name (name)}
          {@const o = objs[name]}
          {@const r = role(name)}
          {#if isBowl(name)}
            {@const [cx, cy] = P(o.cx, o.cy)}
            {@const rad = meanRadius(o)}
            <path class="obj {r}" d={polyPath(o.poly)} data-qa-shape />
            <circle
              class="rim {r}"
              class:goalrim={showGoal && r === 'ref' && goal.relation === 'stacked_in' && !goal.initiallyTrue}
              {cx}
              {cy}
              r={rad * 0.6}
            />
          {:else}
            <path class="obj {r}" d={polyPath(o.poly)} data-qa-shape />
          {/if}
        {/each}
      </g>
    {/key}

    {#if showGoal}
      {#key goal.key + startNo}
        <g>
          {#if goal.initiallyTrue}
            <g class="check" in:fade={{ duration: 400, delay: 200 }}>
              <circle cx={badge[0]} cy={badge[1]} r="8.5" data-qa-shape />
              <path d="M{f1(badge[0] - 3.6)},{f1(badge[1])} l2.6,2.7 l4.8,-5.2" />
            </g>
          {:else}
            {#if isBowl(goal.mover)}
              {@const [gx, gy] = P(mover.cx + shift[0], mover.cy + shift[1])}
              <circle class="ghost" data-qa-shape cx={gx} cy={gy} r={meanRadius(mover) * 0.94} in:fade={{ duration: 450, delay: 350 }} />
            {:else}
              <path class="ghost" data-qa-shape d={polyPath(mover.poly, shift[0], shift[1])} in:fade={{ duration: 450, delay: 350 }} />
            {/if}
            <path class="arrow-halo" d={arrow} in:fade={{ duration: 300 }} />
            <path class="arrow" data-qa-line d={arrow} marker-end="url(#{uid}-head)" in:draw={{ duration: 750, easing: cubicInOut }} />
          {/if}
          {#each marks as m (m.key)}
            <g class="mark {m.cls}" in:fade={{ duration: 400, delay: m.ghost ? 450 : 200 }}>
              {#if m.tether}<path class="tether" d={m.tether} data-qa-line />{/if}
              <path class="plus-halo" d="M{f1(m.x - 4.5)},{f1(m.y)}h9M{f1(m.x)},{f1(m.y - 4.5)}v9" />
              <path class="plus" data-qa-line d="M{f1(m.x - 4.5)},{f1(m.y)}h9M{f1(m.x)},{f1(m.y - 4.5)}v9" />
            </g>
          {/each}
        </g>
      {/key}
    {/if}

    {#each labels as l (l.name)}
      <text class="label {l.cls}" x={l.x} y={l.y} text-anchor={l.anchor}>{l.text}</text>
    {/each}

    <g class="robot" transform="translate({f1(robotX)} 0) scale({rs.toFixed(3)})">
      <path d="M-9,3 L9,3 L0,13 Z" data-qa-shape />
      <text x="0" y="24" text-anchor="middle">ROBOT</text>
    </g>
  </g>
</svg>
<div class="axis" aria-hidden="true"><span>← robot’s right</span><i></i><span>robot’s left →</span></div>
</div>

<style>
  .gg {
    min-width: 0;
  }

  .glyph {
    display: block;
    width: 100%;
    height: auto;
    overflow: hidden;
    --table: #f1eee6;
    --grid: rgb(21 23 28 / 5.5%);
    --o-mover: var(--mover);
    --o-ref: var(--ref);
    --o-other: #bcb6aa;
    --goal: var(--kept);
    --txt: var(--ink-2);
    --halo: var(--table);
  }

  .glyph.dark {
    --table: #171a21;
    --grid: rgb(255 255 255 / 5%);
    --o-mover: var(--mover-2);
    --o-ref: var(--ref-2);
    --o-other: #59606c;
    --goal: var(--kept-2);
    --txt: #d5d9e0;
  }

  .table {
    fill: var(--table);
  }

  .grid line {
    stroke: var(--grid);
    stroke-width: 1;
  }

  .c0 {
    stop-color: var(--goal);
    stop-opacity: 0.34;
  }

  .c1 {
    stop-color: var(--goal);
    stop-opacity: 0.14;
  }

  .c2 {
    stop-color: var(--goal);
    stop-opacity: 0;
  }

  .cone-edge {
    fill: none;
    stroke: var(--goal);
    stroke-opacity: 0.45;
    stroke-dasharray: 3 4;
    stroke-width: 1.2;
  }

  .obj {
    stroke-width: 2;
    stroke-linejoin: round;
    transition: fill 0.4s, stroke 0.4s;
  }

  .obj.mover {
    fill: var(--o-mover);
    stroke: var(--o-mover);
  }

  .obj.ref {
    fill: var(--o-ref);
    stroke: var(--o-ref);
  }

  .obj.other {
    fill: var(--o-other);
    stroke: var(--o-other);
  }

  .zone {
    fill: var(--goal);
    fill-opacity: 0.13;
    stroke: var(--goal);
    stroke-opacity: 0.6;
    stroke-dasharray: 3 4;
    stroke-width: 1.2;
  }

  .mark .plus,
  .mark .tether,
  .mark .plus-halo {
    fill: none;
    stroke-linecap: round;
  }

  .mark .plus-halo {
    stroke: var(--table);
    stroke-width: 4.2;
  }

  .mark .plus {
    stroke-width: 1.7;
  }

  .mark .tether {
    stroke-width: 1.1;
    stroke-dasharray: 1.5 2;
  }

  .mark.mover .plus,
  .mark.mover .tether {
    stroke: var(--o-mover);
  }

  .mark.ref .plus,
  .mark.ref .tether {
    stroke: var(--o-ref);
  }

  .rim {
    fill: var(--table);
    fill-opacity: 0.45;
    stroke: none;
  }

  .rim.goalrim {
    fill: var(--goal);
    fill-opacity: 0.55;
  }

  .ghost {
    fill: var(--o-mover);
    fill-opacity: 0.12;
    stroke: var(--o-mover);
    stroke-width: 1.6;
    stroke-dasharray: 4 3;
    stroke-linejoin: round;
  }

  .arrow,
  .arrow-halo {
    fill: none;
    stroke-linecap: round;
  }

  .arrow {
    stroke: var(--txt);
    stroke-width: 1.8;
  }

  .arrow-halo {
    stroke: var(--halo);
    stroke-width: 5;
    stroke-opacity: 0.85;
  }

  .head {
    fill: var(--txt);
  }

  .check circle {
    fill: var(--goal);
    stroke: var(--table);
    stroke-width: 2;
  }

  .check path {
    fill: none;
    stroke: #fff;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .label {
    font-family: var(--sans);
    font-size: calc(11.5px * var(--ls, 1));
    font-weight: 600;
    paint-order: stroke;
    stroke: var(--table);
    stroke-width: calc(3.5px * var(--ls, 1));
    stroke-linejoin: round;
  }

  .label.mover {
    fill: var(--o-mover);
  }

  .label.ref {
    fill: var(--o-ref);
  }

  .label.other {
    fill: var(--muted);
    font-weight: 500;
  }

  .dark .label.other {
    fill: var(--stage-muted);
  }

  .robot path {
    fill: var(--txt);
    opacity: 0.75;
  }

  .robot text {
    font-family: var(--mono);
    font-size: 8.5px;
    letter-spacing: 0.12em;
    fill: var(--muted);
    paint-order: stroke;
    stroke: var(--table);
    stroke-width: 3px;
    stroke-linejoin: round;
  }

  .dark .robot text {
    fill: var(--stage-muted);
  }

  .axis {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 7px;
    font-family: var(--mono);
    font-size: 0.66rem;
    line-height: 1.3;
    letter-spacing: 0.03em;
    color: var(--muted);
    white-space: nowrap;
  }

  .axis i {
    flex: 1;
    height: 1px;
    min-width: 12px;
    background: var(--rule-2);
  }

  .gg.dark .axis {
    color: var(--stage-muted);
  }

  .gg.dark .axis i {
    background: var(--stage-rule);
  }
</style>
