<script lang="ts">
  import { onMount } from 'svelte';
  import { reducedMotion } from '../../lib/sync';
  import { study, MODELS, SCENES, FORM_ORDER, FORM_SHORT, FORM_COLOR, type FormId, type ModelId } from '../../lib/study';
  import {
    N,
    idx,
    isAny,
    isEnd,
    startDiffs,
    CONTRAST_FORMS,
    mulberry32,
    flipDraw,
    bootDraw,
    quantile,
    pts,
    pText,
    int,
    word,
    type ContrastKey,
  } from '../../lib/setup';

  /** `codes`: one outcome code per episode (lib/setup). Mirrors the paper's Appendix B statistics. */
  let { codes }: { codes: string } = $props();
  const uid = $props.id();

  type OutcomeKey = 'anytime' | 'end';
  type Who = 'All' | ModelId;
  type Proc = 'boot' | 'flip';
  type Pub = { est: number; ci: [number, number] };

  const STATS = study.settings.stats;
  const KEYS = Object.keys(CONTRAST_FORMS) as ContrastKey[];
  const WHO: Who[] = ['All', ...MODELS.map((m) => m.id)];
  const WHO_LABEL: Record<string, string> = { All: 'All', ...Object.fromEntries(MODELS.map((m) => [m.id, m.short])) };
  const OUTS: OutcomeKey[] = ['anytime', 'end'];
  const OUT_LABEL: Record<OutcomeKey, string> = { anytime: 'Any time', end: 'At the end' };
  /** Fixed seeds so the illustration is the same on every visit. */
  const SEED = { boot: 0x2b0f, flip: 0x51f1 };
  /** Draws whose resampled starts are kept for display. */
  const DETAIL = 400;

  const mean = (xs: ArrayLike<number>) => {
    let s = 0;
    for (let i = 0; i < xs.length; i++) s += xs[i];
    return s / xs.length;
  };
  const sp = (x: number, d = 1) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(100 * x).toFixed(d)}`;

  // Every published point estimate must equal the mean of the start-level differences rebuilt from the codes.
  const verified = $derived.by(() => {
    for (const k of KEYS)
      for (const o of OUTS)
        for (const w of WHO) {
          const p = study.contrasts[k][o]?.[w] as Pub | undefined;
          if (!p) throw new Error(`stats demo: no published ${k} ${o} ${w}`);
          const d = startDiffs(codes, k, o, w === 'All' ? undefined : w);
          if (d.length !== STATS.starts) throw new Error(`stats demo: ${d.length} starts, expected ${STATS.starts}`);
          const e = mean(d.map((x) => x.d));
          if (Math.abs(e - p.est) > 1e-9) throw new Error(`stats demo: ${k} ${o} ${w} estimate ${e} differs from published ${p.est}`);
        }
    return true;
  });

  let key = $state<ContrastKey>('TF_RF');
  let outcome = $state<OutcomeKey>('anytime');
  let who = $state<Who>('All');
  let proc = $state<Proc>('boot');

  const forms = $derived(CONTRAST_FORMS[key] as readonly [FormId, FormId]);
  const A = $derived(FORM_SHORT[forms[0]]);
  const B = $derived(FORM_SHORT[forms[1]]);
  const pub = $derived(study.contrasts[key][outcome][who] as Pub);
  const tested = $derived(outcome === 'anytime' && who === 'All' && STATS.holmFamily.includes(key));
  const family = STATS.holmFamily.map((k) => k.split('_').join('−'));

  const diffs = $derived.by(() => {
    if (!verified) throw new Error('stats demo: unverified');
    return startDiffs(codes, key, outcome, who === 'All' ? undefined : who);
  });

  // Step 1: the paired outcomes behind the start-level values.
  const tally = $derived.by(() => {
    const hit = outcome === 'anytime' ? isAny : isEnd;
    const fa = FORM_ORDER.indexOf(forms[0]);
    const fb = FORM_ORDER.indexOf(forms[1]);
    const ms = who === 'All' ? MODELS.map((_, i) => i) : [MODELS.findIndex((m) => m.id === who)];
    let a = 0;
    let b = 0;
    let same = 0;
    for (const m of ms)
      for (let g = 0; g < N.goals; g++)
        for (let c = 0; c < N.starts; c++) {
          const x = hit(codes[idx(m, g, fa, c)]);
          const y = hit(codes[idx(m, g, fb, c)]);
          if (x && !y) a++;
          else if (y && !x) b++;
          else same++;
        }
    if (outcome === 'anytime' && who === 'All') {
      const ref = study.contrasts[key].discordant;
      if (a !== ref.aOnly || b !== ref.bOnly) throw new Error(`stats demo: ${key} discordant pairs differ`);
    }
    return { a, b, same, n: a + b + same, models: ms.length };
  });

  // Step 3: seeded resampling, computed once per selection and revealed draw by draw.
  const sim = $derived.by(() => {
    const d = Float64Array.from(diffs, (x) => x.d);
    const groups = SCENES.map((s) => diffs.filter((x) => x.scene === s.id).map((x) => x.d));
    const rb = mulberry32(SEED.boot);
    const boot = new Float64Array(STATS.bootstrapDraws);
    const bootCounts: Int8Array[][] = [];
    for (let i = 0; i < boot.length; i++) {
      if (i < DETAIL) {
        const cs = groups.map((g) => new Int8Array(g.length));
        boot[i] = bootDraw(groups, rb, cs);
        bootCounts.push(cs);
      } else boot[i] = bootDraw(groups, rb);
    }
    let flip: Float64Array | null = null;
    const flipSigns: Int8Array[] = [];
    if (tested) {
      const rf = mulberry32(SEED.flip);
      flip = new Float64Array(STATS.signFlipDraws);
      for (let i = 0; i < flip.length; i++) {
        if (i < DETAIL) {
          const s = new Int8Array(d.length);
          flip[i] = flipDraw(d, rf, s);
          flipSigns.push(s);
        } else flip[i] = flipDraw(d, rf);
      }
    }
    let lo = Math.min(0, pub.est);
    let hi = Math.max(0, pub.est);
    for (const arr of [boot, flip]) if (arr) for (let i = 0; i < arr.length; i++) (lo = Math.min(lo, arr[i])), (hi = Math.max(hi, arr[i]));
    const step = hi - lo > 0.4 ? 0.1 : 0.05;
    lo = Math.floor(lo / step - 0.15) * step;
    hi = Math.ceil(hi / step + 0.15) * step;
    const M = [0.25, 0.5, 0.75, 1].find((m) => d.every((x) => Math.abs(x) <= m + 1e-12)) ?? 1;
    return { d, boot, bootCounts, flip, flipSigns, lo, hi, step, M };
  });

  // ---------------------------------------------------------------- playback
  let nBoot = $state(0);
  let nFlip = $state(0);
  let running = $state(false);
  let reduced = $state(true);
  let raf = 0;
  let lastT = 0;
  let target = 0;
  const total = (p: Proc) => (p === 'boot' ? STATS.bootstrapDraws : STATS.signFlipDraws);
  const getN = () => (proc === 'boot' ? nBoot : nFlip);
  const setN = (v: number) => (proc === 'boot' ? (nBoot = v) : (nFlip = v));
  const n = $derived(proc === 'boot' ? nBoot : nFlip);
  const canRun = $derived(proc === 'boot' || tested);

  function stop() {
    cancelAnimationFrame(raf);
    running = false;
  }
  function frame(t: number) {
    const cur = getN();
    if (cur < 12) {
      if (t - lastT < 150) {
        raf = requestAnimationFrame(frame);
        return;
      }
      lastT = t;
      setN(cur + 1);
    } else setN(Math.min(target, cur + Math.max(1, Math.ceil(cur * 0.075))));
    if (getN() >= target) return stop();
    raf = requestAnimationFrame(frame);
  }
  function runTo(to: number) {
    if (!canRun) return;
    stop();
    target = Math.min(to, total(proc));
    if (getN() >= target) setN(0);
    if (reduced) return setN(target);
    running = true;
    lastT = 0;
    raf = requestAnimationFrame(frame);
  }
  function drawOne() {
    stop();
    if (getN() >= total(proc)) setN(0);
    setN(getN() + 1);
  }
  function skip() {
    stop();
    setN(total(proc));
  }
  function reset() {
    stop();
    setN(0);
  }
  function choose(fn: () => void) {
    stop();
    fn();
    nBoot = nFlip = 0;
    if (!tested && proc === 'flip') return;
    if (reduced) setN(total(proc));
    else runTo(total(proc));
  }
  function setProc(p: Proc) {
    stop();
    proc = p;
    if (!canRun || getN() > 0) return;
    if (reduced) setN(total(p));
    else runTo(total(p));
  }

  let root: HTMLDivElement;
  onMount(() => {
    reduced = reducedMotion();
    if (reduced) {
      nBoot = total('boot');
      nFlip = tested ? total('flip') : 0;
      return;
    }
    let played = false;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !played) {
          played = true;
          runTo(total(proc));
        }
      },
      { threshold: 0.35 },
    );
    io.observe(root);
    return () => {
      io.disconnect();
      stop();
    };
  });

  // ---------------------------------------------------------------- what the charts show
  const detail = $derived(n > 0 && n <= DETAIL ? n - 1 : -1);
  const shown = $derived.by(() => {
    const d = sim.d;
    if (detail < 0) return { v: Array.from(d), k: null as number[] | null, m: null as number | null };
    if (proc === 'flip') {
      const s = sim.flipSigns[detail];
      if (!s) return { v: Array.from(d), k: null, m: null };
      return { v: Array.from(d, (x, i) => x * s[i]), k: null, m: sim.flip![detail] };
    }
    const cs = sim.bootCounts[detail];
    return { v: Array.from(d), k: cs.flatMap((g) => Array.from(g)), m: sim.boot[detail] };
  });

  const arr = $derived(proc === 'boot' ? sim.boot : sim.flip);
  const sortedNow = $derived.by(() => (arr && proc === 'boot' && n > 1 ? Float64Array.from(arr.subarray(0, n)).sort() : null));
  const ciNow = $derived(sortedNow ? ([quantile(sortedNow, 0.025), quantile(sortedNow, 0.975)] as [number, number]) : null);
  const extreme = $derived.by(() => {
    if (!sim.flip || proc !== 'flip') return 0;
    const o = Math.abs(pub.est) - 1e-12;
    let k = 0;
    for (let i = 0; i < nFlip; i++) k += +(Math.abs(sim.flip[i]) >= o);
    return k;
  });
  const pNow = $derived(nFlip ? (extreme + 1) / (nFlip + 1) : null);

  // ---------------------------------------------------------------- geometry (pixels, so text keeps its size)
  let w = $state(640);
  const narrow = $derived(w < 460);
  const SH = $derived(narrow ? 188 : 210);
  const PAD = $derived({ l: narrow ? 34 : 40, r: 8, t: 12, b: 48 });
  const plotW = $derived(Math.max(120, w - PAD.l - PAD.r));
  const gap = $derived(narrow ? 8 : 16);
  const colW = $derived((plotW - gap * (SCENES.length - 1)) / (SCENES.length * N.starts));
  const xs = (i: number) => PAD.l + Math.floor(i / N.starts) * (N.starts * colW + gap) + (i % N.starts) * colW + colW / 2;
  const plotH = $derived(SH - PAD.t - PAD.b);
  const ys = (v: number) => PAD.t + plotH / 2 - (v / sim.M) * (plotH / 2);
  const yTicks = $derived([-sim.M, -sim.M / 2, 0, sim.M / 2, sim.M]);
  const dotR = $derived(Math.max(2.5, Math.min(4.5, colW / 2 - 1)));

  const HH = 170;
  const HP = { t: 26, b: 30 };
  const hx = (v: number) => PAD.l + ((v - sim.lo) / (sim.hi - sim.lo)) * plotW;
  const nBins = $derived(Math.max(24, Math.min(90, Math.floor(plotW / 5))));
  const bins = $derived.by(() => {
    const c = new Uint32Array(nBins);
    if (!arr) return { c, max: 1 };
    const span = sim.hi - sim.lo;
    for (let i = 0; i < n; i++) c[Math.min(nBins - 1, Math.max(0, Math.floor(((arr[i] - sim.lo) / span) * nBins)))]++;
    let max = 1;
    for (const x of c) max = Math.max(max, x);
    return { c, max };
  });
  const binW = $derived(plotW / nBins);
  const hTicks = $derived.by(() => {
    const st = sim.step * (plotW < 300 && (sim.hi - sim.lo) / sim.step > 6 ? 2 : 1);
    const out: number[] = [];
    for (let v = Math.ceil(sim.lo / st - 1e-9) * st; v <= sim.hi + 1e-9; v += st) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  });
  const binMid = (i: number) => sim.lo + ((i + 0.5) / nBins) * (sim.hi - sim.lo);
  const obsX = $derived(hx(pub.est));
  const tagX = $derived(Math.max(PAD.l + 44, Math.min(PAD.l + plotW - 44, obsX)));

  const stripLabel = $derived(
    `Paired ${A} minus ${B} differences for the ${STATS.starts} physical starts, ${OUT_LABEL[outcome].toLowerCase()}, ${
      who === 'All' ? 'all models' : WHO_LABEL[who]
    }. ${diffs.filter((x) => x.d > 0).length} starts favour ${A}, ${diffs.filter((x) => x.d < 0).length} favour ${B}, ${
      diffs.filter((x) => x.d === 0).length
    } are tied. Mean ${sp(pub.est)} points.`,
  );
  const histLabel = $derived(
    proc === 'boot'
      ? `Histogram of ${int(nBoot)} bootstrap means, centred near the observed ${sp(pub.est)} points.${
          ciNow ? ` Middle 95%: ${pts(ciNow[0])} to ${pts(ciNow[1])}.` : ''
        }`
      : `Histogram of ${int(nFlip)} sign-flip means, centred on zero. ${int(extreme)} are at least as far from zero as the observed ${sp(pub.est)} points.`,
  );
</script>

<div class="stats" bind:this={root} style="--a:{FORM_COLOR[forms[0]]};--b:{FORM_COLOR[forms[1]]}">
  <p class="lead">
    Every comparison is paired: two wordings, same model, same start, same goal. Choose a comparison and watch how the paper turns
    {int(N.models * N.goals * N.starts)} pairs into an estimate, an interval and a test.
  </p>

  <div class="controls" role="group" aria-label="Comparison to show">
    <div class="ctl">
      <span class="lbl" id="{uid}-k">Wordings</span>
      <div class="seg" role="group" aria-labelledby="{uid}-k">
        {#each KEYS as k (k)}
          <button type="button" aria-pressed={key === k} onclick={() => choose(() => (key = k))}>
            {FORM_SHORT[CONTRAST_FORMS[k][0] as FormId]} − {FORM_SHORT[CONTRAST_FORMS[k][1] as FormId]}
          </button>
        {/each}
      </div>
    </div>
    <div class="ctl">
      <span class="lbl" id="{uid}-o">Outcome</span>
      <div class="seg" role="group" aria-labelledby="{uid}-o">
        {#each OUTS as o (o)}
          <button type="button" aria-pressed={outcome === o} onclick={() => choose(() => (outcome = o))}>{OUT_LABEL[o]}</button>
        {/each}
      </div>
    </div>
    <div class="ctl">
      <span class="lbl" id="{uid}-m">Model</span>
      <div class="seg" role="group" aria-labelledby="{uid}-m">
        {#each WHO as m (m)}
          <button type="button" aria-pressed={who === m} onclick={() => choose(() => (who = m))}>{WHO_LABEL[m]}</button>
        {/each}
      </div>
    </div>
  </div>

  <div class="card">
    <div class="reported" aria-live="polite">
      <span class="lbl">Reported in the paper</span>
      <span class="r-est"><b class="num">{sp(pub.est)}</b> points</span>
      <span class="r-ci num">95% interval {pts(pub.ci[0])} to {pts(pub.ci[1])}</span>
      <span class="r-p">
        {#if tested}
          Holm-adjusted {pText(study.contrasts[key].pHolm)}
        {:else}
          Descriptive, no test
        {/if}
      </span>
    </div>

    <ol class="steps">
      <li>
        <span class="k">1</span>
        <div>
          <b>Pair.</b> For each {who === 'All' ? 'model, ' : ''}start and goal, subtract the {B} outcome from the {A} outcome: +1 if only
          {A} reached the placement, −1 if only {B} did, 0 if they agree.
          <span class="tally num">
            <span><i class="dot a"></i>{int(tally.a)} pairs +1</span>
            <span><i class="dot b"></i>{int(tally.b)} pairs −1</span>
            <span><i class="dot z"></i>{int(tally.same)} pairs 0</span>
          </span>
        </div>
      </li>
      <li>
        <span class="k">2</span>
        <div>
          <b>Average per start.</b> Average over the goals in the start’s scene{who === 'All' ? ', then over the models' : ''}. That
          leaves one value per physical start, {word(N.starts)} per scene. Their mean weights the {word(SCENES.length)} scenes equally.
        </div>
      </li>
    </ol>

    <figure class="strip" bind:clientWidth={w}>
      <svg width={w} height={SH} role="img" aria-label={stripLabel}>
        {#each yTicks as t (t)}
          <line class="grid" class:zero={t === 0} x1={PAD.l} x2={PAD.l + plotW} y1={ys(t)} y2={ys(t)} />
          <text class="yt" x={PAD.l - 6} y={ys(t)} dy="0.32em" text-anchor="end">{t === 0 ? '0' : sp(t, 0)}</text>
        {/each}
        {#each SCENES as s, si (s.id)}
          <text class="sc" x={xs(si * N.starts) - colW / 2 + (N.starts * colW) / 2} y={SH - 8} text-anchor="middle">{s.short}</text>
        {/each}
        {#each shown.v as v, i (i)}
          {@const k = shown.k ? shown.k[i] : 1}
          {@const flipped = proc === 'flip' && detail >= 0 && Math.sign(v) !== Math.sign(sim.d[i])}
          <g class="st" class:off={k === 0} class:flipped>
            {#if flipped}
              <circle class="ghost" cx={xs(i)} cy={ys(sim.d[i])} r={dotR} />
            {/if}
            <line class="stem" class:pos={v > 0} class:neg={v < 0} x1={xs(i)} x2={xs(i)} y1={ys(0)} y2={ys(v)} />
            <circle class="pt" class:pos={v > 0} class:neg={v < 0} cx={xs(i)} cy={ys(v)} r={dotR} />
            {#if shown.k}
              {#each Array.from({ length: Math.min(k, 4) }) as _, j (j)}
                <rect class="mult" x={xs(i) - 2} y={SH - PAD.b + 6 + j * 5} width="4" height="3.5" />
              {/each}
            {/if}
          </g>
        {/each}
        <line class="meanline" x1={PAD.l} x2={PAD.l + plotW} y1={ys(pub.est)} y2={ys(pub.est)} />
        {#if shown.m !== null}
          <line class="drawline" x1={PAD.l} x2={PAD.l + plotW} y1={ys(shown.m)} y2={ys(shown.m)} />
        {/if}
      </svg>
      <figcaption class="key">
        <span class="hint">Each column is one start; values in points</span>
        <span><i class="ln mean"></i>Observed mean {sp(pub.est)}</span>
        {#if shown.m !== null}
          <span><i class="ln draw"></i>Draw {int(detail + 1)}: {sp(shown.m)}</span>
          {#if proc === 'boot'}<span class="hint">Marks under each column: times that start was drawn (faded: not drawn)</span>{/if}
          {#if proc === 'flip'}<span class="hint">Hollow: original position of a flipped start</span>{/if}
        {/if}
      </figcaption>
    </figure>

    <div class="resample">
      <div class="r-head">
        <span class="k">3</span>
        <div class="seg" role="group" aria-label="Resampling procedure">
          <button type="button" aria-pressed={proc === 'boot'} onclick={() => setProc('boot')}>Interval</button>
          <button type="button" aria-pressed={proc === 'flip'} onclick={() => setProc('flip')}>Test</button>
        </div>
      </div>
      {#if proc === 'boot'}
        <p class="explain">
          <b>Bootstrap the starts.</b> Within each scene, draw {word(N.starts)} of its starts with replacement, keeping every goal,
          model and wording of a start together, and recompute the mean. Repeat {int(STATS.bootstrapDraws)} times; the middle 95% of
          the means is the interval.
        </p>
      {:else if tested}
        <p class="explain">
          <b>Flip signs.</b> If the wording made no difference, each start’s value would be as likely to be negative as positive. Flip
          the signs of the {STATS.starts} start values independently at random and recompute the mean. Repeat
          {int(STATS.signFlipDraws)} times; the two-sided p-value is the share of means at least as far from zero as the observed one.
          The paper then applies a Holm correction across its {word(STATS.holmFamily.length)} tested comparisons ({family.join(' and ')}).
        </p>
      {:else}
        <p class="explain">
          <b>No test for this comparison.</b> The paper tests only the pooled any-time {family.join(' and ')} comparisons, with Holm
          correction. Per-model, end-of-episode and DIR−RF summaries are descriptive: they report the interval only.
          <button type="button" class="linkish" onclick={() => choose(() => ((key = 'TF_RF'), (outcome = 'anytime'), (who = 'All')))}>
            Show the TF−RF test
          </button>
        </p>
      {/if}

      {#if canRun}
        <div class="run">
          <button type="button" class="btn" onclick={drawOne} disabled={running}>Draw one</button>
          <button type="button" class="btn" onclick={() => runTo(1000)}>Run to {int(1000)}</button>
          <button type="button" class="btn" onclick={() => runTo(total(proc))}>Run to {int(total(proc))}</button>
          <button type="button" class="btn" onclick={skip}>Skip to result</button>
          <button type="button" class="btn ghostbtn" onclick={reset} disabled={n === 0}>Reset</button>
        </div>

        <svg class="hist" width={w} height={HH} role="img" aria-label={histLabel}>
          {#if proc === 'boot' && ciNow && nBoot >= 40}
            <rect class="ciband" x={hx(ciNow[0])} y={HP.t} width={Math.max(1, hx(ciNow[1]) - hx(ciNow[0]))} height={HH - HP.t - HP.b} />
          {/if}
          {#each Array.from(bins.c) as c, i (i)}
            {#if c > 0}
              {@const mid = binMid(i)}
              <rect
                class="bar {proc}"
                class:ext={proc === 'flip' && Math.abs(mid) >= Math.abs(pub.est) - (sim.hi - sim.lo) / nBins / 2}
                class:out={proc === 'boot' && ciNow !== null && nBoot >= 40 && (mid < ciNow[0] || mid > ciNow[1])}
                x={PAD.l + i * binW + 0.5}
                y={HH - HP.b - (c / bins.max) * (HH - HP.t - HP.b)}
                width={Math.max(1, binW - 1)}
                height={(c / bins.max) * (HH - HP.t - HP.b)}
              />
            {/if}
          {/each}
          <line class="base" x1={PAD.l} x2={PAD.l + plotW} y1={HH - HP.b} y2={HH - HP.b} />
          {#each hTicks as t (t)}
            <line class="tk" x1={hx(t)} x2={hx(t)} y1={HH - HP.b} y2={HH - HP.b + 4} />
            <text class="yt" x={hx(t)} y={HH - HP.b + 16} text-anchor={hx(t) > PAD.l + plotW - 14 ? 'end' : 'middle'}>{t === 0 ? '0' : sp(t, 0)}</text>
          {/each}
          {#if proc === 'flip'}
            <line class="obs ghostobs" x1={hx(-pub.est)} x2={hx(-pub.est)} y1={HP.t - 4} y2={HH - HP.b} />
          {/if}
          <line class="obs" x1={obsX} x2={obsX} y1={HP.t - 4} y2={HH - HP.b} />
          <text class="tag" x={tagX} y={HP.t - 10} text-anchor="middle">observed {sp(pub.est)}</text>
        </svg>

        <div class="readout num" aria-live={running ? 'off' : 'polite'}>
          <span><span class="lbl">Draws</span> {int(n)} of {int(total(proc))}</span>
          {#if proc === 'boot'}
            <span>
              <span class="lbl">This illustration</span>
              {#if ciNow && nBoot >= 40}95% interval {pts(ciNow[0])} to {pts(ciNow[1])}{:else}—{/if}
            </span>
          {:else}
            <span>
              <span class="lbl">This illustration</span>
              {int(extreme)} of {int(nFlip)} at least as extreme{#if pNow !== null && nFlip >= 1000}, {pNow < 0.001 ? 'p < 0.001' : `p ≈ ${pNow.toFixed(3)}`} before Holm{/if}
            </span>
          {/if}
        </div>
      {/if}
      <p class="note">
        Seeded draws illustrate the procedure, so their interval and p-value can differ slightly from the paper’s. The values reported
        in the paper are shown at the top of this panel. Units are percentage points of the placement rate.
      </p>
    </div>
  </div>
</div>

<style>
  .stats {
    container-type: inline-size;
    margin-top: 14px;
  }

  .lead {
    margin: 0;
    color: var(--ink-2);
    max-width: var(--measure);
  }

  .controls {
    margin-top: 22px;
    gap: 12px 22px;
  }

  .ctl {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .seg button {
    min-height: 30px;
    white-space: nowrap;
    color: var(--ink-2);
  }

  .seg button[aria-pressed='true'] {
    color: var(--ink);
  }

  .seg button:focus-visible,
  .btn:focus-visible,
  .linkish:focus-visible {
    outline: 2px solid var(--tf);
    outline-offset: 2px;
  }

  @container (max-width: 380px) {
    .seg button {
      padding: 5px 9px;
    }
  }

  .card {
    margin-top: 20px;
    background: var(--card);
    border: 1px solid var(--rule);
    border-radius: var(--radius);
    padding: clamp(14px, 2.4vw, 28px);
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 18px;
  }

  .reported {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 16px;
    padding: 10px 14px;
    border-radius: var(--radius-s);
    background: var(--paper-2);
    font-size: 0.9rem;
  }

  .reported .lbl {
    flex-basis: 100%;
  }

  .r-est b {
    font-family: var(--serif);
    font-size: 1.6rem;
    font-weight: 500;
  }

  .steps {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px 28px;
    font-size: 0.92rem;
    color: var(--ink-2);
  }

  @container (min-width: 720px) {
    .steps {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .steps li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 10px;
    align-items: start;
  }

  .k {
    display: inline-grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 1px solid var(--rule-2);
    font-family: var(--mono);
    font-size: 0.74rem;
    color: var(--ink);
    flex: none;
  }

  .tally {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin-top: 8px;
    font-size: 0.84rem;
    color: var(--ink);
  }

  .tally span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  i.dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    display: inline-block;
  }

  i.dot.a {
    background: var(--a);
  }

  i.dot.b {
    background: var(--b);
  }

  i.dot.z {
    background: var(--faint);
  }

  .strip {
    margin: 0;
    min-width: 0;
  }

  svg {
    display: block;
    overflow: visible;
    font-family: var(--sans);
  }

  .grid {
    stroke: var(--rule);
    stroke-width: 1;
  }

  .grid.zero {
    stroke: var(--rule-2);
    stroke-width: 1.5;
  }

  .yt {
    font-family: var(--mono);
    font-size: 10px;
    fill: var(--muted);
  }

  .sc {
    font-size: 11px;
    fill: var(--ink-2);
    font-weight: 500;
  }

  .stem {
    stroke: var(--faint);
    stroke-width: 1.5;
  }

  .stem.pos {
    stroke: var(--a);
  }

  .stem.neg {
    stroke: var(--b);
  }

  .pt {
    fill: var(--card);
    stroke: var(--muted);
    stroke-width: 1.5;
  }

  .pt.pos {
    fill: var(--a);
    stroke: var(--a);
  }

  .pt.neg {
    fill: var(--b);
    stroke: var(--b);
  }

  .ghost {
    fill: none;
    stroke: var(--muted);
    stroke-width: 1;
    stroke-dasharray: 2 2;
  }

  .mult {
    fill: var(--ink-2);
  }

  .st.off {
    opacity: 0.18;
  }

  .meanline {
    stroke: var(--ink);
    stroke-width: 1.5;
    stroke-dasharray: 5 3;
  }

  .drawline {
    stroke: var(--lost);
    stroke-width: 2;
  }

  .key {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    margin-top: 6px;
    font-size: 0.8rem;
    color: var(--ink-2);
  }

  .key span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .key .hint {
    color: var(--muted);
  }

  i.ln {
    display: inline-block;
    width: 18px;
    height: 0;
    border-top: 2px dashed var(--ink);
  }

  i.ln.draw {
    border-top: 2px solid var(--lost);
  }

  .resample {
    border-top: 1px solid var(--rule);
    padding-top: 16px;
    min-width: 0;
  }

  .r-head {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .explain {
    margin: 12px 0 0;
    font-size: 0.92rem;
    color: var(--ink-2);
    max-width: var(--measure);
  }

  .linkish {
    font: inherit;
    color: var(--ink);
    text-decoration: underline;
    background: none;
    border: 0;
    padding: 2px 0;
    min-height: 24px;
    cursor: pointer;
  }

  .run {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 14px 0 6px;
  }

  .run .btn {
    padding: 6px 13px;
    font-size: 0.84rem;
    min-height: 30px;
  }

  .run .btn:disabled {
    opacity: 0.5;
    cursor: default;
    transform: none;
    box-shadow: none;
  }

  .hist {
    margin-top: 8px;
  }

  .bar.boot {
    fill: var(--ink-2);
  }

  .bar.boot.out {
    fill: var(--faint);
  }

  .bar.flip {
    fill: var(--faint);
  }

  .bar.flip.ext {
    fill: var(--bad);
  }

  .ciband {
    fill: color-mix(in srgb, var(--ink) 5%, transparent);
  }

  .base,
  .tk {
    stroke: var(--rule-2);
  }

  .obs {
    stroke: var(--ink);
    stroke-width: 2;
  }

  .ghostobs {
    stroke-dasharray: 3 3;
    stroke-width: 1.2;
  }

  .tag {
    font-family: var(--mono);
    font-size: 10px;
    fill: var(--ink);
  }

  .readout {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 22px;
    font-size: 0.86rem;
    color: var(--ink);
    margin-top: 6px;
  }

  .readout .lbl {
    margin-right: 6px;
  }

  .note {
    margin-top: 14px;
  }

</style>
