<script lang="ts">
  import { onMount } from 'svelte';
  import { study, MODELS, SCENES, sceneById } from '../../lib/study';
  import { onVisible, reducedMotion } from '../../lib/sync';
  import { signed, spell, SCENE_COLOR, STARTS } from '../../lib/results';

  const uid = $props.id();
  const REL = Object.fromEntries(study.relation.map((r) => [r.key, r]));
  const POOLED = MODELS.length * STARTS;

  // Per scene: goal effects, their running total, the sum and the scene average.
  const SCN = SCENES.map((s) => {
    const goals = s.goals.map((g) => ({ g, r: REL[g.key] }));
    let run = 0;
    const steps = goals.map(({ g, r }) => {
      const from = run;
      run += r.est;
      return { g, r, from, to: run };
    });
    const sum = run;
    const avg = sum / goals.length;
    const tf = goals.reduce((t, x) => t + x.r.tf, 0);
    const rf = goals.reduce((t, x) => t + x.r.rf, 0);
    const pts = [0, ...steps.map((x) => x.to), avg];
    const range = Math.max(...pts) - Math.min(...pts);
    const step = range <= 0.3 ? 0.05 : range <= 0.6 ? 0.1 : 0.25;
    const lo = Math.min(-step, Math.floor(Math.min(...pts) / step - 1e-9) * step);
    const hi = Math.max(step, Math.ceil(Math.max(...pts) / step - 1e-9) * step);
    return { s, steps, sum, avg, tf, rf, runs: goals.length * POOLED, lo, hi, step };
  });
  // The scene averages, weighted equally, are the pooled any-time TF−RF estimate.
  const overall = SCN.reduce((t, x) => t + x.avg, 0) / SCN.length;
  if (Math.abs(overall - study.contrasts.TF_RF.anytime.All.est) > 1e-4) throw new Error('results: scene averages do not give the pooled estimate');
  const cancel = SCN.filter((x) => x.steps.some((st) => st.r.est > 0) && x.steps.some((st) => st.r.est < 0));
  const FIRST = (cancel.find((x) => Math.abs(x.sum) < 1e-9) ?? cancel[0] ?? SCN[0]).s.id;

  let sid = $state(FIRST);
  const S = $derived(SCN.find((x) => x.s.id === sid)!);

  const reduce = reducedMotion();
  let w = $state(0);
  const BH = 34;
  const PX = 10;
  const sx = $derived((v: number) => PX + ((v - S.lo) / (S.hi - S.lo)) * Math.max(1, w - 2 * PX));
  const ticks = $derived.by(() => {
    const t: number[] = [];
    const every = w && w < 260 ? 2 : 1;
    for (let k = Math.round(S.lo / S.step); k * S.step <= S.hi + 1e-9; k++) if (k % every === 0) t.push(+(k * S.step).toFixed(4));
    return t;
  });
  const tl = (t: number) => (t > 0 ? `+${Math.round(100 * t)}` : t < 0 ? `−${Math.round(-100 * t)}` : '0');

  // Reveal one goal at a time, then the sum, then the scene average.
  let stage = $state(reduce ? 99 : 0);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seen = false;
  function play() {
    clearTimeout(timer);
    if (reduce) return void (stage = 99);
    stage = 0;
    const tick = () => {
      stage++;
      if (stage <= S.steps.length + 1) timer = setTimeout(tick, 520);
    };
    timer = setTimeout(tick, 380);
  }
  let el: HTMLDivElement;
  onMount(() => {
    const off = onVisible(
      el,
      (v) => {
        if (v && !seen) {
          seen = true;
          play();
        }
      },
      0.35,
    );
    return () => {
      off();
      clearTimeout(timer);
    };
  });
  function pick(id: string) {
    if (id === sid) return;
    sid = id;
    if (seen) play();
  }

  type Step = (typeof SCN)[number]['steps'][number];
  const pos = $derived(S.steps.filter((x) => x.r.est > 0));
  const neg = $derived(S.steps.filter((x) => x.r.est < 0));
  const zero = $derived(S.steps.filter((x) => x.r.est === 0));
  const item = (x: Step) => `${x.g.short} (${signed(x.r.est)})`;
  const list = (xs: Step[]) => (xs.length <= 1 ? xs.map(item).join('') : `${xs.slice(0, -1).map(item).join(', ')} and ${item(xs[xs.length - 1])}`);
  const exact = $derived(Math.abs(S.sum) < 1e-9);
  const sname = $derived(sceneById(sid).short.toLowerCase());
  const label = $derived(
    `Waterfall for the ${sname} scene: ` +
      S.steps.map((x) => `${x.g.short} ${signed(x.r.est)}`).join(', ') +
      `; sum ${signed(S.sum)}; scene average ${signed(S.avg)} points.`,
  );
  const tone = (v: number) => (v > 1e-9 ? 'pos' : v < -1e-9 ? 'neg' : '');
  const dia = (y: number) => `M0 ${y - 7}L6 ${y}L0 ${y + 7}L-6 ${y}Z`;
</script>

<div class="fig cc" bind:this={el}>
  <div class="controls">
    <div class="ctl">
      <span class="cl" id="{uid}-s">Scene</span>
      <div class="picks" role="group" aria-labelledby="{uid}-s">
        {#each SCN as x (x.s.id)}
          <button type="button" class="pick" aria-pressed={sid === x.s.id} onclick={() => pick(x.s.id)}
            ><i class="sw" style:background={SCENE_COLOR[x.s.id]} aria-hidden="true"></i>{x.s.short}</button
          >
        {/each}
      </div>
    </div>
    {#if !reduce}
      <button type="button" class="btn replay" onclick={play}>
        <svg viewBox="0 0 16 16" aria-hidden="true"
          ><path d="M3 8a5 5 0 1 0 1.6-3.7M3 2.5v2.8h2.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg
        >
        Replay
      </button>
    {/if}
  </div>

  <div class="wf" role="img" aria-label={label}>
    {#each S.steps as st, i (st.g.key)}
      {@const y = BH / 2}
      {@const on = stage > i}
      {@const next = stage > i + 1}
      <div class="wr" aria-hidden="true">
        <span class="rl">
          <span class="rn">{st.g.short}{#if st.g.initiallyTrue}<sup>†</sup>{/if}</span>
          <span class="rc num"><b class="S">{st.r.tf}</b> vs <b class="I">{st.r.rf}</b></span>
        </span>
        <svg class="rb" width="100%" height={BH}>
          {#if w}
            {#each ticks as t (t)}
              <line class="grid" class:zero={t === 0} x1={sx(t)} x2={sx(t)} y1="0" y2={BH} />
            {/each}
            {#if i > 0}
              <line class="conn" x1={sx(st.from)} x2={sx(st.from)} y1="0" y2={y - 9} style:opacity={on ? 1 : 0} data-qa-line />
            {/if}
            <line class="conn" x1={sx(st.to)} x2={sx(st.to)} y1={y + 9} y2={BH} style:opacity={next ? 1 : 0} data-qa-line />
            {#if st.r.est !== 0}
              <rect
                class="bar {tone(st.r.est)}"
                x="0"
                y={y - 8}
                width="1"
                height="16"
                style:transform="translate({sx(st.from)}px, 0) scaleX({on ? sx(st.to) - sx(st.from) : 0})"
                data-qa-shape
              />
            {:else}
              <circle class="nil" class:hollow={st.g.initiallyTrue} cx={sx(st.from)} cy={y} r="4.5" style:opacity={on ? 1 : 0} data-qa-shape />
            {/if}
          {/if}
        </svg>
        <span class="v num {tone(st.r.est)}">{signed(st.r.est)}</span>
      </div>
    {/each}
    <div class="wr tot" aria-hidden="true">
      <span class="rl"><span class="rn">Sum of {spell(S.steps.length)} goals</span></span>
      <svg class="rb" width="100%" height={BH}>
        {#if w}
          {#each ticks as t (t)}
            <line class="grid" class:zero={t === 0} x1={sx(t)} x2={sx(t)} y1="0" y2={BH} />
          {/each}
          <line class="conn" x1={sx(S.sum)} x2={sx(S.sum)} y1="0" y2={BH / 2 - 9} style:opacity={stage > S.steps.length ? 1 : 0} data-qa-line />
          {#if !exact}
            <rect
              class="bar sum"
              x="0"
              y={BH / 2 - 8}
              width="1"
              height="16"
              style:transform="translate({sx(0)}px, 0) scaleX({stage > S.steps.length ? sx(S.sum) - sx(0) : 0})"
              data-qa-shape
            />
          {/if}
          <path class="dia" d={dia(BH / 2)} style:transform="translate({sx(S.sum)}px, 0)" style:opacity={stage > S.steps.length ? 1 : 0} data-qa-shape />
        {/if}
      </svg>
      <span class="v num {tone(S.sum)}">{signed(S.sum)}</span>
    </div>
    <div class="wr tot avg" aria-hidden="true">
      <span class="rl"><span class="rn">Scene average</span><span class="rc">sum ÷ {S.steps.length}</span></span>
      <svg class="rb" width="100%" height={BH}>
        {#if w}
          {#each ticks as t (t)}
            <line class="grid" class:zero={t === 0} x1={sx(t)} x2={sx(t)} y1="0" y2={BH} />
          {/each}
          <path class="dia avg" d={dia(BH / 2)} style:transform="translate({sx(S.avg)}px, 0)" style:opacity={stage > S.steps.length + 1 ? 1 : 0} data-qa-shape />
        {/if}
      </svg>
      <span class="v num {tone(S.avg)}">{signed(S.avg)}</span>
    </div>
    <div class="wr axis" aria-hidden="true">
      <span class="ax" bind:clientWidth={w}>
        <svg width="100%" height="18">
          {#if w}
            {#each ticks as t (t)}<text x={sx(t)} y="13" text-anchor="middle">{tl(t)}</text>{/each}
          {/if}
        </svg>
        {#if w}
          <span class="fv l" style:right="{w - sx(0) + 6}px">← RF</span>
          <span class="fv r" style:left="{sx(0) + 6}px">TF →</span>
        {/if}
      </span>
    </div>
  </div>

  <div class="story">
    <p>
      {#if pos.length && neg.length}
        In the {sname} scene, {list(pos)}
        {pos.length > 1 ? 'favour' : 'favours'} TF, while {list(neg)}
        {neg.length > 1 ? 'favour' : 'favours'} RF.
        {#if exact}
          The opposite effects cancel exactly: the scene average is <b class="num">{signed(S.avg)}&nbsp;points</b>, although its goals respond to
          the wording in opposite directions.
        {:else}
          They partly offset, leaving a scene average of <b class="num">{signed(S.avg)}&nbsp;points</b>.
        {/if}
      {:else if pos.length}
        In the {sname} scene no goal favours RF: {list(pos)}
        {pos.length > 1 ? 'favour' : 'favours'} TF{#if zero.length}, and {list(zero)}
          {zero.length > 1 ? 'show' : 'shows'} no difference{/if}. The scene average is <b class="num">{signed(S.avg)}&nbsp;points</b>.
      {:else}
        The {sname} scene average is <b class="num">{signed(S.avg)}&nbsp;points</b>.
      {/if}
      Across the scene’s {S.runs} runs per wording, TF placed {S.tf} times and RF {S.rf} times.
    </p>
    <div class="build">
      <span class="bl" id="{uid}-b">Pooled TF − RF, scenes weighted equally</span>
      <div class="eqn" role="group" aria-labelledby="{uid}-b">
        <span class="op par" aria-hidden="true">(</span>
        {#each SCN as x, i (x.s.id)}
          <span class="term"
            >{#if i}<span class="op plus" aria-hidden="true">+</span>{/if}<button
              type="button"
              class="chip"
              class:on={x.s.id === sid}
              aria-current={x.s.id === sid ? 'true' : undefined}
              onclick={() => pick(x.s.id)}
              aria-label="{x.s.short} {signed(x.avg)} points, scene average"
              ><i class="sw" style:background={SCENE_COLOR[x.s.id]}></i>{x.s.short}&nbsp;<b class="num">{signed(x.avg)}</b></button
            ></span
          >
        {/each}
        <span class="op par" aria-hidden="true">)</span>
        <span class="eq"><span class="op"><span class="nsum">Sum&nbsp;</span>÷&nbsp;{SCN.length} =</span> <b class="num">{signed(overall)}&nbsp;points</b></span>
      </div>
    </div>
  </div>

  <p class="caption">
    Each bar adds one goal’s paired TF − RF difference at any time, pooled over the {spell(MODELS.length)} models; the counts beside each goal are its TF and
    RF placements out of {POOLED}. Bars to the right favour TF, bars to the left favour RF. Goals marked † are already true at every start and
    add zero. The pooled estimate averages the goals within each scene and then weights the {spell(SCN.length)} scenes equally, so a scene
    whose goals cancel contributes nothing to it.
  </p>
</div>

<style>
  .cc {
    container-type: inline-size;
  }

  .controls {
    justify-content: space-between;
    align-items: flex-end;
    gap: 14px 20px;
  }

  .ctl {
    display: grid;
    gap: 6px;
    justify-items: start;
  }

  .cl,
  .bl {
    font-family: var(--mono);
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .replay {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 13px;
    font-size: 0.82rem;
  }

  .replay svg {
    width: 14px;
    height: 14px;
  }

  .wf {
    margin-top: 26px;
    display: grid;
    grid-template-columns: minmax(7rem, max-content) minmax(0, 1fr) 4.4rem;
    column-gap: 14px;
  }

  .wr {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    align-items: center;
  }

  .wr.tot {
    border-top: 1px solid var(--rule-2);
  }

  .wr.avg {
    border-top-style: dashed;
  }

  .rl {
    display: grid;
    gap: 1px;
    min-width: 0;
  }

  .rn {
    font-size: 0.88rem;
    font-weight: 500;
    white-space: nowrap;
  }

  .rc {
    font-size: 0.72rem;
    color: var(--muted);
    white-space: nowrap;
  }

  .rc b {
    font-family: var(--mono);
    font-weight: 600;
  }

  .rc b.S {
    color: var(--tf);
  }

  .rc b.I {
    color: var(--rf);
  }

  .tot .rn {
    font-weight: 700;
  }

  sup {
    font-size: 0.7em;
    margin-left: 1px;
    color: var(--muted);
  }

  .rb,
  .ax svg {
    display: block;
    overflow: visible;
  }

  .rb {
    grid-column: 2;
  }

  .grid {
    stroke: var(--rule);
  }

  .grid.zero {
    stroke: var(--ink-2);
    stroke-opacity: 0.55;
    stroke-dasharray: 3 3;
  }

  .bar {
    transform-origin: 0 0;
    transition: transform 0.5s var(--ease);
  }

  .bar.pos {
    fill: var(--tf);
  }

  .bar.neg {
    fill: var(--rf);
  }

  .bar.sum {
    fill: var(--ink-2);
    opacity: 0.3;
  }

  .nil {
    fill: var(--muted);
    transition: opacity 0.3s;
  }

  .nil.hollow {
    fill: var(--card);
    stroke: var(--muted);
    stroke-width: 1.6;
  }

  .conn {
    stroke: var(--ink-2);
    stroke-width: 1.2;
    stroke-dasharray: 2 3;
    transition: opacity 0.3s;
  }

  .dia {
    fill: var(--ink);
    stroke: var(--card);
    stroke-width: 1.5;
    transition:
      opacity 0.3s,
      transform 0.5s var(--ease);
  }

  .dia.avg {
    fill: var(--card);
    stroke: var(--ink);
    stroke-width: 2;
  }

  .v {
    grid-column: 3;
    text-align: right;
    font-family: var(--mono);
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--muted);
    white-space: nowrap;
  }

  .v.pos {
    color: var(--tf);
  }

  .v.neg {
    color: var(--rf);
  }

  .tot .v {
    color: var(--ink);
  }

  .ax {
    grid-column: 2;
    position: relative;
    display: block;
    padding-bottom: 22px;
  }

  .ax text {
    font-family: var(--mono);
    font-size: 0.66rem;
    fill: var(--muted);
  }

  .fv {
    position: absolute;
    top: 21px;
    font-size: 0.74rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .fv.l {
    color: var(--rf);
  }

  .fv.r {
    color: var(--tf);
  }

  /* Narrow: the label and value sit on one line above each bar. */
  @container (max-width: 460px) {
    .wf {
      grid-template-columns: minmax(0, 1fr);
      margin-top: 18px;
    }

    .wr {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        'l v'
        'b b';
      padding-top: 6px;
    }

    .rl {
      grid-area: l;
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 2px 8px;
    }

    .v {
      grid-area: v;
      font-size: 0.82rem;
    }

    .rb {
      grid-area: b;
    }

    .conn {
      display: none;
    }

    .wr.axis {
      grid-template-areas: 'b b';
      padding-top: 0;
    }

    .ax {
      grid-area: b;
    }
  }

  .story {
    margin-top: 18px;
    display: grid;
    gap: 16px;
  }

  .story p {
    margin: 0;
    max-width: var(--measure);
    color: var(--ink-2);
  }

  .build {
    display: grid;
    gap: 8px;
  }

  .eqn {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 6px;
  }

  .picks {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .pick {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid var(--rule-2);
    background: var(--card);
    color: var(--ink-2);
    font-size: 0.82rem;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background 0.2s,
      border-color 0.2s,
      color 0.2s;
  }

  .pick:hover {
    border-color: var(--ink-2);
  }

  .pick[aria-pressed='true'] {
    background: var(--ink);
    border-color: var(--ink);
    color: #fff;
  }

  .pick[aria-pressed='true'] .sw {
    box-shadow: 0 0 0 1.5px #fff;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 3px 11px;
    border-radius: 999px;
    border: 1px solid var(--rule-2);
    background: var(--card);
    color: var(--ink);
    font-size: 0.8rem;
    white-space: nowrap;
    cursor: pointer;
  }

  .chip:hover {
    border-color: var(--ink-2);
  }

  .chip.on {
    border-color: var(--ink);
    box-shadow: inset 0 0 0 1px var(--ink);
  }

  .chip b {
    font-family: var(--mono);
    font-weight: 600;
  }

  .sw {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: none;
  }

  .op {
    font-family: var(--mono);
    color: var(--muted);
  }

  .term {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .eq {
    white-space: nowrap;
  }

  .nsum {
    display: none;
  }

  /* Narrow: the four scene terms stack as a column sum. */
  @container (max-width: 460px) {
    .eqn {
      display: grid;
      justify-items: start;
      gap: 6px;
    }

    .par {
      display: none;
    }

    .term {
      position: relative;
      padding-left: 22px;
    }

    .plus {
      position: absolute;
      left: 4px;
    }

    .eq {
      justify-self: stretch;
      margin-top: 2px;
      padding: 8px 0 0 22px;
      border-top: 1px solid var(--rule-2);
    }

    .nsum {
      display: inline;
    }
  }

  .eq b {
    font-family: var(--mono);
  }

  .cc > .caption {
    margin-top: 18px;
  }

  @media (prefers-reduced-motion: reduce) {
    .bar,
    .nil,
    .conn,
    .dia {
      transition: none;
    }
  }
</style>
