<script lang="ts">
  import { onDestroy } from 'svelte';
  import { createClock, autoplay } from '../../lib/clock.svelte';
  import type { Timeline } from '../../lib/timeline';
  import SyncVideo from '../SyncVideo.svelte';
  import Transport from '../Transport.svelte';
  import Lanes from '../Lanes.svelte';
  import { sec } from '../../lib/explore';

  /**
   * A side-by-side [generated | executed] video (1280×540: wrist camera above two exterior cameras on each half), on its
   * own clock. `offset` maps clip time to episode time; full-episode clips also show the scorer lanes.
   */
  let {
    src,
    left,
    right,
    label,
    rate = 1,
    offset = 0,
    tl = null,
    stableAt = null,
  }: {
    src: string;
    left: string;
    right: string;
    label: string;
    rate?: number;
    offset?: number;
    /** Show the episode's scorer lanes under the clip (whole-episode clips only). */
    tl?: Timeline | null;
    stableAt?: number | null;
  } = $props();

  const { clock, state: play, destroy } = createClock(rate, 1200);
  onDestroy(() => {
    clock.pause();
    destroy();
  });
  let userPaused = $state(false);
</script>

<div class="comp" {@attach autoplay(clock, () => !userPaused, 0.2)}>
  <div class="heads" aria-hidden="true">
    <span class="gen">{left}</span>
    <span class="exe">{right}</span>
  </div>
  <button
    type="button"
    class="frame"
    onclick={() => {
      clock.toggle();
      userPaused = !clock.playing;
    }}
    aria-label="Play or pause: {label}"
  >
    <SyncVideo {clock} {src} {label} lazy={false} />
    <span class="split" aria-hidden="true"></span>
  </button>
  <div class="tp">
    <Transport {clock} t={play.t} playing={play.playing} dur={play.dur} dark onuser={(p) => (userPaused = !p)} />
    {#if offset}<span class="et mono num">Episode time {sec(offset + play.t)}</span>{/if}
  </div>
  {#if tl}
    <div class="lanes">
      <Lanes {tl} t={play.t} duration={play.dur} onseek={(x) => clock.seek(x)} {stableAt} />
    </div>
  {/if}
</div>

<style>
  .comp {
    display: grid;
    gap: 10px;
    min-width: 0;
  }

  .heads {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .gen {
    color: #b9c4ff;
  }

  .exe {
    color: var(--stage-ink);
  }

  .frame {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 1280 / 540;
    padding: 0;
    border: 0;
    border-radius: 12px;
    overflow: hidden;
    background: #000;
    cursor: pointer;
  }

  .split {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: 2px;
    margin-left: -1px;
    background: var(--stage);
  }

  .tp {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
  }

  .et {
    font-size: 0.74rem;
    color: var(--stage-muted);
    white-space: nowrap;
  }

  .lanes {
    padding: 12px 14px;
    border: 1px solid var(--stage-rule);
    border-radius: 12px;
    background: var(--stage-2);
  }
</style>
