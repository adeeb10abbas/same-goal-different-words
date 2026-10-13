<script lang="ts">
  import { onVisible, reducedMotion } from '../../lib/sync';
  import { MODELS, MODEL_SHORT, GOALS, FORM_ORDER } from '../../lib/study';
  import { FC, SEL, N_ALL, STARTS, VOCAB, type FcRec } from '../../lib/forecasts';

  let { recs }: { recs: FcRec[] } = $props();

  const [qwen, glm] = FC.reported.annotators;
  const fields = FC.agreement.map((a) => a[0]);
  const hidden = ['Instruction', 'Requested goal', 'Policy', 'Wording', 'Rollout', 'Outcome'];
  /** Long model names may break only after their hyphens. */
  const parts = (s: string) => s.split('-').map((p, i, a) => (i < a.length - 1 ? `${p}-` : p));
  const perModel = N_ALL / MODELS.length;
  const DOT_COLS = 48;
  const short = (s: string) => s.split('-').slice(0, 2).join('-');
  const rel = VOCAB.rel.map(([code]) => ({ code, k: FC.labels.fc_visible_final_relation[code] ?? 0 }));
  if (rel.reduce((a, r) => a + r.k, 0) !== N_ALL) throw new Error('Pipeline: relation classes do not cover every forecast');
  const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const cap = (n: number) => WORDS[n] ?? String(n);
  const fallbacks = recs.filter((r) => r.fallback);
  if (fallbacks.length !== SEL.fallbacks) throw new Error('Pipeline: fallback count differs from the reported selection');
  const fbModels = [...new Set(fallbacks.map((r) => MODEL_SHORT[r.m]))].join(' and ');

  let on = $state(true);
  function reveal(node: HTMLElement) {
    if (reducedMotion()) return;
    let first = true;
    return onVisible(
      node,
      (v) => {
        if (first) {
          first = false;
          if (!v) on = false;
          return;
        }
        if (v) on = true;
      },
      0.15,
    );
  }
</script>

<ol class="fig pipe" class:on {@attach reveal}>
  <li class="step" style:--i={0}>
    <span class="dot" aria-hidden="true">1</span>
    <div class="txt">
      <h4><span class="num">{N_ALL}</span> rollouts</h4>
      <p>
        {MODELS.length} models × {GOALS.length} goals × {FORM_ORDER.length} wordings × {STARTS} starts. Each request returned a chunk of up
        to {SEL.actions} actions at <span class="nw">{SEL.hz}&nbsp;Hz</span> together with a generated video of the future.
      </p>
    </div>
    <div class="vis dots" aria-hidden="true">
      {#each MODELS as m (m.id)}
        <div class="mblock">
          <span class="mlab">{m.short}</span>
          <svg viewBox="0 0 {DOT_COLS} {perModel / DOT_COLS}">
            {#each Array(perModel) as _, i (i)}<circle cx={(i % DOT_COLS) + 0.5} cy={Math.floor(i / DOT_COLS) + 0.5} r="0.32" />{/each}
          </svg>
        </div>
      {/each}
    </div>
  </li>

  <li class="step" style:--i={1}>
    <span class="dot" aria-hidden="true">2</span>
    <div class="txt">
      <h4>One forecast per rollout</h4>
      <p>
        Chosen without viewing the forecast or the outcome: the first prediction made while the gripper was within
        <span class="nw">{SEL.gripperCm}&nbsp;cm</span> of a movable task object. {cap(SEL.fallbacks)} {fbModels} episodes never met that condition
        and use their first prediction. Only frames assigned to actions the policy then performed, before its next prediction, are kept.
      </p>
    </div>
    <div class="vis reqs" aria-hidden="true">
      {#each Array(7) as _, i (i)}<i class:sel={i === 2}></i>{/each}
      <span class="near">gripper ≤&nbsp;{SEL.gripperCm}&nbsp;cm</span>
    </div>
  </li>

  <li class="step" style:--i={2}>
    <span class="dot" aria-hidden="true">3</span>
    <div class="txt">
      <h4>What the annotators saw</h4>
      <p>
        {cap(SEL.frames)} forecast frames in a common three-camera layout, and an episode-start image with numbered objects and direction arrows.
        Ambiguous observations could be labelled unknown.
      </p>
      <ul class="hidden" aria-label="Hidden from the annotators">
        {#each hidden as h (h)}<li>{h}</li>{/each}
      </ul>
    </div>
    <div class="vis frames" aria-hidden="true">
      <span class="start"><b>1</b><b>2</b></span>
      {#each Array(SEL.frames) as _, i (i)}<i style:--k={i}></i>{/each}
    </div>
  </li>

  <li class="step" style:--i={3}>
    <span class="dot" aria-hidden="true">4</span>
    <div class="txt">
      <h4>Two vision–language models, independently</h4>
      <div class="vlms">
        <span class="vlm mono">{#each parts(qwen) as p (p)}{p}<wbr />{/each}</span>
        <span class="vlm mono">{#each parts(glm) as p (p)}{p}<wbr />{/each}</span>
      </div>
      <p>They replaced the planned human video annotation before anyone inspected their answers.</p>
    </div>
    <div class="vis fork" aria-hidden="true">
      <span class="in">{#each Array(4) as _, i (i)}<i></i>{/each}</span>
      <svg viewBox="0 0 40 60" preserveAspectRatio="none">
        <path d="M0 30 C 22 30, 18 13, 40 13" />
        <path d="M0 30 C 22 30, 18 47, 40 47" />
      </svg>
      <span class="who"><b>{short(qwen)}</b><b>{short(glm)}</b></span>
    </div>
  </li>

  <li class="step" style:--i={4}>
    <span class="dot" aria-hidden="true">5</span>
    <div class="txt span">
      <h4>{fields.length} fields each</h4>
      <ul class="tags" aria-label="Labelled fields">
        {#each fields as f (f)}<li>{f}</li>{/each}
      </ul>
      <p class="fine">The comparison object is not necessarily the instruction’s reference.</p>
    </div>
  </li>

  <li class="step" style:--i={5}>
    <span class="dot" aria-hidden="true">6</span>
    <div class="txt">
      <h4>Disagreements resolved by one of the two</h4>
      <p>
        Qwen chose between the two answers and an unknown option, in random order. Because Qwen also supplied one of the original answers,
        this step is not independent validation.
      </p>
    </div>
    <div class="vis pick" aria-hidden="true">
      <span class="opts"><b>{short(glm)}</b><b class="unk">Unknown</b><b>{short(qwen)}</b></span>
      <span class="by">random order · {short(qwen)} decides</span>
    </div>
  </li>

  <li class="step" style:--i={6}>
    <span class="dot" aria-hidden="true">7</span>
    <div class="txt">
      <h4>Classified against the task</h4>
      <p>
        A requested or alternative relation counted only when the labels named the intended target as moving and matched that goal’s
        comparison object and relation.
      </p>
      <ul class="tags cls" aria-label="Task-relative classes">
        {#each VOCAB.rel as [code, name] (code)}<li class={code}>{name}</li>{/each}
      </ul>
    </div>
    <div class="vis share" aria-hidden="true">
      <span class="bar">{#each rel as r (r.code)}<i class={r.code} style:width="{(100 * r.k) / N_ALL}%"></i>{/each}</span>
      <span class="by">share of {N_ALL} forecasts</span>
    </div>
  </li>
</ol>

<style>
  .pipe {
    container-type: inline-size;
    list-style: none;
    margin-block-end: 0;
    display: grid;
    gap: 0;
    position: relative;
    --dot: 30px;
    --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  }

  .step {
    position: relative;
    display: grid;
    grid-template-columns: var(--dot) minmax(0, 1fr) minmax(0, 240px);
    column-gap: 20px;
    padding-bottom: 26px;
    transition:
      opacity 0.7s var(--ease-out) calc(var(--i) * 140ms),
      transform 0.7s var(--ease-out) calc(var(--i) * 140ms);
  }

  .step:last-child {
    padding-bottom: 0;
  }

  /* The rail joining one step to the next. */
  .step::before {
    content: '';
    position: absolute;
    left: calc(var(--dot) / 2 - 1px);
    top: calc(var(--dot) + 4px);
    bottom: 4px;
    width: 2px;
    border-radius: 2px;
    background: linear-gradient(var(--stage-muted), var(--stage-rule));
    transform-origin: top;
    transition: transform 0.6s var(--ease-out) calc(var(--i) * 140ms + 300ms);
  }

  .step:last-child::before {
    display: none;
  }

  .pipe:not(.on) .step {
    opacity: 0;
    transform: translateY(14px);
  }

  .pipe:not(.on) .step::before {
    transform: scaleY(0);
  }

  .dot {
    width: var(--dot);
    height: var(--dot);
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-family: var(--mono);
    font-size: 0.78rem;
    font-weight: 600;
    color: #0d0f13;
    background: #e9ecf1;
  }

  .txt {
    min-width: 0;
    grid-column: 2;
  }

  .txt.span {
    grid-column: 2 / -1;
  }

  h4 {
    margin: 4px 0 6px;
    font-family: var(--sans);
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: 0;
    color: #fff;
  }

  .txt p {
    margin: 0;
    font-size: 0.88rem;
    line-height: 1.55;
    color: #c9ced6;
    max-width: 38em;
  }

  .txt p + p,
  .txt ul + p,
  .txt .vlms + p {
    margin-top: 8px;
  }

  .txt .fine {
    font-size: 0.78rem;
    color: var(--stage-muted);
  }

  .vis {
    grid-column: 3;
    grid-row: 1;
    align-self: center;
    min-width: 0;
  }

  /* 1: three blocks of 288 rollouts. */
  .dots {
    display: grid;
    gap: 6px;
  }

  .mblock {
    display: grid;
    grid-template-columns: 36px 1fr;
    align-items: center;
    gap: 8px;
  }

  .mlab {
    font-family: var(--mono);
    font-size: 0.66rem;
    color: var(--stage-muted);
  }

  .mblock svg {
    display: block;
    width: 100%;
    height: auto;
  }

  .mblock circle {
    fill: #8a919d;
  }

  /* 2: a row of predictions with the selected one lit. */
  .reqs {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 3px;
    align-items: end;
  }

  .reqs i {
    height: 14px;
    border-radius: 2px;
    background: #2e333d;
  }

  .reqs i.sel {
    background: #e9ecf1;
  }

  .near {
    grid-column: 1 / -1;
    margin-top: 6px;
    font-family: var(--mono);
    font-size: 0.66rem;
    color: var(--stage-muted);
    padding-left: calc(200% / 7);
    white-space: nowrap;
  }

  /* 3: numbered start image, then eight forecast frames. */
  .frames {
    display: grid;
    grid-template-columns: 1.5fr repeat(4, 1fr);
    grid-auto-rows: 22px;
    gap: 4px;
  }

  .frames .start {
    grid-row: span 2;
    border-radius: 4px;
    background: #2a3039;
    box-shadow: inset 0 0 0 1px #4a515d;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .frames .start b {
    width: 17px;
    height: 17px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-family: var(--mono);
    font-size: 0.65rem;
    color: #0d0f13;
    background: #c9ced6;
  }

  .frames i {
    border-radius: 3px;
    background: linear-gradient(#1d2a6b, #2b3a8a);
    box-shadow: inset 0 0 0 1px rgb(141 156 255 / 40%);
  }

  /* 4: the same inputs go to two annotators. */
  .fork {
    display: grid;
    grid-template-columns: 52px 40px minmax(0, 1fr);
    align-items: center;
    height: 64px;
  }

  .fork .in {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 3px;
  }

  .fork .in i {
    height: 13px;
    border-radius: 2px;
    background: linear-gradient(#1d2a6b, #2b3a8a);
    box-shadow: inset 0 0 0 1px rgb(141 156 255 / 40%);
  }

  .fork svg {
    width: 40px;
    height: 64px;
  }

  .fork path {
    fill: none;
    stroke: #6b7280;
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
  }

  .fork .who {
    display: grid;
    gap: 10px;
  }

  .fork .who b,
  .pick .opts b {
    font-family: var(--mono);
    font-size: 0.7rem;
    font-weight: 500;
    white-space: nowrap;
    color: #fff;
    padding: 4px 8px;
    border-radius: 6px;
    background: var(--stage-3);
    border: 1px solid #3a404c;
    justify-self: start;
  }

  /* 6: the adjudication options. */
  .pick {
    display: grid;
    gap: 8px;
  }

  .pick .opts {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .pick .opts b.unk {
    color: var(--stage-muted);
    border-style: dashed;
  }

  .by {
    font-family: var(--mono);
    font-size: 0.66rem;
    color: var(--stage-muted);
  }

  /* 7: how the 864 final labels fell into the four classes. */
  .share {
    display: grid;
    gap: 8px;
  }

  .share .bar {
    display: flex;
    height: 16px;
    border-radius: 4px;
    overflow: hidden;
    background: #353a44;
  }

  .share .bar i + i {
    box-shadow: inset 2px 0 0 var(--stage-2);
  }

  .share .goal {
    background: var(--mover-2);
  }

  .share .alternative_goal {
    background: #e5cf9a;
  }

  .share .not_goal {
    background: #6b7280;
  }

  .share .unknown {
    background: #353a44 repeating-linear-gradient(135deg, rgb(255 255 255 / 9%) 0 2px, transparent 2px 6px);
  }

  .hidden {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .hidden li {
    font-size: 0.74rem;
    color: var(--stage-muted);
    text-decoration: line-through;
    text-decoration-color: rgb(255 107 107 / 70%);
    padding: 2px 8px;
    border-radius: 6px;
    border: 1px dashed #3a404c;
    white-space: nowrap;
  }

  .vlms {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 4px 0 2px;
  }

  .vlm {
    font-size: 0.76rem;
    color: #fff;
    padding: 5px 10px;
    border-radius: 8px;
    background: var(--stage-3);
    border: 1px solid #3a404c;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .tags {
    list-style: none;
    margin: 4px 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .tags li {
    font-size: 0.78rem;
    color: var(--stage-ink);
    padding: 3px 9px;
    border-radius: 6px;
    background: rgb(255 255 255 / 6%);
    border: 1px solid rgb(255 255 255 / 8%);
    white-space: nowrap;
  }

  .cls {
    margin-top: 10px;
  }

  .cls li.goal {
    color: #8fe1f0;
    border-color: color-mix(in srgb, var(--mover-2) 50%, transparent);
  }

  .cls li.alternative_goal {
    color: #e5cf9a;
    border-color: rgb(229 207 154 / 45%);
  }

  @container (max-width: 640px) {
    .step {
      grid-template-columns: var(--dot) minmax(0, 1fr);
    }

    .vis {
      grid-column: 2;
      grid-row: auto;
      max-width: 260px;
      margin-top: 12px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .step,
    .step::before {
      transition: none;
    }
  }
</style>
