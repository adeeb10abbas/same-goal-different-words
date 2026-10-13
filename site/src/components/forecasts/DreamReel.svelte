<script lang="ts">
  import { onDestroy } from 'svelte';
  import { createClock, autoplay } from '../../lib/clock.svelte';
  import { epFile } from '../../lib/media';
  import { MODELS, FORM_SHORT, FORM_NAME, goalByKey } from '../../lib/study';
  import { loadTimeline, type Timeline } from '../../lib/timeline';
  import { DREAMS, SEL, goalShort, type FcRec } from '../../lib/forecasts';
  import Transport from '../Transport.svelte';
  import PairFrames from './PairFrames.svelte';

  let { recs }: { recs: FcRec[] } = $props();

  const byId = $derived(new Map(recs.map((r) => [r.id, r])));
  const list = $derived(DREAMS.map((id) => byId.get(id)!));
  const models = MODELS.filter((m) => DREAMS.some((id) => id.startsWith(`RWS-${m.id}-`)));

  let id = $state('RWS-E3-S4-C02-R-S');
  const rec = $derived(byId.get(id)!);
  const mine = $derived(list.filter((r) => r.m === rec.m));

  const { clock, state: play, destroy } = createClock(1, 1200);
  onDestroy(destroy);
  let userPaused = $state(false);

  let tl = $state<Timeline | null>(null);
  let failed = $state(false);
  $effect(() => {
    const want = id;
    tl = null;
    failed = false;
    clock.seek(0);
    loadTimeline(want).then(
      (t) => want === id && (tl = t),
      () => want === id && (failed = true),
    );
  });

  const fps = $derived(tl?.fps ?? SEL.hz);
  const n = $derived(tl?.n ?? 1);
  const tick = $derived(Math.min(n - 1, Math.max(0, Math.floor(play.t * fps + 1e-6))));
  /** The prediction shown at a tick: the first covers its whole window; each later one starts one tick after its request. */
  function reqAt(t: Timeline, T: number) {
    const R = t.requests;
    if (T <= R[0][0] + R[0][1]) return 0;
    for (let r = R.length - 1; r > 0; r--) if (T > R[r][0]) return r;
    return 0;
  }
  const cur = $derived(tl ? reqAt(tl, tick) : 0);
  const k = $derived(tl ? tick - tl.requests[cur][0] : 0);

  type LaneKey = 'grip_mover' | 'grip_reference' | 'relation' | 'goal';
  const LANES: { key: LaneKey; label: string; short: string; cls: string }[] = [
    { key: 'grip_mover', label: 'Gripper on target', short: 'On target', cls: 'mover' },
    { key: 'grip_reference', label: 'Gripper on reference', short: 'On reference', cls: 'ref' },
    { key: 'relation', label: 'Relation holds', short: 'Relation', cls: 'rel' },
    { key: 'goal', label: 'Goal met', short: 'Goal met', cls: 'goal' },
  ];

  let box = $state<HTMLDivElement>();
  let dragging = false;
  function seekTick(T: number) {
    clock.pause();
    userPaused = true;
    clock.seek((Math.min(n - 1, Math.max(0, T)) + 0.5) / fps);
  }
  function seekAt(e: PointerEvent) {
    if (!box || !tl) return;
    const r = box.getBoundingClientRect();
    seekTick(Math.floor(((e.clientX - r.left) / r.width) * n));
  }
  function onkeydown(e: KeyboardEvent) {
    if (!tl || e.altKey || e.ctrlKey || e.metaKey) return;
    const R = tl.requests;
    const next = cur + 1 < R.length ? R[cur + 1][0] + 1 : n - 1;
    const prev = cur > 0 ? (cur - 1 === 0 ? 0 : R[cur - 1][0] + 1) : 0;
    const at = { ArrowRight: next, ArrowUp: next, ArrowLeft: prev, ArrowDown: prev, Home: 0, End: n - 1 }[e.key];
    if (at === undefined) return;
    e.preventDefault();
    seekTick(at);
  }
</script>

<div class="fig reel" {@attach autoplay(clock, () => !userPaused, 0.3)}>
  <div class="pick">
    <div class="ctl">
      <span class="lbl">Model</span>
      <div class="seg" role="group" aria-label="Whole-episode forecast model">
        {#each models as m (m.id)}
          <button
            type="button"
            aria-pressed={rec.m === m.id}
            onclick={() => {
              if (rec.m !== m.id) id = list.find((r) => r.m === m.id)!.id;
            }}>{m.short}</button
          >
        {/each}
      </div>
    </div>
    <div class="ctl eps">
      <span class="lbl">Episode</span>
      <div class="chips" role="group" aria-label="Whole-episode forecast">
        {#each mine as r (r.id)}
          <button
            type="button"
            class="chip"
            aria-pressed={id === r.id}
            onclick={() => (id = r.id)}
            title="{goalByKey(r.g).label}, {FORM_NAME[r.f].toLowerCase()} wording, start {r.c}"
            >{goalShort(r.g)} <span class="form-pill {r.f}">{FORM_SHORT[r.f]}</span></button
          >
        {/each}
      </div>
    </div>
  </div>

  <div class="stage">
    {#key id}
      <PairFrames {clock} src={epFile(id, 'dream.mp4')} what="episode forecast" />
    {/key}
  </div>

  <div class="deck">
    <Transport {clock} t={play.t} playing={play.playing} dur={play.dur} onuser={(p) => (userPaused = !p)} />
    <p class="readout num" aria-live="off">
      {#if tl}
        Prediction <b>{cur + 1}</b> of {tl.requests.length} <span class="sep">·</span> frame {k} of {tl.requests[cur][1]}
        {#if cur === rec.pr}<span class="tag">Selected forecast</span>{/if}
      {:else if failed}
        Timeline unavailable
      {:else}
        Loading timeline…
      {/if}
    </p>
  </div>

  <div class="lanes">
    <div class="labs" aria-hidden="true">
      <div class="lab pred"><span class="full">Predictions</span><span class="short">Predictions</span></div>
      {#each LANES as l (l.key)}
        <div class="lab {l.cls}"><span class="full">{l.label}</span><span class="short">{l.short}</span></div>
      {/each}
    </div>
    <div
      class="track"
      bind:this={box}
      role="slider"
      tabindex="0"
      aria-label="Episode time"
      aria-valuemin={0}
      aria-valuemax={Math.round(n / fps)}
      aria-valuenow={Math.round(play.t)}
      aria-valuetext="{play.t.toFixed(1)} of {(n / fps).toFixed(1)} seconds, prediction {cur + 1}"
      onpointerdown={(e) => {
        dragging = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        seekAt(e);
      }}
      onpointermove={(e) => dragging && seekAt(e)}
      onpointerup={() => (dragging = false)}
      onpointercancel={() => (dragging = false)}
      {onkeydown}
    >
      <svg class="row preds" viewBox="0 0 {n} 1" preserveAspectRatio="none" aria-hidden="true">
        {#if tl}
          {#each tl.requests as [pre, len], r (pre)}
            {@const a = r === 0 ? 0 : pre + 1}
            <rect class:alt={r % 2 === 1} class:on={r === cur} class:sel={r === rec.pr} x={a} y="0" width={Math.min(n, pre + len + 1) - a} height="1" />
          {/each}
        {/if}
      </svg>
      {#each LANES as l (l.key)}
        <svg class="row lane {l.cls}" viewBox="0 0 {n} 1" preserveAspectRatio="none" aria-hidden="true">
          <rect class="bg" x="0" y="0" width={n} height="1" />
          {#if tl}
            {#each tl.flags[l.key] as [a, b] (a)}<rect class="on" x={a} y="0" width={b - a + 1} height="1" />{/each}
          {/if}
        </svg>
      {/each}
      <div class="head" style:left="{Math.min(1, (play.t * fps) / n) * 100}%"></div>
    </div>
  </div>

  <div class="key" aria-hidden="true">
    <span><i class="k-pred"></i>One prediction</span>
    <span><i class="k-sel"></i>Selected forecast, the one analysed on this page</span>
    <span><i class="k-on"></i>Prediction now playing</span>
  </div>

  <p class="caption">
    Each model’s generated video beside the executed episode, at the same moment. Every new request re-anchors the prediction on the
    current scene, so the generated half jumps at each boundary on the top strip; within one prediction, frames are paired by index and do
    not establish the pace of generated motion. A black generated frame would mean no decodable future was available for that moment, which
    is missing evidence rather than a zero or a failure; none of these 17 episodes has one. The thin black strip under Nano and Edge
    predictions is padding. Lanes are scored from simulator state. These 17 are the episodes with whole-episode media; none has a detected
    error in its selected chunk.
  </p>
</div>

<style>
  .reel {
    display: grid;
    gap: 18px;
  }

  .pick {
    display: flex;
    flex-wrap: wrap;
    gap: 14px 24px;
    align-items: flex-start;
  }

  .ctl {
    display: grid;
    gap: 7px;
    min-width: 0;
  }

  .ctl .lbl {
    color: var(--stage-muted);
  }

  .eps {
    flex: 1 1 320px;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--stage-rule);
    background: transparent;
    color: var(--stage-muted);
    border-radius: 999px;
    padding: 4px 6px 4px 12px;
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

  .chip .form-pill {
    font-size: 0.64rem;
    padding: 2px 7px;
  }

  /* On short laptop screens, size the pair (1280 × 540) so the video, transport and lanes fit in one view. */
  .stage {
    min-width: 0;
    width: 100%;
    max-width: max(560px, calc((100svh - 300px) * 1280 / 540));
    margin-inline: auto;
  }

  .deck {
    container-type: inline-size;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px 18px;
  }

  .readout {
    margin: 0;
    font-size: 0.82rem;
    color: var(--stage-muted);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
  }

  .readout b {
    color: #fff;
    font-weight: 600;
  }

  .sep {
    opacity: 0.6;
  }

  .tag {
    font-family: var(--mono);
    font-size: 0.66rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 2px 7px;
    border-radius: 5px;
    color: #0d0f13;
    background: #e9ecf1;
    white-space: nowrap;
  }

  .lanes {
    container-type: inline-size;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    column-gap: 12px;
    --row: 17px;
    --lane-h: 9px;
    user-select: none;
  }

  .labs {
    display: grid;
    grid-auto-rows: var(--row);
  }

  .lab {
    line-height: var(--row);
    font-size: 0.68rem;
    color: var(--stage-muted);
    text-align: right;
    white-space: nowrap;
  }

  .lab.mover {
    color: var(--mover-2);
  }

  .lab.ref {
    color: var(--ref-2);
  }

  .lab.goal {
    color: var(--kept-2);
  }

  .short {
    display: none;
  }

  @container (max-width: 420px) {
    .full {
      display: none;
    }

    .short {
      display: inline;
    }
  }

  .track {
    position: relative;
    display: grid;
    grid-auto-rows: var(--row);
    align-items: center;
    cursor: ew-resize;
    touch-action: pan-y;
    border-radius: 3px;
  }

  .track:focus-visible {
    outline: 2px solid var(--tf-2);
    outline-offset: 4px;
  }

  .row {
    display: block;
    width: 100%;
    height: var(--lane-h);
    border-radius: 2px;
    overflow: hidden;
  }

  .preds rect {
    fill: #3a404c;
    stroke: var(--stage-2);
    stroke-width: 0.5;
    vector-effect: non-scaling-stroke;
  }

  .preds rect.alt {
    fill: #2e333d;
  }

  .preds rect.sel {
    fill: #c9ced6;
  }

  .preds rect.on {
    fill: var(--tf-2);
  }

  .bg {
    fill: rgb(127 127 127 / 14%);
  }

  .mover .on {
    fill: var(--mover-2);
  }

  .ref .on {
    fill: var(--ref-2);
  }

  .rel .on {
    fill: #9aa3b2;
  }

  .goal .on {
    fill: var(--kept-2);
  }

  .head {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    margin-left: -1px;
    background: #fff;
    border-radius: 2px;
    box-shadow: 0 0 0 1px rgb(0 0 0 / 35%);
    pointer-events: none;
  }

  .key {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    font-size: 0.76rem;
    color: var(--stage-muted);
  }

  .key span {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }

  .key i {
    width: 16px;
    height: 8px;
    border-radius: 2px;
  }

  .k-pred {
    background: linear-gradient(90deg, #3a404c 50%, #2e333d 50%);
  }

  .k-sel {
    background: #c9ced6;
  }

  .k-on {
    background: var(--tf-2);
  }

  .caption {
    margin: 0;
  }
</style>
