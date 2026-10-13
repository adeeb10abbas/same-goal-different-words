<script lang="ts">
  import { onMount } from 'svelte';
  import { MODELS, FORM_NAME, goalByKey, type FormId, type ModelId, type VqaErr } from '../../lib/study';
  import { reducedMotion } from '../../lib/sync';
  import {
    COND_LABEL,
    CONSOLE_START,
    ERR_BY_CODE,
    VQA_PIDS,
    condOf,
    hasImages,
    loadVqa,
    qidOf,
    type ConsoleSeed,
    type GridCodes,
    type VqaPublic,
    type VqaSel as Sel,
  } from '../../lib/vqa';
  import AnswerGrid from './AnswerGrid.svelte';
  import Output from './Output.svelte';
  import Prompt from './Prompt.svelte';

  /** "Ask the backbone": every item of the instruction-understanding test (paper Sec. 4, App. F) with its exact
   *  prompt and the model's decoded answer, opened by a five-step tour. */
  let { codes, seed }: { codes: GridCodes; seed: ConsoleSeed } = $props();

  const NOTE: Record<ModelId, string> = {
    N3: "same weights as Nano's language model",
    E3: "matches Edge's released reasoner",
    F3: "FLUX's frozen text encoder",
  };
  const TOUR: { at: Required<Sel>; title: string; body: string }[] = [
    {
      at: { model: 'F3', images: false, camera: false, pid: 'S4-R-I', slot: 1 },
      title: "FLUX's text encoder reverses a reference-first instruction",
      body: 'Tested on its own with text only, the encoder names the mustard and the raisin box correctly but puts the mustard to the left of the box: the requested relation, reversed.',
    },
    {
      at: { model: 'F3', images: false, camera: false, pid: 'S4-R-S', slot: 1 },
      title: 'Same goal, target-first: correct',
      body: 'Name the mustard first and the answer is right. FLUX reads all ten direct and all ten target-first instructions correctly, but only four of ten reference-first ones, and each of its six errors reverses the relation.',
    },
    {
      at: { model: 'N3', images: false, camera: false, pid: 'S3-R-I', slot: 1 },
      title: "Nano's language model reads all 30 from text",
      body: 'From text alone, Nano answers every instruction correctly, including this reference-first one. Camera descriptions without images change none of its answers.',
    },
    {
      at: { model: 'N3', images: true, camera: true, pid: 'S3-R-I', slot: 3 },
      title: 'Adding the camera images reverses the same sentence',
      body: 'With images and camera descriptions, Nano reverses this butter instruction at five of eight starts and cube-behind at three. Reference-first accuracy falls to 89.9%, 10.1 points below the same prompt without images (95% CI 5.2–14.6); direct and target-first stay at 100%.',
    },
    {
      at: { model: 'E3', images: false, camera: false, pid: 'S1-F-D', slot: 1 },
      title: 'Edge misreads even direct commands',
      body: "Edge's reasoner answers “left of” for “Put the rubiks cube in front of the bowl.” From text it gets 6/10 direct, 8/10 target-first and 4/10 reference-first instructions right, so its difficulty is not restricted to reference-first wording.",
    },
  ];
  const DWELL = 6500;

  let model = $state<ModelId>(CONSOLE_START.model);
  let images = $state(false);
  let camera = $state(false);
  let pid = $state(CONSOLE_START.pid);
  let slot = $state(1);
  let v = $state.raw<VqaPublic | null>(null);
  let failed = $state(false);
  let phase = $state<'encoding' | 'decoding' | 'done'>('done');
  let shown = $state(999);
  let step = $state(-1);
  let tourOn = $state(false);
  let paused = $state(false);
  let visible = false;
  let started = false;
  let run = 0;
  let acc = 0;
  let root: HTMLElement | undefined = $state();

  const cond = $derived(condOf(images, camera));
  const qid = $derived(qidOf(cond, pid, slot));
  const goal = $derived(goalByKey(pid.slice(0, pid.lastIndexOf('-'))));
  const form = $derived(pid.slice(pid.lastIndexOf('-') + 1) as FormId);
  const prompt = $derived(seed.prompts[pid]);
  const rec = $derived.by(() => {
    if (v) {
      const it = v.lanes[model].b2[qid];
      return { tokens: it[0], seq: v.lanes[model].seqs[it[1]] };
    }
    if (model === seed.init.model && qid === seed.init.qid) return { tokens: seed.init.tokens, seq: seed.init.seq };
    return null;
  });
  const err = $derived.by((): VqaErr => {
    const row = codes[model][cond][VQA_PIDS.indexOf(pid)];
    return ERR_BY_CODE[hasImages(cond) ? row[slot - 1] : row];
  });
  const textTokens = $derived(
    v ? v.lanes[model].b2[qidOf(camera ? 'H' : 'T', pid)][0] : !images && rec ? rec.tokens : 0,
  );
  const mname = $derived(MODELS.find((m) => m.id === model)!);

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  async function decode(by: 'user' | 'tour') {
    const id = ++run;
    if (!v || reducedMotion()) {
      phase = 'done';
      shown = 999;
      return;
    }
    const n = v.lanes[model].seqs[v.lanes[model].b2[qid][1]].length;
    phase = 'encoding';
    shown = 0;
    await wait(by === 'tour' ? 420 + (images ? 260 : 0) : 160);
    if (id !== run) return;
    phase = 'decoding';
    for (let i = 1; i <= n; i++) {
      await wait(by === 'tour' ? 68 : 22);
      if (id !== run) return;
      shown = i;
    }
    phase = 'done';
  }

  function select(p: Sel, by: 'user' | 'tour') {
    started = true;
    if (by === 'user') tourOn = false;
    if (p.model) model = p.model;
    if (p.images !== undefined) images = p.images;
    if (p.camera !== undefined) camera = p.camera;
    if (p.pid) pid = p.pid;
    if (p.slot) slot = p.slot;
    decode(by);
  }

  function goStep(i: number) {
    step = i;
    tourOn = true;
    paused = false;
    acc = 0;
    select(TOUR[i].at, 'tour');
  }

  /** Called by the findings and the scoreboard. */
  export function show(p: Sel) {
    select(p, 'user');
    bring();
  }
  export function playTour(i = 0) {
    goStep(i);
    bring();
  }
  function bring() {
    if (!root) return;
    const r = root.getBoundingClientRect();
    if (r.top < 0 || r.top > innerHeight * 0.4)
      root.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  function maybeStart() {
    if (started || !visible || !v || reducedMotion()) return;
    started = true;
    goStep(0);
  }

  onMount(() => {
    loadVqa().then(
      (d) => {
        v = d;
        maybeStart();
      },
      () => (failed = true),
    );
    /* Visible once the console fills half the viewport or a third of itself shows. */
    const io = new IntersectionObserver(
      ([e]) => {
        const vh = e.rootBounds?.height ?? innerHeight;
        visible = e.isIntersecting && (e.intersectionRatio >= 0.35 || e.intersectionRect.height >= 0.5 * vh);
        maybeStart();
      },
      { threshold: Array.from({ length: 21 }, (_, i) => i / 20) },
    );
    io.observe(root!);
    let last = performance.now();
    const h = setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      if (!tourOn || paused || !visible || phase !== 'done') return;
      acc += dt;
      if (acc < DWELL) return;
      if (step < TOUR.length - 1) goStep(step + 1);
      else tourOn = false;
    }, 100);
    return () => {
      io.disconnect();
      clearInterval(h);
    };
  });
</script>

<div class="console dark" bind:this={root}>
  <div class="head">
    <div class="models" role="group" aria-label="Language model">
      {#each MODELS as m (m.id)}
        <button class="model" aria-pressed={model === m.id} onclick={() => select({ model: m.id }, 'user')}>
          <b>{m.name}</b>
          <span class="lm">{m.lm}</span>
          <span class="nt">{NOTE[m.id]}</span>
        </button>
      {/each}
    </div>
    <div class="toggles">
      <div class="tg">
        <span class="lbl">Camera images</span>
        <div class="seg" role="group" aria-label="Camera images">
          <button aria-pressed={!images} onclick={() => select({ images: false }, 'user')}>Off</button>
          <button aria-pressed={images} onclick={() => select({ images: true }, 'user')}>On</button>
        </div>
      </div>
      <div class="tg">
        <span class="lbl">Camera descriptions</span>
        <div class="seg" role="group" aria-label="Camera descriptions">
          <button aria-pressed={!camera} onclick={() => select({ camera: false }, 'user')}>Off</button>
          <button aria-pressed={camera} onclick={() => select({ camera: true }, 'user')}>On</button>
        </div>
      </div>
    </div>
  </div>

  <div class="tour" class:off={!tourOn}>
    <div class="dots" role="group" aria-label="Tour steps">
      {#each TOUR as t, i (i)}
        <button
          class="dot"
          class:cur={tourOn && i === step}
          class:seen={i < step || (!tourOn && i <= step)}
          aria-label="Tour step {i + 1}: {t.title}"
          aria-current={tourOn && i === step ? 'step' : undefined}
          onclick={() => goStep(i)}>{i + 1}</button
        >
      {/each}
    </div>
    <div class="story" aria-hidden="true">
      {#each TOUR as t, i (i)}
        <div class="slide" class:on={tourOn && i === step}>
          <p class="tt">{t.title}</p>
          <p class="tb">{t.body}</p>
        </div>
      {/each}
      <div class="slide" class:on={!tourOn}>
        <p class="tt">{mname.short} · {COND_LABEL[cond]} · {goal.label} · {FORM_NAME[form]}</p>
        <p class="tb">
          Pick any cell for its exact prompt and decoded answer{hasImages(cond) ? ', and any of the eight starts' : ''}.
          {#if model === 'F3' && images}<span class="dag"
              >† FLUX's policy uses this encoder for text only, so image answers test standalone Qwen.</span
            >{/if}
        </p>
      </div>
    </div>
    <p class="sr" aria-live="polite">{tourOn && step >= 0 ? `${TOUR[step].title}. ${TOUR[step].body}` : ''}</p>
    <div class="tctl">
      {#if tourOn}
        <button class="btn" onclick={() => (paused = !paused)} aria-label={paused ? 'Resume tour' : 'Pause tour'}>
          {paused ? '▶' : '❚❚'}
        </button>
        <button class="btn" disabled={step >= TOUR.length - 1} onclick={() => goStep(step + 1)}>Next ›</button>
      {:else}
        <button class="btn" onclick={() => goStep(0)}>▶ {step < 0 ? 'Guided tour' : 'Replay tour'}</button>
      {/if}
    </div>
  </div>

  <div class="body">
    <div class="side">
      <AnswerGrid {codes} {model} {cond} {pid} {slot} onpick={(p) => select(p, 'user')} />
    </div>
    <div class="prompt">
      <Prompt
        segments={seed.templates[camera ? 'IH' : 'I']}
        {prompt}
        {goal}
        {images}
        {slot}
        tokens={rec?.tokens ?? 0}
        {textTokens}
      />
    </div>
    <div class="lower">
      <p class="strip"><span class="form-pill {form}">{FORM_NAME[form]}</span> {prompt.instruction}</p>
      {#if failed}
        <p class="fail">The answers could not be loaded. Reload the page to try again.</p>
      {:else}
        <Output
          seq={rec?.seq ?? null}
          {shown}
          phase={rec ? phase : 'encoding'}
          gold={prompt.gold}
          schema={seed.schemas[prompt.scene]}
          err={rec ? err : null}
          mover={goal.mover}
          tokens={rec?.tokens ?? 0}
        />
      {/if}
    </div>
  </div>
</div>

<style>
  .console {
    display: grid;
    gap: 14px;
    padding: clamp(14px, 2.2vw, 24px);
    border-radius: 20px;
    background: var(--stage);
    color: var(--stage-ink);
    color-scheme: dark;
    box-shadow: 0 40px 90px -50px rgb(13 15 19 / 75%);
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 22px;
    align-items: end;
    justify-content: space-between;
  }

  .models {
    flex: 1 1 540px;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .model {
    min-width: 0;
    display: grid;
    gap: 2px;
    align-content: start;
    text-align: left;
    padding: 9px 12px 10px;
    border: 1px solid var(--stage-rule);
    border-radius: 12px;
    background: var(--stage-2);
    color: var(--stage-ink);
    font: inherit;
    cursor: pointer;
    transition:
      border-color 0.2s,
      background 0.2s,
      box-shadow 0.2s;
  }

  .model:hover {
    border-color: var(--stage-muted);
  }

  .model[aria-pressed='true'] {
    border-color: #fff;
    background: var(--stage-3);
    box-shadow: inset 0 0 0 1px #fff;
  }

  .model b {
    font-size: 0.92rem;
    font-weight: 600;
  }

  .model .lm {
    font-family: var(--mono);
    font-size: 0.68rem;
    color: #c9ced6;
  }

  .model .nt {
    font-size: 0.7rem;
    line-height: 1.35;
    color: var(--stage-muted);
  }

  .toggles {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 16px;
  }

  .tg {
    display: grid;
    gap: 5px;
  }

  .tg .lbl {
    color: var(--stage-muted);
  }

  .tour {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 10px 18px;
    align-items: center;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid rgb(141 156 255 / 32%);
    background: linear-gradient(90deg, rgb(141 156 255 / 14%), rgb(141 156 255 / 3%));
    transition:
      background 0.3s,
      border-color 0.3s;
  }

  .tour.off {
    border-color: var(--stage-rule);
    background: var(--stage-2);
  }

  .dots {
    display: flex;
    gap: 5px;
  }

  .dot {
    flex: none;
    width: 26px;
    height: 26px;
    padding: 0;
    border-radius: 50%;
    border: 1px solid var(--stage-rule);
    background: transparent;
    color: var(--stage-muted);
    font: 600 0.7rem/1 var(--mono);
    cursor: pointer;
    transition:
      background 0.2s,
      color 0.2s,
      border-color 0.2s;
  }

  .dot:hover {
    border-color: var(--stage-muted);
    color: #fff;
  }

  .dot.seen {
    background: rgb(255 255 255 / 10%);
    color: #c9ced6;
  }

  .dot.cur {
    background: var(--tf-2);
    border-color: var(--tf-2);
    color: var(--stage);
  }

  .story {
    min-width: 0;
    display: grid;
  }

  .slide {
    grid-area: 1 / 1;
    align-self: center;
    visibility: hidden;
    opacity: 0;
    transition:
      opacity 0.35s,
      visibility 0.35s;
  }

  .slide.on {
    visibility: visible;
    opacity: 1;
  }

  .tt {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    line-height: 1.35;
    color: #fff;
  }

  .tb {
    margin: 3px 0 0;
    font-size: 0.86rem;
    line-height: 1.5;
    color: #c9ced6;
  }

  .dag {
    display: block;
    margin-top: 3px;
    font-size: 0.78rem;
    color: var(--stage-muted);
  }

  .tctl {
    display: flex;
    gap: 6px;
  }

  .tctl .btn {
    padding: 6px 13px;
    font-size: 0.8rem;
    white-space: nowrap;
    background: transparent;
    color: var(--stage-ink);
    border-color: var(--stage-rule);
  }

  .tctl .btn:hover {
    border-color: var(--stage-muted);
    box-shadow: none;
  }

  .tctl .btn:disabled {
    opacity: 0.4;
    cursor: default;
    transform: none;
  }

  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .body {
    display: grid;
    gap: 16px;
    grid-template-columns: minmax(0, 1fr);
  }

  .side {
    min-width: 0;
  }

  .lower {
    min-width: 0;
    display: grid;
    gap: 12px;
    align-content: start;
  }

  .strip {
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.5;
    color: #fff;
  }

  .strip .form-pill {
    margin-right: 6px;
    vertical-align: 1px;
  }

  .fail {
    margin: 0;
    padding: 14px;
    border: 1px dashed var(--stage-rule);
    border-radius: 12px;
    color: var(--stage-muted);
  }

  @media (max-width: 639px) {
    .side {
      order: 1;
    }

    .lower {
      order: 2;
    }

    .prompt {
      order: 3;
    }
  }

  @media (min-width: 640px) {
    .body {
      grid-template-columns: 284px minmax(0, 1fr);
      grid-template-areas:
        'side lower'
        'prompt prompt';
      align-items: start;
    }

    .side {
      grid-area: side;
    }

    .prompt {
      grid-area: prompt;
      min-width: 0;
    }

    .lower {
      grid-area: lower;
    }
  }

  @media (min-width: 980px) {
    .body {
      grid-template-areas:
        'side prompt'
        'side lower';
    }

    .strip {
      display: none;
    }
  }

  @media (max-width: 759px) {
    .tour {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .story {
      grid-column: 1 / -1;
      grid-row: 2;
    }
  }

  /* Phones: the five step dots keep full-size targets on their own row; the controls drop below the story. */
  @media (max-width: 439px) {
    .tour {
      grid-template-columns: minmax(0, 1fr);
    }

    .tctl {
      grid-row: 3;
      justify-self: end;
    }
  }

  @media (max-width: 559px) {
    .models {
      grid-template-columns: minmax(0, 1fr);
      gap: 6px;
    }

    .model {
      grid-template-columns: auto minmax(0, 1fr);
      column-gap: 10px;
      align-items: baseline;
      padding: 8px 12px;
    }

    .model .nt {
      display: none;
    }
  }
</style>
