<script lang="ts">
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { study, MODELS, SCENES, GOALS, FORM_ORDER, FORM_SHORT, FORM_NAME, FORM_COLOR, type FormId, type ModelId } from '../../lib/study';
  import { reducedMotion } from '../../lib/sync';
  import { cell, contrastOf, CONTRASTS, dodge, num, spell, STARTS, type OutcomeId } from '../../lib/results';

  const uid = $props.id();
  type GoalSet = 'all' | 'excl';
  const OUTS: { id: OutcomeId; label: string }[] = [
    { id: 'anytime', label: 'Any time' },
    { id: 'end', label: 'At episode end' },
  ];
  const SETS: { id: GoalSet; label: string }[] = [
    { id: 'all', label: 'All goals' },
    { id: 'excl', label: 'Not true at reset' },
  ];

  // Scene-balanced rate from the counts: goals averaged within each scene, scenes weighted equally.
  const rate = (m: ModelId, f: FormId, o: OutcomeId, s: GoalSet) => {
    const per = SCENES.map((sc) => {
      const gs = sc.goals.filter((g) => s === 'all' || !g.initiallyTrue);
      return gs.reduce((t, g) => t + cell(m, g.key, f)[o === 'anytime' ? 0 : 1] / STARTS, 0) / gs.length;
    });
    return per.reduce((t, v) => t + v, 0) / per.length;
  };
  const SRC = { all: 'byModelForm', excl: 'byModelFormExcl' } as const;
  const mean = (xs: number[]) => xs.reduce((t, v) => t + v, 0) / xs.length;
  const fail = (msg: string) => {
    throw new Error(`results: ${msg}`);
  };
  for (const s of SETS)
    for (const o of OUTS) {
      for (const m of MODELS)
        for (const f of FORM_ORDER)
          if (Math.abs(rate(m.id, f, o.id, s.id) - study.rates[SRC[s.id]][m.id][f][o.id]) > 1e-9) fail(`rate ${s.id} ${o.id} ${m.id} ${f}`);
      const all = MODELS.flatMap((m) => FORM_ORDER.map((f) => rate(m.id, f, o.id, s.id)));
      const want = s.id === 'all' ? study.rates[o.id] : study.rates.excl[o.id];
      if (Math.abs(mean(all) - want) > 1e-9) fail(`overall rate ${s.id} ${o.id}`);
    }
  // With every goal included, each paired contrast is exactly the gap between two of these rates.
  for (const c of CONTRASTS)
    for (const o of OUTS)
      for (const row of ['All', ...MODELS.map((m) => m.id)] as const) {
        const ms = row === 'All' ? MODELS.map((m) => m.id) : [row as ModelId];
        const gap = mean(ms.map((m) => rate(m, c.a, o.id, 'all'))) - mean(ms.map((m) => rate(m, c.b, o.id, 'all')));
        if (Math.abs(gap - study.contrasts[c.id][o.id][row].est) > 1e-4) fail(`rate gap ${c.id} ${o.id} ${row}`);
      }

  type Row = { id: ModelId | 'All'; name: string; short: string };
  const ROWS: Row[] = [...MODELS.map((m) => ({ id: m.id, name: m.short, short: m.short })), { id: 'All', name: 'All models', short: 'All' }];
  const valueOf = (r: Row, f: FormId, o: OutcomeId, s: GoalSet) =>
    r.id === 'All' ? mean(MODELS.map((m) => rate(m.id, f, o, s))) : rate(r.id as ModelId, f, o, s);
  const STATES = OUTS.flatMap((o) => SETS.map((s) => ({ o: o.id, s: s.id })));
  const YMAX = Math.ceil(Math.max(...STATES.flatMap(({ o, s }) => ROWS.flatMap((r) => FORM_ORDER.map((f) => valueOf(r, f, o, s))))) * 10) / 10;
  const YT = Array.from({ length: Math.round(YMAX * 10) + 1 }, (_, i) => i / 10);
  // At any time a goal already true at reset always counts as placed, so no all-goals rate can fall below this.
  const FLOOR = mean(SCENES.map((sc) => sc.goals.filter((g) => g.initiallyTrue).length / sc.goals.length));
  const TRUE_GOALS = GOALS.filter((g) => g.initiallyTrue);
  const FALSE_GOALS = GOALS.filter((g) => !g.initiallyTrue);

  let o = $state<OutcomeId>('anytime');
  let s = $state<GoalSet>('all');
  const vals = $derived(ROWS.flatMap((r) => FORM_ORDER.map((f) => valueOf(r, f, o, s))));
  const reduce = reducedMotion();
  const tw = Tween.of(() => vals, { duration: reduce ? 0 : 650, easing: cubicOut });
  const floorOn = $derived(o === 'anytime' && s === 'all');

  let w = $state(0);
  const H = 300;
  const TOP = 14;
  const BOT = H - 36;
  const narrow = $derived(w < 420);
  const LW = 30;
  const RW = $derived(narrow ? 78 : 118);
  const xs = $derived.by(() => {
    const x0 = LW + 22;
    const x2 = Math.max(x0 + 60, w - RW - 12);
    return [x0, (x0 + x2) / 2, x2];
  });
  const y = (v: number) => BOT - (v / YMAX) * (BOT - TOP);
  const pt = (ri: number, fi: number) => tw.current[ri * 3 + fi] ?? 0;
  const path = (ri: number) => FORM_ORDER.map((_, fi) => `${fi ? 'L' : 'M'}${xs[fi].toFixed(1)} ${y(pt(ri, fi)).toFixed(1)}`).join('');
  const labY = $derived(dodge(ROWS.map((_, ri) => y(pt(ri, 2))), 15, TOP + 4, BOT - 6));

  const cur = (r: Row, f: FormId) => valueOf(r, f, o, s);
  const rowAll = (r: Row) => mean(FORM_ORDER.map((f) => cur(r, f)));
  const overall = $derived(s === 'all' ? study.rates[o] : study.rates.excl[o]);
  const rfLowest = $derived(MODELS.filter((m) => FORM_ORDER.every((f) => f === 'I' || rate(m.id, 'I', o, s) < rate(m.id, f, o, s))));
  const tfRf = $derived(study.contrasts.TF_RF[o].All.est);
  // A model-wording pair whose any-time rate equals the floor placed none of the goals that were not already true.
  const onFloor = MODELS.flatMap((m) =>
    FORM_ORDER.filter((f) => Math.abs(rate(m.id, f, 'anytime', 'all') - FLOOR) < 1e-9).map((f) => `${m.short}’s ${FORM_SHORT[f]}`),
  );
  // Raw counts behind a zero rate, so a zero reads as observed failures.
  const zeros = $derived(
    MODELS.flatMap((m) =>
      FORM_ORDER.filter((f) => rate(m.id, f, o, s) === 0).map((f) => {
        const goals = s === 'all' ? GOALS : FALSE_GOALS;
        const k = o === 'anytime' ? 0 : 1;
        return { m, f, placed: goals.reduce((t, g) => t + cell(m.id, g.key, f)[k], 0), n: goals.length * STARTS, goals: goals.length };
      }),
    ),
  );
  const label = $derived(
    `Slope chart of scene-balanced placement rates ${o === 'anytime' ? 'at any time' : 'at episode end'}, ${s === 'all' ? 'all goals' : 'excluding goals true at reset'}. ` +
      ROWS.map((r) => `${r.name}: ${FORM_ORDER.map((f) => `${FORM_SHORT[f]} ${num(cur(r, f))}`).join(', ')}`).join('; ') +
      ' percent.',
  );

  // Appendix C.3: raw episode counts by goal type, derived from the count table.
  type Raw = { label: string; n: number; any: number; end: number };
  const tally = (goals: typeof GOALS): Raw => {
    let any = 0;
    let end = 0;
    for (const m of MODELS)
      for (const g of goals)
        for (const f of FORM_ORDER) {
          const [a, e] = cell(m.id, g.key, f);
          if (e > a) fail(`${m.id} ${g.key} ${f}: end exceeds any time`);
          any += a;
          end += e;
        }
    return { label: '', n: MODELS.length * goals.length * FORM_ORDER.length * STARTS, any, end };
  };
  const RAW: Raw[] = [
    { ...tally(GOALS), label: 'All episodes' },
    { ...tally(FALSE_GOALS), label: 'Goals not true at reset' },
    { ...tally(TRUE_GOALS), label: 'Goals true at reset' },
  ];
  const fl = study.flow;
  for (const [r, want] of [
    [RAW[0], fl],
    [RAW[1], fl.achievement],
    [RAW[2], fl.maintenance],
  ] as const)
    if (r.n !== (want.total ?? want.n) || r.any !== want.anytime || r.end !== want.end) fail(`raw flow ${r.label}`);
  const pc = (a: number, b: number) => `${((100 * a) / b).toFixed(1)}%`;
  const ALL = RAW[0];
  const ACH = RAW[1];
  const MNT = RAW[2];
</script>

<div class="fig rs">
  <div class="controls">
    <div class="ctl">
      <span class="cl" id="{uid}-o">Outcome</span>
      <div class="seg" role="group" aria-labelledby="{uid}-o">
        {#each OUTS as x (x.id)}
          <button type="button" aria-pressed={o === x.id} onclick={() => (o = x.id)}>{x.label}</button>
        {/each}
      </div>
    </div>
    <div class="ctl">
      <span class="cl" id="{uid}-g">Goals</span>
      <div class="seg" role="group" aria-labelledby="{uid}-g">
        {#each SETS as x (x.id)}
          <button type="button" aria-pressed={s === x.id} onclick={() => (s = x.id)}>{x.label}</button>
        {/each}
      </div>
    </div>
  </div>

  <div class="body">
    <div class="chart">
      <div class="yt" aria-hidden="true">Placement rate, %</div>
      <div class="cv" bind:clientWidth={w} role="img" aria-label={label}>
        <svg width="100%" height={H} aria-hidden="true">
          {#if w}
            {#each YT as t (t)}
              <line class="grid" class:base={t === 0} x1={LW} x2={xs[2] + 8} y1={y(t)} y2={y(t)} />
              <text class="tick" x={LW - 6} y={y(t) + 4} text-anchor="end">{Math.round(100 * t)}</text>
            {/each}
            {#each FORM_ORDER as f, fi (f)}
              <line class="col" x1={xs[fi]} x2={xs[fi]} y1={TOP - 4} y2={BOT} />
              <text class="xl" x={xs[fi]} y={H - 12} text-anchor="middle" style:fill={FORM_COLOR[f]}>{narrow ? FORM_SHORT[f] : FORM_NAME[f]}</text>
            {/each}
            <g class="floor" style:opacity={floorOn ? 1 : 0}>
              <line x1={LW} x2={xs[2] + 8} y1={y(FLOOR)} y2={y(FLOOR)} />
              <text x={LW + 4} y={y(FLOOR) + 15}>{narrow ? 'True-at-reset floor' : 'Floor from goals already true at reset'} {num(FLOOR)}</text>
            </g>
            {#each ROWS as r, ri (r.id)}
              <path class="ln m-{r.id}" class:all={r.id === 'All'} d={path(ri)} data-qa-line />
            {/each}
            {#each ROWS as r, ri (r.id)}
              {#each FORM_ORDER as f, fi (f)}
                <circle class="pt" class:all={r.id === 'All'} cx={xs[fi]} cy={y(pt(ri, fi))} r={r.id === 'All' ? 6 : 4.5} style:fill={FORM_COLOR[f]} data-qa-shape />
              {/each}
              {@const py = y(pt(ri, 2))}
              {@const ly = labY[ri]}
              {#if Math.abs(ly - py) > 1.5}
                <path class="lead" d="M{xs[2] + 8} {py}L{xs[2] + 13} {py}L{xs[2] + 17} {ly}" data-qa-line />
              {/if}
              <text class="rl" class:all={r.id === 'All'} x={xs[2] + 20} y={ly + 4}
                >{narrow ? r.short : r.name}<tspan class="rv" dx="5">{num(cur(r, 'I'))}</tspan></text
              >
            {/each}
          {/if}
        </svg>
      </div>
      <div class="key" aria-hidden="true">
        {#each ROWS as r (r.id)}
          <span class="k"
            ><svg width="26" height="10"><line class="ln m-{r.id}" class:all={r.id === 'All'} x1="1" x2="25" y1="5" y2="5" /></svg>{r.name}</span
          >
        {/each}
      </div>
    </div>

    <div class="side">
      <div class="tscroll" role="region" aria-label="Placement rates by model and wording" tabindex="0" data-qa-scroll="x">
        <table class="dtable rt">
          <caption class="sr-only">
            Scene-balanced placement rates in percent, {o === 'anytime' ? 'at any time' : 'at episode end'}, {s === 'all'
              ? 'all goals'
              : 'excluding goals true at reset'}
          </caption>
          <thead>
            <tr>
              <th scope="col">Model</th>
              {#each FORM_ORDER as f (f)}<th scope="col" class="n" style:color={FORM_COLOR[f]}>{FORM_SHORT[f]}</th>{/each}
              <th scope="col" class="n">All</th>
            </tr>
          </thead>
          <tbody>
            {#each ROWS as r (r.id)}
              <tr class:tot={r.id === 'All'}>
                <th scope="row">{r.name}</th>
                {#each FORM_ORDER as f (f)}<td class="n num">{num(cur(r, f))}</td>{/each}
                <td class="n num">{num(rowAll(r))}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <ul class="notes">
        <li>
          Overall rate{s === 'all' ? '' : ' without the goals true at reset'}, all models and wordings:
          <b class="num">{num(overall)}%</b>
          {o === 'anytime' ? 'at any time' : 'at episode end'}.
        </li>
        {#if rfLowest.length === MODELS.length}
          <li>RF is the lowest of the {spell(FORM_ORDER.length)} wordings for every model in this view.</li>
        {:else}
          <li>RF is the lowest wording for {rfLowest.map((m) => m.short).join(', ') || 'no model'} in this view.</li>
        {/if}
        {#if s === 'all'}
          <li>
            The all-models line falls <b class="num">{num(tfRf)}&nbsp;points</b> from TF to RF: exactly the paired TF − RF estimate {o === 'anytime'
              ? 'at any time'
              : 'at episode end'}, because both average goals within scenes and weight scenes equally.
          </li>
        {/if}
        {#if floorOn}
          <li>
            At any time the {spell(TRUE_GOALS.length)} goals already true at reset always count as placed, which sets a floor of
            <b class="num">{num(FLOOR)}%</b>.{#if onFloor.length}
              {' '}{onFloor.join(' and ')} {onFloor.length > 1 ? 'rates sit' : 'rate sits'} exactly on it: no such run placed a goal that was not
              already true.{/if}
          </li>
        {/if}
        {#each zeros as z (z.m.id + z.f)}
          <li>
            {z.m.short}’s {FORM_SHORT[z.f]} rate is zero: {z.placed} of its {z.n}
            {FORM_SHORT[z.f]} runs on the {spell(z.goals)}
            {s === 'all' ? 'goals' : 'goals not true at reset'} reached a stable placement {o === 'anytime' ? 'at any time' : 'at episode end'}.
          </li>
        {/each}
        {#if o === 'end'}
          <li>The episode-end check requires the placement conditions throughout the final second.</li>
        {/if}
      </ul>
    </div>
  </div>
  <p class="caption">
    Rates average the goals within each scene and weight the {spell(SCENES.length)} scenes equally, as in the paper; per-model rates are descriptive.
    {s === 'excl'
      ? `This view drops the ${spell(TRUE_GOALS.length)} goals already true at reset (${TRUE_GOALS.map((g) => g.short).join(', ')}).`
      : ''}
    Any-time and end scores assess placement only; neither shows that the requested object was the one moved.
  </p>

  <div class="raw">
    <h4 class="rh">Placed, then failed the end check: raw counts</h4>
    <div class="legend" aria-hidden="true">
      <span><i class="sw kept"></i>Passes the end check</span>
      <span><i class="sw lost"></i>Placed, fails the end check</span>
      <span><i class="sw never"></i>Never placed</span>
    </div>
    <div class="rows">
      {#each RAW as r (r.label)}
        <div
          class="rr"
          role="img"
          aria-label="{r.label}, {r.n} episodes: {r.end} pass the end check, {r.any - r.end} placed but fail it, {r.n - r.any} never placed."
        >
          <div class="rt1" aria-hidden="true"><b>{r.label}</b><span class="num">{r.n} episodes</span></div>
          <div class="track" aria-hidden="true">
            <div class="bar" style:width="{(100 * r.n) / ALL.n}%">
              {#if r.end}<span class="part kept" style:flex-grow={r.end}></span>{/if}
              {#if r.any - r.end}<span class="part lost" style:flex-grow={r.any - r.end}></span>{/if}
              {#if r.n - r.any}<span class="part never" style:flex-grow={r.n - r.any}></span>{/if}
            </div>
          </div>
          <div class="rt2 num" aria-hidden="true">
            <span><i class="sw kept"></i>{r.end}</span>
            <span><i class="sw lost"></i>{r.any - r.end}</span>
            <span><i class="sw never"></i>{r.n - r.any}</span>
          </div>
        </div>
      {/each}
    </div>
    <p class="rtext">
      Across the {ALL.n} episodes, {ALL.any} reach a stable placement and {ALL.end} also pass the episode-end check, so
      <b class="num">{ALL.any - ALL.end} of the {ALL.any}</b> any-time passes (<span class="num">{pc(ALL.any - ALL.end, ALL.any)}</span>) fail at the
      end. Among the {ACH.n} episodes whose goals are not true at reset, {ACH.any} reach a placement and {ACH.end} pass the final check; the other
      {ACH.any - ACH.end} are <span class="num">{pc(ACH.any - ACH.end, ACH.any)}</span> of that group’s any-time passes. For goals already true at
      reset, {MNT.end} of {MNT.n} episodes pass the final check.
    </p>
    <p class="caption">
      Raw counts pooled over models and wordings, so they need not equal the scene-balanced rates above. An episode can lose and regain a
      placement, so passing at the end does not show that the placement was held continuously after it was first reached.
    </p>
  </div>
</div>

<style>
  .rs {
    container-type: inline-size;
  }

  .controls {
    gap: 14px 26px;
    align-items: flex-end;
  }

  .ctl {
    display: grid;
    gap: 6px;
    justify-items: start;
  }

  .cl,
  .yt {
    font-family: var(--mono);
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .body {
    margin-top: 24px;
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
    gap: 26px 34px;
    align-items: start;
  }

  .yt {
    margin-bottom: 6px;
  }

  .cv svg {
    display: block;
    overflow: visible;
  }

  .grid {
    stroke: var(--rule);
  }

  .grid.base {
    stroke: var(--rule-2);
  }

  .col {
    stroke: var(--rule-2);
    stroke-dasharray: 2 4;
  }

  .tick {
    font-family: var(--mono);
    font-size: 0.66rem;
    fill: var(--muted);
  }

  .xl {
    font-size: 0.78rem;
    font-weight: 700;
  }

  .floor {
    transition: opacity 0.4s;
  }

  .floor line {
    stroke: var(--muted);
    stroke-width: 1.3;
    stroke-dasharray: 5 4;
  }

  .floor text {
    font-size: 0.7rem;
    fill: var(--muted);
    paint-order: stroke;
    stroke: var(--card);
    stroke-width: 4px;
    stroke-linejoin: round;
  }

  .ln {
    fill: none;
    stroke: var(--ink-2);
    stroke-width: 1.6;
    stroke-linejoin: round;
  }

  .ln.m-N3 {
    stroke-dasharray: none;
  }

  .ln.m-E3 {
    stroke-dasharray: 6 4;
  }

  .ln.m-F3 {
    stroke-dasharray: 1.5 3.5;
    stroke-linecap: round;
    stroke-width: 2;
  }

  .ln.all {
    stroke: var(--ink);
    stroke-width: 3.4;
  }

  .pt {
    stroke: var(--card);
    stroke-width: 1.5;
  }

  .lead {
    fill: none;
    stroke: var(--muted);
    stroke-width: 1;
  }

  .rl {
    font-size: 0.74rem;
    font-weight: 600;
    fill: var(--ink-2);
  }

  .rl.all {
    fill: var(--ink);
    font-weight: 700;
  }

  .rv {
    font-family: var(--mono);
    font-weight: 600;
    fill: var(--rf);
  }

  .key {
    margin-top: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    font-size: 0.78rem;
    color: var(--ink-2);
  }

  .k {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  .k svg {
    display: block;
  }

  .side {
    display: grid;
    gap: 14px;
    min-width: 0;
  }

  .rt {
    width: 100%;
  }

  .rt tr.tot th,
  .rt tr.tot td {
    font-weight: 700;
    border-top: 1px solid var(--rule-2);
  }

  .notes {
    margin: 0;
    padding: 0 0 0 1.1em;
    display: grid;
    gap: 6px;
    font-size: 0.88rem;
    color: var(--ink-2);
  }

  .notes b {
    font-family: var(--mono);
    color: var(--ink);
  }

  .rs > .caption {
    margin-top: 18px;
  }

  .raw {
    margin-top: 30px;
    padding-top: 22px;
    border-top: 1px solid var(--rule);
  }

  .rh {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
  }

  .legend {
    margin-top: 10px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    font-size: 0.8rem;
    color: var(--ink-2);
  }

  .legend span,
  .rt2 span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  .sw {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    flex: none;
  }

  .sw.kept,
  .part.kept {
    background: var(--kept);
  }

  .sw.lost,
  .part.lost {
    background: var(--lost);
  }

  .sw.never,
  .part.never {
    background: var(--never);
  }

  .rows {
    margin-top: 14px;
    display: grid;
    gap: 14px;
  }

  .rr {
    display: grid;
    grid-template-columns: minmax(10rem, 13rem) minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px 16px;
  }

  .rt1 {
    display: grid;
    font-size: 0.86rem;
  }

  .rt1 span {
    font-size: 0.76rem;
    color: var(--muted);
  }

  .track {
    min-width: 0;
  }

  .bar {
    display: flex;
    height: 18px;
    border-radius: 3px;
    overflow: hidden;
    gap: 2px;
    background: var(--card);
  }

  .part {
    flex-basis: 0;
    min-width: 0;
  }

  .rt2 {
    display: flex;
    gap: 12px;
    font-family: var(--mono);
    font-size: 0.8rem;
    color: var(--ink-2);
  }

  .rtext {
    margin: 16px 0 0;
    max-width: var(--measure);
    color: var(--ink-2);
  }

  .raw .caption {
    margin-top: 10px;
  }

  @container (max-width: 760px) {
    .body {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @container (max-width: 400px) {
    .rt th,
    .rt td {
      padding-inline: 5px;
    }

    .rt th:first-child {
      padding-left: 0;
    }

    .rt td:last-child,
    .rt th:last-child {
      padding-right: 0;
    }
  }

  @container (max-width: 560px) {
    .rr {
      grid-template-columns: minmax(0, 1fr);
    }

    .rt1 {
      display: flex;
      flex-wrap: wrap;
      gap: 2px 8px;
      align-items: baseline;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .floor {
      transition: none;
    }
  }
</style>
