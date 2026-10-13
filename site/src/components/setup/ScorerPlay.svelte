<script lang="ts">
  import layoutRaw from '../../data/layout.json';
  import { GOALS, study } from '../../lib/study';
  import { hull2d, type Pt } from '../../lib/pose';

  /** A scorer toy in the robot frame: the reader moves the target around a fixed reference, and the same predicates the
   *  scorer uses decide whether the arrangement counts. Drawn in the site's convention: the robot at the top facing the
   *  viewer, so the robot's left is screen right and "in front of" (closer to the robot) is screen up. */
  type Obj = { x: number; y: number; cx: number; cy: number; box: [number, number, number, number]; poly: Pt[] };
  const LAYOUT = layoutRaw as unknown as Record<string, { rep: number; starts: Record<string, Obj>[] }>;

  const S = study.settings.scoring;
  /** Positions are recorded, and speed is differenced, at the control rate. */
  const HZ = study.settings.hz;
  const COS = Math.cos((S.coneDeg * Math.PI) / 180);
  const TOL = S.footprintCm / 100;
  const uid = $props.id();

  // The mustard scene's representative start: its target and reference, as logged at the first step.
  const G0 = GOALS.find((g) => g.mover === 'mustard_bottle')!;
  const scene = LAYOUT[G0.scene.id];
  const start = scene.starts[scene.rep];
  const M = start[G0.mover];
  const R = start[G0.reference];
  const MOVER = G0.moverName;
  const REF = G0.referenceName;
  const mHull = hull2d(M.poly).map(([x, y]) => [x - M.x, y - M.y] as Pt);
  const rHull = hull2d(R.poly);
  const mCentre: Pt = [M.cx - M.x, M.cy - M.y];

  /** Relations the study's goals actually use, except bowl stacking (a containment check). */
  type Rel = 'L' | 'R' | 'F' | 'B' | 'supported_on';
  type Key = 'relation' | 'support' | 'released' | 'slow';
  const DIRS: Record<string, Pt> = { L: [0, 1], R: [0, -1], F: [-1, 0], B: [1, 0] };
  const REL_WORD: Record<Rel, string> = { L: 'left of', R: 'right of', F: 'in front of', B: 'behind', supported_on: 'on top of' };
  const ORDER: Rel[] = ['L', 'R', 'F', 'B', 'supported_on'];
  const RELS = ORDER.filter((r) => GOALS.some((g) => g.relation === r));
  const pairsOf = (r: Rel) => [...new Set(GOALS.filter((g) => g.relation === r).map((g) => `${g.moverName} and ${g.referenceName}`))];
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  // View: a window of the table around the reference; the robot's base sits beyond the top edge.
  const rc: Pt = [(R.box[0] + R.box[2]) / 2, (R.box[1] + R.box[3]) / 2];
  const VX: [number, number] = [rc[0] - 0.2, rc[0] + 0.17];
  const VY: [number, number] = [rc[1] - 0.24, rc[1] + 0.24];
  const SC = 900;
  const TOP = 44;
  const W = (VY[1] - VY[0]) * SC;
  const H = (VX[1] - VX[0]) * SC + TOP;
  const P = (x: number, y: number): Pt => [(y - VY[0]) * SC, (x - VX[0]) * SC + TOP];
  const path = (pts: Pt[]) => `M${pts.map(([x, y]) => P(x, y).map((v) => v.toFixed(1)).join(' ')).join('L')}Z`;

  let rel = $state<Rel>(RELS.includes('R') ? 'R' : RELS[0]);
  let pos = $state<Pt>([M.x, M.y]);
  let held = $state(false);
  let air = $state(false);
  let speed = $state(0);
  let heldS = $state(0);
  let ever = $state(false);
  let broke = $state<Key[]>([]);
  let wobble = 0;

  // ------------------------------------------------------------------ predicates (as in the paper's appendix)

  function overlap(a: Pt[], b: Pt[]) {
    for (const poly of [a, b]) {
      for (let i = 0; i < poly.length; i++) {
        const [x0, y0] = poly[i];
        const [x1, y1] = poly[(i + 1) % poly.length];
        const n: Pt = [y1 - y0, x0 - x1];
        let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
        for (const [x, y] of a) {
          const d = x * n[0] + y * n[1];
          a0 = Math.min(a0, d);
          a1 = Math.max(a1, d);
        }
        for (const [x, y] of b) {
          const d = x * n[0] + y * n[1];
          b0 = Math.min(b0, d);
          b1 = Math.max(b1, d);
        }
        if (a1 <= b0 || b1 <= a0) return false;
      }
    }
    return true;
  }

  const moverPoly = $derived(mHull.map(([dx, dy]) => [pos[0] + dx, pos[1] + dy] as Pt));
  const surface = $derived<'air' | 'ref' | 'table'>(air ? 'air' : overlap(moverPoly, rHull) ? 'ref' : 'table');
  const relation = $derived.by(() => {
    if (rel === 'supported_on') {
      const x = pos[0] + mCentre[0], y = pos[1] + mCentre[1];
      return x >= R.box[0] - TOL && x <= R.box[2] + TOL && y >= R.box[1] - TOL && y <= R.box[3] + TOL;
    }
    const d = DIRS[rel];
    const vx = pos[0] - R.x, vy = pos[1] - R.y;
    return vx * d[0] + vy * d[1] >= Math.hypot(vx, vy) * COS;
  });
  const support = $derived(rel === 'supported_on' ? surface === 'ref' : surface === 'table');
  const released = $derived(!held);
  const slow = $derived(speed < S.speedCmS);
  const ok = $derived({ relation, support, released, slow });
  const all = $derived(relation && support && released && slow);
  const done = $derived(heldS >= S.holdS - 1e-9);

  const ROWS = $derived<{ key: Key; label: string; hint: string }[]>([
    {
      key: 'relation',
      label: `${cap(MOVER)} ${REL_WORD[rel]} the ${REF}`,
      hint:
        rel === 'supported_on'
          ? `its centre over the ${REF}’s footprint, give or take ${S.footprintCm}\u00a0cm`
          : `its origin within ${S.coneDeg}° of the robot’s ${rel === 'L' ? 'left' : rel === 'R' ? 'right' : rel === 'F' ? 'front' : 'back'}`,
    },
    {
      key: 'support',
      label: rel === 'supported_on' ? `Supported by the ${REF}` : 'Supported by the table',
      hint: surface === 'air' ? 'now: in the air' : surface === 'ref' ? `now: resting on the ${REF}` : 'now: resting on the table',
    },
    { key: 'released', label: 'Clear of the gripper', hint: held ? 'now: held by the gripper' : 'now: released' },
    { key: 'slow', label: `Slower than ${S.speedCmS}\u00a0cm/s`, hint: `now: ${speed.toFixed(1)}\u00a0cm/s` },
  ]);
  const NAME: Record<Key, string> = { relation: 'relation', support: 'support', released: 'gripper contact', slow: 'speed' };

  // ------------------------------------------------------------------ the scorer's clock

  let last: Pt = [M.x, M.y];
  $effect(() => {
    const id = setInterval(() => {
      if (wobble) {
        const k = wobble--;
        pos = [pos[0], pos[1] + (k % 2 ? 0.006 : -0.006)];
      }
      const p = pos;
      speed = Math.hypot(p[0] - last[0], p[1] - last[1]) * HZ * 100;
      last = p;
      if (relation && support && released && speed < S.speedCmS) {
        heldS = Math.min(S.holdS, heldS + 1 / HZ);
        broke = [];
        if (heldS >= S.holdS - 1e-9) ever = true;
      } else {
        if (heldS > 0) broke = (Object.keys(ok) as Key[]).filter((k) => !{ relation, support, released, slow: speed < S.speedCmS }[k]);
        heldS = 0;
      }
    }, 1000 / HZ);
    return () => clearInterval(id);
  });

  const status = $derived(
    done
      ? { cls: 'done', text: 'Stable placement' }
      : heldS > 0
        ? { cls: 'run', text: 'Holding…' }
        : broke.length
          ? { cls: 'reset', text: `Timer reset: ${broke.map((k) => NAME[k]).join(' and ')} failed` }
          : ever
            ? { cls: 'idle', text: 'Credited earlier; the any-time outcome keeps it' }
            : { cls: 'idle', text: `Waiting for all four checks` },
  );
  // Announce state changes only, never the running timer.
  const said = $derived(done ? `Stable placement credited.` : broke.length ? status.text : all ? 'All four checks pass; holding.' : '');

  // ------------------------------------------------------------------ interaction

  // Keep the whole footprint (and the gripper's fingers) on the drawn table.
  const ext = (i: 0 | 1) => [Math.min(...mHull.map((p) => p[i])), Math.max(...mHull.map((p) => p[i]))];
  const [ex, ey] = [ext(0), ext(1)];
  const clampPos = ([x, y]: Pt): Pt => [
    Math.min(VX[1] - 0.012 - ex[1], Math.max(VX[0] + 0.012 - ex[0], x)),
    Math.min(VY[1] - 0.022 - ey[1], Math.max(VY[0] + 0.022 - ey[0], y)),
  ];

  let svg: SVGSVGElement;
  let grab = $state<Pt | null>(null);
  function world(e: PointerEvent): Pt {
    const m = svg.getScreenCTM();
    if (!m) return pos;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [(p.y - TOP) / SC + VX[0], p.x / SC + VY[0]];
  }
  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    const w = world(e);
    grab = [pos[0] - w[0], pos[1] - w[1]];
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function move(e: PointerEvent) {
    if (!grab) return;
    const w = world(e);
    pos = clampPos([w[0] + grab[0], w[1] + grab[1]]);
  }
  const up = () => (grab = null);

  const KEYS: Record<string, Pt> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  function key(e: KeyboardEvent) {
    const d = KEYS[e.key];
    if (!d || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const step = e.shiftKey ? 0.05 : 0.01;
    pos = clampPos([pos[0] + d[0] * step, pos[1] + d[1] * step]);
  }
  function reset() {
    pos = [M.x, M.y];
    last = pos;
    held = false;
    air = false;
    heldS = 0;
    ever = false;
    broke = [];
  }
  function pick(r: Rel) {
    rel = r;
    heldS = 0;
    ever = false;
    broke = [];
  }

  // ------------------------------------------------------------------ drawing

  const apex = P(R.x, R.y);
  const CONE_R = 0.6 * SC;
  function wedge(r: Rel) {
    const d = DIRS[r];
    const a = Math.atan2(d[0], d[1]);
    const h = (S.coneDeg * Math.PI) / 180;
    const [ax, ay] = apex;
    const e0 = [ax + Math.cos(a - h) * CONE_R, ay + Math.sin(a - h) * CONE_R];
    const e1 = [ax + Math.cos(a + h) * CONE_R, ay + Math.sin(a + h) * CONE_R];
    return `M${ax} ${ay}L${e0[0]} ${e0[1]}A${CONE_R} ${CONE_R} 0 0 1 ${e1[0]} ${e1[1]}Z`;
  }
  const diag = [Math.PI / 4, (3 * Math.PI) / 4].map((a) => {
    const c = Math.cos(a) * CONE_R, s = Math.sin(a) * CONE_R;
    return `M${apex[0] - c} ${apex[1] - s}L${apex[0] + c} ${apex[1] + s}`;
  });
  const foot = [P(R.box[0] - TOL, R.box[1] - TOL), P(R.box[2] + TOL, R.box[3] + TOL)];

  // Text in viewBox units grows when the drawing is small, so labels stay at least 11 CSS px.
  let cw = $state(0);
  const k = $derived(cw ? Math.max(1, W / cw) : 1.3);
  const FS = $derived(11 * k);
  /** Region labels sit along each cone's axis, clamped inside the drawing. */
  const LABEL_AT: Record<string, [number, number]> = { L: [0.085, 0.17], R: [0.085, -0.17], F: [-0.135, 0], B: [0.12, 0] };
  const labels = $derived(
    (['L', 'R', 'F', 'B'] as const).map((r) => {
      const [dx, dy] = LABEL_AT[r];
      const [x, y] = P(R.x + dx, R.y + dy);
      const half = (REL_WORD[r].length * 0.56 * FS) / 2 + 4;
      return { r, x: Math.min(W - half, Math.max(half, x)), y: y + FS * 0.35, text: REL_WORD[r] };
    }),
  );
  const robotX = P(0, 0)[0];

  const mp = $derived(moverPoly.map(([x, y]) => P(x, y)));
  const mc = $derived(P(pos[0] + mCentre[0], pos[1] + mCentre[1]));
  const mo = $derived(P(pos[0], pos[1]));
  const mBox = $derived.by(() => {
    const xs = mp.map((p) => p[0]), ys = mp.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  });
  const RING = 2 * Math.PI * 30;
</script>

<figure class="fig sp" aria-labelledby="{uid}-cap">
  <div class="ctl">
    <div class="grp">
      <span class="lbl" id="{uid}-goal">Goal</span>
      <div class="chips" role="group" aria-labelledby="{uid}-goal">
        {#each RELS as r (r)}
          <button type="button" aria-pressed={rel === r} onclick={() => pick(r)}>{REL_WORD[r]}</button>
        {/each}
      </div>
    </div>
    <div class="row2">
      <div class="grp">
        <span class="lbl" id="{uid}-grip">Gripper</span>
        <div class="seg" role="group" aria-labelledby="{uid}-grip">
          <button type="button" aria-pressed={held} onclick={() => (held = true)}>Holding it</button>
          <button type="button" aria-pressed={!held} onclick={() => (held = false)}>Released</button>
        </div>
      </div>
      <div class="grp">
        <span class="lbl" id="{uid}-sup">Target</span>
        <div class="seg" role="group" aria-labelledby="{uid}-sup">
          <button type="button" aria-pressed={!air} onclick={() => (air = false)}>Resting</button>
          <button type="button" aria-pressed={air} onclick={() => (air = true)}>In the air</button>
        </div>
      </div>
      <div class="acts">
        <button type="button" class="act" onclick={() => (wobble = 2)} title="Jiggle the target for two steps">Nudge</button>
        <button type="button" class="act" onclick={reset}>Reset</button>
      </div>
    </div>
  </div>

  <div class="body">
    <div class="plan">
      <div class="svgbox" bind:clientWidth={cw}>
        <svg bind:this={svg} viewBox="0 0 {W.toFixed(0)} {H.toFixed(0)}" aria-hidden="false" role="group" aria-label="Table seen from above, robot at the top">
          <defs>
            <clipPath id="{uid}-clip"><rect x="0" y={TOP} width={W} height={H - TOP} rx="10" /></clipPath>
            <pattern id="{uid}-grid" width={0.1 * SC} height={0.1 * SC} patternUnits="userSpaceOnUse" x={P(0, 0)[0]} y={P(0, 0)[1]}>
              <path d="M{0.1 * SC} 0H0V{0.1 * SC}" class="gridline" />
            </pattern>
          </defs>
          <rect class="table" x="0" y={TOP} width={W} height={H - TOP} rx="10" />
          <rect x="0" y={TOP} width={W} height={H - TOP} rx="10" fill="url(#{uid}-grid)" />

          <path class="robot" d="M{robotX - 30} 0h60a30 26 0 0 1 -60 0z" />
          <text class="rlabel" x={robotX + 38} y={14 + FS * 0.35} style:font-size="{FS}px">robot</text>

          <g clip-path="url(#{uid}-clip)">
            {#each diag as d}<path class="diag" {d} />{/each}
            {#if rel === 'supported_on'}
              <rect
                class="zone"
                class:hit={relation}
                x={foot[0][0]}
                y={foot[0][1]}
                width={foot[1][0] - foot[0][0]}
                height={foot[1][1] - foot[0][1]}
                rx="3"
              />
            {:else}
              <path class="zone" class:hit={relation} d={wedge(rel)} />
            {/if}
            {#each labels as l (l.r)}
              <text class="region" class:sel={l.r === rel} x={l.x} y={l.y} text-anchor="middle" style:font-size="{FS}px">{l.text}</text>
            {/each}

            <path class="ref" d={path(rHull)} />
            <path class="cross ref-x" d="M{apex[0] - 5} {apex[1]}h10M{apex[0]} {apex[1] - 5}v10" />

            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <g
              class="mover"
              class:air
              class:grab={!!grab}
              tabindex="0"
              role="button"
              aria-roledescription="movable object"
              aria-label="{cap(MOVER)}, the target"
              aria-describedby="{uid}-how {uid}-now"
              onpointerdown={down}
              onpointermove={move}
              onpointerup={up}
              onpointercancel={up}
              onkeydown={key}
              style:transform-origin="{mc[0]}px {mc[1]}px"
            >
              {#if air}<path class="shadow" d={`M${mp.map(([x, y]) => `${x + 7} ${y + 11}`).join('L')}Z`} />{/if}
              <rect class="hit" x={mBox[0] - 10} y={mBox[1] - 10} width={mBox[2] - mBox[0] + 20} height={mBox[3] - mBox[1] + 20} rx="12" />
              <path class="body" d={`M${mp.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z`} />
              {#if rel === 'supported_on'}
                <circle class="centre" cx={mc[0]} cy={mc[1]} r="3.4" />
              {:else}
                <path class="cross" d="M{mo[0] - 5} {mo[1]}h10M{mo[0]} {mo[1] - 5}v10" />
              {/if}
              {#if held}
                <g class="fingers">
                  <rect x={mBox[0] - 9} y={mc[1] - 9} width="7" height="18" rx="2" />
                  <rect x={mBox[2] + 2} y={mc[1] - 9} width="7" height="18" rx="2" />
                  <path d="M{mBox[0] - 5.5} {mc[1] - 9}V{mc[1] - 16}H{mBox[2] + 5.5}V{mc[1] - 9}" />
                </g>
              {/if}
            </g>
          </g>
        </svg>
      </div>
      <div class="axis" aria-hidden="true"><span>← robot’s right</span><i></i><span>robot’s left →</span></div>
      <p class="legend">
        <span class="li"><span class="sw m"></span>{MOVER} (target)</span>
        <span class="li"><span class="sw r"></span>{REF} (reference)</span>
        <span class="li"><span class="sw z"></span>where the relation holds</span>
      </p>
    </div>

    <div class="panel">
      <ol class="checks" aria-label="Scorer checks">
        {#each ROWS as r (r.key)}
          <li class:ok={ok[r.key]} class:bad={!ok[r.key] && broke.includes(r.key)}>
            <span class="ck" aria-hidden="true"
              ><svg viewBox="0 0 12 12">
                {#if ok[r.key]}<path d="M2.5 6.4 5 8.8 9.6 3.6" />{:else}<path d="M3.4 3.4 8.6 8.6M8.6 3.4 3.4 8.6" />{/if}
              </svg></span
            >
            <span class="txt"
              ><span class="l">{r.label}<span class="sr-only">: {ok[r.key] ? 'yes' : 'no'}</span></span><span class="h">{r.hint}</span></span
            >
          </li>
        {/each}
      </ol>

      <div class="hold {status.cls}">
        <svg class="ring" viewBox="0 0 72 72" aria-hidden="true">
          <circle class="track" cx="36" cy="36" r="30" />
          <circle class="fill" cx="36" cy="36" r="30" stroke-dasharray={RING} stroke-dashoffset={RING * (1 - heldS / S.holdS)} />
          {#if done}
            <circle class="ping" cx="36" cy="36" r="30" />
            <path class="tick" d="M25 37.5 32.5 45 47.5 29" />
          {:else}
            <text x="36" y="40.5" text-anchor="middle" class="sec">{heldS.toFixed(1)}</text>
          {/if}
        </svg>
        <div class="htxt">
          <span class="lbl">Held {S.holdS === 1 ? 'one' : S.holdS} continuous second{S.holdS === 1 ? '' : 's'}</span>
          <span class="st">{status.text}</span>
        </div>
      </div>
      <p class="sr-only" aria-live="polite">{said}</p>
    </div>
  </div>

  <figcaption id="{uid}-cap" class="cap">
    <span id="{uid}-how"
      >Drag the {MOVER}, or focus it and use the arrow keys (Shift moves 5&nbsp;cm). Moving it counts as speed, so each step restarts the
      timer.</span
    >
    <span id="{uid}-now" class="sr-only">{ROWS.map((r) => `${r.label}: ${ok[r.key] ? 'yes' : 'no'}`).join('. ')}.</span>
    The scorer measures direction between the objects’ origins (+) in a {S.coneDeg * 2}° cone, and “on top” from the target’s centre (•).
    Speed is the change in the logged position between steps at {HZ}&nbsp;Hz. {#if rel === 'F' || rel === 'B'}In the study, {REL_WORD[rel]}
      goals use the {pairsOf(rel).join(', ')}; the cone is the same.{/if}
  </figcaption>
</figure>

<style>
  .sp {
    container: sp / inline-size;
    margin: clamp(22px, 3vw, 32px) 0 0;
  }

  .ctl {
    display: grid;
    gap: 12px;
  }

  .grp {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    min-width: 0;
  }

  .grp .lbl {
    min-width: 4.6em;
  }

  .row2 {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 22px;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chips button,
  .act {
    min-height: 32px;
    padding: 5px 13px;
    border-radius: 999px;
    border: 1px solid var(--rule-2);
    background: var(--card);
    color: var(--ink-2);
    font-size: 0.84rem;
    font-weight: 500;
    line-height: 1.2;
    white-space: nowrap;
    cursor: pointer;
    transition: background 0.2s, color 0.2s, border-color 0.2s;
  }

  .chips button:hover,
  .act:hover {
    border-color: var(--ink-2);
    color: var(--ink);
  }

  .chips button[aria-pressed='true'] {
    background: var(--ink);
    border-color: var(--ink);
    color: #fff;
  }

  .seg button {
    min-height: 28px;
  }

  .acts {
    display: flex;
    gap: 8px;
  }

  .body {
    display: grid;
    gap: 20px 32px;
    margin-top: 18px;
  }

  @container sp (min-width: 46em) {
    .body {
      grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
      align-items: start;
    }
  }

  .plan {
    min-width: 0;
  }

  .svgbox {
    width: 100%;
    max-width: 560px;
    margin-inline: auto;
  }

  .plan .axis,
  .legend {
    max-width: 560px;
    margin-inline: auto;
  }

  svg {
    width: 100%;
    height: auto;
    overflow: hidden;
    touch-action: none;
  }

  .table {
    fill: #f1eee6;
    stroke: var(--rule-2);
  }

  .gridline {
    fill: none;
    stroke: rgb(21 23 28 / 6%);
    stroke-width: 1;
  }

  .robot {
    fill: var(--ink-2);
    opacity: 0.8;
  }

  .rlabel {
    font-family: var(--mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    fill: var(--muted);
    font-weight: 600;
  }

  .diag {
    stroke: rgb(21 23 28 / 16%);
    stroke-dasharray: 3 5;
    fill: none;
  }

  .zone {
    fill: rgb(47 125 79 / 9%);
    stroke: rgb(47 125 79 / 55%);
    stroke-dasharray: 4 4;
    stroke-width: 1.3;
    transition: fill 0.25s;
  }

  .zone.hit {
    fill: rgb(47 125 79 / 20%);
  }

  .region {
    font-family: var(--sans);
    font-weight: 500;
    fill: var(--muted);
  }

  .region.sel {
    fill: var(--kept);
    font-weight: 650;
  }

  .ref {
    fill: color-mix(in srgb, var(--ref) 78%, #fff);
    stroke: var(--ref-ink);
    stroke-width: 1.4;
  }

  .cross {
    stroke: #fff;
    stroke-width: 2;
    stroke-linecap: round;
  }

  .ref-x {
    stroke: var(--ink);
  }

  .mover {
    cursor: grab;
    transition: transform 0.2s var(--ease);
  }

  .mover.grab {
    cursor: grabbing;
  }

  .mover.air {
    transform: scale(1.08);
  }

  .mover .hit {
    fill: transparent;
  }

  .mover:focus-visible {
    outline: 2px solid var(--tf);
    outline-offset: 2px;
  }

  .mover .body {
    fill: var(--mover);
    stroke: var(--mover-ink);
    stroke-width: 1.4;
    stroke-linejoin: round;
  }

  .mover .shadow {
    fill: rgb(20 22 28 / 18%);
  }

  .mover .centre {
    fill: #fff;
    stroke: var(--mover-ink);
    stroke-width: 1.2;
  }

  .fingers rect {
    fill: var(--ink-2);
  }

  .fingers path {
    fill: none;
    stroke: var(--ink-2);
    stroke-width: 3;
    stroke-linejoin: round;
  }

  .axis {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
    font-family: var(--mono);
    font-size: 0.68rem;
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

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 14px;
    margin: 8px auto 0;
    font-size: 0.78rem;
    line-height: 1.5;
    color: var(--muted);
  }

  .li {
    white-space: nowrap;
  }

  .sw {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 3px;
    margin: 0 5px 0 0;
    vertical-align: -1px;
  }


  .sw.m {
    background: var(--mover);
  }

  .sw.r {
    background: color-mix(in srgb, var(--ref) 78%, #fff);
    box-shadow: inset 0 0 0 1px var(--ref-ink);
  }

  .sw.z {
    background: rgb(47 125 79 / 20%);
    box-shadow: inset 0 0 0 1px rgb(47 125 79 / 55%);
  }

  .panel {
    min-width: 0;
    display: grid;
    gap: 16px;
  }

  .checks {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }

  .checks li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 10px;
    align-items: start;
    padding: 9px 12px;
    border-radius: 10px;
    border: 1px solid transparent;
    transition: background 0.25s, border-color 0.25s;
  }

  .checks li.ok {
    background: color-mix(in srgb, var(--kept) 9%, transparent);
  }

  .checks li.bad {
    border-color: color-mix(in srgb, var(--lost) 70%, transparent);
    background: color-mix(in srgb, var(--lost) 10%, transparent);
  }

  .ck svg {
    width: 20px;
    height: 20px;
    padding: 3px;
    margin-top: 1px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--ink) 7%, transparent);
    fill: none;
    stroke: var(--muted);
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: background 0.25s;
  }

  li.ok .ck svg {
    background: var(--kept);
    stroke: #fff;
  }

  .txt {
    display: grid;
    min-width: 0;
  }

  .l {
    font-size: 0.92rem;
    font-weight: 550;
    line-height: 1.35;
    color: var(--ink);
  }

  .h {
    font-size: 0.78rem;
    line-height: 1.4;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .hold {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--paper);
    border: 1px solid var(--rule);
    transition: border-color 0.3s, background 0.3s;
  }

  .hold.done {
    border-color: color-mix(in srgb, var(--kept) 55%, transparent);
    background: color-mix(in srgb, var(--kept) 8%, var(--paper));
  }

  .hold.reset {
    border-color: color-mix(in srgb, var(--lost) 70%, transparent);
  }

  .ring {
    flex: none;
    width: 64px;
    height: 64px;
    overflow: visible;
    transform: rotate(-90deg);
  }

  .ring .track {
    fill: none;
    stroke: color-mix(in srgb, var(--ink) 9%, transparent);
    stroke-width: 6;
  }

  .ring .fill {
    fill: none;
    stroke: var(--kept);
    stroke-width: 6;
    stroke-linecap: round;
    transition: stroke-dashoffset 70ms linear;
  }

  .hold.reset .ring .fill {
    transition: none;
  }

  .ring .sec {
    transform: rotate(90deg);
    transform-origin: 36px 36px;
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 600;
    fill: var(--ink-2);
  }

  .ring .tick {
    transform: rotate(90deg);
    transform-origin: 36px 36px;
    fill: none;
    stroke: var(--kept);
    stroke-width: 4.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 40;
    animation: draw 0.45s var(--ease) both;
  }

  .ring .ping {
    fill: none;
    stroke: var(--kept);
    stroke-width: 2;
    transform-origin: 36px 36px;
    animation: ping 0.9s var(--ease) both;
  }

  @keyframes draw {
    from {
      stroke-dashoffset: 40;
    }
    to {
      stroke-dashoffset: 0;
    }
  }

  @keyframes ping {
    from {
      opacity: 0.7;
      transform: scale(1);
    }
    to {
      opacity: 0;
      transform: scale(1.35);
    }
  }

  .htxt {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .st {
    font-size: 0.95rem;
    font-weight: 600;
    line-height: 1.35;
    color: var(--ink-2);
  }

  .hold.done .st {
    color: var(--kept);
    font-family: var(--serif);
    font-size: 1.2rem;
    font-weight: 500;
  }

  .hold.reset .st {
    color: #8a5a00;
  }

  .cap {
    margin-top: 16px;
    font-size: 0.82rem;
    line-height: 1.55;
    color: var(--muted);
    max-width: 52em;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .mover,
    .zone,
    .checks li,
    .ck svg,
    .hold,
    .ring .fill,
    .chips button,
    .act {
      transition: none;
    }

    .ring .tick,
    .ring .ping {
      animation: none;
    }

    .ring .ping {
      display: none;
    }
  }
</style>
