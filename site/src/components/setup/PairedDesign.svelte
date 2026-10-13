<script lang="ts">
  import { onMount, tick } from 'svelte';
  import GoalGlyph from '../GoalGlyph.svelte';
  import Instruction from '../Instruction.svelte';
  import type { Episode } from '../../lib/media';
  import { reducedMotion } from '../../lib/sync';
  import {
    study,
    MODELS,
    GOALS,
    SCENES,
    FORM_ORDER,
    FORM_SHORT,
    FORM_NAME,
    OUTCOME_LABEL,
    goalByKey,
    type Outcome,
  } from '../../lib/study';
  import { N, TOTAL, INIT_GOALS, idx, outcomeCode, startImage, goalPhrase, word, Word, int, relShort, relTiny } from '../../lib/setup';

  /** `example` fixes the worked start and goal; `codes` holds one outcome code per episode (see lib/setup). */
  let { codes, example }: { codes: string; example: Episode } = $props();
  const uid = $props.id();

  const goal = $derived(goalByKey(`${example.s}-${example.g}`));
  const g0 = $derived(GOALS.indexOf(goal));
  const c0 = $derived(example.c - 1);
  const sceneName = $derived(goal.scene.short.toLowerCase());

  // Runs on screen after each step: one start, one goal, its wordings, the models, every start, every goal.
  const COUNT = [1, 1, N.forms, N.forms * N.models, N.forms * N.models * N.starts, N.forms * N.models * N.starts * N.goals];
  if (COUNT[5] !== TOTAL || TOTAL !== study.flow.total) throw new Error('paired design: the last step does not hold every episode');
  const LAST = COUNT.length - 1;
  const STEP_NAME = ['One start', 'One goal', `${Word(N.forms)} wordings`, `${Word(N.models)} models`, `${Word(N.starts)} starts`, `${Word(N.goals)} goals`];
  const OUTS: Outcome[] = ['kept', 'lost', 'never'];
  const SHORT: Record<Outcome, string> = { kept: 'Kept', lost: 'Lost', never: 'Never' };

  const tally = $derived.by(() => {
    if (codes.length !== TOTAL) throw new Error(`paired design: ${codes.length} codes for ${TOTAL} episodes`);
    const t: Record<Outcome, number> = { kept: 0, lost: 0, never: 0 };
    for (const ch of codes) t[outcomeCode(ch)]++;
    if (t.kept !== study.flow.end || t.kept + t.lost !== study.flow.anytime) throw new Error('paired design: outcome tallies differ from flow');
    return t;
  });

  const SCENE_OF = GOALS.map((g) => SCENES.indexOf(g.scene));
  const SCENE_ROWS = SCENES.map((s, si) => ({ s, si, g: SCENE_OF.indexOf(si), n: SCENE_OF.filter((x) => x === si).length }));
  const outcomeAt = (m: number, g: number, f: number, c: number) => outcomeCode(codes[idx(m, g, f, c)]);

  // One cell per (model, goal, start) holding its DIR, TF and RF dots. The delays spread the worked goal's row out from
  // the worked start (step 5) and fill the other rows outward from it (step 6).
  const TRIPLES = $derived(
    MODELS.flatMap((_, m) =>
      GOALS.flatMap((_, g) =>
        Array.from({ length: N.starts }, (_, c) => {
          const d4 = 0.3 + 0.07 * Math.abs(c - c0) + 0.05 * m;
          const d5 = 0.055 * Math.abs(g - g0) + 0.012 * c + 0.03 * m;
          return {
            key: `${m}-${g}-${c}`,
            g,
            c,
            o: FORM_ORDER.map((_, f) => outcomeAt(m, g, f, c)),
            style: `--m:${m};--g:${g};--c:${c};--sc:${SCENE_OF[g]};--dx:${c0 - c};--d4:${d4.toFixed(3)}s;--d5:${d5.toFixed(3)}s`,
          };
        }),
      ),
    ),
  );

  // ---------------------------------------------------------------- stepping and playback
  let step = $state(LAST);
  let fwd = $state(false);
  let playing = $state(false);
  let mode = $state<'wording' | 'outcome'>('wording');
  let reduced = $state(true);
  let stage: HTMLDivElement;
  let mxEl: HTMLDivElement;
  let ringEl: HTMLDivElement | undefined = $state();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let visible = false;
  let autoplayed = false;
  const DWELL = [2600, 3400, 3800, 3400, 3600];

  function show(s: number) {
    fwd = s > step;
    step = s;
    if (s < 4) hov = cur = null;
    else if (s === 4) {
      if (hov && hov.g !== g0) hov = null;
      if (cur && cur.g !== g0) cur = { ...cur, g: g0 };
    }
  }
  function stop() {
    playing = false;
    clearTimeout(timer);
  }
  function schedule() {
    clearTimeout(timer);
    if (playing && visible && step < LAST)
      timer = setTimeout(() => {
        show(step + 1);
        if (step >= LAST) stop();
        else schedule();
      }, DWELL[step]);
  }
  function play() {
    autoplayed = true;
    if (step >= LAST) show(0);
    playing = true;
    schedule();
  }
  function pick(s: number) {
    autoplayed = true;
    stop();
    show(s);
  }
  function setMode(m: 'wording' | 'outcome') {
    mode = m;
    // Outcomes need models (step 4 on); from earlier steps, jump to the full matrix.
    if (m === 'outcome' && step < 3) pick(LAST);
  }

  onMount(() => {
    reduced = reducedMotion();
    if (!reduced) step = 0;
    // Plays once, the first time at least half of the stage (or of the screen) is in view; pauses while out of view.
    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting && e.intersectionRect.height >= 0.5 * Math.min(e.boundingClientRect.height, innerHeight);
        if (visible && !autoplayed && !reduced) play();
        else if (visible) schedule();
        else clearTimeout(timer);
      },
      { threshold: Array.from({ length: 21 }, (_, i) => i / 20) },
    );
    io.observe(stage);
    return () => {
      io.disconnect();
      clearTimeout(timer);
    };
  });

  const playLabel = $derived(playing ? 'Pause' : step >= LAST ? 'Replay' : 'Play');

  // ---------------------------------------------------------------- matrix inspection (pointer and keyboard)
  type Cell = { m: number; g: number; c: number; f: number };
  let hov = $state<Cell | null>(null);
  let cur = $state<Cell | null>(null);
  let focused = $state(false);
  const shown = $derived(hov ?? (focused ? cur : null));
  const live = (g: number) => step === LAST || (step === 4 && g === g0);

  function at(e: PointerEvent): Cell | null {
    const el = (e.target as Element).closest<HTMLElement>('.tri');
    if (!el) return null;
    const [m, g, c] = el.dataset.k!.split('-').map(Number);
    if (!live(g)) return null;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    return { m, g, c, f: Math.max(0, Math.min(2, Math.floor(((x - 0.1) / 0.8) * 3))) };
  }

  const KEYS: Record<string, (p: Cell) => Cell> = {
    ArrowRight: (p) => (p.f < 2 ? { ...p, f: p.f + 1 } : p.c < N.starts - 1 ? { ...p, c: p.c + 1, f: 0 } : p),
    ArrowLeft: (p) => (p.f > 0 ? { ...p, f: p.f - 1 } : p.c > 0 ? { ...p, c: p.c - 1, f: 2 } : p),
    ArrowDown: (p) => ({ ...p, g: Math.min(N.goals - 1, p.g + 1) }),
    ArrowUp: (p) => ({ ...p, g: Math.max(0, p.g - 1) }),
    PageDown: (p) => ({ ...p, m: Math.min(N.models - 1, p.m + 1) }),
    PageUp: (p) => ({ ...p, m: Math.max(0, p.m - 1) }),
    Home: (p) => ({ ...p, c: 0, f: 0 }),
    End: (p) => ({ ...p, c: N.starts - 1, f: 2 }),
  };
  function onkey(e: KeyboardEvent) {
    const f = KEYS[e.key];
    if (!f || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const next = f(cur ?? { m: 0, g: g0, c: c0, f: 1 });
    cur = live(next.g) ? next : { ...next, g: g0 };
    hov = null;
    // On a phone the stacked matrix is taller than the screen; keep the keyboard ring in view.
    tick().then(() => ringEl?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }));
  }

  const ringStyle = $derived(shown ? `--m:${shown.m};--g:${shown.g};--c:${shown.c};--sc:${SCENE_OF[shown.g]};--f:${shown.f}` : '');

  const NARR = $derived([
    `Start ${c0 + 1} of ${N.starts} in the ${sceneName} scene. Every run from this start begins in the same saved simulator state. The camera faces the robot, so image left is the robot’s right.`,
    `One goal, in the robot’s frame: ${goalPhrase(goal)}. The drawing shows the same start from above.` +
      (goal.relation.length === 1
        ? ` The wedge marks the directions that count as “${relShort(goal)}”, and the dashed outline is one placement that would count.`
        : ''),
    `${Word(N.forms)} wordings of that goal. All ${word(N.forms)} ask the robot to move the ${goal.moverName}; only the words differ.`,
    `Each wording runs once on each model, with the same seed: ${N.forms}\u00a0×\u00a0${N.models}\u00a0=\u00a0${COUNT[3]}\u00a0episodes from this start.`,
    `The same ${word(COUNT[3])} runs from each of the scene’s ${N.starts}\u00a0starts: ${COUNT[4]}\u00a0episodes. The three dots in a cell share the model, goal and start; only the wording differs.`,
    `All ${N.goals}\u00a0goals in the ${word(N.scenes)} scenes, each from its scene’s ${N.starts}\u00a0starts: ${int(TOTAL)}\u00a0episodes. Point at or tap a dot to see its run, or focus the matrix and use the arrow keys.`,
  ]);
  const longestGoal = GOALS.reduce((a, b) => (b.label.length > a.label.length ? b : a));
  const longestModel = MODELS.reduce((a, b) => (b.name.length > a.name.length ? b : a));
  const longestScene = SCENES.reduce((a, b) => (b.short.length > a.short.length ? b : a));
</script>

<svelte:window
  onpointerdown={(e) => {
    if (hov && !mxEl?.contains(e.target as Node)) hov = null;
  }}
/>

<figure class="fig pd">
  <div class="controls top">
    <button class="btn primary play" onclick={() => (playing ? stop() : play())} aria-label="{playLabel} the walkthrough">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        {#if playing}<path d="M4 2.5h2.6v11H4zM9.4 2.5H12v11H9.4z" fill="currentColor" />
        {:else if step >= LAST}<path d="M8 2.6a5.4 5.4 0 1 1-5.2 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /><path
            d="M1.1 3.3 2.8 7.2l3.6-2.2z"
            fill="currentColor"
          />
        {:else}<path d="M4.5 2.4 13 8l-8.5 5.6z" fill="currentColor" />{/if}
      </svg>
      <span class="stk" aria-hidden="true">
        {#each ['Play', 'Pause', 'Replay'] as l}<span class:show={l === playLabel}>{l}</span>{/each}
      </span>
    </button>
    <div class="seg steps" role="group" aria-label="Step">
      {#each STEP_NAME as s, i}
        <button aria-pressed={step === i} aria-label="Step {i + 1}: {s.toLowerCase()}" title={s} onclick={() => pick(i)}>{i + 1}</button>
      {/each}
    </div>
    <div class="ctl">
      <span class="lbl">Colour</span>
      <div class="seg" role="group" aria-label="Colour dots by">
        <button aria-pressed={mode === 'wording'} onclick={() => setMode('wording')}>Wording</button>
        <button aria-pressed={mode === 'outcome'} onclick={() => setMode('outcome')}>Outcome</button>
      </div>
    </div>
  </div>

  <p class="eq">
    <span class="t" class:hot={step === 0 || step === 4}
      ><span class="stk"><b class:show={step < 4}>1</b><b class:show={step >= 4}>{N.starts}</b></span>&nbsp;<span class="stk w"
        ><span class:show={step < 4}>start</span><span class:show={step >= 4}>starts</span></span
      ></span
    >
    <span class="t" class:off={step < 1} class:hot={step === 1 || step === 5}
      >×&nbsp;<span class="stk"><b class:show={step < 5}>1</b><b class:show={step >= 5}>{N.goals}</b></span>&nbsp;<span class="stk w"
        ><span class:show={step < 5}>goal</span><span class:show={step >= 5}>goals</span></span
      ></span
    >
    <span class="t" class:off={step < 2} class:hot={step === 2}>×&nbsp;<b>{N.forms}</b>&nbsp;wordings</span>
    <span class="t" class:off={step < 3} class:hot={step === 3}>×&nbsp;<b>{N.models}</b>&nbsp;models</span>
    <span class="t tot" class:off={step < 3}
      >=&nbsp;<span class="stk"
        >{#each COUNT.slice(3) as n, i}<b class:show={step === i + 3 || (i === 0 && step < 3)}>{int(n)}</b>{/each}</span
      >&nbsp;episodes</span
    >
  </p>

  <div class="stage" bind:this={stage}>
    <div class="flow" class:on={step < 4} class:fwd aria-hidden={step >= 4}>
      <div class="pa" class:show={step === 0}>
        <div class="ph"><span class="lbl">Start {c0 + 1} of {N.starts}</span></div>
        <img
          src={startImage(goal.scene.id, example.c)}
          alt="Start {c0 + 1} of the {sceneName} scene from the exterior camera: the robot at the top, the {goal.moverName} and the {goal.referenceName} on the table."
          width="536"
          height="390"
          loading="lazy"
          decoding="async"
        />
        <div class="axis" aria-hidden="true"><span>← robot’s right</span><i></i><span>robot’s left →</span></div>
      </div>
      <div class="ar" class:show={step >= 1} aria-hidden="true">
        <svg viewBox="0 0 40 16"><path d="M2 8h33M29 3l6 5-6 5" /></svg>
      </div>
      <div class="pb" class:show={step >= 1}>
        <div class="ph"><span class="lbl">The goal, from above</span></div>
        <GoalGlyph {goal} start={example.c} showGoal={reduced || step >= 1} />
      </div>
      <div class="fan" class:show={step >= 2}>
        {#each FORM_ORDER as f, fi}
          <div class="card {f}" style:--i={fi}>
            <div class="ch">
              <span class="form-pill {f}">{FORM_SHORT[f]}</span>
              <span class="fname">{FORM_NAME[f]}</span>
              <span class="models" class:show={step >= 3} class:oc={mode === 'outcome'}>
                {#each MODELS as m, mi}
                  {@const o = outcomeAt(mi, g0, fi, c0)}
                  <span class="mchip {o}" title="{m.name}, {FORM_SHORT[f]}: {OUTCOME_LABEL[o].toLowerCase()}"><i></i>{m.short}</span>
                {/each}
              </span>
            </div>
            <p class="q">“<Instruction prompt={goal.prompts[f]} {goal} />”</p>
          </div>
        {/each}
      </div>
    </div>

    <div class="mxl" class:on={step >= 4}>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <div
        bind:this={mxEl}
        class="mx {mode}"
        class:pre={step < 4}
        class:s4={step === 4}
        class:s5={step === LAST}
        class:fwd
        style:--nm={N.models}
        style:--ng={N.goals}
        style:--nc={N.starts}
        style:--ns={N.scenes}
        role="application"
        aria-roledescription="dot matrix"
        aria-label="{int(TOTAL)} episodes, one dot each. Arrow keys move between episodes; Page Up and Page Down change the model."
        aria-describedby="{uid}-alt"
        tabindex={step >= 4 ? 0 : -1}
        onkeydown={onkey}
        onfocus={() => {
          focused = true;
          cur ??= { m: 0, g: g0, c: c0, f: 1 };
        }}
        onblur={() => {
          focused = false;
          hov = null;
        }}
        onpointermove={(e) => {
          if (e.pointerType === 'mouse') hov = at(e);
        }}
        onpointerdown={(e) => {
          const h = at(e);
          if (h) cur = h;
          if (e.pointerType !== 'mouse') hov = h;
        }}
        onpointerleave={(e) => {
          if (e.pointerType === 'mouse') hov = null;
        }}
      >
        {#each MODELS as m, mi}
          <div class="mh" style:--m={mi} aria-hidden="true">
            <b class="long">{m.name}</b><b class="short">{m.short}</b>
            <span class="nums">{#each { length: N.starts } as _, c}<span>{c + 1}</span>{/each}</span>
          </div>
          {#each SCENE_ROWS as r}
            <div class="sl" class:m0={mi === 0} style="--m:{mi};--g:{r.g};--sc:{r.si};--n:{r.n}" aria-hidden="true">
              <span>{r.s.short}</span>
            </div>
          {/each}
          {#each GOALS as g, gi}
            <div class="gl" class:m0={mi === 0} class:hi={gi === g0 && step === 4} style="--m:{mi};--g:{gi};--sc:{SCENE_OF[gi]}" aria-hidden="true">
              <span class="long">{relShort(g)}</span><span class="short">{relTiny(g)}</span>{#if g.initiallyTrue}<span class="ck">✓</span>{/if}
            </div>
          {/each}
        {/each}
        {#each TRIPLES as t (t.key)}
          <div class="tri" class:g0={t.g === g0} class:c0={t.c === c0} data-k={t.key} style={t.style}>
            {#each FORM_ORDER as f, fi}<i class="{f} {t.o[fi]}"></i>{/each}
          </div>
        {/each}
        {#each MODELS as _, mi}
          <div class="seed" style="--m:{mi};--g:{g0};--c:{c0};--sc:{SCENE_OF[g0]}" aria-hidden="true"></div>
        {/each}
        {#if shown}<div class="ring" style={ringStyle} aria-hidden="true" bind:this={ringEl}></div>{/if}
      </div>
    </div>
  </div>

  <div class="foot">
    <div class="say" aria-live="polite">
      {#each NARR as n, i}<p class="nar" class:show={!shown && i === step}>{n}</p>{/each}
      {#if shown}
        {@const g = GOALS[shown.g]}
        <div class="insp show">
          <p class="i1">
            <b>{MODELS[shown.m].name}</b> · {g.scene.short} scene, start&nbsp;{shown.c + 1} · {g.label}{#if g.initiallyTrue}&nbsp;<span
                class="ck">✓&nbsp;already&nbsp;true</span
              >{/if}
          </p>
          <p class="i2">
            {#each FORM_ORDER as f, fi}
              {@const o = outcomeAt(shown.m, shown.g, fi, shown.c)}
              <span class="ep" class:cur={fi === shown.f}
                ><span class="form-pill {f}">{FORM_SHORT[f]}</span><span class="status {o}">{OUTCOME_LABEL[o]}</span></span
              >
            {/each}
          </p>
        </div>
      {/if}
      <div class="insp sizer" aria-hidden="true">
        <p class="i1">
          <b>{longestModel.name}</b> · {longestScene.short} scene, start&nbsp;{N.starts} · {longestGoal.label}&nbsp;<span class="ck"
            >✓&nbsp;already&nbsp;true</span
          >
        </p>
        <p class="i2">
          {#each FORM_ORDER as f}<span class="ep"><span class="form-pill {f}">{FORM_SHORT[f]}</span><span class="status lost">{OUTCOME_LABEL.lost}</span></span
            >{' '}{/each}
        </p>
      </div>
    </div>
    <div class="legend" class:off={step < 2} aria-hidden="true">
      <span class="lg" class:show={mode === 'wording'}>
        {#each FORM_ORDER as f}<span class="li"><i class="sw {f}"></i>{FORM_SHORT[f]}</span>{' '}{/each}
        <span class="ln">{int(TOTAL / N.forms)} episodes each</span>
      </span>
      <span class="lg" class:show={mode === 'outcome'}>
        {#each OUTS as o}<span class="li"><i class="sw {o}"></i>{SHORT[o]}&nbsp;<b class="num">{tally[o]}</b></span>{' '}{/each}
      </span>
    </div>
  </div>

  <p id="{uid}-alt" class="sr-only">
    Of {int(TOTAL)} episodes, {tally.kept} were placed and kept, {tally.lost} were placed and then lost, and {tally.never} were never placed.
    {#each MODELS as m, mi}
      {@const k = codes.slice(idx(mi, 0, 0, 0), idx(mi + 1, 0, 0, 0))}
      {m.name}: {[...k].filter((x) => outcomeCode(x) !== 'never').length} of {k.length} placed at some point.
    {/each}
  </p>
  <figcaption class="caption">
    Every dot is one episode. Rows are goals, grouped by scene; columns are the {N.starts} starts. Each cell holds the DIR, TF and RF runs
    of one model, goal and start, so its {word(N.forms)} dots differ only in wording. ✓ marks the {word(INIT_GOALS.length)} goals that
    already hold at the start. <b>Kept</b>: the placement conditions hold throughout the final second. <b>Lost</b>: a stable placement at
    some point, but not at the end. <b>Never</b>: no stable placement.
  </figcaption>
</figure>

<style>
  .pd {
    --line: color-mix(in srgb, var(--faint) 55%, var(--card));
    container: pd / inline-size;
    margin: clamp(24px, 3vw, 36px) 0 0;
  }

  .top {
    gap: 10px 14px;
  }

  .stk {
    display: inline-grid;
  }

  .stk > * {
    grid-area: 1 / 1;
    visibility: hidden;
  }

  .stk > .show {
    visibility: visible;
  }

  .play {
    padding-inline: 14px 18px;
  }

  .play .stk {
    justify-items: start;
  }

  .steps button {
    min-width: 2.1rem;
    padding-inline: 9px;
    font-variant-numeric: tabular-nums;
  }

  .ctl {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }

  /* ------------------------------------------------------------------ equation */
  .eq {
    margin: 18px 0 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 10px;
    font-size: 0.95rem;
    line-height: 1.3;
    color: var(--ink-2);
  }

  .eq .t {
    white-space: nowrap;
    transition: opacity 0.35s var(--ease);
  }

  .eq .t.off {
    opacity: 0;
    visibility: hidden;
  }

  .eq b {
    font-family: var(--serif);
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }

  .eq .stk {
    justify-items: end;
  }

  .eq .hot b {
    box-shadow: inset 0 -0.2em 0 color-mix(in srgb, var(--lost) 32%, transparent);
  }

  .eq .stk.w {
    justify-items: start;
  }

  /* ------------------------------------------------------------------ stage: two layers in one grid cell */
  .stage {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    margin-top: 14px;
  }

  .flow,
  .mxl {
    grid-area: 1 / 1;
    align-self: start;
    min-width: 0;
    opacity: 0;
    visibility: hidden;
    transition:
      opacity 0.45s var(--ease),
      visibility 0s linear 0.45s;
  }

  .flow.on,
  .mxl.on {
    opacity: 1;
    visibility: visible;
    transition: opacity 0.45s var(--ease) 0.1s;
  }

  /* ------------------------------------------------------------------ flow: start, goal, wordings, models */
  .flow {
    --fg: 10px;
    --bw: 22px;
    --sx: 7px;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: clamp(14px, 1.8vw, 22px);
  }

  .pa,
  .pb {
    grid-area: 1 / 1;
    min-width: 0;
    transition:
      opacity 0.45s var(--ease),
      visibility 0s linear 0.45s;
  }

  /* Narrow: the drawing replaces the photo in the same box (same orientation, nearly the same shape). */
  .pa:not(.show),
  .pb:not(.show) {
    opacity: 0;
    visibility: hidden;
  }

  .pa.show,
  .pb.show {
    transition: opacity 0.45s var(--ease);
  }

  .ph {
    margin-bottom: 6px;
    line-height: 1.2;
  }

  .pa img {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 536 / 390;
    object-fit: cover;
    object-position: 50% 100%;
    border-radius: 10px;
    background: var(--paper-2);
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

  .ar {
    display: none;
    align-self: center;
    color: var(--faint);
    transition: opacity 0.4s var(--ease);
  }

  .ar:not(.show) {
    opacity: 0;
  }

  .ar svg {
    display: block;
    width: 100%;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .fan {
    position: relative;
    display: grid;
    grid-auto-rows: 1fr;
    gap: var(--fg);
    padding-left: var(--bw);
    min-width: 0;
  }

  /* A bracket from the first card's middle to the last card's; each card adds a stub. */
  .fan::before {
    content: '';
    position: absolute;
    left: var(--sx);
    top: calc((100% - 2 * var(--fg)) / 6);
    bottom: calc((100% - 2 * var(--fg)) / 6);
    border-left: 1.5px solid var(--line);
    transition: opacity 0.4s var(--ease);
  }

  .fan:not(.show)::before {
    opacity: 0;
  }

  .card {
    position: relative;
    min-width: 0;
    padding: 10px 14px 11px;
    border: 1px solid var(--rule);
    border-left: 3px solid var(--fc);
    border-radius: 12px;
    background: var(--card);
    transition:
      opacity 0.45s var(--ease),
      transform 0.45s var(--ease);
  }

  .card.D {
    --fc: var(--dir);
  }

  .card.S {
    --fc: var(--tf);
  }

  .card.I {
    --fc: var(--rf);
  }

  .card::before {
    content: '';
    position: absolute;
    left: calc(var(--sx) - var(--bw) - 3px);
    width: calc(var(--bw) - var(--sx));
    top: 50%;
    border-top: 1.5px solid var(--line);
  }

  .fan:not(.show) .card {
    opacity: 0;
    transform: translateX(-10px);
    visibility: hidden;
  }

  .flow.fwd .fan.show .card {
    transition-delay: calc(var(--i) * 0.14s);
  }

  .ch {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
  }

  .fname {
    margin-right: auto;
    font-size: 0.84rem;
    font-weight: 600;
    color: var(--ink);
    white-space: nowrap;
  }

  .models {
    display: inline-flex;
    gap: 4px;
    white-space: nowrap;
    transition: opacity 0.4s var(--ease);
  }

  .models:not(.show) {
    opacity: 0;
    visibility: hidden;
  }

  .flow.fwd .models.show {
    transition-delay: calc(var(--i) * 0.12s);
  }

  .mchip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px 2px 5px;
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 500;
    line-height: 1.3;
    color: var(--ink-2);
    background: color-mix(in srgb, var(--ink) 5%, transparent);
  }

  .mchip i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--fc);
    transition: background-color 0.3s;
  }

  .models.oc .kept i {
    background: var(--kept);
  }

  .models.oc .lost i {
    background: var(--lost);
  }

  .models.oc .never i {
    background: var(--never);
    box-shadow: inset 0 0 0 1px var(--rule-2);
  }

  .q {
    margin: 7px 0 0;
    font-family: var(--serif);
    font-size: 0.95rem;
    line-height: 1.45;
    color: var(--ink);
  }

  @container pd (min-width: 480px) {
    .flow {
      grid-template-columns: minmax(0, 1fr) 2rem minmax(0, 1fr);
    }

    .pa,
    .pb {
      grid-area: auto;
    }

    .pa:not(.show) {
      opacity: 1;
      visibility: visible;
    }

    .ar {
      display: block;
    }

    .fan {
      grid-column: 1 / -1;
    }
  }

  /* Wide: start → goal → wordings in one row, the wordings fanned out by the bracket. */
  @container pd (min-width: 900px) {
    .flow {
      grid-template-columns: minmax(0, 1fr) 2.2rem minmax(0, 1fr) minmax(0, 1.45fr);
      align-items: center;
    }

    .fan {
      --bw: 2.6rem;
      --sx: calc(var(--bw) * 0.42);
      grid-column: auto;
    }

    .fan::after {
      content: '';
      position: absolute;
      left: 0;
      width: var(--sx);
      top: 50%;
      border-top: 1.5px solid var(--line);
      transition: opacity 0.4s var(--ease);
    }

    .fan:not(.show)::after {
      opacity: 0;
    }
  }

  /* ------------------------------------------------------------------ matrix */
  .mxl {
    container: mx / inline-size;
  }

  .mx {
    --G: 14px;
    --bg: 14px;
    --sg: 6px;
    --lab: 4.3rem;
    --hdr: 1.5rem;
    --tw: min(2.4rem, calc((100cqw - var(--lab)) / var(--nc)));
    --rp: clamp(0.85rem, calc(var(--tw) * 0.55), 1.1rem);
    --bh: calc(var(--hdr) + var(--ng) * var(--rp) + (var(--ns) - 1) * var(--sg));
    --bx: 0px;
    --by: calc(var(--bh) + var(--bg));
    --pad: calc(var(--tw) * 0.1);
    --slot: calc(var(--tw) * 0.8 / 3);
    --d: min(calc(var(--slot) * 0.86), calc(var(--rp) * 0.62));
    position: relative;
    height: calc(var(--bh) + (var(--nm) - 1) * var(--by));
    outline: none;
    user-select: none;
    /* Stacked on a phone, the matrix is taller than the screen. Focus then aligns its top with
       the 60px header instead of the 72px scroll padding, so the extra 12px show matrix rather than page. */
    scroll-margin-top: -12px;
    -webkit-tap-highlight-color: transparent;
  }

  .mx:focus-visible {
    border-radius: 8px;
    box-shadow:
      0 0 0 4px var(--card),
      0 0 0 6px var(--tf);
  }

  @container mx (min-width: 480px) {
    .mx {
      --hdr: 2.5rem;
      --tw: calc((100cqw - var(--lab) - (var(--nm) - 1) * var(--G)) / (var(--nm) * var(--nc)));
      --rp: clamp(0.95rem, calc(var(--tw) * 0.5), 1.3rem);
      --bx: calc(var(--nc) * var(--tw) + var(--G));
      --by: 0px;
      scroll-margin-top: 0;
    }
  }

  @container mx (min-width: 760px) {
    .mx {
      --lab: 10.4rem;
      --G: 18px;
    }
  }

  .tri,
  .seed,
  .ring {
    position: absolute;
    left: calc(var(--lab) + var(--m) * var(--bx) + var(--c) * var(--tw));
    top: calc(var(--m) * var(--by) + var(--hdr) + var(--g) * var(--rp) + var(--sc) * var(--sg));
    width: var(--tw);
    height: var(--rp);
  }

  .tri {
    display: grid;
    grid-template-columns: repeat(3, var(--slot));
    padding-inline: var(--pad);
    align-items: center;
    justify-items: center;
    transition:
      opacity 0.5s var(--ease),
      transform 0.6s var(--ease);
  }

  .tri i {
    width: var(--d);
    height: var(--d);
    border-radius: 50%;
    background: var(--dot, var(--rule-2));
    transition:
      background-color 0.45s var(--ease),
      box-shadow 0.45s var(--ease);
  }

  .wording i.D {
    --dot: var(--dir);
  }

  .wording i.S {
    --dot: var(--tf);
  }

  .wording i.I {
    --dot: var(--rf);
  }

  .outcome i.kept {
    --dot: var(--kept);
  }

  .outcome i.lost {
    --dot: var(--lost);
  }

  .outcome i.never {
    --dot: var(--never);
  }

  /* Until the worked goal has every start, its other starts wait stacked on the worked start. */
  .pre .tri.g0:not(.c0) {
    opacity: 0;
    transform: translateX(calc(var(--dx) * var(--tw)));
  }

  /* Rows that are not assembled yet are outlines. */
  .mx:not(.s5) .tri:not(.g0) i {
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--rule-2);
  }

  .fwd.s4 .tri.g0,
  .fwd.s4 .tri.g0 i {
    transition-delay: var(--d4);
  }

  .fwd.s5 .tri:not(.g0) i {
    transition-delay: var(--d5);
  }

  .seed {
    margin: -3px 0 0 -3px;
    width: calc(var(--tw) + 6px);
    height: calc(var(--rp) + 6px);
    border: 1.5px solid var(--ink);
    border-radius: 7px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.4s var(--ease);
  }

  .s4 .seed {
    opacity: 1;
  }

  .s5 .seed {
    opacity: 0.4;
  }

  .ring {
    left: calc(var(--lab) + var(--m) * var(--bx) + var(--c) * var(--tw) + var(--pad) + var(--f) * var(--slot));
    width: var(--slot);
    display: grid;
    place-items: center;
    pointer-events: none;
  }

  .ring::before {
    content: '';
    flex: none;
    width: calc(var(--d) + 7px);
    height: calc(var(--d) + 7px);
    border-radius: 50%;
    box-shadow: 0 0 0 2px var(--ink);
  }

  /* Labels. Stacked (narrow): each model block has its own labels. Side by side: one label column for all three. */
  .mh,
  .sl,
  .gl {
    position: absolute;
    line-height: 1.2;
  }

  .mh {
    left: calc(var(--m) * var(--bx));
    top: calc(var(--m) * var(--by));
    width: calc(var(--lab) + var(--nc) * var(--tw));
    height: var(--hdr);
    display: grid;
    grid-template-columns: var(--lab) 1fr;
    align-items: end;
    padding-bottom: 4px;
    font-size: 0.74rem;
  }

  .mh b {
    font-weight: 600;
    color: var(--ink);
    white-space: nowrap;
  }

  .mh .long {
    display: none;
  }

  .nums {
    display: grid;
    grid-template-columns: repeat(var(--nc), 1fr);
    text-align: center;
    font-family: var(--mono);
    font-size: 0.64rem;
    color: var(--muted);
  }

  .sl {
    left: 0;
    top: calc(var(--m) * var(--by) + var(--hdr) + var(--g) * var(--rp) + var(--sc) * var(--sg) - var(--sg) / 2);
    width: 1.15rem;
    height: calc(var(--n) * var(--rp) + var(--sg));
    display: grid;
    place-items: center;
    font-size: 0.64rem;
    font-weight: 600;
    color: var(--ink-2);
  }

  .sl::after {
    content: '';
    position: absolute;
    right: 0;
    top: calc(var(--sg) / 2 + 1px);
    bottom: calc(var(--sg) / 2 + 1px);
    border-right: 1px solid var(--rule-2);
  }

  .sl span {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    white-space: nowrap;
    line-height: 1;
  }

  .gl {
    left: 1.45rem;
    top: calc(var(--m) * var(--by) + var(--hdr) + var(--g) * var(--rp) + var(--sc) * var(--sg));
    width: calc(var(--lab) - 1.45rem);
    height: var(--rp);
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 0.66rem;
    color: var(--muted);
    white-space: nowrap;
    transition: color 0.3s;
  }

  .gl .long {
    display: none;
  }

  .gl.hi {
    color: var(--ink);
    font-weight: 600;
  }

  .ck {
    color: var(--kept);
    font-weight: 600;
  }

  @container mx (min-width: 480px) {
    .mh {
      left: calc(var(--lab) + var(--m) * var(--bx));
      width: calc(var(--nc) * var(--tw));
      grid-template-columns: minmax(0, 1fr);
      align-content: end;
      row-gap: 3px;
      text-align: center;
    }

    .mh .long {
      display: block;
    }

    .mh .short {
      display: none;
    }

    .sl:not(.m0),
    .gl:not(.m0) {
      display: none;
    }
  }

  @container mx (min-width: 760px) {
    .sl {
      width: 4.2rem;
      display: block;
      font-size: 0.74rem;
    }

    .sl::after {
      display: none;
    }

    .sl span {
      display: block;
      margin-top: calc(var(--sg) / 2);
      line-height: var(--rp);
      writing-mode: horizontal-tb;
      transform: none;
    }

    .gl {
      left: 4.4rem;
      width: calc(var(--lab) - 4.4rem);
      font-size: 0.74rem;
    }

    .gl .long {
      display: inline;
    }

    .gl .short {
      display: none;
    }
  }

  /* ------------------------------------------------------------------ foot: narration or inspector, legend */
  .foot {
    margin-top: 16px;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px 28px;
    align-items: start;
  }

  .say {
    display: grid;
    min-width: 0;
  }

  .say > * {
    grid-area: 1 / 1;
    margin: 0;
    visibility: hidden;
  }

  .say > .show {
    visibility: visible;
  }

  .nar {
    font-size: 0.92rem;
    line-height: 1.5;
    color: var(--ink-2);
  }

  .insp p {
    margin: 0;
  }

  .i1 {
    font-size: 0.86rem;
    line-height: 1.45;
    color: var(--ink-2);
  }

  .i1 b {
    color: var(--ink);
  }

  .insp .i2 {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 10px;
    margin-top: 7px;
  }

  .ep {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px;
    border-radius: 999px;
    white-space: nowrap;
  }

  .ep.cur {
    box-shadow: 0 0 0 1.5px var(--ink);
  }

  .legend {
    display: grid;
    font-size: 0.8rem;
    color: var(--ink-2);
  }

  .legend.off {
    visibility: hidden;
  }

  .lg {
    grid-area: 1 / 1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 14px;
    visibility: hidden;
  }

  .legend:not(.off) .lg.show {
    visibility: visible;
  }

  .li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  .ln {
    color: var(--muted);
    white-space: nowrap;
  }

  .sw {
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }

  .sw.D {
    background: var(--dir);
  }

  .sw.S {
    background: var(--tf);
  }

  .sw.I {
    background: var(--rf);
  }

  .sw.kept {
    background: var(--kept);
  }

  .sw.lost {
    background: var(--lost);
  }

  .sw.never {
    background: var(--never);
  }

  @container pd (min-width: 760px) {
    .foot {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .legend {
      justify-items: end;
    }

    .lg {
      justify-content: flex-end;
    }
  }

  .pd figcaption {
    margin-top: 16px;
  }

  @media (prefers-reduced-motion: reduce) {
    .pd :global(*),
    .pd :global(*::before),
    .pd :global(*::after) {
      transition: none !important;
    }
  }
</style>
