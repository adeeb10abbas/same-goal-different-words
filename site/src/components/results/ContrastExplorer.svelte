<script lang="ts">
  import { onMount } from 'svelte';
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { study, MODELS, SCENES, GOALS, FORM_SHORT, FORM_COLOR } from '../../lib/study';
  import { onVisible, reducedMotion } from '../../lib/sync';
  import {
    CONTRASTS,
    ROWS,
    STARTS,
    contrastOf,
    discordant,
    startDetail,
    signed,
    sgn,
    spell,
    fmtCI,
    fmtP,
    isTested,
    swarm,
    placeTip,
    SCENE_COLOR,
    REL_TEXT,
    OUT_LABEL,
    type Bits,
    type ContrastId,
    type OutcomeId,
    type RowId,
  } from '../../lib/results';

  let { bits }: { bits: Bits } = $props();
  const uid = $props.id();

  type Start = { scene: string; slot: number; d: number };
  type Iv = { est: number; ci: [number, number]; starts: Start[] };

  const NAME = { All: 'All models', ...Object.fromEntries(MODELS.map((m) => [m.id, m.short])) } as Record<RowId, string>;
  const SCENE_SHORT: Record<string, string> = Object.fromEntries(SCENES.map((s) => [s.id, s.short]));
  const STATS = study.settings.stats;
  const DRAWS = STATS.bootstrapDraws.toLocaleString('en-US');
  const OUTS: { id: OutcomeId; label: string }[] = [
    { id: 'anytime', label: 'Any time' },
    { id: 'end', label: 'At episode end' },
  ];

  let cid = $state<ContrastId>('TF_RF');
  let out = $state<OutcomeId>('anytime');
  let hl = $state<string | null>(null);

  const C = $derived(contrastOf(cid));
  const A = $derived(FORM_SHORT[C.a]);
  const B = $derived(FORM_SHORT[C.b]);
  const ivOf = (c: ContrastId, o: OutcomeId, r: RowId) => study.contrasts[c][o][r] as Iv;

  const reduce = reducedMotion();
  const tw = Object.fromEntries(
    ROWS.map((r) => [r, Tween.of(() => ivOf(cid, out, r).est, { duration: reduce ? 0 : 520, easing: cubicOut })]),
  ) as Record<RowId, Tween<number>>;

  // Strip geometry (px). Dots keep their exact x; ties stack vertically up to CAP levels either side of Y0.
  const H = 100;
  const Y0 = 38;
  const YE = 82;
  const YM = 94;
  const PAD = 14;
  const CAP = 4;
  let w = $state(0);
  const step = $derived(w >= 480 ? 8 : 7);
  const rad = $derived(step / 2 - 0.5);
  const sx = (v: number) => PAD + ((v + 1) / 2) * (w - 2 * PAD);
  const TICKS = [-1, -0.5, 0, 0.5, 1];
  const tick = (t: number) => (t > 0 ? `+${100 * t}` : t < 0 ? `−${-100 * t}` : '0');

  const lay = $derived(
    ROWS.map((id) => {
      const iv = ivOf(cid, out, id);
      const xs = iv.starts.map((s) => sx(s.d));
      const off = w ? swarm(xs, step, CAP) : xs.map(() => [0, 0] as [number, number]);
      const pos = xs.map((x, i) => [x + off[i][0], Y0 + off[i][1]] as [number, number]);
      const order = xs.map((_, i) => i).sort((p, q) => iv.starts[p].d - iv.starts[q].d || pos[p][0] - pos[q][0] || p - q);
      const rank: number[] = [];
      order.forEach((i, k) => (rank[i] = k));
      const up = iv.starts.filter((s) => s.d > 1e-9).length;
      const down = iv.starts.filter((s) => s.d < -1e-9).length;
      const mean: Record<string, number> = {};
      for (const sc of SCENES) {
        const ss = iv.starts.filter((s) => s.scene === sc.id);
        mean[sc.id] = ss.reduce((t, s) => t + s.d, 0) / ss.length;
      }
      return { id, iv, pos, order, rank, up, down, tie: iv.starts.length - up - down, tested: isTested(cid, out, id), mean };
    }),
  );
  const spill = $derived(
    w ? Math.round(Math.max(0, ...lay.flatMap((L) => L.pos.map((p, i) => Math.abs(p[0] - sx(L.iv.starts[i].d)) / step)))) : 1,
  );

  // Raw discordant pairs. One scale for every state so bars stay comparable while switching.
  const disc = $derived(discordant(bits, cid, out));
  const DMAX = Math.max(
    ...CONTRASTS.flatMap((c) =>
      (['anytime', 'end'] as OutcomeId[]).flatMap((o) => {
        const d = discordant(bits, c.id, o);
        return ROWS.flatMap((r) => [d[r].a, d[r].b]);
      }),
    ),
  );
  const DROWS: RowId[] = [...MODELS.map((m) => m.id), 'All'];

  // Entrance: dots gather at the estimate, then spread to their starts once the chart is on screen.
  let rowsEl: HTMLDivElement;
  let seen = $state(reduce);
  let shown = $state(reduce);
  onMount(() => (reduce ? undefined : onVisible(rowsEl, (v) => v && (seen = true), 0.15)));
  $effect(() => {
    if (!seen || !w || shown) return;
    let id = requestAnimationFrame(() => (id = requestAnimationFrame(() => (shown = true))));
    return () => cancelAnimationFrame(id);
  });

  // One cursor per row for keyboard use; pointer hover moves it too.
  let cur = $state<Partial<Record<RowId, number>>>({});
  let act = $state<{ row: number; i: number } | null>(null);
  let svgs = $state<SVGSVGElement[]>([]);
  let touch = false;

  const navigable = (ri: number) => {
    const L = lay[ri];
    return hl ? L.order.filter((i) => L.iv.starts[i].scene === hl) : L.order;
  };
  const cursorOf = (ri: number) => {
    const ids = navigable(ri);
    const c = cur[lay[ri].id];
    return c !== undefined && ids.includes(c) ? c : ids[Math.floor(ids.length / 2)];
  };

  function pick(e: PointerEvent, ri: number) {
    const svg = svgs[ri];
    if (!svg || !w) return;
    const b = svg.getBoundingClientRect();
    const px = e.clientX - b.left;
    const py = e.clientY - b.top;
    let best = -1;
    let bd = Infinity;
    for (const i of navigable(ri)) {
      const [x, y] = lay[ri].pos[i];
      const d = (x - px) ** 2 + (0.5 * (y - py)) ** 2;
      if (d < bd) [bd, best] = [d, i];
    }
    if (best < 0 || bd > 24 ** 2) {
      if (e.pointerType !== 'touch') act = null;
      return;
    }
    cur[lay[ri].id] = best;
    act = { row: ri, i: best };
  }

  function keys(e: KeyboardEvent, ri: number) {
    const ids = navigable(ri);
    const k = Math.max(0, ids.indexOf(cursorOf(ri)));
    let n = k;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') n = Math.min(ids.length - 1, k + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') n = Math.max(0, k - 1);
    else if (e.key === 'PageUp') n = Math.min(ids.length - 1, k + 4);
    else if (e.key === 'PageDown') n = Math.max(0, k - 4);
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = ids.length - 1;
    else if (e.key === 'Escape') return void (act = null);
    else return;
    e.preventDefault();
    cur[lay[ri].id] = ids[n];
    act = { row: ri, i: ids[n] };
  }

  const pairWord = (row: RowId) => (row === 'All' ? 'goal–model pairs' : 'goals');
  const tallyOf = (cells: string[]) => [cells.filter((c) => c === 'a').length, cells.filter((c) => c === 'b').length];
  function valueText(ri: number) {
    const L = lay[ri];
    const s = L.iv.starts[cursorOf(ri)];
    const det = startDetail(bits, cid, out, L.id, s.scene, s.slot);
    const [na, nb] = tallyOf(det.grid.flatMap((g) => g.cells));
    return `${SCENE_SHORT[s.scene]} scene, start ${s.slot}: ${signed(s.d)} points. Of ${det.pairs} ${pairWord(L.id)}, ${na} placed only under ${A} and ${nb} only under ${B}.`;
  }

  // Tooltip: above the dot, else below, else clamped inside the viewport and under the header.
  let tipEl = $state<HTMLDivElement>();
  let tipPos = $state<{ x: number; y: number } | null>(null);
  $effect(() => {
    const a = act;
    const el = tipEl;
    if (!a || !el || !svgs[a.row] || !lay[a.row]) return void (tipPos = null);
    const b = svgs[a.row].getBoundingClientRect();
    const [x, y] = lay[a.row].pos[a.i];
    tipPos = placeTip({ cx: b.left + x, top: b.top + y - rad - 3, bottom: b.top + y + rad + 3 }, el);
  });
  const tip = $derived.by(() => {
    if (!act || !lay[act.row]) return null;
    const L = lay[act.row];
    const s = L.iv.starts[act.i];
    const det = startDetail(bits, cid, out, L.id, s.scene, s.slot);
    const [na, nb] = tallyOf(det.grid.flatMap((g) => g.cells));
    return { L, s, det, na, nb, dagger: det.grid.some((g) => g.goal.initiallyTrue) };
  });

  function setContrast(c: ContrastId) {
    cid = c;
    act = null;
  }
  function setOut(o: OutcomeId) {
    out = o;
    act = null;
  }

  const status = (L: (typeof lay)[number]) =>
    L.tested ? `Holm-adjusted p\u00a0${fmtP(study.contrasts[cid].pHolm)}` : cid === 'DIR_RF' ? 'Descriptive · added later' : 'Descriptive';
  const live = $derived(
    `${A} minus ${B}, ${OUT_LABEL[out]}: ${signed(lay[0].iv.est)} points across all ${spell(MODELS.length)} models, 95% interval ${fmtCI(lay[0].iv.ci)}. ` +
      lay
        .slice(1)
        .map((L) => `${NAME[L.id]} ${signed(L.iv.est)}`)
        .join(', ') +
      '.',
  );
</script>

<svelte:window
  onscroll={() => (act = null)}
  onresize={() => (act = null)}
  onkeydown={(e) => e.key === 'Escape' && (act = null)}
  onpointerdown={(e) => {
    if (!(e.target as Element)?.closest?.('.cx-plot')) act = null;
  }}
/>

<div class="fig cx">
  <div class="controls">
    <div class="ctl">
      <span class="cl" id="{uid}-c">Contrast</span>
      <div class="seg" role="group" aria-labelledby="{uid}-c">
        {#each CONTRASTS as c (c.id)}
          <button type="button" aria-pressed={cid === c.id} onclick={() => setContrast(c.id)}
            >{FORM_SHORT[c.a]}<span class="mn">−</span>{FORM_SHORT[c.b]}</button
          >
        {/each}
      </div>
    </div>
    <div class="ctl">
      <span class="cl" id="{uid}-o">Outcome</span>
      <div class="seg" role="group" aria-labelledby="{uid}-o">
        {#each OUTS as o (o.id)}
          <button type="button" aria-pressed={out === o.id} onclick={() => setOut(o.id)}>{o.label}</button>
        {/each}
      </div>
    </div>
    <div class="ctl">
      <span class="cl" id="{uid}-s">Highlight a scene</span>
      <div class="chips" role="group" aria-labelledby="{uid}-s">
        <button type="button" class="chip" aria-pressed={hl === null} onclick={() => (hl = null)}>All</button>
        {#each SCENES as s (s.id)}
          <button type="button" class="chip" aria-pressed={hl === s.id} onclick={() => (hl = hl === s.id ? null : s.id)}
            ><i class="sw" style:background={SCENE_COLOR[s.id]} aria-hidden="true"></i>{s.short}</button
          >
        {/each}
      </div>
    </div>
  </div>

  <div class="rows" bind:this={rowsEl} style:--a={FORM_COLOR[C.a]} style:--b={FORM_COLOR[C.b]}>
    {#each lay as L, ri (L.id)}
      {#if ri === 1}<div class="sep"><span>Each model separately · descriptive</span></div>{/if}
      <div class="row" class:all={L.id === 'All'}>
        <div class="head">
          <span class="rn">{NAME[L.id]}</span>
          <span class="est nw"><span class="ev">{signed(tw[L.id].current)}</span><span class="eu">points</span></span>
          <span class="ci">95% CI {fmtCI(L.iv.ci)}</span>
          <span class="st" class:t={L.tested}>{status(L)}</span>
          <span class="tally"
            ><b style:color="var(--a)">{L.up}</b> starts favour {A}, <b style:color="var(--b)">{L.down}</b>
            {B}, {L.tie} tie</span
          >
        </div>
        <div
          class="plot cx-plot"
          role="slider"
          tabindex="0"
          aria-label="{NAME[L.id]}: start-level {A} minus {B} differences, {OUT_LABEL[out]}"
          aria-valuemin={1}
          aria-valuemax={L.iv.starts.length}
          aria-valuenow={L.rank[cursorOf(ri)] + 1}
          aria-valuetext={valueText(ri)}
          aria-orientation="horizontal"
          onpointermove={(e) => pick(e, ri)}
          onpointerdown={(e) => {
            touch = e.pointerType === 'touch';
            pick(e, ri);
          }}
          onpointerleave={() => {
            if (!touch) act = null;
          }}
          onkeydown={(e) => keys(e, ri)}
          onfocus={(e) => {
            if ((e.currentTarget as HTMLElement).matches(':focus-visible')) act = { row: ri, i: cursorOf(ri) };
          }}
          onblur={() => (act = null)}
        >
          <svg bind:this={svgs[ri]} width="100%" height={H} aria-hidden="true">
            {#if w}
              {#each TICKS as t (t)}
                <line class="grid" class:zero={t === 0} x1={sx(t)} x2={sx(t)} y1="2" y2={H - 2} />
              {/each}
              <rect
                class="cib"
                x="0"
                y={YE - 1.25}
                width="1"
                height="2.5"
                style:transform="translate({sx(L.iv.ci[0])}px, 0) scaleX({sx(L.iv.ci[1]) - sx(L.iv.ci[0])})"
                data-qa-shape
              />
              {#each L.iv.ci as c, k (k)}
                <rect class="cap" x="-0.75" y={YE - 5} width="1.5" height="10" style:transform="translate({sx(c)}px, 0)" data-qa-shape />
              {/each}
              <path class="dia" d="M0 {YE - 6.5}L5.5 {YE}L0 {YE + 6.5}L-5.5 {YE}Z" style:transform="translate({sx(L.iv.est)}px, 0)" data-qa-shape />
              {#if hl}
                <path
                  class="smean"
                  d="M0 {YM - 4.5}l4.5 7.5h-9Z"
                  fill={SCENE_COLOR[hl]}
                  style:transform="translate({sx(L.mean[hl])}px, 0)"
                  data-qa-shape
                />
              {/if}
              {#each L.iv.starts as s, i (i)}
                {@const p = L.pos[i]}
                <circle
                  class="dot"
                  class:dim={!!hl && s.scene !== hl}
                  r={rad}
                  fill={SCENE_COLOR[s.scene]}
                  style:transform="translate({shown ? p[0] : sx(L.iv.est)}px, {shown ? p[1] : YE}px)"
                  style:opacity={shown ? null : 0}
                  style:transition-delay="{shown ? L.rank[i] * 7 : 0}ms"
                  data-qa-shape
                />
              {/each}
              {#if act?.row === ri}
                {@const p = L.pos[act.i]}
                <circle class="ring" r={rad + 2.8} style:transform="translate({p[0]}px, {p[1]}px)" />
              {/if}
            {/if}
          </svg>
        </div>
      </div>
    {/each}
    <div class="row axis">
      <div class="head" aria-hidden="true"></div>
      <div class="plot-ax" bind:clientWidth={w}>
        <svg width="100%" height="24" aria-hidden="true">
          {#if w}
            {#each TICKS as t (t)}
              <line class="tk" x1={sx(t)} x2={sx(t)} y1="0" y2="5" data-qa-line />
              <text x={sx(t)} y="18" text-anchor="middle">{tick(t)}</text>
            {/each}
          {/if}
        </svg>
        <div class="fav" aria-hidden="true">
          <span style:color="var(--b)">← {B} placed more</span>
          <span style:color="var(--a)">{A} placed more →</span>
        </div>
        <div class="axt">Paired difference in stable-placement rate, percentage points</div>
      </div>
    </div>
  </div>

  <p class="sr-only" aria-live="polite">{live}</p>

  <div class="notes">
    {#if cid === 'TF_RF'}
      <p class="note">
        TF and RF change both object order and relation vocabulary, so this comparison does not identify which aspect drives the effect.
      </p>
    {:else if cid === 'DIR_TF'}
      <p class="note">
        DIR versus TF compares a concise command with an expanded one. The pooled interval includes zero{#if out === 'anytime'}&nbsp;(adjusted
          p&nbsp;{fmtP(study.contrasts.DIR_TF.pHolm)}){/if}. Failure to detect that difference is not evidence that expanding the
        instruction has no effect.
      </p>
    {:else}
      <p class="note">
        DIR–RF was added after the original analyses and is descriptive. The two forms also differ in length and sentence construction, so
        this comparison cannot isolate the effect of changing spatial perspective. No new multiplicity-adjusted significance claims are made.
      </p>
    {/if}
    {#if out === 'end'}
      <p class="note">
        Episode-end outcomes are descriptive. The end check requires the placement conditions throughout the final second of the episode.
      </p>
    {/if}
  </div>

  <p class="caption">
    Each dot is one of the {STATS.starts} physical starts ({spell(STARTS)} per scene). Its position is the paired {A}&nbsp;−&nbsp;{B}
    difference in stable placement for that start, averaged over the scene’s goals and, in the top row, over the {spell(MODELS.length)} models.
    Tied dots stack vertically{#if spill > 0}; a full stack continues {spell(spill)} dot-width{spill > 1 ? 's' : ''} to the side{/if}. Diamonds
    and bars show the mean and its 95% interval from {DRAWS} bootstrap draws of starts within scenes. Adjusted p-values appear only for the {spell(study.settings.stats.holmFamily.length)}
    original pooled any-time tests (TF&nbsp;−&nbsp;RF and DIR&nbsp;−&nbsp;TF, Holm correction); all other rows are descriptive.{#if hl}
      The triangle marks the {SCENE_SHORT[hl].toLowerCase()} scene’s average.{/if}
  </p>

  <div class="disc">
    <h4>Paired runs that disagree</h4>
    <p class="dsub">Same model, start and goal; {OUT_LABEL[out]}. The remaining pairs agree: both wordings placed, or neither did.</p>
    <div class="dgrid" style:--a={FORM_COLOR[C.a]} style:--b={FORM_COLOR[C.b]}>
      <span class="dh dl" aria-hidden="true"></span>
      <span class="dh db">Only {B} placed</span>
      <span class="dh da">Only {A} placed</span>
      <span class="dh dn">Agree</span>
      {#each DROWS as r (r)}
        {@const d = disc[r]}
        {#if r === 'All'}<span class="dsep" aria-hidden="true"></span>{/if}
        <span class="dl" class:tot={r === 'All'}>{r === 'All' ? 'All' : NAME[r]}<span class="dn-in">{' · '}{d.n - d.a - d.b} of {d.n} agree</span></span>
        <span class="half b" class:tot={r === 'All'}>
          <i style:width="calc((100% - 2.6em) * {d.b / DMAX})"></i><b>{d.b}</b>
        </span>
        <span class="half a" class:tot={r === 'All'}>
          <i style:width="calc((100% - 2.6em) * {d.a / DMAX})"></i><b>{d.a}</b>
        </span>
        <span class="dn" class:tot={r === 'All'}>{d.n - d.a - d.b} of {d.n}</span>
      {/each}
    </div>
    <p class="caption">
      Raw counts of paired runs in which exactly one wording reached a stable placement: {disc[MODELS[0].id].n} pairs per model ({GOALS.length}
      goals × {STARTS} starts). They include the {spell(GOALS.filter((g) => g.initiallyTrue).length)} goals already true at the start, which
      never disagree at any time. Unlike the dots above, these counts are not averaged within scenes. Computed from the released episode outcomes;
      the paper does not report them.
    </p>
  </div>
</div>

{#if tip}
  <div
    class="tooltip cx-tip"
    bind:this={tipEl}
    style:left="{tipPos?.x ?? 0}px"
    style:top="{tipPos?.y ?? 0}px"
    style:visibility={tipPos ? null : 'hidden'}
    style:--a={FORM_COLOR[C.a]}
    style:--b={FORM_COLOR[C.b]}
    data-qa-overlay
    aria-hidden="true"
  >
    <span class="tt-h"
      ><i class="sw" style:background={SCENE_COLOR[tip.s.scene]}></i><b>{SCENE_SHORT[tip.s.scene]} · start {tip.s.slot}</b><span class="tt-r"
        >{NAME[tip.L.id]}</span
      ></span
    >
    <span class="tt-v"><b>{signed(tip.s.d)}</b> points = ({tip.na} − {tip.nb}) ÷ {tip.det.pairs} {pairWord(tip.L.id)}</span>
    <span class="tt-g" style:grid-template-columns="auto repeat({tip.det.models.length}, minmax(2.7em, auto))">
      <span></span>
      {#each tip.det.models as m (m)}<span class="tt-m">{NAME[m]}</span>{/each}
      {#each tip.det.grid as g (g.goal.key)}
        <span class="tt-gl">{REL_TEXT[g.goal.id]}{g.goal.initiallyTrue ? ' †' : ''}</span>
        {#each g.cells as c, k (k)}
          <span class="tt-c {c}">{c === 'a' ? A : c === 'b' ? B : c === 'both' ? 'both' : '–'}</span>
        {/each}
      {/each}
    </span>
    <span class="tt-n"
      >Which wording placed ({OUT_LABEL[out]}): only {A}, only {B}, both, or neither (–).{#if tip.dagger}&nbsp;† Already true at the
        start.{/if}</span
    >
  </div>
{/if}

<style>
  .cx {
    container-type: inline-size;
  }

  .controls {
    gap: 14px 26px;
    align-items: flex-start;
  }

  .ctl {
    display: grid;
    gap: 6px;
    justify-items: start;
  }

  .cl {
    font-family: var(--mono);
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .mn {
    margin-inline: 0.22em;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 30px;
    padding: 4px 11px;
    border-radius: 999px;
    border: 1px solid var(--rule-2);
    background: var(--card);
    color: var(--ink-2);
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition:
      background 0.2s,
      border-color 0.2s,
      color 0.2s;
  }

  .chip:hover {
    border-color: var(--ink-2);
  }

  .chip[aria-pressed='true'] {
    background: var(--ink);
    border-color: var(--ink);
    color: #fff;
  }

  .sw {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex: none;
  }

  .chip[aria-pressed='true'] .sw {
    box-shadow: 0 0 0 1.5px #fff;
  }

  .rows {
    margin-top: 26px;
    display: grid;
    gap: 6px;
  }

  .row {
    display: grid;
    grid-template-columns: 14.5rem minmax(0, 1fr);
    gap: 4px 22px;
    align-items: center;
  }

  .sep {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 10px 0 2px;
    font-family: var(--mono);
    font-size: 0.66rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .sep::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--rule);
  }

  .head {
    display: grid;
    gap: 1px;
    align-content: center;
    min-width: 0;
  }

  .rn {
    font-weight: 600;
    font-size: 0.92rem;
  }

  .est {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
  }

  .ev {
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
    font-size: 1.32rem;
    font-weight: 500;
    letter-spacing: -0.02em;
  }

  .all .ev {
    font-size: 1.6rem;
  }

  .eu {
    font-size: 0.8rem;
    color: var(--muted);
  }

  .ci,
  .st,
  .tally {
    font-size: 0.78rem;
    color: var(--muted);
  }

  .ci {
    font-family: var(--mono);
    font-size: 0.74rem;
    white-space: nowrap;
  }

  .st.t {
    color: var(--ink);
    font-weight: 600;
  }

  .tally b {
    font-weight: 700;
  }

  .plot {
    position: relative;
    min-width: 0;
    border-radius: 8px;
    cursor: crosshair;
    touch-action: pan-y;
  }

  .plot:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  .plot svg,
  .plot-ax svg {
    display: block;
    overflow: visible;
  }

  .grid {
    stroke: var(--rule);
    stroke-width: 1;
  }

  .grid.zero {
    stroke: var(--ink-2);
    stroke-opacity: 0.45;
    stroke-dasharray: 3 3;
  }

  .cib,
  .cap,
  .dia,
  .smean {
    transform-origin: 0 0;
    transition: transform 0.6s var(--ease);
    pointer-events: none;
  }

  .cib,
  .cap {
    fill: var(--ink);
  }

  .dia {
    fill: var(--ink);
    stroke: var(--card);
    stroke-width: 1.5;
  }

  .smean {
    stroke: var(--card);
    stroke-width: 1;
  }

  .dot {
    transition:
      transform 0.7s var(--ease),
      opacity 0.35s;
  }

  .dot.dim {
    opacity: 0.14;
  }

  .ring {
    fill: none;
    stroke: var(--ink);
    stroke-width: 1.6;
    pointer-events: none;
  }

  .tk {
    stroke: var(--rule-2);
  }

  .plot-ax text {
    font-family: var(--mono);
    font-size: 0.66rem;
    fill: var(--muted);
  }

  .fav {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 0.78rem;
    font-weight: 600;
    margin-top: 2px;
  }

  .axt {
    text-align: center;
    font-size: 0.76rem;
    color: var(--muted);
    margin-top: 2px;
  }

  .notes {
    display: grid;
    gap: 10px;
    margin-top: 22px;
  }

  .notes .note {
    margin: 0;
  }

  .cx > .caption {
    margin-top: 14px;
  }

  .disc {
    margin-top: 30px;
    padding-top: 24px;
    border-top: 1px solid var(--rule);
  }

  .disc h4 {
    font-size: 1.05rem;
  }

  .dsub {
    margin: 4px 0 14px;
    font-size: 0.86rem;
    color: var(--ink-2);
    max-width: 46em;
  }

  .dgrid {
    display: grid;
    grid-template-columns: 4.6rem minmax(0, 1fr) minmax(0, 1fr) 5.6rem;
    align-items: center;
    row-gap: 6px;
    max-width: 760px;
  }

  .dh {
    font-size: 0.74rem;
    font-weight: 600;
    padding-bottom: 4px;
  }

  .dh.db {
    text-align: right;
    padding-right: 10px;
    color: var(--b);
  }

  .dh.da {
    padding-left: 10px;
    color: var(--a);
  }

  .dh.dn {
    text-align: right;
    color: var(--muted);
    font-weight: 500;
  }

  .dl {
    font-size: 0.86rem;
    font-weight: 500;
  }

  .dn-in {
    display: none;
    font-weight: 400;
    color: var(--muted);
  }

  .half {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 22px;
  }

  .half.b {
    flex-direction: row-reverse;
    box-shadow: inset -1.5px 0 0 var(--ink-2);
  }

  .half i {
    display: block;
    height: 14px;
    flex: none;
    transition: width 0.6s var(--ease);
  }

  .half.a i {
    background: var(--a);
    border-radius: 0 3px 3px 0;
  }

  .half.b i {
    background: var(--b);
    border-radius: 3px 0 0 3px;
    margin-right: 1.5px;
  }

  .half b {
    font-family: var(--mono);
    font-size: 0.78rem;
    font-weight: 600;
  }

  .half.a b {
    color: var(--a);
  }

  .half.b b {
    color: var(--b);
  }

  .dn {
    text-align: right;
    font-family: var(--mono);
    font-size: 0.76rem;
    color: var(--muted);
  }

  .dsep {
    grid-column: 1 / -1;
    height: 1px;
    margin-top: 2px;
    background: var(--rule);
  }

  .dl.tot {
    font-weight: 700;
  }

  .disc .caption {
    margin-top: 14px;
  }

  @container (max-width: 640px) {
    .row {
      grid-template-columns: minmax(0, 1fr);
    }

    .row.axis .head {
      display: none;
    }

    .head {
      grid-template-columns: minmax(0, 1fr) auto;
      column-gap: 10px;
      align-items: baseline;
    }

    .rn {
      grid-column: 1;
      grid-row: 1;
    }

    .est {
      grid-column: 2;
      grid-row: 1;
      justify-self: end;
    }

    .st {
      grid-column: 1;
      grid-row: 2;
    }

    .ci {
      grid-column: 2;
      grid-row: 2;
      justify-self: end;
    }

    .tally {
      grid-column: 1 / -1;
      grid-row: 3;
    }

    .st.t {
      grid-column: 1 / -1;
      grid-row: 3;
    }

    .st.t ~ .tally {
      grid-row: 4;
    }

    .all .ev {
      font-size: 1.4rem;
    }

    .row + .row {
      margin-top: 10px;
    }
  }

  @container (max-width: 470px) {
    .dgrid {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }

    .dh.dl,
    .dh.dn,
    .dn {
      display: none;
    }

    .dl {
      grid-column: 1 / -1;
      padding-top: 4px;
    }

    .dn-in {
      display: inline;
    }

    .seg button {
      padding-inline: 10px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dot,
    .cib,
    .cap,
    .dia,
    .smean,
    .half i {
      transition: none;
    }
  }

  :global(.cx-tip) {
    display: grid;
    gap: 6px;
    width: max-content;
    max-width: min(300px, calc(100vw - 16px));
    transform: none;
    padding: 9px 12px 10px;
  }

  .tt-h {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .tt-r {
    margin-left: auto;
    padding-left: 10px;
    font-size: 0.72rem;
    color: #b9bfc8;
  }

  .tt-v b {
    font-family: var(--mono);
    font-size: 0.95rem;
  }

  .tt-g {
    display: grid;
    gap: 2px 4px;
    font-size: 0.72rem;
    align-items: center;
  }

  .tt-m {
    text-align: center;
    color: #b9bfc8;
    font-size: 0.68rem;
  }

  .tt-gl {
    padding-right: 6px;
    color: #d5d9df;
    white-space: nowrap;
  }

  .tt-c {
    text-align: center;
    border-radius: 4px;
    padding: 1px 4px;
    font-family: var(--mono);
    font-size: 0.68rem;
    font-weight: 600;
    background: rgb(255 255 255 / 8%);
    color: #b9bfc8;
  }

  .tt-c.a {
    background: var(--a);
    color: #fff;
  }

  .tt-c.b {
    background: var(--b);
    color: #fff;
  }

  .tt-c.both {
    background: rgb(255 255 255 / 22%);
    color: #fff;
    font-weight: 500;
  }

  .tt-n {
    font-size: 0.72rem;
    color: #c9ced6;
    line-height: 1.4;
  }
</style>
