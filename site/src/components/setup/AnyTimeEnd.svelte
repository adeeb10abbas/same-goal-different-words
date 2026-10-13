<script lang="ts">
  import { onMount } from 'svelte';
  import { epFile, TABLE_CROP, cropAspect, cropBackground, type Episode } from '../../lib/media';
  import { loadTimeline, type Runs } from '../../lib/timeline';
  import { study, GOALS, SCENES, FORM_SHORT, FORM_NAME, MODEL_SHORT, STAGE_LABEL, goalByKey, outcomeOf, pct, type Outcome } from '../../lib/study';
  import { TOTAL, cellOf, isAny, isEnd, goalPhrase, int } from '../../lib/setup';

  /** `codes`: one outcome code per episode (lib/setup). `examples`: worked rollouts, shown as mini timelines. */
  let { codes, examples }: { codes: string; examples: Episode[] } = $props();
  const uid = $props.id();
  const sc = study.settings.scoring;

  // Totals from the codes, checked against the published counts and the scene-balanced rates.
  const totals = $derived.by(() => {
    if (codes.length !== TOTAL) throw new Error(`any time/end: ${codes.length} codes for ${TOTAL} episodes`);
    let any = 0;
    let end = 0;
    const sa = SCENES.map(() => 0);
    const se = SCENES.map(() => 0);
    const sn = SCENES.map(() => 0);
    for (let i = 0; i < codes.length; i++) {
      const s = SCENES.indexOf(GOALS[cellOf(i).g].scene);
      const a = +isAny(codes[i]);
      const e = +isEnd(codes[i]);
      any += a;
      end += e;
      sa[s] += a;
      se[s] += e;
      sn[s]++;
    }
    const rateAny = sa.reduce((t, x, i) => t + x / sn[i], 0) / SCENES.length;
    const rateEnd = se.reduce((t, x, i) => t + x / sn[i], 0) / SCENES.length;
    if (any !== study.flow.anytime || end !== study.flow.end) throw new Error('any time/end: totals differ from study.flow');
    if (Math.abs(rateAny - study.rates.anytime) > 1e-9 || Math.abs(rateEnd - study.rates.end) > 1e-9)
      throw new Error('any time/end: scene-balanced rates differ from study.rates');
    return { any, end, lost: any - end, rateAny, rateEnd };
  });

  type Row = { e: Episode; o: Outcome; dur: number; fps: number };
  const rows = $derived.by(() =>
    examples.map((e): Row => {
      const g = goalByKey(`${e.s}-${e.g}`);
      if (!!e.init !== g.initiallyTrue) throw new Error(`any time/end: ${e.id} initial state disagrees with goal`);
      if (e.sf && !e.se) throw new Error(`any time/end: ${e.id} kept without a placement`);
      const fps = (g.scene.ticks - 1) / g.scene.seconds;
      if (e.n !== g.scene.ticks || !Number.isInteger(fps)) throw new Error(`any time/end: ${e.id} has an unexpected length`);
      return { e, o: outcomeOf(e), dur: g.scene.seconds, fps };
    }),
  );
  const groups = $derived(
    [false, true]
      .map((init) => ({ init, rows: rows.filter((r) => !!r.e.init === init) }))
      .filter((x) => x.rows.length)
      .map((x) => ({ ...x, goal: goalByKey(`${x.rows[0].e.s}-${x.rows[0].e.g}`) })),
  );

  // Scorer flags for each example, loaded once the figure is near the viewport.
  let flags = $state<Record<string, { goal: Runs; stable: Runs }>>({});
  let failed = $state(false);
  let root: HTMLDivElement;
  onMount(() => {
    const io = new IntersectionObserver(
      ([en]) => {
        if (!en.isIntersecting) return;
        io.disconnect();
        Promise.all(examples.map((e) => loadTimeline(e.id).then((t) => [e.id, { goal: t.flags.goal, stable: t.flags.stable }] as const)))
          .then((xs) => (flags = Object.fromEntries(xs)))
          .catch(() => (failed = true));
      },
      { rootMargin: '600px' },
    );
    io.observe(root);
    return () => io.disconnect();
  });

  let sel = $state(0);
  const cur = $derived(rows[Math.min(sel, rows.length - 1)]);

  const at = (t: number, r: Row) => `${((100 * t) / r.dur).toFixed(3)}%`;
  const seg = ([a, b]: [number, number], r: Row) => {
    const n = r.e.n - 1;
    return `left:${((100 * a) / n).toFixed(3)}%;width:max(2px, ${((100 * (b - a)) / n).toFixed(3)}%)`;
  };
  const sec = (t: number) => `${t.toFixed(1)} s`;
  // One shared time axis: every example must come from scenes of the same length.
  const DUR = $derived.by(() => {
    const d = rows[0]?.dur ?? 0;
    if (rows.some((r) => r.dur !== d)) throw new Error('any time/end: examples differ in episode length');
    return d;
  });
  const AXIS = $derived(Array.from({ length: Math.floor(DUR / 10) + 1 }, (_, i) => i * 10));

  function caption(r: Row) {
    const e = r.e;
    if (r.o === 'never') return `Never stable. ${STAGE_LABEL[e.stage] ?? e.stage}.`;
    const start = e.init ? 'Already in place at the start; credited' : 'Credited';
    const hold = r.o === 'kept' ? 'still stable through the final second' : 'not stable in the final second';
    return `${start} at ${sec(e.tStableDone!)}, ${hold}.`;
  }
  const label = (e: Episode) => `${MODEL_SHORT[e.m]}, ${FORM_NAME[e.f].toLowerCase()} (${FORM_SHORT[e.f]})`;
</script>

<div class="ate" bind:this={root}>
  <p class="lead">
    The scorer gives every run two outcomes. Both use the same stable-placement conditions: the requested relation, support, a
    target released from the gripper and moving slower than {sc.speedCmS}&nbsp;cm/s.
  </p>

  <div class="defs">
    <div class="def">
      <div class="lbl">Main outcome</div>
      <h4>Stable placement at any time</h4>
      <p>The conditions hold for {sc.holdS === 1 ? 'one' : sc.holdS} continuous second at some point during the episode.</p>
      <div class="big num">{pct(totals.rateAny)}</div>
      <div class="sm num">{int(totals.any)} of {int(TOTAL)} runs</div>
    </div>
    <div class="def strict">
      <div class="lbl">Stricter</div>
      <h4>Still holds at the end</h4>
      <p>The same conditions hold throughout the final second of the episode.</p>
      <div class="big num">{pct(totals.rateEnd)}</div>
      <div class="sm num">{int(totals.end)} of {int(TOTAL)} runs</div>
    </div>
  </div>
  <p class="note">
    Percentages weight the {SCENES.length} scenes equally, as in the paper; counts are raw. {int(totals.lost)} of the
    {int(totals.any)} runs credited at some point are no longer in place at the end.
    <a href="#failures">Where those placements go →</a>
  </p>

  <div class="examples">
    <div class="tl-list">
      <div class="legend" aria-hidden="true">
        <span><i class="sw hold"></i>Arrangement holds</span>
        <span><i class="sw still"></i>…and the target is still</span>
        <span><i class="mk"></i>Placement credited</span>
        <span><i class="sw last"></i>Final second</span>
      </div>
      {#each groups as gr (gr.init)}
        <div class="group">
          <div class="gh">
            <span class="lbl">{gr.init ? 'Already true at the start' : 'Must be achieved'}</span>
            <span class="gp">{goalPhrase(gr.goal)}</span>
          </div>
          {#each gr.rows as r (r.e.id)}
            {@const i = rows.indexOf(r)}
            {@const f = flags[r.e.id]}
            <button
              type="button"
              class="row {r.o}"
              aria-pressed={sel === i}
              onclick={() => (sel = i)}
            >
              <span class="who">
                <span class="m">{MODEL_SHORT[r.e.m]}</span>
                <span class="form-pill {r.e.f}" title={FORM_NAME[r.e.f]}>{FORM_SHORT[r.e.f]}</span>
              </span>
              <span class="track" aria-hidden="true">
                {#if f}
                  {#each f.goal as run (run[0])}<span class="hold" style={seg(run, r)}></span>{/each}
                  {#each f.stable as run (run[0])}<span class="still" style={seg(run, r)}></span>{/each}
                {:else if r.e.sf && r.e.tFinal !== null}
                  <span class="still" style="left:{at(r.e.tFinal, r)};right:0"></span>
                {/if}
                <span class="last" style="width:calc({(100 / r.dur).toFixed(3)}% + 6px)"></span>
                {#if r.e.tStableDone !== null}<span class="mk" style="left:{at(r.e.tStableDone, r)}"></span>{/if}
              </span>
              <span class="verdicts">
                <span class="v {r.e.se ? 'yes' : 'no'}">Any time <span aria-hidden="true">{r.e.se ? '✓' : '✗'}</span><span class="sr-only">{r.e.se ? 'yes' : 'no'}</span></span>
                <span class="v {r.e.sf ? 'yes' : 'no'}">End <span aria-hidden="true">{r.e.sf ? '✓' : '✗'}</span><span class="sr-only">{r.e.sf ? 'yes' : 'no'}</span></span>
              </span>
              <span class="cap">{caption(r)}</span>
            </button>
          {/each}
        </div>
      {/each}
      <div class="axis" aria-hidden="true">
        <span class="spacer"></span>
        <span class="ticks">
          {#each AXIS as t (t)}<span style="left:{(100 * t) / DUR}%">{t}{t === DUR ? ' s' : ''}</span>{/each}
        </span>
      </div>
      {#if failed}<p class="note">The detailed scorer traces could not be loaded; bars show only the final stable stretch.</p>{/if}
    </div>

    {#if cur}
      <figure class="stills" aria-labelledby="{uid}-cap">
        <div class="pair">
          <div class="still-img">
            <div class="img" role="img" aria-label="First frame" style="aspect-ratio:{cropAspect(TABLE_CROP)};{cropBackground(epFile(cur.e.id, 'first.webp'), TABLE_CROP)}"></div>
            <span class="lbl">Start</span>
          </div>
          <div class="still-img">
            <div class="img" role="img" aria-label="Last frame" style="aspect-ratio:{cropAspect(TABLE_CROP)};{cropBackground(epFile(cur.e.id, 'last.webp'), TABLE_CROP)}"></div>
            <span class="lbl">End · {cur.dur} s</span>
          </div>
        </div>
        <figcaption id="{uid}-cap">
          <span class="status {cur.o}">{cur.o === 'kept' ? 'Placed and kept' : cur.o === 'lost' ? 'Placed, then lost' : 'Never placed'}</span>
          <span class="fc">{label(cur.e)}, start {cur.e.c}: {goalPhrase(goalByKey(`${cur.e.s}-${cur.e.g}`))}.</span>
        </figcaption>
      </figure>
    {/if}
  </div>
</div>

<style>
  .ate {
    container-type: inline-size;
    margin-top: 14px;
  }

  .lead {
    margin: 0;
    color: var(--ink-2);
    max-width: var(--measure);
  }

  .defs {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
    margin-top: 24px;
    max-width: 880px;
  }

  @container (min-width: 560px) {
    .defs {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .def {
    background: var(--card);
    border: 1px solid var(--rule);
    border-top: 3px solid var(--ink-2);
    border-radius: var(--radius-s);
    padding: 16px 18px 18px;
    min-width: 0;
  }

  .def.strict {
    border-top-color: var(--kept);
  }

  .def h4 {
    font-family: var(--serif);
    font-size: 1.22rem;
    font-weight: 500;
    margin: 6px 0 6px;
    line-height: 1.25;
  }

  .def p {
    margin: 0 0 12px;
    font-size: 0.92rem;
    color: var(--ink-2);
  }

  .big {
    font-family: var(--serif);
    font-size: clamp(2rem, 1.6rem + 1.4vw, 2.6rem);
    line-height: 1;
    color: var(--ink);
  }

  .sm {
    margin-top: 6px;
    font-size: 0.84rem;
    color: var(--muted);
  }

  .note {
    margin-top: 18px;
  }

  .note a {
    color: var(--ink);
    white-space: nowrap;
  }

  .examples {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 22px;
    margin-top: 28px;
    background: var(--card);
    border: 1px solid var(--rule);
    border-radius: var(--radius);
    padding: clamp(14px, 2.4vw, 26px);
  }

  @container (min-width: 820px) {
    .examples {
      grid-template-columns: minmax(0, 1fr) minmax(220px, 280px);
      align-items: start;
    }
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    font-size: 0.8rem;
    color: var(--muted);
    margin-bottom: 8px;
  }

  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .sw {
    display: inline-block;
    width: 16px;
    height: 10px;
    border-radius: 2px;
  }

  .sw.hold {
    background: color-mix(in srgb, var(--ink) 16%, transparent);
  }

  .sw.still {
    background: linear-gradient(90deg, var(--kept) 50%, #a86f00 50%);
  }

  .sw.last {
    width: 10px;
    height: 14px;
    border: 2px solid var(--ink);
    background: transparent;
  }

  i.mk {
    position: relative;
    display: inline-block;
    width: 10px;
    height: 10px;
    background: var(--card);
    border: 2px solid var(--ink);
    transform: rotate(45deg);
  }

  .group {
    margin-top: 14px;
  }

  .gh {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 10px;
    margin-bottom: 4px;
  }

  .gp {
    font-size: 0.86rem;
    color: var(--ink-2);
  }

  .examples {
    --who: 6.2rem;
    --verd: 9.6rem;
  }

  .axis {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0 12px;
    padding: 0 8px;
    margin-top: 2px;
  }

  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'who' 'track' 'verdicts' 'cap';
    gap: 6px 12px;
    width: 100%;
    text-align: left;
    font: inherit;
    color: inherit;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-s);
    padding: 8px 8px;
    margin: 2px 0;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s;
  }

  @container (min-width: 520px) {
    .row {
      grid-template-columns: var(--who) minmax(0, 1fr) var(--verd);
      grid-template-areas: 'who track verdicts' '. cap cap';
      align-items: center;
    }

    .axis {
      grid-template-columns: var(--who) minmax(0, 1fr) var(--verd);
    }
  }

  .row:hover {
    background: color-mix(in srgb, var(--ink) 4%, transparent);
  }

  .row[aria-pressed='true'] {
    background: color-mix(in srgb, var(--ink) 5%, transparent);
    border-color: var(--rule-2);
  }

  .row:focus-visible {
    outline: 2px solid var(--tf);
    outline-offset: 2px;
  }

  .who {
    grid-area: who;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .m {
    font-weight: 600;
    font-size: 0.9rem;
  }

  .track {
    grid-area: track;
    position: relative;
    display: block;
    height: 16px;
    margin: 0 6px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--ink) 4%, transparent);
  }

  .track .hold,
  .track .still {
    position: absolute;
    top: 3px;
    bottom: 3px;
    background: color-mix(in srgb, var(--ink) 16%, transparent);
  }

  .track .still {
    top: 0;
    bottom: 0;
    background: var(--ink-2);
    border-radius: 1px;
  }

  .row.kept .track .still {
    background: var(--kept);
  }

  .row.lost .track .still {
    background: #a86f00;
  }

  .track .last {
    position: absolute;
    top: -4px;
    bottom: -4px;
    right: -3px;
    border: 2px solid var(--ink);
    border-radius: 2px;
  }

  .track .mk {
    position: absolute;
    top: 50%;
    width: 10px;
    height: 10px;
    margin: -5px 0 0 -5px;
    background: var(--card);
    border: 2px solid var(--ink);
    transform: rotate(45deg);
  }

  .verdicts {
    grid-area: verdicts;
    display: inline-flex;
    justify-content: flex-start;
    gap: 6px;
    flex-wrap: wrap;
  }

  .v {
    position: relative;
    font-size: 0.78rem;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: 999px;
    white-space: nowrap;
  }

  .v.yes {
    color: color-mix(in srgb, var(--kept) 72%, var(--ink));
    background: color-mix(in srgb, var(--kept) 10%, transparent);
  }


  .v.no {
    color: color-mix(in srgb, var(--muted) 80%, var(--ink));
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }

  .cap {
    grid-area: cap;
    font-size: 0.82rem;
    color: var(--muted);
    line-height: 1.4;
  }

  .axis .spacer {
    display: none;
  }

  @container (min-width: 520px) {
    .axis .spacer {
      display: block;
    }
  }

  .ticks {
    position: relative;
    display: block;
    height: 1.4em;
    margin: 0 6px;
    font-family: var(--mono);
    font-size: 0.7rem;
    color: var(--muted);
  }

  .ticks span {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    white-space: nowrap;
  }

  .ticks span:first-child {
    transform: none;
  }

  .ticks span:last-child {
    transform: translateX(-100%);
  }

  .stills {
    margin: 0;
    min-width: 0;
  }

  .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .still-img {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .img {
    width: 100%;
    border-radius: 6px;
    background-color: var(--stage-2);
    background-repeat: no-repeat;
  }

  .status.kept {
    color: color-mix(in srgb, var(--kept) 72%, var(--ink));
  }

  .status.lost {
    color: color-mix(in srgb, #a86f00 70%, var(--ink));
  }

  .status.never {
    color: color-mix(in srgb, var(--muted) 80%, var(--ink));
  }

  figcaption {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    margin-top: 10px;
    font-size: 0.84rem;
    color: var(--ink-2);
  }
</style>
