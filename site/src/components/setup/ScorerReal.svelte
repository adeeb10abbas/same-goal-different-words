<script lang="ts">
  import { onDestroy } from 'svelte';
  import { createClock, autoplay } from '../../lib/clock.svelte';
  import { loadTimeline, inRuns, type Runs, type Timeline } from '../../lib/timeline';
  import { liveState } from '../../lib/live';
  import { epFile, TOP_ASPECT, type Episode } from '../../lib/media';
  import { FORM_NAME, FORM_SHORT, MODEL_SHORT, goalByKey, study } from '../../lib/study';
  import { holdAt, sec, timeOfTick } from '../../lib/failures';
  import Instruction from '../Instruction.svelte';
  import Minimap from '../Minimap.svelte';
  import SyncVideo from '../SyncVideo.svelte';
  import Transport from '../Transport.svelte';

  /** The toy's checklist applied to one real rollout: the scorer's lanes from the logged simulator state, synced to the
   *  exterior camera and the top-down plan. */
  let { ep }: { ep: Episode } = $props();

  const S = study.settings.scoring;
  const uid = $props.id();
  const goal = $derived(goalByKey(`${ep.s}-${ep.g}`));
  const { clock, state: play, destroy } = createClock(1, 1500);
  onDestroy(destroy);
  let userPaused = $state(false);

  let tl = $state.raw<Timeline | null>(null);
  let failed = $state(false);
  $effect(() => {
    loadTimeline(ep.id).then(
      (x) => (tl = x),
      () => (failed = true),
    );
  });

  const fps = $derived(tl?.fps ?? study.settings.hz);
  const n = $derived(tl?.n ?? ep.n);
  const dur = $derived(play.dur || (n - 1) / fps);
  const tick = $derived(Math.min(n - 1, Math.max(0, Math.round(play.t * fps))));
  const live = $derived(liveState(tl, tick));

  /** Target speed as the scorer computes it: backward difference of the logged positions at the logging rate. */
  const speed = $derived.by(() => {
    if (!tl) return null;
    const o = tl.objects.find((x) => x.role === 'mover')!;
    const v = new Float32Array(tl.n);
    for (let i = 1; i < tl.n; i++) v[i] = Math.hypot(o.x[i] - o.x[i - 1], o.y[i] - o.y[i - 1], o.z[i] - o.z[i - 1]) * tl.fps * 100;
    return v;
  });

  function runsOf(len: number, on: (i: number) => boolean): Runs {
    const out: Runs = [];
    let a = -1;
    for (let i = 0; i <= len; i++) {
      const v = i < len && on(i);
      if (v && a < 0) a = i;
      if (!v && a >= 0) {
        out.push([a, i - 1]);
        a = -1;
      }
    }
    return out;
  }

  const need = $derived(Math.round(S.holdS * fps));
  /** First tick at which a stable run has lasted the full hold: the any-time credit. */
  const credit = $derived.by(() => {
    if (!tl) return ep.tStableDone != null ? Math.round(ep.tStableDone * fps) : null;
    const run = tl.flags.stable.find(([a, b]) => b - a >= need);
    return run ? run[0] + need : null;
  });

  type Key = 'relation' | 'support' | 'released' | 'slow';
  const REL_WORD: Record<string, string> = { L: 'left of', R: 'right of', F: 'in front of', B: 'behind', supported_on: 'on top of', stacked_in: 'in' };
  const DIR_WORD: Record<string, string> = { L: 'left', R: 'right', F: 'front', B: 'back' };
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const onTop = $derived(goal.relation === 'supported_on');
  const surfaceName = $derived(onTop ? `the ${goal.referenceName}` : 'the table');
  const LANES = $derived.by(() => {
    if (!tl || !speed) return [];
    const sp = speed;
    const rw = REL_WORD[goal.relation];
    return [
      {
        key: 'relation' as Key,
        label: rw ? `${cap(goal.moverName)} ${rw} the ${goal.referenceName}` : goal.label,
        lane: rw ? `${cap(rw)} the ${goal.referenceName}` : 'Relation',
        short: 'Relation',
        runs: tl.flags.relation,
      },
      { key: 'support' as Key, label: `Supported by ${surfaceName}`, lane: `Supported by ${surfaceName}`, short: 'Supported', runs: tl.flags.support },
      { key: 'released' as Key, label: 'Clear of the gripper', lane: 'Clear of the gripper', short: 'Released', runs: tl.flags.detached },
      {
        key: 'slow' as Key,
        label: `Slower than ${S.speedCmS}\u00a0cm/s`,
        lane: `Slower than ${S.speedCmS}\u00a0cm/s`,
        short: 'Slow',
        runs: runsOf(tl.n, (i) => sp[i] < S.speedCmS),
      },
    ];
  });
  /** All four at once, split into the accumulating first second and the credited remainder. */
  const holdRuns = $derived.by(() => {
    if (!tl) return { building: [] as Runs, held: [] as Runs };
    const building: Runs = [];
    const held: Runs = [];
    for (const [a, b] of tl.flags.stable) {
      building.push([a, Math.min(b, a + need - 1)]);
      if (b >= a + need) held.push([a + need, b]);
    }
    return { building, held };
  });

  const now = $derived.by(() => {
    if (!tl || !speed) return null;
    const ok = {
      relation: inRuns(tl.flags.relation, tick),
      support: inRuns(tl.flags.support, tick),
      released: inRuns(tl.flags.detached, tick),
      slow: speed[tick] < S.speedCmS,
    };
    return { ok, h: holdAt(tl, tick), speed: speed[tick] };
  });
  const credited = $derived(credit != null && tick >= credit);
  const hint = $derived.by(() => {
    const ok = now?.ok;
    const lifted = tl ? inRuns(tl.flags.lift, tick) : false;
    return {
      relation: onTop
        ? `its centre over the ${goal.referenceName}’s footprint, give or take ${S.footprintCm}\u00a0cm`
        : `its origin within ${S.coneDeg}° of the robot’s ${DIR_WORD[goal.relation] ?? 'side'}`,
      support: ok?.support ? `now: resting on ${surfaceName}` : lifted ? 'now: lifted' : `now: not resting on ${surfaceName}`,
      released: ok?.released ? 'now: released' : 'now: touching the gripper',
      slow: `now: ${(now?.speed ?? 0).toFixed(1)}\u00a0cm/s`,
    } satisfies Record<Key, string>;
  });
  const flash = $derived(credit != null && tick >= credit && tick < credit + 2 * fps);

  const firstOf = (runs: Runs | undefined) => (runs && runs.length ? runs[0][0] : null);
  const relT = $derived(tl ? firstOf(tl.flags.relation) : null);
  const goalT = $derived(tl ? firstOf(tl.flags.goal) : null);
  const carriedAtRel = $derived(tl != null && relT != null && inRuns(tl.flags.grip_mover, relT));
  const tt = (i: number) => sec(timeOfTick(i, fps));

  function jump(i: number) {
    clock.pause();
    clock.seek(timeOfTick(i, fps));
    userPaused = true;
  }

  // Scrubbing on the lanes.
  let box: HTMLDivElement;
  let dragging = false;
  function seekAt(e: PointerEvent) {
    const r = box.getBoundingClientRect();
    clock.seek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * dur);
  }
  const STEP: Record<string, (t: number) => number> = {
    ArrowRight: (t) => t + 1 / fps,
    ArrowUp: (t) => t + 1,
    ArrowLeft: (t) => t - 1 / fps,
    ArrowDown: (t) => t - 1,
    PageUp: (t) => t + dur / 10,
    PageDown: (t) => t - dur / 10,
    Home: () => 0,
    End: () => dur,
  };
  function onkeydown(e: KeyboardEvent) {
    const f = STEP[e.key];
    if (!f || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    clock.pause();
    userPaused = true;
    clock.seek(Math.min(dur, Math.max(0, f(play.t))));
  }
  const x = (i: number) => `${(100 * i) / Math.max(1, n - 1)}%`;
  const RING = 2 * Math.PI * 30;
  const ASPECT = (([w, h]) => w / h)(TOP_ASPECT.split('/').map(Number));
</script>

<figure class="fig sr" aria-labelledby="{uid}-cap" {@attach autoplay(clock, () => !userPaused, 0.25)}>
  <div class="head">
    <span class="form-pill {ep.f}">{FORM_SHORT[ep.f]}</span>
    <span class="fname">{MODEL_SHORT[ep.m]} · {FORM_NAME[ep.f]}</span>
    <span class="live {live.cls}"><i></i>{live.text}</span>
  </div>
  <p class="instr">“<Instruction prompt={goal.prompts[ep.f]} {goal} />”</p>

  <div class="ctl">
    <div class="tp">
      <Transport {clock} t={play.t} playing={play.playing} dur={play.dur} dark={false} onuser={(p) => (userPaused = !p)} />
    </div>
    <button type="button" class="jump" class:on={credit != null && tick === credit} disabled={credit == null} onclick={() => credit != null && jump(credit)}
      >Jump to the credit</button
    >
  </div>

  <div class="grid">
    <div class="video">
      <button
        type="button"
        class="frame"
        style:aspect-ratio={TOP_ASPECT}
        style:width="min(100%, calc((100svh - 120px) * {ASPECT}))"
        onclick={() => {
          clock.toggle();
          userPaused = !clock.playing;
        }}
        aria-label="Play or pause the rollout"
      >
        <SyncVideo {clock} src={epFile(ep.id, 'top.mp4')} poster={epFile(ep.id, 'first.webp')} label="Rollout from the exterior camera, robot at the top" />
        {#if flash}
          <span class="chip" data-qa-overlay>Stable placement credited</span>
        {/if}
      </button>
      <div class="axis" aria-hidden="true"><span>← robot’s right</span><i></i><span>robot’s left →</span></div>
    </div>
    <div class="map">
      <div class="mapbox"><Minimap {tl} tick={Math.min(n - 1, Math.max(0, play.t * fps))} dark={false} /></div>
      <div class="axis" aria-hidden="true"><span>From above</span><i></i><span>same frame</span></div>
    </div>

    <div class="panel">
      <span class="lbl">The scorer at <span class="t num">{sec(play.t)}</span></span>
      <ol class="checks" aria-label="Scorer checks at the current time">
        {#each LANES as l (l.key)}
          {@const ok = now?.ok[l.key] ?? false}
          <li class:ok>
            <span class="ck" aria-hidden="true"
              ><svg viewBox="0 0 12 12">
                {#if ok}<path d="M2.5 6.4 5 8.8 9.6 3.6" />{:else}<path d="M3.4 3.4 8.6 8.6M8.6 3.4 3.4 8.6" />{/if}
              </svg></span
            >
            <span class="txt"
              ><span class="l">{l.label}<span class="sr-only">: {ok ? 'yes' : 'no'}</span></span><span class="h">{hint[l.key]}</span></span
            >
          </li>
        {:else}
          <li class="wait">{failed ? 'The simulator log could not be loaded.' : 'Loading the simulator log…'}</li>
        {/each}
      </ol>
      <div class="hold" class:done={now?.h.done}>
        <svg class="ring" viewBox="0 0 72 72" aria-hidden="true">
          <circle class="track" cx="36" cy="36" r="30" />
          <circle class="fill" cx="36" cy="36" r="30" stroke-dasharray={RING} stroke-dashoffset={RING * (1 - (now ? now.h.held / now.h.need : 0))} />
          {#if now?.h.done}
            <path class="tick" d="M25 37.5 32.5 45 47.5 29" />
          {:else}
            <text x="36" y="40.5" text-anchor="middle" class="sec">{(now?.h.held ?? 0).toFixed(1)}</text>
          {/if}
        </svg>
        <div class="htxt">
          <span class="lbl">All four, held {S.holdS === 1 ? 'one' : S.holdS} second{S.holdS === 1 ? '' : 's'}</span>
          <span class="st"
            >{now?.h.done ? 'Stable placement' : now && now.h.held > 0 ? 'Holding…' : credited ? 'Credited earlier' : 'Not yet'}</span
          >
          {#if credited && credit != null}<span class="h">Any-time credit at {sec(timeOfTick(credit, fps))}</span>{/if}
        </div>
      </div>
    </div>

    <div class="lanes">
      <div class="labels" aria-hidden="true">
        {#each LANES as l (l.key)}<div class="lab"><span class="long">{l.lane}</span><span class="short">{l.short}</span></div>{/each}
        {#if LANES.length}<div class="lab all">
            <span class="long">All four, held {S.holdS}&nbsp;s</span><span class="short">Held {S.holdS}&nbsp;s</span>
          </div>{/if}
      </div>
      <div
        class="track"
        bind:this={box}
        role="slider"
        tabindex="0"
        aria-label="Episode time"
        aria-valuemin={0}
        aria-valuemax={Math.round(dur)}
        aria-valuenow={Math.round(play.t)}
        aria-valuetext="{play.t.toFixed(1)} of {dur.toFixed(1)} seconds"
        onpointerdown={(e) => {
          dragging = true;
          clock.pause();
          userPaused = true;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          seekAt(e);
        }}
        onpointermove={(e) => dragging && seekAt(e)}
        onpointerup={() => (dragging = false)}
        onpointercancel={() => (dragging = false)}
        {onkeydown}
      >
        {#each LANES as l (l.key)}
          <div class="lane" class:on={now?.ok[l.key]}>
            {#each l.runs as [a, b]}<i style:left={x(a)} style:width="calc({x(b + 1)} - {x(a)})"></i>{/each}
          </div>
        {/each}
        {#if LANES.length}
          <div class="lane all">
            {#each holdRuns.building as [a, b]}<i class="b" style:left={x(a)} style:width="calc({x(b + 1)} - {x(a)})"></i>{/each}
            {#each holdRuns.held as [a, b]}<i style:left={x(a)} style:width="calc({x(b + 1)} - {x(a)})"></i>{/each}
          </div>
        {/if}
        {#if credit != null && LANES.length}
          <div class="cline" style:left={x(credit)} aria-hidden="true"></div>
          <div class="mark" data-qa-overlay style:left={x(credit)} title="Stable placement credited at {sec(timeOfTick(credit, fps))}">
            <svg viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="7" /><path d="M4 7.3 6.1 9.4 10 5.2" /></svg>
          </div>
        {/if}
        <div class="headline" style:left="{Math.min(100, (100 * play.t) / Math.max(dur, 1e-6))}%"></div>
      </div>
      <div class="ticks num" aria-hidden="true"><span>0&nbsp;s</span><span>{dur.toFixed(0)}&nbsp;s</span></div>
    </div>
  </div>

  <figcaption id="{uid}-cap" class="cap">
    {#if tl && relT != null && goalT != null && credit != null}
      {#if relT < goalT}
        The relation already holds at {tt(relT)}{carriedAtRel ? `, while the gripper still carries the ${goal.moverName}` : ''}, but the goal
        is met only at {tt(goalT)}, with the {goal.moverName} resting on {surfaceName} and released.
      {:else}
        The goal is first met at {tt(goalT)}.
      {/if}
      After {S.holdS}&nbsp;s of that, slow and unbroken, the scorer credits a stable placement at {tt(credit)}. Later breaks reset the
      timer, but the any-time outcome keeps the first credit; {ep.sf
        ? 'the checks also hold through the final second, so the episode-end outcome passes too.'
        : 'the checks do not hold through the final second, so the episode-end outcome fails.'}
    {:else}
      The same checks, read from the logged simulator state of one rollout. Drag along the lanes, or focus them and use the arrow keys, to scrub.
    {/if}
  </figcaption>
</figure>

<style>
  .sr {
    container: sr / inline-size;
    margin: clamp(18px, 2.4vw, 26px) 0 0;
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 10px;
  }

  .fname {
    font-weight: 600;
    color: var(--ink);
  }

  .live {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-family: var(--mono);
    font-size: 0.72rem;
    color: var(--muted);
    border: 1px solid var(--rule-2);
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

  .live.mover,
  .live.lift {
    color: var(--mover-ink);
  }

  .live.ref,
  .live.other {
    color: var(--ref-ink);
  }

  .live.goal,
  .live.stable {
    color: var(--kept);
  }

  .instr {
    margin: 8px 0 14px;
    font-size: 0.98rem;
    line-height: 1.5;
    color: var(--ink-2);
  }

  .ctl {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 16px;
    margin-bottom: 14px;
  }

  .tp {
    container-type: inline-size;
    flex: 1 1 260px;
    min-width: 0;
  }

  .tp :global(.of) {
    color: var(--muted);
  }

  .jump {
    min-height: 34px;
    padding: 6px 14px;
    border-radius: 999px;
    border: 1px solid var(--rule-2);
    background: var(--card);
    color: var(--ink);
    font-size: 0.84rem;
    font-weight: 500;
    line-height: 1.2;
    white-space: nowrap;
    cursor: pointer;
  }

  .jump:hover {
    border-color: var(--ink-2);
  }

  .jump.on {
    color: var(--kept);
    border-color: color-mix(in srgb, var(--kept) 60%, transparent);
  }

  .jump:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .grid {
    display: grid;
    gap: 16px 20px;
    grid-template-areas: 'video' 'map' 'lanes' 'panel';
  }

  @container sr (min-width: 34em) {
    .grid {
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
      grid-template-areas: 'video map' 'lanes lanes' 'panel panel';
    }
  }

  @container sr (min-width: 50em) {
    .grid {
      grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.9fr) minmax(0, 1fr);
      grid-template-areas: 'video map panel' 'lanes lanes lanes';
    }
  }

  .video {
    grid-area: video;
    min-width: 0;
  }

  .map {
    grid-area: map;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .mapbox {
    aspect-ratio: 4 / 3;
    min-height: 0;
  }

  @container sr (min-width: 34em) {
    .mapbox {
      aspect-ratio: auto;
      flex: 1;
    }
  }

  .panel {
    grid-area: panel;
    min-width: 0;
    display: grid;
    gap: 12px;
    align-content: start;
  }

  .lanes {
    grid-area: lanes;
    container: srl / inline-size;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    column-gap: 12px;
    min-width: 0;
    --row: 22px;
    --lane-h: 10px;
    user-select: none;
  }

  .frame {
    position: relative;
    display: block;
    width: 100%;
    margin: 0 auto;
    padding: 0;
    border: 0;
    border-radius: 12px;
    overflow: hidden;
    cursor: pointer;
    background: #000;
  }

  .chip {
    position: absolute;
    left: 50%;
    bottom: 10px;
    transform: translateX(-50%);
    max-width: calc(100% - 20px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 4px 11px;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--kept-2);
    background: rgb(13 15 19 / 86%);
    pointer-events: none;
    animation: rise 0.35s var(--ease) both;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translate(-50%, 6px);
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
    color: var(--muted);
    white-space: nowrap;
  }

  .axis i {
    flex: 1;
    height: 1px;
    min-width: 12px;
    background: var(--rule-2);
  }

  .lbl .t {
    text-transform: none;
    color: var(--ink);
  }

  .checks {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }

  @container sr (min-width: 34em) and (max-width: 49.99em) {
    .checks {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .checks li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 10px;
    align-items: start;
    padding: 7px 10px;
    border-radius: 10px;
  }

  .checks li.ok {
    background: color-mix(in srgb, var(--kept) 9%, transparent);
  }

  .checks li.wait {
    display: block;
    color: var(--muted);
    font-size: 0.86rem;
  }

  .ck svg {
    width: 20px;
    height: 20px;
    padding: 3px;
    margin-top: 1px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--ink) 7%, transparent);
    fill: none;
    stroke: var(--muted);
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  li.ok .ck svg {
    background: var(--kept);
    stroke: #fff;
  }

  .txt {
    display: grid;
    min-width: 0;
  }

  .l {
    font-size: 0.9rem;
    font-weight: 550;
    line-height: 1.35;
    color: var(--ink);
  }

  .h {
    font-size: 0.76rem;
    line-height: 1.4;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .hold {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--paper);
    border: 1px solid var(--rule);
  }

  .hold.done {
    border-color: color-mix(in srgb, var(--kept) 55%, transparent);
    background: color-mix(in srgb, var(--kept) 8%, var(--paper));
  }

  .ring {
    flex: none;
    width: 56px;
    height: 56px;
    transform: rotate(-90deg);
  }

  .ring .track {
    fill: none;
    stroke: color-mix(in srgb, var(--ink) 9%, transparent);
    stroke-width: 6;
  }

  .ring .fill {
    fill: none;
    stroke: var(--kept);
    stroke-width: 6;
    stroke-linecap: round;
  }

  .ring .sec,
  .ring .tick {
    transform: rotate(90deg);
    transform-origin: 36px 36px;
  }

  .ring .sec {
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 600;
    fill: var(--ink-2);
  }

  .ring .tick {
    fill: none;
    stroke: var(--kept);
    stroke-width: 4.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .htxt {
    display: grid;
    gap: 1px;
    min-width: 0;
  }

  .st {
    font-size: 0.95rem;
    font-weight: 600;
    line-height: 1.35;
    color: var(--ink-2);
  }

  .hold.done .st {
    color: var(--kept);
    font-family: var(--serif);
    font-size: 1.15rem;
    font-weight: 500;
  }

  .labels {
    display: grid;
    grid-auto-rows: var(--row);
  }

  .lab {
    line-height: var(--row);
    font-size: 0.74rem;
    color: var(--muted);
    white-space: nowrap;
    text-align: right;
  }

  .lab.all {
    color: var(--kept);
    font-weight: 600;
  }

  .lab .short {
    display: none;
  }

  @container srl (max-width: 34em) {
    .lab .long {
      display: none;
    }

    .lab .short {
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
    border-radius: 4px;
  }

  .lane {
    position: relative;
    height: var(--lane-h);
    border-radius: 2px;
    background: rgb(127 127 127 / 14%);
    overflow: hidden;
  }

  .lane i {
    position: absolute;
    top: 0;
    bottom: 0;
    background: #8c94a3;
  }

  .lane.all i {
    background: var(--kept);
  }

  .lane.all i.b {
    background: color-mix(in srgb, var(--kept) 38%, transparent);
  }

  .cline {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 0;
    border-left: 1px dashed color-mix(in srgb, var(--kept) 70%, transparent);
    pointer-events: none;
  }

  .mark {
    position: absolute;
    bottom: calc((var(--row) - 14px) / 2);
    transform: translateX(-50%);
  }

  .mark svg {
    display: block;
    width: 14px;
    height: 14px;
  }

  .mark circle {
    fill: var(--kept);
  }

  .mark path {
    fill: none;
    stroke: #fff;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .headline {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 2px;
    margin-left: -1px;
    background: var(--ink);
    border-radius: 2px;
    pointer-events: none;
  }

  .ticks {
    grid-column: 2;
    display: flex;
    justify-content: space-between;
    margin-top: 2px;
    font-family: var(--mono);
    font-size: 0.66rem;
    color: var(--muted);
  }

  .cap {
    margin-top: 16px;
    font-size: 0.84rem;
    line-height: 1.55;
    color: var(--muted);
    max-width: 52em;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .chip {
      animation: none;
    }
  }
</style>
