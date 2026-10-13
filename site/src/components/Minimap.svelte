<script lang="ts">
  import type { Timeline, TObject } from '../lib/timeline';
  import { inRuns } from '../lib/timeline';
  import bodiesJson from '../data/bodies.json';
  import {
    CONE_HALF_ANGLE,
    DIRS,
    FOOTPRINT_TOL,
    footprint,
    insideConvex,
    nearestOnPolys,
    place,
    poseAt,
    silhouette,
    turn,
    type Body,
    type Pose,
    type Pt,
    type SceneBodies,
    type V3,
  } from '../lib/pose';

  const BODIES = bodiesJson as unknown as Record<string, SceneBodies>;

  let {
    tl,
    tick = 0,
    dark = true,
    trails = true,
    labels = true,
    ghosts = true,
    window: win = null,
  }: {
    tl: Timeline | null;
    /** Timeline tick; fractional ticks interpolate between logged poses. */
    tick?: number;
    dark?: boolean;
    trails?: boolean;
    labels?: boolean;
    /** Dashed outline where each displaced object started. */
    ghosts?: boolean;
    /** Robot-frame region (m) that must stay in view; defaults to the scene's fixed window. */
    window?: { x: [number, number]; y: [number, number] } | null;
  } = $props();

  let wrap: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let w = $state(0);
  let h = $state(0);

  $effect(() => {
    const ro = new ResizeObserver(([e]) => {
      w = e.contentRect.width;
      h = e.contentRect.height;
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  });

  const scene = $derived(tl ? BODIES[tl.id.split('-')[2]] : null);
  const view = $derived(win ?? scene?.view ?? BODIES.S1.view);

  /** Centre below which an object has left the table (m). */
  const FALLEN_Z = -0.05;
  /** Radius of the drawn direction cone (m); the scored cone is unbounded. */
  const CONE_R = 0.3;

  const DARK = {
    table: '#171a21',
    grid: 'rgba(255,255,255,0.05)',
    other: '#59606c',
    text: '#9aa1ad',
    mover: '#3fb6cc',
    ref: '#ef9a62',
    goal: '111,211,154',
    tcp: '#eceef1',
    shadow: 'rgba(0,0,0,0.55)',
  };
  const LIGHT = {
    table: '#f1eee6',
    grid: 'rgba(21,23,28,0.055)',
    other: '#bcb6aa',
    text: '#676d77',
    mover: '#147d92',
    ref: '#c46635',
    goal: '47,125,79',
    tcp: '#15171c',
    shadow: 'rgba(20,22,28,0.3)',
  };

  // Per-object caches: the box-centre track at every tick (x, y, z interleaved) and the starting silhouette.
  const tracks = new WeakMap<TObject, Float32Array>();
  const firsts = new WeakMap<TObject, Pt[][]>();

  function track(o: TObject, b: Body): Float32Array {
    let c = tracks.get(o);
    if (!c) {
      c = new Float32Array(3 * o.x.length);
      for (let k = 0; k < o.x.length; k++) c.set(place(poseAt(o, k), b.c), 3 * k);
      tracks.set(o, c);
    }
    return c;
  }

  function first(o: TObject, b: Body): Pt[][] {
    let p = firsts.get(o);
    if (!p) firsts.set(o, (p = silhouette(b, poseAt(o, 0))));
    return p;
  }

  type Cls = 'mover' | 'ref' | 'other';
  type State = {
    o: TObject;
    body: Body;
    T: Pose;
    cls: Cls;
    centre: V3;
    polys: Pt[][];
    screen: Pt[][];
    lift: number;
    fallen: boolean;
  };

  $effect(() => {
    if (!canvas || !w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    const g = canvas.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(g, dpr, tl, tick);
  });

  function draw(g: CanvasRenderingContext2D, dpr: number, tl: Timeline | null, tick: number) {
    const C = dark ? DARK : LIGHT;
    const rgba = (a: number) => `rgba(${C.goal},${a})`;
    g.fillStyle = C.table;
    g.fillRect(0, 0, w, h);

    // Camera orientation, as in the videos: the robot is at the top facing the viewer, so x (away from the robot) is
    // screen down and y (the robot's left) is screen right.
    const { x: [xa, xb], y: [ya, yb] } = view;
    const s = Math.min(w / (yb - ya), h / (xb - xa));
    const ox = w / 2 - ((ya + yb) / 2) * s;
    const oy = h / 2 - ((xa + xb) / 2) * s;
    const P = (x: number, y: number): Pt => [ox + y * s, oy + x * s];

    g.strokeStyle = C.grid;
    g.lineWidth = 1;
    g.beginPath();
    for (let k = Math.ceil((-ox / s) * 10); k <= Math.floor(((w - ox) / s) * 10); k++) {
      const px = Math.round(ox + (k / 10) * s) + 0.5;
      g.moveTo(px, 0);
      g.lineTo(px, h);
    }
    for (let k = Math.ceil((-oy / s) * 10); k <= Math.floor(((h - oy) / s) * 10); k++) {
      const py = Math.round(oy + (k / 10) * s) + 0.5;
      g.moveTo(0, py);
      g.lineTo(w, py);
    }
    g.stroke();

    g.fillStyle = C.text;
    g.globalAlpha = 0.7;
    g.beginPath();
    g.moveTo(ox - 8, 3);
    g.lineTo(ox + 8, 3);
    g.lineTo(ox, 12);
    g.fill();
    g.globalAlpha = 1;
    g.font = '600 9px Inter Variable, system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('ROBOT', ox, 23);

    if (!tl || !scene) return;
    const t = Math.max(0, Math.min(tl.n - 1, tick));
    const i = Math.min(tl.n - 1, Math.floor(t + 1e-6));
    const kind = tl.goal === 'TOP' ? 'top' : tl.goal === 'LR' || tl.goal === 'RL' ? 'stack' : 'dir';
    const relHolds = inRuns(tl.flags.relation, i);
    const goalHolds = inRuns(tl.flags.goal, i);
    const colour = (c: Cls) => (c === 'mover' ? C.mover : c === 'ref' ? C.ref : C.other);

    const states: State[] = tl.objects.map((o) => {
      const body = scene.objects[o.name];
      const T = poseAt(o, t);
      const centre = place(T, body.c);
      const polys = silhouette(body, T);
      const z0 = track(o, body)[2];
      return {
        o,
        body,
        T,
        cls: o.role === 'mover' ? 'mover' : o.role === 'reference' ? 'ref' : 'other',
        centre,
        polys,
        screen: polys.map((poly) => poly.map(([x, y]) => P(x, y))),
        lift: Math.max(0, centre[2] - z0),
        fallen: centre[2] < FALLEN_Z,
      };
    });
    const mv = states.find((x) => x.cls === 'mover')!;
    const rf = states.find((x) => x.cls === 'ref')!;

    const outline = (polys: Pt[][]) => {
      g.beginPath();
      for (const poly of polys) {
        poly.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath();
      }
    };

    // Goal region, as scored, under everything else.
    let zoneRect: [number, number, number, number] | null = null;
    if (kind === 'dir') {
      const d = DIRS[tl.goal];
      const [rx, ry] = P(rf.T.p[0], rf.T.p[1]);
      const ang = Math.atan2(d[0], d[1]);
      const R = CONE_R * s;
      const grad = g.createRadialGradient(rx, ry, 0, rx, ry, R);
      grad.addColorStop(0, rgba(relHolds ? 0.42 : 0.22));
      grad.addColorStop(1, rgba(0));
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(rx, ry);
      g.arc(rx, ry, R, ang - CONE_HALF_ANGLE, ang + CONE_HALF_ANGLE);
      g.closePath();
      g.fill();
      g.setLineDash([3, 4]);
      g.lineWidth = 1.2;
      g.strokeStyle = rgba(relHolds ? 0.8 : 0.5);
      g.beginPath();
      g.moveTo(rx + Math.cos(ang - CONE_HALF_ANGLE) * R, ry + Math.sin(ang - CONE_HALF_ANGLE) * R);
      g.lineTo(rx, ry);
      g.lineTo(rx + Math.cos(ang + CONE_HALF_ANGLE) * R, ry + Math.sin(ang + CONE_HALF_ANGLE) * R);
      g.stroke();
      g.setLineDash([]);
    } else if (kind === 'top') {
      const [x0, y0, x1, y1] = footprint(rf.body, rf.T);
      const [ax, ay] = P(x0 - FOOTPRINT_TOL, y0 - FOOTPRINT_TOL);
      const [bx, by] = P(x1 + FOOTPRINT_TOL, y1 + FOOTPRINT_TOL);
      zoneRect = [ax, ay, bx - ax, by - ay];
      g.fillStyle = rgba(relHolds ? 0.3 : 0.14);
      g.beginPath();
      g.roundRect(...zoneRect, 3);
      g.fill();
    } else {
      outline(rf.screen);
      g.lineJoin = 'round';
      g.lineWidth = relHolds ? 12 : 8;
      g.strokeStyle = rgba(relHolds ? 0.45 : 0.22);
      g.stroke();
    }

    // Where displaced objects started.
    if (ghosts) {
      g.setLineDash([3, 3]);
      g.lineWidth = 1.2;
      for (const S of states) {
        const tr = track(S.o, S.body);
        if (Math.hypot(S.centre[0] - tr[0], S.centre[1] - tr[1]) < 0.01) continue;
        outline(first(S.o, S.body).map((poly) => poly.map(([x, y]) => P(x, y))));
        g.strokeStyle = colour(S.cls);
        g.globalAlpha = 0.5;
        g.stroke();
      }
      g.globalAlpha = 1;
      g.setLineDash([]);
    }

    // Box-centre trails up to now.
    if (trails) {
      for (const S of states) {
        const tr = track(S.o, S.body);
        let far = 0;
        for (let k = 0; k <= i; k++) far = Math.max(far, Math.hypot(tr[3 * k] - tr[0], tr[3 * k + 1] - tr[1]));
        if (far < 0.01) continue;
        g.strokeStyle = colour(S.cls);
        g.lineWidth = S.cls === 'mover' ? 1.6 : 1.3;
        g.lineJoin = 'round';
        g.globalAlpha = 0.6;
        g.setLineDash(S.cls === 'mover' ? [] : S.cls === 'ref' ? [3, 3] : [1, 3]);
        g.beginPath();
        for (let k = 0; k <= i; k++) {
          const [px, py] = P(tr[3 * k], tr[3 * k + 1]);
          if (k) g.lineTo(px, py);
          else g.moveTo(px, py);
        }
        const [cx, cy] = P(S.centre[0], S.centre[1]);
        g.lineTo(cx, cy);
        g.stroke();
        g.setLineDash([]);
        const [sx, sy] = P(tr[0], tr[1]);
        g.fillStyle = colour(S.cls);
        g.beginPath();
        g.arc(sx, sy, 2.5, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      }
    }

    // Objects, lowest first; lifted ones cast a shadow that grows with height.
    for (const S of [...states].sort((a, b) => a.centre[2] - b.centre[2])) {
      const col = colour(S.cls);
      outline(S.screen);
      g.fillStyle = col;
      g.strokeStyle = col;
      g.lineWidth = 1.5;
      g.lineJoin = 'round';
      if (S.fallen) {
        g.globalAlpha = 0.35;
        g.fill();
        g.globalAlpha = 1;
        g.setLineDash([2, 2]);
        g.stroke();
        g.setLineDash([]);
        continue;
      }
      if (S.lift > 0.004) {
        const L = S.lift * s * dpr;
        g.shadowColor = C.shadow;
        g.shadowBlur = 3 * dpr + L * 0.35;
        g.shadowOffsetX = L * 0.15;
        g.shadowOffsetY = L * 0.3;
      }
      g.fill();
      g.shadowColor = 'transparent';
      g.stroke();
      if (S.body.bowl) {
        const n = turn(S.T, S.body.bowl.axis);
        if (n[2] > 0.25) {
          const [cx, cy] = P(...(place(S.T, S.body.bowl.c).slice(0, 2) as Pt));
          const a = ((0.6 * S.body.bowl.r) / 1000) * s;
          const rot = Math.hypot(n[0], n[1]) > 1e-6 ? Math.atan2(n[0], n[1]) : 0;
          const target = kind === 'stack' && S.cls === 'ref';
          g.fillStyle = target ? rgba(relHolds ? 0.85 : 0.6) : C.table;
          g.globalAlpha = target ? 1 : 0.45;
          g.beginPath();
          g.ellipse(cx, cy, a * n[2], a, rot, 0, Math.PI * 2);
          g.fill();
          g.globalAlpha = 1;
        }
      }
      if (goalHolds && S.cls === 'mover') {
        outline(S.screen);
        g.strokeStyle = rgba(1);
        g.lineWidth = 2.5;
        g.stroke();
      }
    }

    if (zoneRect) {
      g.setLineDash([3, 4]);
      g.lineWidth = 1.2;
      g.strokeStyle = rgba(relHolds ? 0.9 : 0.6);
      g.beginPath();
      g.roundRect(...zoneRect, 3);
      g.stroke();
      g.setLineDash([]);
    }

    // The points the scorer compares, with a tether when a point lies outside its object.
    const mark = (S: State, p: V3) => {
      const pt: Pt = [p[0], p[1]];
      const [sx, sy] = P(...pt);
      const col = colour(S.cls);
      g.lineCap = 'round';
      if (!S.polys.some((poly) => insideConvex(poly, pt))) {
        const [qx, qy] = P(...nearestOnPolys(S.polys, pt));
        const len = Math.hypot(qx - sx, qy - sy);
        if (len > 5) {
          g.setLineDash([1.5, 2.5]);
          g.lineWidth = 1.1;
          g.strokeStyle = col;
          g.beginPath();
          g.moveTo(sx + ((qx - sx) * 4.5) / len, sy + ((qy - sy) * 4.5) / len);
          g.lineTo(qx, qy);
          g.stroke();
          g.setLineDash([]);
        }
      }
      for (const [lw, c] of [
        [4.2, C.table],
        [1.7, col],
      ] as const) {
        g.lineWidth = lw;
        g.strokeStyle = c;
        g.beginPath();
        g.moveTo(sx - 4.5, sy);
        g.lineTo(sx + 4.5, sy);
        g.moveTo(sx, sy - 4.5);
        g.lineTo(sx, sy + 4.5);
        g.stroke();
      }
      g.lineCap = 'butt';
    };
    if (kind === 'dir') {
      mark(rf, rf.T.p);
      mark(mv, mv.T.p);
    } else if (kind === 'top') {
      mark(mv, mv.centre);
    } else {
      mark(mv, place(mv.T, mv.body.hc));
    }

    // Gripper: ring size encodes height above the table, the fill encodes closure.
    const i1 = Math.min(tl.n - 1, i + 1);
    const f = t - i;
    const at = (a: Float32Array) => a[i] + (a[i1] - a[i]) * f;
    const [tx, ty] = P(at(tl.tcp.x), at(tl.tcp.y));
    const hz = Math.max(0, Math.min(1, (at(tl.tcp.z) - 0.02) / 0.35));
    const closed = at(tl.grip);
    const gr = 5 + hz * 7;
    g.strokeStyle = C.tcp;
    g.lineWidth = 1.5;
    g.globalAlpha = 0.9;
    g.beginPath();
    g.arc(tx, ty, gr, 0, Math.PI * 2);
    g.moveTo(tx - gr - 4, ty);
    g.lineTo(tx - gr + 2, ty);
    g.moveTo(tx + gr - 2, ty);
    g.lineTo(tx + gr + 4, ty);
    g.stroke();
    if (closed > 0.15) {
      g.fillStyle = C.tcp;
      g.globalAlpha = 0.25 + 0.6 * Math.min(1, closed);
      g.beginPath();
      g.arc(tx, ty, gr * 0.55, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    // Labels above (or else below) each object; objects that left the view get an edge marker instead.
    if (!labels) return;
    g.font = '600 10px Inter Variable, system-ui, sans-serif';
    g.textAlign = 'center';
    g.lineJoin = 'round';
    const taken: [number, number, number, number][] = [];
    const free = (r: [number, number, number, number]) =>
      r[0] >= 2 && r[2] <= w - 2 && r[1] >= 2 && r[3] <= h - 2 && !taken.some((q) => r[0] < q[2] && q[0] < r[2] && r[1] < q[3] && q[1] < r[3]);
    for (const S of [mv, rf, ...states.filter((x) => x.cls === 'other')]) {
      const text = S.body.label + (S.fallen ? ' · fell off' : '');
      const tw = g.measureText(text).width;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const poly of S.screen)
        for (const [x, y] of poly) {
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
      const col = S.cls === 'other' ? C.text : colour(S.cls);
      if (x1 < 0 || x0 > w || y1 < 0 || y0 > h) {
        const [cx, cy] = P(S.centre[0], S.centre[1]);
        const ex = Math.max(10, Math.min(w - 10, cx));
        const ey = Math.max(10, Math.min(h - 10, cy));
        const a = Math.atan2(cy - ey, cx - ex);
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(ex + Math.cos(a) * 7, ey + Math.sin(a) * 7);
        g.lineTo(ex + Math.cos(a + 2.4) * 5, ey + Math.sin(a + 2.4) * 5);
        g.lineTo(ex + Math.cos(a - 2.4) * 5, ey + Math.sin(a - 2.4) * 5);
        g.fill();
        const lx = Math.max(tw / 2 + 4, Math.min(w - tw / 2 - 4, ex - Math.cos(a) * 14));
        const ly = Math.max(12, Math.min(h - 6, ey - Math.sin(a) * 14 + 3));
        taken.push([lx - tw / 2, ly - 9, lx + tw / 2, ly + 2]);
        g.strokeStyle = C.table;
        g.lineWidth = 3;
        g.strokeText(text, lx, ly);
        g.fillText(text, lx, ly);
        continue;
      }
      const cx = Math.max(tw / 2 + 4, Math.min(w - tw / 2 - 4, (x0 + x1) / 2));
      const options = [y0 - 6, y1 + 13];
      const ly = options.find((y) => free([cx - tw / 2, y - 9, cx + tw / 2, y + 2])) ?? options[0];
      taken.push([cx - tw / 2, ly - 9, cx + tw / 2, ly + 2]);
      g.strokeStyle = C.table;
      g.lineWidth = 3;
      g.strokeText(text, cx, ly);
      g.fillStyle = col;
      g.fillText(text, cx, ly);
    }
  }
</script>

<div class="minimap" bind:this={wrap}>
  <canvas
    bind:this={canvas}
    style="width:{w}px;height:{h}px"
    role="img"
    aria-label="Top-down simulator state: the objects, the gripper and the region where the goal counts as met"
  ></canvas>
</div>

<style>
  .minimap {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 120px;
    border-radius: 10px;
    overflow: hidden;
  }

  canvas {
    position: absolute;
    inset: 0;
  }
</style>
