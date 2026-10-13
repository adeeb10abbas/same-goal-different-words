<script lang="ts">
  import { loadTimeline, type Timeline } from '../../lib/timeline';
  import { liveState } from '../../lib/live';
  import { epFile, TOP_ASPECT, type Episode } from '../../lib/media';
  import { FORM_NAME, FORM_SHORT, MODEL_SHORT, OUTCOME_LABEL, goalByKey, outcomeOf } from '../../lib/study';
  import { sceneFps, sec, timeOfTick } from '../../lib/failures';
  import Still from './Still.svelte';
  import Toggle from './Toggle.svelte';

  type Pair = { tf: Episode; rf: Episode; tick: number; when: string };
  let { pairs }: { pairs: Pair[] } = $props();

  type View = 'close' | 'viewport';
  let view = $state<View>('close');
  const VIEWS = [
    { v: 'close' as const, full: 'Close view · rotated 90°', short: 'Close view' },
    { v: 'viewport' as const, full: 'Viewport camera · unrotated', short: 'Viewport' },
  ];
  /** Native frame sizes of the two recordings (px). */
  const ASPECT: Record<View, string> = { close: TOP_ASPECT, viewport: '864 / 480' };

  let ticks = $state(pairs.map((p) => p.tick));
  let tls = $state.raw<Record<string, Timeline>>({});
  $effect(() => {
    for (const p of pairs) for (const e of [p.tf, p.rf]) loadTimeline(e.id).then((x) => (tls = { ...tls, [e.id]: x }));
  });

  const file = $derived(view === 'close' ? 'top.mp4' : 'front.mp4');
  const camName = $derived(view === 'close' ? 'exterior camera, close crop' : 'viewport camera');
  const poster = (e: Episode, tick: number) =>
    view !== 'close' ? '' : tick === 0 ? epFile(e.id, 'first.webp') : tick === e.n - 1 ? epFile(e.id, 'last.webp') : '';
</script>

<div class="cc">
  <div class="bar">
    <Toggle label="Camera" group="Camera view" options={VIEWS} bind:value={view} at={26} />
  </div>
  <p class="note view-note" aria-live="polite">
    {#if view === 'close'}
      <b>Close view.</b> A fixed crop of the exterior camera, rotated 90° for readability, as in the paper’s close views. The camera faces the
      robot, so image left is the robot’s right. The crop is identical across instruction forms, and no image content is retouched.
    {:else}
      <b>Viewport camera.</b> A second recording of the same executed rollouts, from the simulator’s viewport camera at the near edge of the table
      (864&nbsp;×&nbsp;480, unrotated, never mirrored). It also faces the robot, so image left is the robot’s right: image left and right are not
      the robot-frame relation. The paper’s appendix shows the full exterior-camera frame in its native orientation with the same warning; those full
      frames are not among this website’s recordings.
    {/if}
  </p>

  {#each pairs as p, k (p.tf.id)}
    {@const goal = goalByKey(`${p.tf.s}-${p.tf.g}`)}
    {@const fps = sceneFps(p.tf.s)}
    {@const n = p.tf.n}
    {@const tick = ticks[k]}
    {@const t = timeOfTick(tick, fps)}
    <section class="pair" aria-labelledby="cc-pair-{k}">
      <header class="ph">
        <h4 id="cc-pair-{k}">
          <span class="m">{MODEL_SHORT[p.tf.m]}</span>
          <span>{goal.label}</span>
          <span class="c">start state {p.tf.c}</span>
        </h4>
        <span class="when">{p.when}</span>
      </header>
      <div class="cells">
        <figure class="cell init">
          <figcaption><span class="lbl">Initial scene</span><span class="aside">both rollouts start here</span></figcaption>
          <Still
            src={epFile(p.tf.id, file)}
            t={timeOfTick(0, fps)}
            poster={poster(p.tf, 0)}
            aspect={ASPECT[view]}
            label="Initial scene, {camName}"
            chip={sec(0)}
          />
        </figure>
        {#each [{ f: 'S' as const, e: p.tf }, { f: 'I' as const, e: p.rf }] as c (c.f)}
          {@const o = outcomeOf(c.e)}
          {@const live = liveState(tls[c.e.id] ?? null, tick)}
          <figure class="cell {c.f}">
            <figcaption><span class="form-pill {c.f}">{FORM_SHORT[c.f]}</span><span class="fname">{FORM_NAME[c.f]}</span></figcaption>
            <Still
              src={epFile(c.e.id, file)}
              {t}
              poster={poster(c.e, tick)}
              aspect={ASPECT[view]}
              label="{FORM_NAME[c.f]} rollout at {sec(tick / fps)}, {camName}"
              chip={sec(tick / fps)}
            />
            <div class="foot">
              <span class="live {live.cls}"><i></i>{live.text}</span>
              <span class="status {o}">{OUTCOME_LABEL[o]}</span>
            </div>
          </figure>
        {/each}
      </div>
      <div class="scrub">
        <label class="lbl" for="cc-t-{k}">Time</label>
        <input
          id="cc-t-{k}"
          type="range"
          min="0"
          max={n - 1}
          step="1"
          bind:value={ticks[k]}
          aria-valuetext="{sec(tick / fps)} of {sec((n - 1) / fps)}"
        />
        <span class="tv">{sec(tick / fps)}</span>
        <button type="button" class="reset" disabled={tick === p.tick} onclick={() => (ticks[k] = p.tick)}>
          Back to {sec(p.tick / fps)}
        </button>
      </div>
    </section>
  {/each}

  <p class="caption">
    Within each pair, both rollouts begin from the same physical state and are shown at the same elapsed time. These are executed observations,
    not model-generated predictions; the labels under each frame are scored from simulator state at that moment and over the whole episode.
  </p>
</div>

<style>
  .cc {
    container: cc / inline-size;
    margin-top: clamp(24px, 3vw, 36px);
  }

  .bar {
    display: block;
  }

  .view-note {
    margin: 14px 0 0;
    max-width: 52em;
    font-size: 0.86rem;
    line-height: 1.55;
  }

  .view-note b {
    color: var(--stage-ink);
    font-weight: 600;
  }

  .pair {
    margin-top: 26px;
    padding: 16px 16px 14px;
    border-radius: 18px;
    background: color-mix(in srgb, var(--stage-2) 88%, transparent);
    border: 1px solid var(--stage-rule);
  }

  .ph {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 4px 16px;
    margin-bottom: 12px;
  }

  h4 {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 10px;
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    line-height: 1.35;
  }

  h4 .m {
    color: var(--stage-muted);
    font-weight: 500;
  }

  h4 .c {
    font-weight: 400;
    font-size: 0.84rem;
    color: var(--stage-muted);
  }

  .when {
    font-family: var(--mono);
    font-size: 0.72rem;
    letter-spacing: 0.02em;
    color: var(--stage-muted);
  }

  .cells {
    display: grid;
    gap: 14px 12px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .cell.init {
    grid-column: 1 / -1;
  }

  @container cc (min-width: 36em) {
    .cells {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .cell.init {
      grid-column: auto;
    }
  }

  .cell {
    margin: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .cell figcaption {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    min-height: 24px;
    margin-bottom: 8px;
  }

  .cell .lbl {
    color: var(--stage-ink);
  }

  .cell .aside {
    font-size: 0.78rem;
    color: var(--stage-muted);
  }

  .fname {
    font-weight: 600;
    font-size: 0.88rem;
  }

  .foot {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }

  .live {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    font-family: var(--mono);
    font-size: 0.68rem;
    line-height: 1.3;
    color: var(--stage-muted);
    border: 1px solid var(--stage-rule);
    border-radius: 8px;
    padding: 2px 9px 2px 7px;
  }

  .live i {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }

  .live.mover {
    color: var(--mover-2);
  }

  .live.ref {
    color: var(--ref-2);
  }

  .live.lift {
    color: #b9c4ff;
  }

  .live.goal,
  .live.stable {
    color: var(--kept-2);
  }

  .live.other {
    color: var(--lost-2);
  }

  .scrub {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px 12px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--stage-rule);
  }

  .scrub .lbl {
    color: var(--stage-muted);
  }

  .tv {
    font-family: var(--mono);
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
    min-width: 5.2ch;
    text-align: right;
  }

  .reset {
    grid-column: 1 / -1;
    justify-self: start;
    min-height: 30px;
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid var(--stage-rule);
    background: rgb(255 255 255 / 4%);
    color: var(--stage-ink);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .reset:disabled {
    opacity: 0.45;
    cursor: default;
  }

  @container cc (min-width: 36em) {
    .scrub {
      grid-template-columns: auto minmax(0, 1fr) auto auto;
    }

    .reset {
      grid-column: auto;
    }
  }

  input[type='range'] {
    width: 100%;
    height: 28px;
    margin: 0;
    background: transparent;
    accent-color: var(--kept-2);
    cursor: pointer;
  }

  .caption {
    margin-top: 16px;
  }
</style>
