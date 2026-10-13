<script lang="ts">
  import { onDestroy } from 'svelte';
  import { createClock, autoplay } from '../../lib/clock.svelte';
  import { loadTimeline, type Timeline, type TObject } from '../../lib/timeline';
  import { liveState } from '../../lib/live';
  import { epFile, TOP_ASPECT, type Episode } from '../../lib/media';
  import { FORM_NAME, FORM_SHORT, OUTCOME_LABEL, STAGE_LABEL, goalByKey, outcomeOf, study } from '../../lib/study';
  import { PREDICATES, cm, gripAt, holdAt, predicatesAt, sceneFps, sec, timeOfTick, type Predicate } from '../../lib/failures';
  import Instruction from '../Instruction.svelte';
  import Lanes from '../Lanes.svelte';
  import Minimap from '../Minimap.svelte';
  import SyncVideo from '../SyncVideo.svelte';
  import Transport from '../Transport.svelte';
  import Checks from './Checks.svelte';

  let { tf, rf }: { tf: Episode; rf: Episode } = $props();

  const goal = $derived(goalByKey(`${tf.s}-${tf.g}`));
  const fps = $derived(sceneFps(tf.s));
  const S = study.settings.scoring;
  /** The paper's snapshot: when the reference-first rollout first completes the stable interval. */
  const snapT = $derived(rf.tStableDone ?? 0);
  const snapTick = $derived(Math.round(snapT * fps));
  const nice = (s: string) => s.replace(/'/g, '\u2019');
  const moverName = $derived(nice(goal.moverName));
  const refName = $derived(goal.referenceName);
  /** Robot-frame region kept in view on the maps (m): both starts, the lifted bowl and the gripper's reach. */
  const WIN = { x: [0.22, 0.63] as [number, number], y: [-0.27, 0.29] as [number, number] };

  const { clock, state: play, destroy } = createClock(2, 1800);
  onDestroy(destroy);
  let userPaused = $state(false);

  let tls = $state.raw<Record<string, Timeline>>({});
  $effect(() => {
    for (const e of [tf, rf]) loadTimeline(e.id).then((x) => (tls = { ...tls, [e.id]: x }));
  });
  const tlTF = $derived(tls[tf.id] ?? null);
  const tlRF = $derived(tls[rf.id] ?? null);

  const n = $derived(tf.n);
  const ftick = $derived(Math.min(n - 1, Math.max(0, play.t * fps)));
  const tick = $derived(Math.min(n - 1, Math.max(0, Math.round(play.t * fps))));
  const done = $derived(play.dur > 0 && play.t >= play.dur - 0.05);
  const atSnap = $derived(!play.playing && tick === snapTick);

  const panels = $derived([
    { f: 'S' as const, ep: tf, tl: tlTF },
    { f: 'I' as const, ep: rf, tl: tlRF },
  ]);

  function jump(t: number) {
    clock.pause();
    clock.seek(t);
    userPaused = true;
  }

  const FAIL_SHORT: Record<Predicate, string> = {
    relation: 'Relation does not hold',
    support: 'Not supported by the table',
    detached: 'Still touching the gripper',
  };

  /** Badge over a video: the scorer's verdict at the snapshot, the recorded outcome at the end. */
  function chip(tl: Timeline | null, ep: Episode) {
    if (!tl) return null;
    if (done) {
      const o = outcomeOf(ep);
      return o === 'kept'
        ? { cls: 'kept', text: OUTCOME_LABEL.kept }
        : o === 'lost'
          ? { cls: 'lost', text: 'Fails the end check' }
          : { cls: 'never', text: OUTCOME_LABEL.never };
    }
    if (!atSnap) return null;
    const p = predicatesAt(tl, tick);
    if (p.goal) return holdAt(tl, tick).done ? { cls: 'kept', text: 'Stable placement credited' } : { cls: 'lost', text: 'Goal met, not yet still' };
    const miss = PREDICATES.find((k) => !p[k])!;
    return { cls: 'never', text: FAIL_SHORT[miss] };
  }

  function outcomeLine(ep: Episode) {
    const o = outcomeOf(ep);
    if (o === 'kept') return `Placed at ${sec(ep.tStable ?? 0)} and kept to the end.`;
    if (o === 'lost') return `Stable placement completed at ${sec(ep.tStableDone ?? 0)}; the final arrangement fails the end check.`;
    return `${STAGE_LABEL[ep.stage] ?? OUTCOME_LABEL.never}.`;
  }

  const byRole = (tl: Timeline, role: TObject['role']) => tl.objects.find((o) => o.role === role)!;
  const moved = (o: TObject, i: number) => Math.hypot(o.x[i] - o.x[0], o.y[i] - o.y[0]);

  /** Everything the snapshot note says, read from the two timelines at the snapshot tick. */
  const snap = $derived.by(() => {
    if (!tlTF || !tlRF) return null;
    const i = snapTick;
    const rb = byRole(tlRF, 'reference');
    const rc = byRole(tlRF, 'mover');
    const tb = byRole(tlTF, 'reference');
    const tc = byRole(tlTF, 'mover');
    const rim = Math.min(Math.abs(tb.lb[0]), tb.lb[3], Math.abs(tb.lb[1]), tb.lb[4]) / 1000;
    return {
      rf: { p: predicatesAt(tlRF, i), h: holdAt(tlRF, i), grip: gripAt(tlRF, i), bowlMoved: moved(rb, i), bowlRaised: rb.z[i] - rb.z[0], cubeMoved: moved(rc, i) },
      tf: {
        p: predicatesAt(tlTF, i),
        grip: gripAt(tlTF, i),
        cubeMoved: moved(tc, i),
        inBowl: Math.hypot(tc.x[i] - tb.x[i], tc.y[i] - tb.y[i]) < rim,
      },
    };
  });

  /** At the last frame: which placement conditions the reference-first arrangement no longer meets. */
  const endFails = $derived.by(() => {
    if (!tlRF) return [] as Predicate[];
    const p = predicatesAt(tlRF, tlRF.n - 1);
    return PREDICATES.filter((k) => !p[k]);
  });
  const FAIL_LONG = $derived<Record<Predicate, string>>({
    relation: `the ${moverName} is no longer within the ${S.coneDeg}° cone behind the ${refName}`,
    support: `the ${moverName} is not supported by the table`,
    detached: `the gripper is touching the ${moverName}`,
  });
  const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
</script>

<div class="wo" {@attach autoplay(clock, () => !userPaused, 0.25)}>
  <div class="ctl">
    <div class="ctl-in">
      <div class="tp">
        <Transport {clock} t={play.t} playing={play.playing} dur={play.dur} onuser={(p) => (userPaused = !p)} />
      </div>
      <div class="jumps">
        <button type="button" class="jump" class:on={atSnap} onclick={() => jump(timeOfTick(snapTick, fps))}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2.5v11M6.5 8h7M10.5 5l3 3-3 3" /></svg>
          Jump to {sec(snapT)}
        </button>
        <button type="button" class="jump" class:on={done && !play.playing} onclick={() => jump(play.dur || n / fps)}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8h8M7.5 5l3 3-3 3M13.5 2.5v11" /></svg>
          Jump to the end
        </button>
      </div>
    </div>
  </div>

  <div class="two">
    {#each panels as p (p.f)}
      {@const live = liveState(p.tl, tick)}
      {@const c = chip(p.tl, p.ep)}
      {@const o = outcomeOf(p.ep)}
      <figure class="panel {p.f}">
        <div class="head">
          <div class="hin">
            <span class="form-pill {p.f}">{FORM_SHORT[p.f]}</span>
            <span class="fname">{FORM_NAME[p.f]}</span>
            <span class="live {live.cls}"><i></i>{live.text}</span>
          </div>
        </div>
        <p class="instr">“<Instruction prompt={goal.prompts[p.f]} {goal} />”</p>
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
            aria-label="Play or pause both rollouts"
          >
            <SyncVideo {clock} src={epFile(p.ep.id, 'top.mp4')} poster={epFile(p.ep.id, 'first.webp')} label="{FORM_NAME[p.f]} rollout, exterior camera" />
            {#if c}
              <span class="chip status {c.cls}" data-qa-overlay>{c.text}</span>
            {/if}
          </button>
          <div class="map">
            <Minimap tl={p.tl} tick={ftick} window={WIN} />
          </div>
        </div>
        </div>
        <div class="axis" aria-hidden="true"><span>← robot’s right</span><i></i><span>robot’s left →</span></div>
        <figcaption class="out"><span class="status {o}">{OUTCOME_LABEL[o]}</span> <span>{outcomeLine(p.ep)}</span></figcaption>
        <div class="lanes">
          <Lanes tl={p.tl} t={play.t} duration={play.dur} onseek={(x) => clock.seek(x)} stableAt={p.ep.se ? p.ep.tStableDone : null} />
        </div>
        <p class="facts">
          <span class="mv">{moverName}</span>: ended {cm(p.ep.disp)} from its start · <span class="rf">{refName}</span>: at most {cm(p.ep.refMax)}
          from its start
        </p>
      </figure>
    {/each}
  </div>

  <div class="readout">
    <Checks
      cols={[
        { key: 'tf', head: FORM_NAME.S, f: 'S', tl: tlTF, i: tick },
        { key: 'rf', head: FORM_NAME.I, f: 'I', tl: tlRF, i: tick },
      ]}
      {goal}
      caption="What the scorer reads at"
      at={sec(play.t)}
    />
    <div class="snapnote" class:active={atSnap || (done && !play.playing)} aria-live="polite">
      {#if atSnap && snap}
        <p class="lbl">The paper’s snapshot · <span class="t">{sec(snapT)}</span></p>
        <p>
          <b class="rfc">Reference-first</b> completes its first stable placement here.
          {#if snap.rf.grip === 'reference'}The gripper is holding the {refName}, carried {cm(snap.rf.bowlMoved)} from its start{#if snap.rf.bowlRaised > 0.02}{' '}and
              raised {cm(snap.rf.bowlRaised)}{/if}.{/if}
          The {moverName} has moved only {cm(snap.rf.cubeMoved)}.{#if snap.rf.p.goal && snap.rf.h.done}{' '}Measured from where the {refName} is now, it counts as
            behind it, and it rests on the table, clear of the gripper, still for {S.holdS}&nbsp;s: every check passes.{/if}
        </p>
        <p>
          <b class="tfc">Target-first</b> moved the {moverName} {cm(snap.tf.cubeMoved)}{snap.tf.inBowl ? ` and left it in the ${refName}` : ''}.
          {#if snap.tf.p.goal}The goal holds as well.{:else}{#if snap.tf.p.relation}The relation check passes, but{:else}The relation does not hold, and{/if}
            {list(PREDICATES.filter((k) => k !== 'relation' && !snap.tf.p[k]).map((k) => FAIL_LONG[k]))}, so nothing is credited.{/if}
        </p>
      {:else if done && !play.playing && tlRF}
        <p class="lbl">Last frame · <span class="t">{sec(play.dur)}</span></p>
        <p>
          <b class="rfc">Reference-first</b> no longer meets the placement conditions{#if endFails.length}: {list(endFails.map((k) => FAIL_LONG[k]))}{/if}. The
          end check needs them throughout the final second, so this rollout counts as placed at some point but not at the end.
        </p>
        <p><b class="tfc">Target-first</b> never reached a stable placement.</p>
      {:else}
        <p class="hint">
          Every row is read from simulator state at the current moment, as the lanes are. <b>Jump to {sec(snapT)}</b> stops both rollouts where the
          paper’s snapshot was taken.
        </p>
      {/if}
    </div>
  </div>
</div>

<style>
  .wo {
    container: wo / inline-size;
    margin-top: clamp(28px, 3.6vw, 44px);
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
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 34px;
    padding: 6px 14px 6px 11px;
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
    transition:
      border-color 0.2s,
      color 0.2s,
      background 0.2s;
  }

  .jump:hover {
    border-color: #6b7280;
  }

  .jump.on {
    color: var(--kept-2);
    border-color: color-mix(in srgb, var(--kept-2) 55%, transparent);
    background: rgb(111 211 154 / 8%);
  }

  .jump svg {
    flex: none;
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .two {
    display: grid;
    gap: 18px;
  }

  /* Side by side, the two panels share row tracks so their videos, outcomes and lanes line up. */
  @container wo (min-width: 50em) {
    .two {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: repeat(7, auto);
      gap: 0 20px;
    }
  }

  .panel {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 14px 14px 12px;
    border-radius: 18px;
    background: color-mix(in srgb, var(--stage-2) 88%, transparent);
    border: 1px solid var(--stage-rule);
    min-width: 0;
  }

  @container wo (min-width: 50em) {
    .panel {
      display: grid;
      grid-row: span 7;
      grid-template-rows: subgrid;
      row-gap: 0;
    }
  }

  .panel.S {
    box-shadow: inset 0 3px 0 -1px var(--tf-2);
  }

  .panel.I {
    box-shadow: inset 0 3px 0 -1px var(--rf-2);
  }

  .head {
    container-type: inline-size;
    min-width: 0;
  }

  .hin {
    display: flex;
    align-items: center;
    gap: 6px 10px;
    min-height: 26px;
  }

  @container (max-width: 384px) {
    .hin {
      display: grid;
      grid-template-columns: auto 1fr;
      justify-items: start;
    }

    .hin .live {
      grid-column: 1 / -1;
      margin-left: 0;
    }
  }

  .fname {
    font-weight: 600;
    font-size: 0.92rem;
  }

  .live {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-family: var(--mono);
    font-size: 0.7rem;
    letter-spacing: 0.02em;
    color: var(--stage-muted);
    border: 1px solid var(--stage-rule);
    border-radius: 999px;
    padding: 3px 10px 3px 8px;
    transition:
      color 0.3s,
      border-color 0.3s,
      background 0.3s;
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
    border-color: color-mix(in srgb, var(--mover-2) 45%, transparent);
  }

  .live.ref {
    color: var(--ref-2);
    border-color: color-mix(in srgb, var(--ref-2) 45%, transparent);
  }

  .live.lift {
    color: #b9c4ff;
    border-color: color-mix(in srgb, #b9c4ff 40%, transparent);
  }

  .live.goal,
  .live.stable {
    color: var(--kept-2);
    border-color: color-mix(in srgb, var(--kept-2) 50%, transparent);
    background: rgb(111 211 154 / 8%);
  }

  .live.other {
    color: var(--lost-2);
  }

  .instr {
    font-family: var(--serif);
    font-variation-settings: 'opsz' 18;
    font-size: clamp(0.98rem, 0.9rem + 0.25vw, 1.1rem);
    line-height: 1.5;
    color: #d5d9e0;
    margin: 8px 0 12px;
  }

  /* A subgrid cannot be a size container, so the video/map split queries this wrapper instead of the panel. */
  .mwrap {
    container: media / inline-size;
    min-width: 0;
  }

  .media {
    display: grid;
    gap: 10px;
  }

  @container media (min-width: 25em) {
    .media {
      grid-template-columns: minmax(0, 1.42fr) minmax(0, 1fr);
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

  .map {
    min-width: 0;
    aspect-ratio: 4 / 3;
  }

  @container media (min-width: 25em) {
    .map {
      aspect-ratio: auto;
    }
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
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, currentColor 45%, transparent),
      0 6px 20px rgb(0 0 0 / 45%);
    animation: pop 0.45s var(--ease);
    pointer-events: none;
  }

  .frame .chip.never {
    color: #dfe3ea;
  }

  @keyframes pop {
    from {
      opacity: 0;
      transform: translate(-50%, 6px) scale(0.96);
    }
  }

  .axis {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 7px;
    font-family: var(--mono);
    font-size: 0.66rem;
    line-height: 1.3;
    letter-spacing: 0.03em;
    color: var(--stage-muted);
    white-space: nowrap;
  }

  .axis i {
    flex: 1;
    height: 1px;
    min-width: 12px;
    background: var(--stage-rule);
  }

  .out {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 10px;
    align-items: baseline;
    align-content: start;
    padding: 12px 2px 0;
    font-size: 0.86rem;
    line-height: 1.45;
    color: #c3c8d0;
  }

  .out .status {
    flex: none;
  }

  .lanes {
    container-type: inline-size;
    padding: 12px 2px 0;
    min-width: 0;
  }

  .facts {
    margin: 10px 2px 0;
    font-size: 0.8rem;
    line-height: 1.45;
    color: var(--stage-muted);
  }

  .facts .mv {
    color: var(--mover-2);
  }

  .facts .rf {
    color: var(--ref-2);
  }

  .readout {
    container-type: inline-size;
    display: grid;
    gap: 18px 32px;
    margin-top: 22px;
    padding: 18px 18px 16px;
    border-radius: 16px;
    background: var(--stage-2);
    border: 1px solid var(--stage-rule);
  }

  @container wo (min-width: 50em) {
    .readout {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      align-items: start;
    }
  }

  .snapnote {
    min-width: 0;
    padding-left: 14px;
    border-left: 2px solid var(--stage-rule);
    transition: border-color 0.3s;
  }

  .snapnote.active {
    border-left-color: var(--kept-2);
  }

  .snapnote p {
    margin: 0 0 10px;
    font-size: 0.9rem;
    line-height: 1.55;
    color: #c9ced6;
  }

  .snapnote p:last-child {
    margin-bottom: 0;
  }

  .snapnote .lbl {
    color: var(--kept-2);
  }

  .snapnote .lbl .t {
    text-transform: none;
    letter-spacing: 0.04em;
  }

  .snapnote .hint {
    color: var(--stage-muted);
  }

  .snapnote .hint b {
    color: var(--stage-ink);
    font-weight: 600;
  }

  .rfc {
    color: var(--rf-2);
  }

  .tfc {
    color: var(--tf-2);
  }

  @media (prefers-reduced-motion: reduce) {
    .frame .chip.status {
      animation: none;
    }

    .live,
    .jump,
    .snapnote {
      transition: none;
    }
  }
</style>
