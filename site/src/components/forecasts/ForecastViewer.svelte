<script lang="ts">
  import { onDestroy } from 'svelte';
  import { createClock, autoplay } from '../../lib/clock.svelte';
  import { epFile } from '../../lib/media';
  import { MODELS, SCENES, goalByKey, FORM_ORDER, FORM_SHORT, FORM_NAME, OUTCOME_LABEL } from '../../lib/study';
  import { SEL, STARTS, nameOf, recIndex, secs, type FcRec } from '../../lib/forecasts';
  import Instruction from '../Instruction.svelte';
  import Transport from '../Transport.svelte';
  import PairFrames from './PairFrames.svelte';

  let { recs }: { recs: FcRec[] } = $props();
  const uid = $props.id();

  const N = SEL.actions;
  const FPS = SEL.hz;
  const firstById = (p: (r: FcRec) => boolean) => [...recs].sort((a, b) => (a.id < b.id ? -1 : 1)).find(p)!;
  // Fixed rule: the cube-behind episode from start 1 with direct wording for each model (an earlier draft of the
  // appendix showed Edge's and FLUX's), then the first wrong-object and contradictory-release windows by identifier.
  const examples = $derived([
    { label: 'Edge · cube behind', i: recIndex('E3', 'S1-B', 'D', 1) },
    { label: 'FLUX · cube behind', i: recIndex('F3', 'S1-B', 'D', 1) },
    { label: 'Nano · cube behind', i: recIndex('N3', 'S1-B', 'D', 1) },
    { label: 'Wrong-object detection', i: firstById((r) => r.ev === 'wrong').i },
    { label: 'Contradictory release', i: firstById((r) => r.ev === 'release').i },
  ]);
  const events = $derived(recs.filter((r) => r.ev));
  const starts = Array.from({ length: STARTS }, (_, i) => i + 1);

  let idx = $state(recIndex('E3', 'S1-B', 'D', 1));
  let view = $state<'side' | 'wipe' | 'blend'>('side');
  let wipe = $state(50);
  const rec = $derived(recs[idx]);
  const goal = $derived(goalByKey(rec.g));
  const model = $derived(MODELS.find((m) => m.id === rec.m)!);
  const pre = $derived(rec.pr * N);
  const evPos = $derived(events.findIndex((r) => r.i === idx));

  function pick(p: Partial<Pick<FcRec, 'm' | 'g' | 'f' | 'c'>>) {
    const r = { m: rec.m, g: rec.g, f: rec.f, c: rec.c, ...p };
    idx = recIndex(r.m, r.g, r.f, r.c);
  }
  function stepEvent(d: 1 | -1) {
    const list = d > 0 ? events : [...events].reverse();
    idx = (list.find((r) => (d > 0 ? r.i > idx : r.i < idx)) ?? list[0]).i;
  }
  const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;

  const { clock, state: play, destroy } = createClock(0.5, 1200);
  onDestroy(destroy);
  let userPaused = $state(false);
  // Each selection starts at the request frame.
  $effect(() => {
    void rec.id;
    clock.seek(0);
  });
  const frame = $derived(Math.min(N, Math.max(0, Math.floor(play.t * FPS + 1e-6))));
  function scrub(k: number) {
    clock.pause();
    userPaused = true;
    clock.seek((k + 0.5) / FPS);
  }

  const VIEWS = [
    ['side', 'Side by side'],
    ['wipe', 'Wipe'],
    ['blend', 'Overlay'],
  ] as const;
  const EVENT = {
    wrong: 'Wrong-object manipulation detected in this chunk',
    release: 'Contradictory release detected in this chunk',
    '': 'No detected error in this chunk',
  } as const;
</script>

<div class="fig viewer" {@attach autoplay(clock, () => !userPaused, 0.3)}>
  <div class="top">
    <div class="ctl">
      <span class="lbl">Examples</span>
      <div class="chips" role="group" aria-label="Forecast example">
        {#each examples as ex (ex.label)}
          <button type="button" class="chip" aria-pressed={idx === ex.i} onclick={() => (idx = ex.i)}>{ex.label}</button>
        {/each}
      </div>
    </div>
    <div class="ctl evnav">
      <span class="lbl">Detected errors</span>
      <div class="evrow">
        <button type="button" class="arrow" onclick={() => stepEvent(-1)} aria-label="Previous forecast with a detected error">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>
        </button>
        <span class="evpos num">{evPos >= 0 ? `${evPos + 1} of ${events.length}` : `– of ${events.length}`}</span>
        <button type="button" class="arrow" onclick={() => stepEvent(1)} aria-label="Next forecast with a detected error">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" /></svg>
        </button>
      </div>
    </div>
  </div>

  <div class="pick">
    <div class="ctl">
      <span class="lbl">Model</span>
      <div class="seg" role="group" aria-label="Forecast model">
        {#each MODELS as m (m.id)}
          <button type="button" aria-pressed={rec.m === m.id} onclick={() => pick({ m: m.id })}>{m.short}</button>
        {/each}
      </div>
    </div>
    <div class="ctl">
      <label class="lbl" for="{uid}-goal">Goal</label>
      <select id="{uid}-goal" value={rec.g} onchange={(e) => pick({ g: e.currentTarget.value })}>
        {#each SCENES as s (s.id)}
          <optgroup label={s.title}>
            {#each s.goals as g (g.key)}<option value={g.key}>{g.label}</option>{/each}
          </optgroup>
        {/each}
      </select>
    </div>
    <div class="ctl">
      <span class="lbl">Wording</span>
      <div class="seg" role="group" aria-label="Forecast wording">
        {#each FORM_ORDER as f (f)}
          <button type="button" aria-pressed={rec.f === f} onclick={() => pick({ f })} title={FORM_NAME[f]}
            ><i class="dot {f}" aria-hidden="true"></i>{FORM_SHORT[f]}</button
          >
        {/each}
      </div>
    </div>
    <div class="ctl">
      <span class="lbl">Start</span>
      <div class="seg starts" role="group" aria-label="Forecast start">
        {#each starts as c (c)}
          <button type="button" aria-pressed={rec.c === c} onclick={() => pick({ c })} aria-label="Start {c}">{c}</button>
        {/each}
      </div>
    </div>
    <div class="ctl">
      <span class="lbl">View</span>
      <div class="seg" role="group" aria-label="Comparison view">
        {#each VIEWS as [v, name] (v)}
          <button type="button" aria-pressed={view === v} onclick={() => (view = v)}>{name}</button>
        {/each}
      </div>
    </div>
  </div>

  <div class="body">
    <div class="screen">
      {#key rec.id}
        <PairFrames {clock} src={epFile(rec.id, 'forecast.mp4')} mode={view} bind:wipe what="forecast" />
      {/key}
      <div class="deck">
        <Transport {clock} t={play.t} playing={play.playing} dur={play.dur} onuser={(p) => (userPaused = !p)} />
        <div class="scrub">
          <span class="lbl" aria-hidden="true">Frame</span>
          <input
            type="range"
            min="0"
            max={N}
            step="1"
            value={frame}
            oninput={(e) => scrub(+e.currentTarget.value)}
            aria-label="Forecast frame"
            aria-valuetext="Frame {frame} of {N}"
          />
          <span class="fr mono num" aria-hidden="true">{frame}/{N}</span>
        </div>
      </div>
    </div>

    <aside class="meta" aria-live="polite">
      <div class="who">
        <span class="mname">{model.name}</span>
        <span class="form-pill {rec.f}">{FORM_SHORT[rec.f]}</span>
        <span class="start">start {rec.c} of {STARTS}</span>
      </div>
      <p class="instr">“<Instruction prompt={goal.prompts[rec.f]} {goal} />”</p>
      <p class="fine">The annotators never saw the instruction.</p>

      <dl class="facts">
        <dt>Window</dt>
        <dd>
          {ord(rec.pr + 1)} prediction, <span class="nw">{secs(pre / FPS)}–{secs((pre + N) / FPS)}&nbsp;s</span>
        </dd>
        <dt>Chosen as</dt>
        <dd>
          {#if rec.fallback}
            First prediction (fallback: the gripper never came within {SEL.gripperCm}&nbsp;cm of a movable task object)
          {:else}
            First prediction with the gripper within {SEL.gripperCm}&nbsp;cm of a movable task object
          {/if}
        </dd>
      </dl>

      <h4>VLM labels <span>final, after resolving disagreements</span></h4>
      <dl class="labels">
        <div><dt>Moving object</dt><dd><span class="val role-{rec.role}">{nameOf('role', rec.role)}</span></dd></div>
        <div><dt>Motion direction</dt><dd><span class="val">{nameOf('dir', rec.dir)}</span></dd></div>
        <div><dt>Final relation</dt><dd><span class="val rel-{rec.rel}">{nameOf('rel', rec.rel)}</span></dd></div>
        <div><dt>Possible release</dt><dd><span class="val yn-{rec.release}">{nameOf('yn', rec.release)}</span></dd></div>
        <div><dt>Hallucinated object</dt><dd><span class="val yn-{rec.hall}">{nameOf('yn', rec.hall)}</span></dd></div>
      </dl>

      <h4>Scored afterwards from simulator state</h4>
      <p class="ev ev-{rec.ev || 'none'}"><i aria-hidden="true"></i>{EVENT[rec.ev]}</p>
      <p class="outcome">Episode outcome <span class="status {rec.out}">{OUTCOME_LABEL[rec.out]}</span></p>
    </aside>

    <p class="caption">
      The generated prediction is the video the model produced with its chunk of up to {N} actions; the executed view is what the same three
      cameras recorded while those actions ran, wrist camera above two exterior cameras. Frames are paired by index from the request at frame
      0; nominal frame times do
      not establish the pace of the generated motion. Nano and Edge decode a few rows short of this layout, so their predictions end in a
      thin black strip. The annotators saw eight generated frames and a numbered episode-start image, never the executed half. Examples
      follow a fixed rule: the cube-behind episode from start 1 with direct wording for each model, and the first wrong-object and
      contradictory-release chunks by episode identifier.
    </p>
  </div>
</div>

<style>
  .viewer {
    container-type: inline-size;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 20px;
  }

  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 14px 28px;
  }

  .ctl {
    display: grid;
    gap: 7px;
    align-content: start;
    min-width: 0;
  }

  .ctl .lbl {
    color: var(--stage-muted);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chip {
    border: 1px solid var(--stage-rule);
    background: transparent;
    color: var(--stage-muted);
    border-radius: 999px;
    padding: 5px 12px;
    font-size: 0.8rem;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    transition: background 0.2s, color 0.2s, border-color 0.2s;
  }

  .chip:hover {
    color: #fff;
    border-color: var(--stage-muted);
  }

  .chip[aria-pressed='true'] {
    background: var(--stage-3);
    border-color: #59606d;
    color: #fff;
  }

  .evrow {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .arrow {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 1px solid var(--stage-rule);
    background: transparent;
    color: var(--stage-ink);
    display: grid;
    place-items: center;
    cursor: pointer;
  }

  .arrow:hover {
    border-color: var(--stage-muted);
  }

  .arrow svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .evpos {
    min-width: 5.6em;
    text-align: center;
    font-family: var(--mono);
    font-size: 0.8rem;
    color: var(--stage-ink);
  }

  .pick {
    display: flex;
    flex-wrap: wrap;
    gap: 14px 22px;
    padding-top: 18px;
    border-top: 1px solid var(--stage-rule);
  }

  select {
    font: inherit;
    font-size: 0.86rem;
    color: var(--stage-ink);
    background: var(--stage-3);
    border: 1px solid #3a404c;
    border-radius: 10px;
    padding: 6px 10px;
    height: 34px;
    width: 100%;
    max-width: 22em;
    min-width: 0;
    cursor: pointer;
  }

  .seg {
    flex: none;
  }

  .seg button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  .starts button {
    min-width: 26px;
    padding-inline: 0;
    justify-content: center;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .dot.D {
    background: var(--dir-2);
  }

  .dot.S {
    background: var(--tf-2);
  }

  .dot.I {
    background: var(--rf-2);
  }

  .body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 290px;
    grid-template-rows: auto 1fr;
    grid-template-areas:
      'screen meta'
      'cap meta';
    gap: 20px 26px;
    align-items: start;
  }

  .screen {
    grid-area: screen;
    display: grid;
    gap: 12px;
    min-width: 0;
  }

  .deck {
    container-type: inline-size;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px 18px;
  }

  .scrub {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1 1 200px;
    max-width: 360px;
    min-width: 0;
  }

  .scrub .lbl {
    color: var(--stage-muted);
  }

  .scrub input {
    flex: 1;
    min-width: 0;
    accent-color: var(--tf-2);
    height: 24px;
  }

  .fr {
    font-size: 0.8rem;
    min-width: 3.4em;
    text-align: right;
  }

  .meta {
    grid-area: meta;
    display: grid;
    gap: 10px;
    align-content: start;
    font-size: 0.86rem;
    line-height: 1.45;
    background: var(--stage);
    border: 1px solid var(--stage-rule);
    border-radius: 12px;
    padding: 16px;
  }

  .who {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
  }

  .mname {
    font-weight: 600;
    color: #fff;
  }

  .start {
    font-family: var(--mono);
    font-size: 0.74rem;
    color: var(--stage-muted);
  }

  .instr {
    margin: 0;
    font-family: var(--serif);
    font-size: 1.06rem;
    line-height: 1.4;
    color: var(--stage-ink);
  }

  .fine {
    margin: -4px 0 0;
    font-size: 0.76rem;
    color: var(--stage-muted);
  }

  h4 {
    margin: 6px 0 0;
    font-family: var(--mono);
    font-size: 0.68rem;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--stage-muted);
    border-top: 1px solid var(--stage-rule);
    padding-top: 12px;
  }

  h4 span {
    display: block;
    margin-top: 2px;
    letter-spacing: 0.02em;
    text-transform: none;
    font-family: var(--sans);
    font-size: 0.74rem;
  }

  dl {
    margin: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 6px 12px;
    align-items: baseline;
  }

  dt {
    color: var(--stage-muted);
  }

  dd {
    margin: 0;
    color: var(--stage-ink);
  }

  .facts dd {
    font-size: 0.82rem;
  }

  /* Each value sits beside its name, drops below it when the row is too narrow, and wraps only if wider than the panel. */
  .labels {
    grid-template-columns: minmax(0, 1fr);
  }

  .labels div {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 3px 12px;
  }

  .labels dd {
    margin-left: auto;
    min-width: 0;
    text-align: right;
  }

  .val {
    display: inline-block;
    padding: 1px 8px;
    border-radius: 6px;
    background: rgb(255 255 255 / 7%);
    color: var(--stage-ink);
    font-weight: 500;
  }

  .val.role-mover {
    background: color-mix(in srgb, var(--mover) 34%, transparent);
    color: #8fe1f0;
  }

  .val.role-reference {
    background: color-mix(in srgb, var(--ref) 32%, transparent);
    color: #ffc39b;
  }

  .val.yn-yes {
    background: color-mix(in srgb, var(--lost-2) 18%, transparent);
    color: var(--lost-2);
  }

  .ev {
    margin: 0;
    display: flex;
    gap: 9px;
    align-items: baseline;
    color: var(--stage-ink);
  }

  .ev i {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    background: var(--never-2);
    transform: translateY(1px);
  }

  .ev-wrong i {
    background: var(--wrong);
  }

  .ev-release i {
    background: var(--release);
  }

  .outcome {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    color: var(--stage-muted);
  }

  .caption {
    grid-area: cap;
    margin: 0;
  }

  @container (max-width: 280px) {
    .seg button {
      padding-inline: 9px;
    }
  }

  @media (max-width: 960px) {
    .body {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: none;
      grid-template-areas:
        'screen'
        'meta'
        'cap';
    }
  }
</style>
