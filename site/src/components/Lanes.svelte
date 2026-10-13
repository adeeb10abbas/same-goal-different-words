<script lang="ts">
  import type { Timeline, Runs } from '../lib/timeline';

  let {
    tl,
    t = 0,
    duration = 0,
    onseek,
    compact = false,
    labels = true,
    stableAt = null,
  }: {
    tl: Timeline | null;
    t?: number;
    duration?: number;
    onseek?: (t: number) => void;
    compact?: boolean;
    labels?: boolean;
    stableAt?: number | null;
  } = $props();

  type Lane = { key: string; label: string; short: string; cls: string; runs: (tl: Timeline) => Runs };
  const ALL: Lane[] = [
    { key: 'grip_mover', label: 'Gripper on target', short: 'On target', cls: 'mover', runs: (x) => x.flags.grip_mover },
    { key: 'grip_reference', label: 'Gripper on reference', short: 'On reference', cls: 'ref', runs: (x) => x.flags.grip_reference },
    { key: 'lift', label: 'Target lifted', short: 'Lifted', cls: 'lift', runs: (x) => x.flags.lift },
    { key: 'relation', label: 'Relation holds', short: 'Relation holds', cls: 'rel', runs: (x) => x.flags.relation },
    { key: 'goal', label: 'Goal met (released, supported)', short: 'Goal met', cls: 'goal', runs: (x) => x.flags.goal },
  ];
  const lanes = $derived(compact ? ALL.filter((l) => l.key !== 'lift') : ALL);
  const n = $derived(tl?.n ?? 1);
  const dur = $derived(duration || (tl ? tl.n / tl.fps : 1));
  const head = $derived(Math.min(1, Math.max(0, t / dur)));

  let box: HTMLDivElement;
  let dragging = false;
  function seekAt(e: PointerEvent) {
    if (!onseek) return;
    const r = box.getBoundingClientRect();
    onseek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * dur);
  }

  const STEP: Record<string, (t: number, dur: number) => number> = {
    ArrowRight: (t) => t + 1,
    ArrowUp: (t) => t + 1,
    ArrowLeft: (t) => t - 1,
    ArrowDown: (t) => t - 1,
    PageUp: (t, d) => t + d / 10,
    PageDown: (t, d) => t - d / 10,
    Home: () => 0,
    End: (_, d) => d,
  };
  function onkeydown(e: KeyboardEvent) {
    const f = STEP[e.key];
    if (!onseek || !f || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    onseek(Math.min(dur, Math.max(0, f(t, dur))));
  }
</script>

<div class="lanes" class:compact class:nolabels={!labels}>
  {#if labels}
    <div class="labels" aria-hidden="true">
      {#each lanes as l}<div class="lab {l.cls}"><span class="full">{l.label}</span><span class="short">{l.short}</span></div>{/each}
    </div>
  {/if}
  <div
    class="track"
    bind:this={box}
    role="slider"
    tabindex="0"
    aria-label="Episode time"
    aria-valuemin={0}
    aria-valuemax={Math.round(dur)}
    aria-valuenow={Math.round(t)}
    aria-valuetext="{t.toFixed(1)} of {dur.toFixed(1)} seconds"
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
    {#each lanes as l}
      <svg class="lane {l.cls}" viewBox="0 0 {n} 1" preserveAspectRatio="none" aria-hidden="true">
        <rect class="bg" x="0" y="0" width={n} height="1" />
        {#if tl}
          {#each l.runs(tl) as [a, b]}<rect class="on" x={a} y="0" width={b - a + 1} height="1" />{/each}
        {/if}
      </svg>
    {/each}
    {#if tl && !compact}
      <div class="reqs" aria-hidden="true">
        {#each tl.requests as [pre]}<i style="left:{(pre / n) * 100}%"></i>{/each}
      </div>
    {/if}
    {#if stableAt != null}
      <div class="mark" data-qa-overlay style="left:{(stableAt / dur) * 100}%" title="Stable placement completed at {stableAt.toFixed(1)} s">
        <svg viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="7" /><path d="M4 7.3 6.1 9.4 10 5.2" /></svg>
      </div>
    {/if}
    <div class="head" style="left:{head * 100}%"></div>
  </div>
</div>

<style>
  .lanes {
    container-type: inline-size;
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 12px;
    font-size: 0.72rem;
    /* Labels and bars share one row pitch so a label can never spill into its neighbour. */
    --row: 16px;
    --lane-h: 9px;
    user-select: none;
  }

  .lanes.nolabels {
    grid-template-columns: 1fr;
  }

  .compact {
    --row: 14px;
    --lane-h: 6px;
  }

  .labels {
    display: grid;
    grid-auto-rows: var(--row);
  }

  .lab {
    line-height: var(--row);
    color: var(--stage-muted, var(--muted));
    white-space: nowrap;
    text-align: right;
    font-size: 0.68rem;
  }

  .short {
    display: none;
  }

  /* Short labels when narrow, so the scrubbable track keeps most of the width. */
  @container (max-width: 380px) {
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
    touch-action: none;
  }

  .lane {
    display: block;
    width: 100%;
    height: var(--lane-h);
    border-radius: 2px;
    overflow: hidden;
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

  .lift .on {
    fill: color-mix(in srgb, var(--mover-2) 55%, #fff);
  }

  .rel .on {
    fill: #9aa3b2;
  }

  .goal .on {
    fill: var(--kept-2);
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

  .reqs {
    position: absolute;
    left: 0;
    right: 0;
    top: -3px;
    height: 4px;
  }

  .reqs i {
    position: absolute;
    top: 0;
    width: 1px;
    height: 4px;
    background: rgb(160 166 178 / 60%);
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

  /* Milestone on the goal lane (the last row) where stable placement completed. */
  .mark {
    position: absolute;
    bottom: calc((var(--row) - 14px) / 2);
    transform: translateX(-50%);
    pointer-events: auto;
  }

  .mark svg {
    display: block;
    width: 14px;
    height: 14px;
  }

  .mark circle {
    fill: var(--kept-2);
  }

  .mark path {
    fill: none;
    stroke: #0b2416;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  :global(.light-lanes) .head {
    background: var(--ink);
    box-shadow: none;
  }

  :global(.light-lanes) .goal .on {
    fill: var(--kept);
  }

  :global(.light-lanes) .mover .on {
    fill: var(--mover);
  }

  :global(.light-lanes) .ref .on {
    fill: var(--ref);
  }

  :global(.light-lanes) .lab.mover {
    color: var(--mover-ink);
  }

  :global(.light-lanes) .lab.ref {
    color: var(--ref-ink);
  }

  :global(.light-lanes) .lab.goal {
    color: var(--kept);
  }
</style>
