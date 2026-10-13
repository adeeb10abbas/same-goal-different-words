<script lang="ts">
  import { onDestroy } from 'svelte';
  import { createClock, autoplay } from '../../lib/clock.svelte';
  import { epFile, TOP_ASPECT } from '../../lib/media';
  import { liveState } from '../../lib/live';
  import { loadTimeline, type Timeline } from '../../lib/timeline';
  import { MODEL_SHORT, MODEL_NAME } from '../../lib/study';
  import SyncVideo from '../SyncVideo.svelte';
  import Transport from '../Transport.svelte';
  import Lanes from '../Lanes.svelte';
  import Instruction from '../Instruction.svelte';
  import { GOAL_INFO, FORM_SHORT, FORM_NAME, HZ, verdict, type PairRow } from '../../lib/explore';

  /** One paired set: the same model, start and goal under the three wordings, on one clock. */
  let {
    row,
    starts,
    where,
    prev,
    next,
    onnav,
    onopen,
    onback = null,
    onclose,
  }: {
    row: PairRow;
    starts: number;
    where: string;
    prev: string | null;
    next: string | null;
    onnav: (row: string) => void;
    onopen: (id: string) => void;
    /** Return to the rollout this comparison was opened from. */
    onback?: (() => void) | null;
    onclose: () => void;
  } = $props();

  const { clock, state: play, destroy } = createClock(2, 1500);
  onDestroy(() => {
    clock.pause();
    destroy();
  });
  let userPaused = $state(false);
  let cam = $state<'top' | 'front'>('top');

  const first = $derived(row.cells[0].e);
  const info = $derived(GOAL_INFO[row.goal.key]);
  let tls = $state.raw<(Timeline | null)[]>([null, null, null]);
  $effect(() => {
    const key = row.key;
    tls = [null, null, null];
    Promise.all(row.cells.map((c) => loadTimeline(c.e.id).catch(() => null))).then((x) => {
      if (row.key === key) tls = x;
    });
  });
  const panels = $derived(
    row.cells.map((c, j) => {
      const tl = tls[j];
      const fps = tl?.fps ?? HZ;
      const tick = tl ? Math.min(tl.n - 1, Math.round(play.t * fps)) : 0;
      const end = c.e.n / HZ;
      return { c, tl, live: liveState(tl, tick), v: verdict(c.e), done: play.t >= end - 0.05 && play.dur > 0 };
    }),
  );

  $effect(() => {
    const on = (ev: KeyboardEvent) => {
      if (ev.defaultPrevented || ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
      const t = ev.target as HTMLElement | null;
      if (t?.closest('input, select, textarea, [role=slider], [role=tablist], [role=group]')) return;
      if (ev.key === 'ArrowLeft' && prev) {
        ev.preventDefault();
        onnav(prev);
      } else if (ev.key === 'ArrowRight' && next) {
        ev.preventDefault();
        onnav(next);
      }
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  });
</script>

<article class="cmp" aria-labelledby="cmp-title" {@attach autoplay(clock, () => !userPaused, 0.2)}>
  <header class="ph">
    <div class="pt">
      <h2 id="cmp-title">
        <span class="kick">Compare wordings</span>
        <span class="g"><span class="tok-mover">{info.parts.mover}</span> {info.parts.rel} <span class="tok-ref">{info.parts.ref}</span></span>
      </h2>
      <p class="meta">
        <span title={MODEL_NAME[first.m]}>{MODEL_SHORT[first.m]}</span><span aria-hidden="true">·</span><span>Start {first.c} of {starts}</span><span
          aria-hidden="true">·</span
        ><span>Same start, three wordings</span><span aria-hidden="true">·</span><span class="mono id">{row.key}</span>
      </p>
    </div>
    <div class="acts">
      {#if onback}
        <button type="button" class="back" onclick={onback}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>
          Back to rollout
        </button>
      {/if}
      <div class="nav" role="group" aria-label="Paired sets in the current order">
        <button type="button" class="ib" disabled={!prev} onclick={() => prev && onnav(prev)} aria-label="Previous paired set">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>
        </button>
        <span class="pos num">{where}</span>
        <button type="button" class="ib" disabled={!next} onclick={() => next && onnav(next)} aria-label="Next paired set">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
        </button>
      </div>
      <button type="button" class="ib x" onclick={onclose} aria-label="Close" data-autofocus>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
      </button>
    </div>
  </header>

  <div class="body">
    <div class="bar">
      <div class="seg" role="group" aria-label="Camera">
        <button type="button" aria-pressed={cam === 'top'} onclick={() => (cam = 'top')}>Close view</button>
        <button type="button" aria-pressed={cam === 'front'} onclick={() => (cam = 'front')}>Front view</button>
      </div>
      <div class="tp">
        <Transport {clock} t={play.t} playing={play.playing} dur={play.dur} dark onuser={(pl) => (userPaused = !pl)} />
      </div>
      <p class="hint">
        {cam === 'top'
          ? 'Close view: rotated, robot at the top, so the robot’s left is image right.'
          : 'Front view: native orientation.'}
      </p>
    </div>

    <div class="three">
      {#each panels as p (p.c.e.id)}
        {@const e = p.c.e}
        <section class="pane" aria-label="{FORM_NAME[e.f]} wording">
          <div class="ph2">
            <span class="form-pill {e.f}">{FORM_SHORT[e.f]}</span>
            <span class="fn">{FORM_NAME[e.f]}</span>
            <span class="live {p.live.cls}"><i></i>{p.live.text}</span>
          </div>
          <p class="q">“<Instruction prompt={row.goal.prompts[e.f]} goal={row.goal} />”</p>
          <button
            type="button"
            class="frame"
            style:aspect-ratio={cam === 'top' ? TOP_ASPECT : '864 / 480'}
            onclick={() => {
              clock.toggle();
              userPaused = !clock.playing;
            }}
            aria-label="Play or pause all three"
          >
            {#key cam}
              <SyncVideo
                {clock}
                src={epFile(e.id, cam === 'top' ? 'top.mp4' : 'front.mp4')}
                poster={cam === 'top' ? epFile(e.id, 'first.webp') : undefined}
                label="{FORM_NAME[e.f]} wording, {cam === 'top' ? 'close' : 'front'} view"
                lazy={false}
              />
            {/key}
            {#if p.done}<span class="final status {p.v.cls}" data-qa-overlay>{p.v.text}</span>{/if}
          </button>
          <div class="foot">
            <span class="status {p.v.cls}">{p.v.text}</span>
          </div>
          <div class="lanes">
            <Lanes tl={p.tl} t={play.t} duration={play.dur} onseek={(x) => clock.seek(x)} compact stableAt={e.se ? e.tStableDone : null} />
          </div>
          <button type="button" class="open" onclick={() => onopen(e.id)}>Open this rollout</button>
        </section>
      {/each}
    </div>
  </div>
</article>

<style>
  .cmp {
    container: cmp / inline-size;
    min-height: 100%;
  }

  .ph {
    position: sticky;
    top: 0;
    z-index: 3;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px 18px;
    padding: 14px 20px;
    background: rgb(13 15 19 / 94%);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--stage-rule);
  }

  .pt {
    min-width: 0;
    flex: 1 1 340px;
  }

  h2 {
    display: grid;
    gap: 2px;
    font-size: clamp(1.15rem, 1rem + 0.6vw, 1.45rem);
    line-height: 1.25;
    color: #fff;
  }

  .kick {
    font-family: var(--sans);
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--tf-2);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 7px;
    margin: 5px 0 0;
    font-size: 0.78rem;
    color: var(--stage-muted);
    line-height: 1.35;
  }

  .id {
    font-size: 0.72rem;
  }

  .acts {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .nav {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .pos {
    min-width: 6.5em;
    text-align: center;
    font-size: 0.78rem;
    color: var(--stage-muted);
    white-space: nowrap;
  }

  .ib,
  .back {
    display: inline-grid;
    place-items: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 1px solid var(--stage-rule);
    border-radius: 10px;
    background: var(--stage-2);
    color: var(--stage-ink);
    cursor: pointer;
  }

  .back {
    display: inline-flex;
    gap: 6px;
    width: auto;
    padding: 0 12px 0 8px;
    font-size: 0.84rem;
    white-space: nowrap;
  }

  .ib:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .ib:not(:disabled):hover,
  .back:hover {
    border-color: var(--stage-muted);
  }

  svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .body {
    display: grid;
    gap: 14px;
    padding: 16px 20px 24px;
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
  }

  .hint {
    margin: 0;
    font-size: 0.8rem;
    color: var(--stage-muted);
  }

  .three {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }

  .pane {
    display: grid;
    grid-template-rows: auto 1fr auto auto auto auto;
    gap: 10px;
    min-width: 0;
    padding: 12px;
    border: 1px solid var(--stage-rule);
    border-radius: 14px;
    background: var(--stage-2);
  }

  .pane:nth-child(1) {
    --tone: var(--dir-2, #9aa3b2);
  }

  .pane:nth-child(2) {
    --tone: var(--tf-2);
  }

  .pane:nth-child(3) {
    --tone: var(--rf-2, var(--tf-2));
  }

  .pane {
    border-top: 3px solid var(--tone);
  }

  .ph2 {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
    min-height: 26px;
  }

  .fn {
    font-size: 0.86rem;
    font-weight: 600;
    color: #fff;
  }

  .q {
    margin: 0;
    font-family: var(--serif);
    font-size: 1rem;
    line-height: 1.4;
    color: #d5d9e0;
  }

  .frame {
    position: relative;
    display: block;
    width: 100%;
    padding: 0;
    border: 0;
    border-radius: 10px;
    overflow: hidden;
    background: #000;
    cursor: pointer;
  }

  .final {
    position: absolute;
    left: 50%;
    bottom: 10px;
    transform: translateX(-50%);
    max-width: calc(100% - 16px);
    box-shadow: 0 6px 18px rgb(0 0 0 / 45%);
    background: rgb(13 15 19 / 82%) !important;
  }

  .final.kept {
    color: var(--kept-2);
  }

  .final.lost {
    color: var(--lost-2);
  }

  .final.never {
    color: var(--stage-ink);
  }

  .foot {
    display: flex;
    min-height: 28px;
    align-items: center;
  }

  .live {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--mono);
    font-size: 0.68rem;
    padding: 3px 9px 3px 7px;
    border: 1px solid var(--stage-rule);
    border-radius: 999px;
    white-space: nowrap;
    color: var(--stage-muted);
  }

  .live i {
    width: 7px;
    height: 7px;
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

  .lanes {
    padding: 8px 10px;
    border: 1px solid var(--stage-rule);
    border-radius: 10px;
    background: var(--stage);
  }

  .open {
    justify-self: start;
    padding: 7px 12px;
    border: 1px solid var(--stage-rule);
    border-radius: 9px;
    background: transparent;
    color: var(--stage-ink);
    font-size: 0.82rem;
    cursor: pointer;
  }

  .open:hover {
    border-color: var(--stage-muted);
  }

  .tp {
    min-width: 0;
  }

  .hint {
    flex-basis: 100%;
  }

  @container cmp (max-width: 760px) {
    .three {
      grid-template-columns: minmax(0, 1fr);
    }

    .pane {
      grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
      grid-template-rows: none;
      align-items: start;
    }

    .ph2,
    .q,
    .lanes,
    .open,
    .foot {
      grid-column: 2;
    }

    .frame {
      grid-column: 1;
      grid-row: 1 / span 4;
    }

    .lanes {
      grid-column: 1 / -1;
    }

    .open {
      grid-column: 1 / -1;
    }
  }

  @container cmp (max-width: 560px) {
    .ph {
      padding: 12px 14px;
    }

    .body {
      padding: 14px 14px 22px;
    }

    .acts {
      width: 100%;
    }

    .x {
      margin-left: auto;
    }
  }
</style>
