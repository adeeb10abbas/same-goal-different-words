<script lang="ts">
  import { onDestroy } from 'svelte';
  import { createClock, autoplay } from '../../lib/clock.svelte';
  import { epFile, TOP_ASPECT } from '../../lib/media';
  import { liveState } from '../../lib/live';
  import type { Timeline } from '../../lib/timeline';
  import SyncVideo from '../SyncVideo.svelte';
  import Transport from '../Transport.svelte';
  import Lanes from '../Lanes.svelte';
  import Minimap from '../Minimap.svelte';
  import { verdict, sec, cm, OUTCOME_LABEL, STAGE_LABEL, EVENT_LABEL, HZ, REF_CM, type Rec } from '../../lib/explore';

  /** The executed rollout: close and front views on one clock, scorer lanes, a top-down map and the key facts. */
  let { rec, tl }: { rec: Rec; tl: Timeline | null } = $props();

  const { clock, state: play, destroy } = createClock(2, 1500);
  onDestroy(() => {
    clock.pause();
    destroy();
  });
  let userPaused = $state(false);

  const e = $derived(rec.e);
  const v = $derived(verdict(e));
  const fps = $derived(tl?.fps ?? HZ);
  const tick = $derived(tl ? Math.min(tl.n - 1, Math.round(play.t * fps)) : 0);
  const live = $derived(liveState(tl, tick));
  const done = $derived(play.dur > 0 && play.t >= play.dur - 0.05);
  const toggle = () => {
    clock.toggle();
    userPaused = !clock.playing;
  };
  const seek = (t: number | null) => {
    if (t == null) return;
    clock.seek(t);
  };
  const times = $derived([
    { k: 'Target first lifted', t: e.tLift },
    { k: 'Goal first met', t: e.tHit },
    { k: 'Stable placement began', t: e.tStable },
    { k: 'Final stable run began', t: e.tFinal },
  ]);
  const ev = $derived(rec.v.ev);
</script>

<div class="exw" {@attach autoplay(clock, () => !userPaused, 0.2)}>
<div class="ex">
  <div class="main">
    <div class="views">
      <figure class="view close">
        <figcaption class="vh">
          <span class="vt">Close view</span>
          <span class="live {live.cls}"><i></i>{live.text}</span>
        </figcaption>
        <button type="button" class="frame" style:aspect-ratio={TOP_ASPECT} onclick={toggle} aria-label="Play or pause both views">
          <SyncVideo {clock} src={epFile(e.id, 'top.mp4')} poster={epFile(e.id, 'first.webp')} label="Close view of the rollout" lazy={false} />
          {#if done}<span class="final status {v.cls}" data-qa-overlay>{v.text}</span>{/if}
        </button>
        <div class="axis" aria-hidden="true"><span>← robot’s right</span><i></i><span>robot’s left →</span></div>
      </figure>
      <figure class="view front">
        <figcaption class="vh"><span class="vt">Front view</span><span class="vs">native orientation</span></figcaption>
        <button type="button" class="frame" style:aspect-ratio="864 / 480" onclick={toggle} aria-label="Play or pause both views">
          <SyncVideo {clock} src={epFile(e.id, 'front.mp4')} label="Front view of the rollout" lazy={false} />
        </button>
      </figure>
    </div>
    <Transport {clock} t={play.t} playing={play.playing} dur={play.dur} dark onuser={(p) => (userPaused = !p)} />
    <div class="lanes">
      <Lanes {tl} t={play.t} duration={play.dur} onseek={(x) => clock.seek(x)} stableAt={e.se ? e.tStableDone : null} />
    </div>
  </div>

  <aside class="side">
    <div class="map"><Minimap {tl} tick={play.t * fps} dark /></div>
    <dl class="facts">
      <div><dt>Outcome</dt><dd><span class="status {rec.o}">{OUTCOME_LABEL[rec.o]}</span></dd></div>
      <div><dt>Furthest stage</dt><dd>{STAGE_LABEL[e.stage]}</dd></div>
      {#each times as x (x.k)}
        <div>
          <dt>{x.k}</dt>
          <dd>
            {#if x.t != null}<button type="button" class="seek num" onclick={() => seek(x.t)} aria-label="{x.k}: jump to {sec(x.t)}">{sec(x.t)}</button
              >{:else}<span class="na">never</span>{/if}
          </dd>
        </div>
      {/each}
      <div><dt>Target displacement at the end</dt><dd class="num">{cm(e.disp)}</dd></div>
      <div><dt>Largest reference displacement</dt><dd class="num">{cm(e.refMax)}{e.refMoved ? '' : ` (under ${REF_CM}\u00a0cm)`}</dd></div>
      <div><dt>Goal true at the start</dt><dd>{e.init ? 'Yes' : 'No'}</dd></div>
      <div><dt>Episode length</dt><dd class="num">{sec(e.n / HZ)}</dd></div>
      <div><dt>Error in the forecast window</dt><dd>{ev === 'none' ? 'None detected' : EVENT_LABEL[ev]}</dd></div>
    </dl>
  </aside>
</div>
</div>

<style>
  .exw {
    container: exec / inline-size;
  }

  .ex {
    display: grid;
    gap: 20px;
  }

  .main {
    display: grid;
    gap: 14px;
    min-width: 0;
  }

  .views {
    display: grid;
    grid-template-columns: minmax(0, 0.9926fr) minmax(0, 1.8fr);
    gap: 12px;
    align-items: start;
  }

  .view {
    margin: 0;
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .vh {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    min-height: 26px;
    font-size: 0.8rem;
    color: var(--stage-muted);
  }

  .vt {
    font-weight: 600;
    color: var(--stage-ink);
  }

  .frame {
    position: relative;
    display: block;
    width: 100%;
    padding: 0;
    border: 0;
    border-radius: 12px;
    overflow: hidden;
    background: #000;
    cursor: pointer;
  }

  .final {
    position: absolute;
    left: 50%;
    bottom: 12px;
    transform: translateX(-50%);
    max-width: calc(100% - 16px);
    box-shadow: 0 6px 18px rgb(0 0 0 / 45%);
    backdrop-filter: blur(8px);
    background: rgb(13 15 19 / 80%) !important;
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

  .live {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--mono);
    font-size: 0.7rem;
    padding: 3px 10px 3px 8px;
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
    background: rgb(111 211 154 / 8%);
  }

  .live.other {
    color: var(--lost-2);
  }

  .axis {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--mono);
    font-size: 0.66rem;
    color: var(--stage-muted);
    white-space: nowrap;
  }

  .axis i {
    flex: 1;
    height: 1px;
    background: var(--stage-rule);
  }

  .lanes {
    padding: 12px 14px;
    border: 1px solid var(--stage-rule);
    border-radius: 12px;
    background: var(--stage-2);
  }

  .side {
    display: grid;
    gap: 14px;
    align-content: start;
    min-width: 0;
  }

  .map {
    aspect-ratio: 4 / 3;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--stage-rule);
  }

  .facts {
    margin: 0;
    display: grid;
    border-top: 1px solid var(--stage-rule);
  }

  .facts div {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    min-height: 34px;
    padding: 5px 0;
    border-bottom: 1px solid var(--stage-rule);
  }

  dt {
    font-size: 0.8rem;
    color: var(--stage-muted);
    line-height: 1.3;
  }

  dd {
    margin: 0;
    font-size: 0.84rem;
    text-align: right;
    line-height: 1.3;
  }

  .seek {
    padding: 3px 9px;
    border: 1px solid var(--stage-rule);
    border-radius: 7px;
    background: var(--stage-2);
    color: var(--stage-ink);
    font-size: 0.8rem;
    cursor: pointer;
  }

  .seek:hover {
    border-color: var(--stage-muted);
  }

  .na {
    color: var(--stage-muted);
  }

  @container exec (min-width: 980px) {
    .ex {
      grid-template-columns: minmax(0, 1fr) 300px;
      align-items: start;
    }
  }

  @container exec (max-width: 600px) {
    .views {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
