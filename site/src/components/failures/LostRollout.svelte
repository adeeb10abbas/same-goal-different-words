<script lang="ts">
  import { onDestroy } from 'svelte';
  import { createClock, autoplay } from '../../lib/clock.svelte';
  import { loadTimeline, type Timeline } from '../../lib/timeline';
  import { liveState } from '../../lib/live';
  import { epFile, TOP_ASPECT, type Episode } from '../../lib/media';
  import { FORM_NAME, FORM_SHORT, MODEL_SHORT, OUTCOME_LABEL, goalByKey, outcomeOf, study } from '../../lib/study';
  import { LOST_RULE, lossOf, sceneFps, sec, timeOfTick, type Predicate } from '../../lib/failures';
  import Instruction from '../Instruction.svelte';
  import Lanes from '../Lanes.svelte';
  import Minimap from '../Minimap.svelte';
  import SyncVideo from '../SyncVideo.svelte';
  import Transport from '../Transport.svelte';
  import Checks from './Checks.svelte';

  let { ep, pool }: { ep: Episode; pool: string[] } = $props();

  const goal = $derived(goalByKey(`${ep.s}-${ep.g}`));
  const fps = $derived(sceneFps(ep.s));
  const S = study.settings.scoring;
  const { clock, state: play, destroy } = createClock(2, 1800);
  onDestroy(destroy);
  let userPaused = $state(false);

  let tl = $state.raw<Timeline | null>(null);
  $effect(() => {
    loadTimeline(ep.id).then((x) => (tl = x));
  });
  const loss = $derived(tl ? lossOf(tl) : null);
  const n = $derived(ep.n);
  const ftick = $derived(Math.min(n - 1, Math.max(0, play.t * fps)));
  const tick = $derived(Math.min(n - 1, Math.max(0, Math.round(play.t * fps))));
  const live = $derived(liveState(tl, tick));
  const placeT = $derived(ep.tStableDone ?? 0);
  const placeTick = $derived(Math.round(placeT * fps));
  const atPlace = $derived(!play.playing && tick === placeTick);
  const atLoss = $derived(!play.playing && !!loss && tick === loss.tick);
  const after = $derived(!!loss && tick >= loss.tick);
  const heldS = $derived(loss ? (loss.held[1] + 1 - loss.held[0]) / fps : 0);
  const models = LOST_RULE.models.map((m) => MODEL_SHORT[m]).join(' and ');
  const FAIL: Record<Predicate, string> = {
    relation: 'the relation no longer holds',
    support: 'the target is no longer supported by the table',
    detached: 'the gripper is touching the target again',
  };
  const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

  function jump(t: number) {
    clock.pause();
    clock.seek(t);
    userPaused = true;
  }
</script>

<div class="lr" {@attach autoplay(clock, () => !userPaused, 0.25)}>
  <div class="ctl">
    <div class="ctl-in">
      <div class="tp">
        <Transport {clock} t={play.t} playing={play.playing} dur={play.dur} onuser={(p) => (userPaused = !p)} />
      </div>
      <div class="jumps">
        <button type="button" class="jump" class:on={atPlace} onclick={() => jump(timeOfTick(placeTick, fps))}>Jump to the placement</button>
        <button type="button" class="jump" class:on={atLoss} disabled={!loss} onclick={() => loss && jump(timeOfTick(loss.tick, fps))}>Jump to the loss</button>
      </div>
    </div>
  </div>

  <figure class="panel">
    <div class="head">
      <span class="form-pill {ep.f}">{FORM_SHORT[ep.f]}</span>
      <span class="fname">{MODEL_SHORT[ep.m]} · {FORM_NAME[ep.f]}</span>
      <span class="live {live.cls}"><i></i>{live.text}</span>
    </div>
    <p class="instr">“<Instruction prompt={goal.prompts[ep.f]} {goal} />”</p>
    <div class="mwrap">
      <div class="media">
        <button
          type="button"
          class="frame"
          style:aspect-ratio={TOP_ASPECT}
          onclick={() => {
            clock.toggle();
            userPaused = !clock.playing;
          }}
          aria-label="Play or pause the rollout"
        >
          <SyncVideo {clock} src={epFile(ep.id, 'top.mp4')} poster={epFile(ep.id, 'first.webp')} label="Placed-then-lost rollout, exterior camera" />
          {#if atPlace}
            <span class="chip status kept" data-qa-overlay>Stable placement credited</span>
          {:else if atLoss}
            <span class="chip status lost" data-qa-overlay>Goal no longer holds</span>
          {/if}
        </button>
        <div class="map">
          <Minimap {tl} tick={ftick} />
        </div>
      </div>
    </div>
    <div class="lanes">
      <Lanes {tl} t={play.t} duration={play.dur} onseek={(x) => clock.seek(x)} stableAt={ep.tStableDone} />
    </div>
    <figcaption class="out">
      <span class="status {outcomeOf(ep)}">{OUTCOME_LABEL[outcomeOf(ep)]}</span>
      {#if loss}
        <span>
          Stable placement completed at {sec(placeT)}. The goal held for {sec(heldS)} in its last interval, then stopped holding at {sec(
            timeOfTick(loss.tick, fps),
          )}{#if loss.failed.length}{' '}because {list(loss.failed.map((k) => FAIL[k]))}{/if}, and it never held again before the end.
        </span>
      {/if}
    </figcaption>
  </figure>

  <div class="readout">
    <Checks cols={[{ key: 'ep', head: FORM_NAME[ep.f], f: ep.f, tl, i: tick }]} {goal} caption="What the scorer reads at" at={sec(play.t)} />
    <p class="hint" class:after>
      {#if after}
        Past {sec(loss ? timeOfTick(loss.tick, fps) : 0)}, the placement no longer counts, so the episode-end check, which needs the conditions
        throughout the final {S.holdS}&nbsp;s, fails.
      {:else}
        The episode is credited at any time once the goal has held still for {S.holdS}&nbsp;s. <b>Jump to the loss</b> stops where the goal stops
        holding.
      {/if}
    </p>
  </div>

  <p class="note">
    Chosen for this website to illustrate; not one of the paper’s examples, and not a prevalence estimate. Rule: among the {pool.length}
    {models} episodes in the mustard scene that reach a stable placement at some point, fail the end check and whose goal was not already true at reset,
    take the one whose goal does not hold at the last frame and whose last goal-holding interval is longest. The loss was then confirmed in the video.
  </p>
</div>

<style>
  .lr {
    container: lr / inline-size;
    margin-top: clamp(22px, 3vw, 32px);
  }

  .ctl {
    container-type: inline-size;
    margin-bottom: 14px;
  }

  .ctl-in {
    display: grid;
    gap: 10px 16px;
    align-items: center;
  }

  @container (min-width: 40em) {
    .ctl-in {
      grid-template-columns: minmax(0, 1fr) auto;
    }
  }

  .tp {
    container-type: inline-size;
    min-width: 0;
  }

  .jumps {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .jump {
    min-height: 34px;
    padding: 6px 14px;
    border-radius: 999px;
    border: 1px solid var(--stage-rule);
    background: rgb(255 255 255 / 4%);
    color: var(--stage-ink);
    font: inherit;
    font-size: 0.84rem;
    font-weight: 500;
    line-height: 1.2;
    white-space: nowrap;
    cursor: pointer;
  }

  .jump:hover {
    border-color: #6b7280;
  }

  .jump.on {
    color: var(--lost-2);
    border-color: color-mix(in srgb, var(--lost-2) 55%, transparent);
  }

  .panel {
    margin: 0;
    padding: 16px;
    border-radius: 16px;
    background: var(--stage-2);
    border: 1px solid var(--stage-rule);
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 10px;
  }

  .fname {
    font-weight: 600;
    color: var(--stage-ink);
  }

  .instr {
    margin: 8px 0 12px;
    font-size: 0.92rem;
    line-height: 1.45;
    color: #c9ced6;
  }

  .live {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-family: var(--mono);
    font-size: 0.7rem;
    color: var(--stage-muted);
    border: 1px solid var(--stage-rule);
    border-radius: 999px;
    padding: 3px 10px 3px 8px;
    white-space: nowrap;
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

  .mwrap {
    container: lmedia / inline-size;
    min-width: 0;
  }

  .media {
    display: grid;
    gap: 10px;
  }

  @container lmedia (min-width: 34em) {
    .media {
      grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
    }
  }

  .frame {
    position: relative;
    display: block;
    width: min(100%, calc((100svh - 140px) * 536 / 540));
    justify-self: center;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 12px;
    overflow: hidden;
    cursor: pointer;
    background: #000;
  }

  .frame .chip.status {
    position: absolute;
    left: 50%;
    bottom: 10px;
    transform: translateX(-50%);
    max-width: calc(100% - 20px);
    overflow: hidden;
    text-overflow: ellipsis;
    background: rgb(13 15 19 / 86%);
    pointer-events: none;
  }

  .map {
    min-width: 0;
    aspect-ratio: 4 / 3;
  }

  @container lmedia (min-width: 34em) {
    .map {
      aspect-ratio: auto;
    }
  }

  .lanes {
    container-type: inline-size;
    padding-top: 14px;
    min-width: 0;
  }

  .out {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 10px;
    align-items: baseline;
    padding-top: 12px;
    font-size: 0.86rem;
    line-height: 1.5;
    color: #c3c8d0;
  }

  .readout {
    container-type: inline-size;
    display: grid;
    gap: 16px 32px;
    margin-top: 18px;
    padding: 18px;
    border-radius: 16px;
    background: var(--stage-2);
    border: 1px solid var(--stage-rule);
  }

  @container lr (min-width: 50em) {
    .readout {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      align-items: start;
    }
  }

  .hint {
    margin: 0;
    padding-left: 14px;
    border-left: 2px solid var(--stage-rule);
    font-size: 0.9rem;
    line-height: 1.55;
    color: var(--stage-muted);
  }

  .hint.after {
    border-left-color: var(--lost-2);
    color: #c9ced6;
  }

  .note {
    margin-top: 16px;
  }
</style>
