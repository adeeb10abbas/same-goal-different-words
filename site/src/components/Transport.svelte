<script lang="ts">
  import type { SyncClock } from '../lib/sync';

  let {
    clock,
    t = 0,
    playing = false,
    dur = 0,
    dark = true,
    onuser,
  }: { clock: SyncClock; t?: number; playing?: boolean; dur?: number; dark?: boolean; onuser?: (playing: boolean) => void } = $props();
  const RATES = [0.5, 1, 2];
  let rate = $state(clock.rate);
  const set = (r: number) => {
    rate = r;
    clock.setRate(r);
  };
</script>

<div class="transport" class:dark>
  <button class="pp" onclick={() => { clock.toggle(); onuser?.(clock.playing); }} aria-label={playing ? 'Pause' : 'Play'}>
    {#if playing}
      <svg viewBox="0 0 16 16"><rect x="3" y="2" width="3.6" height="12" rx="1" /><rect x="9.4" y="2" width="3.6" height="12" rx="1" /></svg>
    {:else}
      <svg viewBox="0 0 16 16"><path d="M4 2.5v11a.8.8 0 0 0 1.2.7l9-5.5a.8.8 0 0 0 0-1.4l-9-5.5A.8.8 0 0 0 4 2.5Z" /></svg>
    {/if}
  </button>
  <button class="pp ghost" onclick={() => { clock.seek(0); clock.play(); onuser?.(true); }} aria-label="Restart">
    <svg viewBox="0 0 16 16"><path d="M8 3a5 5 0 1 1-4.9 6h1.6A3.5 3.5 0 1 0 8 4.5V7L4.5 4 8 1v2Z" /></svg>
  </button>
  <span class="time mono num"
    ><span class="cur" style:min-width="{dur.toFixed(1).length}ch">{t.toFixed(1)}</span> <span class="of">/ {dur.toFixed(1)} s</span></span
  >
  <div class="seg" role="group" aria-label="Playback speed">
    {#each RATES as r}
      <button aria-pressed={rate === r} onclick={() => set(r)}>{r}×</button>
    {/each}
  </div>
  <button class="rate mono" onclick={() => set(RATES[(RATES.indexOf(rate) + 1) % RATES.length])} aria-label="Playback speed {rate}×"
    >{rate}×</button
  >
</div>

<style>
  .transport {
    display: flex;
    flex: none;
    align-items: center;
    gap: 10px;
    max-width: 100%;
  }

  .pp {
    flex: none;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 0;
    display: grid;
    place-items: center;
    cursor: pointer;
    background: var(--ink);
    color: #fff;
    transition: transform 0.15s;
  }

  .pp:active {
    transform: scale(0.94);
  }

  .pp svg {
    width: 14px;
    height: 14px;
    fill: currentColor;
  }

  .pp.ghost {
    background: transparent;
    color: var(--muted);
    border: 1px solid var(--rule-2);
  }

  .dark .pp {
    background: #fff;
    color: #0d0f13;
  }

  .dark .pp.ghost {
    background: transparent;
    color: var(--stage-muted);
    border-color: var(--stage-rule);
  }

  .time {
    font-size: 0.8rem;
    white-space: nowrap;
  }

  /* Right-aligned at the width of the duration, so the readout never changes width while playing. */
  .cur {
    display: inline-block;
    text-align: right;
  }

  .of {
    color: var(--faint);
  }

  .dark .of {
    color: var(--stage-muted);
  }

  .seg {
    flex: none;
  }

  .seg button {
    padding: 3px 9px;
    font-size: 0.74rem;
  }

  /* One button that cycles the speed, used when the three-way control does not fit. */
  .rate {
    display: none;
    flex: none;
    min-width: 46px;
    height: 30px;
    padding: 0 10px;
    border-radius: 999px;
    border: 1px solid var(--rule-2);
    background: transparent;
    color: var(--ink);
    font-size: 0.76rem;
    cursor: pointer;
  }

  .dark .rate {
    border-color: var(--stage-rule);
    color: var(--stage-ink);
  }

  .rate:hover {
    border-color: var(--muted);
  }

  @container (max-width: 324px) {
    .seg {
      display: none;
    }

    .rate {
      display: block;
    }
  }
</style>
