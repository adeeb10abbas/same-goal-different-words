<script lang="ts">
  import type { SyncClock } from '../../lib/sync';
  import SyncVideo from '../SyncVideo.svelte';

  /**
   * One [generated | executed] composite video (1280×540) shown as two synced crops of the same file: side by side
   * (stacked in narrow containers), as a wipe with a draggable divider, or with the executed half overlaid at half
   * opacity. Switching mode only changes CSS, so playback continues.
   */
  let {
    clock,
    src,
    mode = 'side',
    wipe = $bindable(50),
    what = 'forecast',
    lazy = true,
  }: {
    clock: SyncClock;
    src: string;
    mode?: 'side' | 'wipe' | 'blend';
    wipe?: number;
    what?: string;
    lazy?: boolean;
  } = $props();

  const GEN: [number, number, number, number, number, number] = [0, 0, 640, 540, 1280, 540];
  const EXE: [number, number, number, number, number, number] = [640, 0, 640, 540, 1280, 540];

  const clamp = (x: number) => Math.max(0, Math.min(100, x));
  const KEYS: Record<string, (x: number) => number> = {
    ArrowLeft: (x) => x - 5,
    ArrowDown: (x) => x - 5,
    ArrowRight: (x) => x + 5,
    ArrowUp: (x) => x + 5,
    PageDown: (x) => x - 20,
    PageUp: (x) => x + 20,
    Home: () => 0,
    End: () => 100,
  };
  function onkeydown(e: KeyboardEvent) {
    const f = KEYS[e.key];
    if (!f || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    wipe = clamp(f(wipe));
  }

  /** Attachment: in wipe mode, pressing anywhere on the frame moves the divider there and drags it. */
  function draggable(node: HTMLElement) {
    let drag = false;
    const at = (e: PointerEvent) => {
      const r = node.getBoundingClientRect();
      wipe = Math.round(clamp(((e.clientX - r.left) / r.width) * 100));
    };
    const down = (e: PointerEvent) => {
      if (mode !== 'wipe' || e.button > 0) return;
      drag = true;
      node.setPointerCapture(e.pointerId);
      at(e);
    };
    const move = (e: PointerEvent) => drag && at(e);
    const up = () => (drag = false);
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    return () => {
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', up);
    };
  }
</script>

<div class="pair {mode}" style:--x="{wipe}%">
  <div class="grid">
    <div class="cell gen">
      <div class="layer">
        <SyncVideo {clock} {src} crop={GEN} {lazy} label="Generated {what}: wrist camera above two exterior cameras" />
      </div>
    </div>
    <div class="cell exe" {@attach draggable}>
      <div class="layer">
        <SyncVideo {clock} {src} crop={EXE} {lazy} label="Executed {what}: the same three cameras during the rollout" />
      </div>
      {#if mode === 'wipe'}
        <div class="line" aria-hidden="true"></div>
        <div
          class="knob"
          role="slider"
          tabindex="0"
          aria-label="Wipe divider"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={wipe}
          aria-valuetext="{wipe}%: generated to the left, executed to the right"
          {onkeydown}
        >
          <svg viewBox="0 0 20 12" aria-hidden="true"><path d="M7 1 2 6l5 5M13 1l5 5-5 5" /></svg>
        </div>
      {/if}
    </div>
  </div>
  <span class="badge g" class:off={mode === 'wipe' && wipe < 30} data-qa-overlay>Generated prediction</span>
  <span class="badge e" class:off={mode === 'wipe' && wipe > 70} data-qa-overlay>{mode === 'blend' ? 'Executed, half opacity' : 'Executed'}</span>
</div>

<style>
  .pair {
    position: relative;
    container-type: inline-size;
    --gap: 10px;
    --frame: 560px;
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--gap);
  }

  .cell {
    position: relative;
    min-width: 0;
  }

  .layer {
    position: relative;
    overflow: hidden;
    aspect-ratio: 640 / 540;
    border-radius: 10px;
    background: #000;
  }

  /* Wipe and overlay: both crops in one cell, executed on top. */
  .wipe .grid,
  .blend .grid {
    grid-template-columns: 1fr;
    grid-template-areas: 'a';
    max-width: var(--frame);
    margin-inline: auto;
  }

  .wipe .cell,
  .blend .cell {
    grid-area: a;
  }

  .wipe .exe .layer {
    clip-path: inset(0 0 0 var(--x));
  }

  .blend .exe .layer {
    opacity: 0.5;
  }

  .wipe .exe {
    cursor: ew-resize;
    touch-action: pan-y;
  }

  .line {
    position: absolute;
    top: 0;
    bottom: 0;
    left: var(--x);
    width: 2px;
    margin-left: -1px;
    background: #fff;
    box-shadow: 0 0 0 1px rgb(0 0 0 / 35%);
    pointer-events: none;
  }

  .knob {
    position: absolute;
    top: 50%;
    left: clamp(22px, var(--x), calc(100% - 22px));
    width: 44px;
    height: 44px;
    margin: -22px 0 0 -22px;
    border-radius: 50%;
    background: #fff;
    color: #0d0f13;
    display: grid;
    place-items: center;
    box-shadow: 0 2px 10px rgb(0 0 0 / 45%);
    cursor: ew-resize;
    touch-action: none;
  }

  .knob svg {
    width: 20px;
    height: 12px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .knob:focus-visible {
    outline: 2px solid var(--tf-2);
    outline-offset: 3px;
  }

  /* Labels sit outside the clipped layers so the wipe never cuts them. */
  .badge {
    position: absolute;
    top: 8px;
    z-index: 2;
    font-family: var(--mono);
    font-size: 0.66rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    line-height: 1.3;
    padding: 4px 8px;
    border-radius: 6px;
    white-space: nowrap;
    pointer-events: none;
    transition: opacity 0.2s;
  }

  .badge.g {
    left: 8px;
    background: #1d2a6b;
    color: #dfe4ff;
    box-shadow: inset 0 0 0 1px rgb(141 156 255 / 55%);
  }

  .badge.e {
    background: #e9ecf1;
    color: #0d0f13;
  }

  .side .badge.e {
    left: calc(50% + var(--gap) / 2 + 8px);
  }

  /* One frame: generated label top left, executed label bottom right, so the two never meet. */
  .wipe .badge.g,
  .blend .badge.g {
    left: max(8px, calc(50% - var(--frame) / 2 + 8px));
  }

  .wipe .badge.e,
  .blend .badge.e {
    top: auto;
    bottom: 8px;
    right: max(8px, calc(50% - var(--frame) / 2 + 8px));
  }

  .badge.off {
    opacity: 0;
  }

  /* Narrow containers stack the two halves. */
  @container (max-width: 479px) {
    .side .grid {
      grid-template-columns: 1fr;
    }

    .side .badge.e {
      left: 8px;
      top: calc(50% + var(--gap) / 2 + 8px);
    }
  }
</style>
