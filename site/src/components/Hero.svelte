<script lang="ts">
  import { onDestroy } from 'svelte';
  import { createClock, autoplay } from '../lib/clock.svelte';
  import { loadTimeline, type Timeline } from '../lib/timeline';
  import { liveState } from '../lib/live';
  import { epFile, TOP_ASPECT, type Episode } from '../lib/media';
  import { goalByKey, outcomeOf, STAGE_LABEL, MODEL_NAME, FORM_NAME, FORM_SHORT } from '../lib/study';
  import { SITE } from '../lib/site';
  import { fitHero } from '../lib/hero-fit';
  import Instruction from './Instruction.svelte';
  import Logos from './Logos.svelte';
  import Lanes from './Lanes.svelte';
  import SyncVideo from './SyncVideo.svelte';
  import Transport from './Transport.svelte';

  let { tf, rf, notes }: { tf: Episode; rf: Episode; notes: Record<'S' | 'I', string> } = $props();

  const goal = $derived(goalByKey(`${tf.s}-${tf.g}`));
  const panels = $derived([
    { f: 'S' as const, ep: tf },
    { f: 'I' as const, ep: rf },
  ]);

  const { clock, state: play, destroy } = createClock(2, 2600);
  onDestroy(destroy);
  let userPaused = $state(false);

  let tls = $state.raw<Record<string, Timeline>>({});
  $effect(() => {
    for (const e of [tf, rf]) loadTimeline(e.id).then((x) => (tls = { ...tls, [e.id]: x }));
  });

  function verdict(e: Episode) {
    const o = outcomeOf(e);
    if (o === 'kept') return { cls: 'kept', text: `Placed at ${e.tStable?.toFixed(1)}\u00a0s, kept to the end` };
    if (o === 'lost') return { cls: 'lost', text: `Placed at ${e.tStable?.toFixed(1)}\u00a0s, then lost` };
    return { cls: 'never', text: STAGE_LABEL[e.stage] ?? 'Never placed' };
  }

  const tick = (tl: Timeline | undefined) => (tl ? Math.min(tl.n - 1, Math.round(play.t * tl.fps)) : 0);
  const done = $derived(play.dur > 0 && play.t >= play.dur - 0.05);

  // Size both frames so they sit fully inside the first screen (see fitHero). details.astro runs the same function before
  // first paint; this keeps it right once fonts and instruction line breaks are final and as the window changes.
  let wrapEl: HTMLDivElement;
  $effect(() => {
    const el = wrapEl;
    let raf = 0;
    let lastW = innerWidth;
    let resized = false;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        fitHero(el, !resized);
        resized = false;
      });
    };
    const onResize = () => {
      // Ignore height-only changes on touch devices (URL bar show/hide).
      if (innerWidth === lastW && matchMedia('(pointer: coarse)').matches) return;
      lastW = innerWidth;
      resized = true;
      schedule();
    };
    schedule();
    document.fonts?.ready.then(schedule);
    addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', onResize);
    };
  });
</script>

<section class="hero dark" data-hero id="top" {@attach autoplay(clock, () => !userPaused, 0.15)}>
  <div class="glow" aria-hidden="true"></div>
  <div class="wrap" bind:this={wrapEl}>
    <header class="top">
      <div class="titles">
        <div class="venue">
          <span class="dot" aria-hidden="true"></span>
          <span>{SITE.venue} · <i>{SITE.workshop}</i></span>
        </div>
        <h1>Same Goal, <em>Different Words</em></h1>
        <p class="sub">{SITE.subtitleParts[0]} <span class="nw">{SITE.subtitleParts[1]}</span></p>
        {#if SITE.authors.length}
          <p class="authors">
            {#each SITE.authors as a, i}{i ? ', ' : ''}<span class="nw"
                >{#if a.url}<a href={a.url}>{a.name}</a>{:else}{a.name}{/if}<sup>{a.aff.join(',')}</sup></span
              >{/each}
          </p>
          <p class="affs">
            {#each SITE.affiliations as name, i}{i ? ' · ' : ''}<span class="nw"><sup>{i + 1}</sup>{name}</span>{/each}
          </p>
          <Logos />
        {/if}
      </div>
      <div class="intro">
        <p>
          Same model, same start, same goal. Only the wording changes. Naming the <span class="tok-ref">reference</span> before the
          <span class="tok-mover">object to move</span> lowers stable placement by <b class="num">12.2&nbsp;points</b> across three
          <span class="nw">world-action</span> models and 864&nbsp;rollouts.
        </p>
        <div class="ctas">
          {#if SITE.paper}<a class="btn primary" href={SITE.paper}>Paper</a>{/if}
          <a class="btn primary" href="#intro">Introduction <span aria-hidden="true">↓</span></a>
          <a class="btn" href={SITE.code}>
            <svg viewBox="0 0 16 16" aria-hidden="true"
              ><path
                fill="currentColor"
                d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.67.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 0Z"
              /></svg
            >
            Evaluation code
          </a>
        </div>
      </div>
    </header>

    <div class="stage">
      {#each panels as p (p.f)}
        {@const tl = tls[p.ep.id]}
        {@const live = liveState(tl ?? null, tick(tl))}
        {@const v = verdict(p.ep)}
        <figure class="panel {p.f}">
          <div class="head">
            <div class="hin">
              <span class="form-pill {p.f}">{FORM_SHORT[p.f]}</span>
              <span class="fname">{FORM_NAME[p.f]}</span>
              <span class="live {live.cls}" aria-live="off"><i></i>{live.text}</span>
            </div>
          </div>
          <p class="instr">“<Instruction prompt={goal.prompts[p.f]} {goal} />”</p>
          <button class="frame" data-qa-fold="(min-width: 1024px) and (min-height: 600px), (min-width: 601px) and (min-height: 900px)" style:aspect-ratio={TOP_ASPECT} onclick={() => {
              clock.toggle();
              userPaused = !clock.playing;
            }} aria-label="Play or pause both rollouts">
            <SyncVideo
              {clock}
              src={epFile(p.ep.id, 'top.mp4')}
              poster={epFile(p.ep.id, 'first.webp')}
              label="{FORM_NAME[p.f]} rollout, exterior camera"
              lazy={false}
            />
            {#if done}
              <span class="final status {v.cls}" data-qa-overlay>{v.text}</span>
            {/if}
          </button>
          <div class="axis" aria-hidden="true"><span>← robot’s right</span><i></i><span>robot’s left →</span></div>
          <figcaption>
            <p class="note-line"><span class="status {v.cls}">{v.cls === 'kept' ? 'Kept' : v.cls === 'lost' ? 'Lost' : 'Never placed'}</span> {notes[p.f]}</p>
            <Lanes
              tl={tl ?? null}
              t={play.t}
              duration={play.dur}
              onseek={(x) => clock.seek(x)}
              compact
              stableAt={p.ep.sf ? p.ep.tStableDone : null}
            />
          </figcaption>
        </figure>
      {/each}
    </div>

    <div class="foot">
      <Transport {clock} t={play.t} playing={play.playing} dur={play.dur} onuser={(p) => (userPaused = !p)} />
      <p class="caption">
        {MODEL_NAME[tf.m]}, start state {tf.c} of 8, played at 2×. Unedited simulator recordings from an exterior camera, cropped and
        rotated upright as in the paper. The camera faces the robot, so image left is the robot’s right. The lanes are scored from
        simulator state after the fact.
      </p>
    </div>
  </div>
</section>

<style>
  .hero {
    position: relative;
    overflow: hidden;
    overflow: clip;
    background: radial-gradient(1200px 600px at 75% -10%, #1b2030 0%, transparent 60%), var(--stage);
    color: var(--stage-ink);
    padding: 84px 0 44px;
  }

  .glow {
    position: absolute;
    inset: auto -20% -30% -20%;
    height: 70%;
    background: radial-gradient(45% 55% at 28% 50%, rgb(59 79 198 / 15%), transparent 70%),
      radial-gradient(45% 55% at 72% 50%, rgb(163 60 121 / 13%), transparent 70%);
    pointer-events: none;
  }

  .wrap {
    position: relative;
    width: min(1280px, 100% - 48px);
    /* Frame width that keeps both videos inside the first screen (refined in script); the stage and its footer hug the frames. */
    --fw: clamp(300px, (100svh - 406px) * 536 / 540, 600px);
    --stage-w: min(100%, calc(2 * var(--fw) + 2 * 30px + 20px));
  }

  .top {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
    gap: 48px;
    align-items: end;
    margin-bottom: 22px;
  }

  .venue {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    font-size: 0.78rem;
    color: var(--stage-muted);
    border: 1px solid var(--stage-rule);
    border-radius: 999px;
    padding: 4px 13px 4px 10px;
    margin-bottom: 12px;
  }

  .dot {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--kept-2);
    box-shadow: 0 0 0 4px rgb(111 211 154 / 16%);
  }

  h1 {
    /* One line on desktop: the title is 11.35em wide, sized to its column (5/9 of the wrap after the gap). */
    font-size: min(3.6rem, (min(1280px, 100vw - 48px) - 48px) * 5 / 9 / 11.8);
    font-weight: 450;
    line-height: 1.04;
    letter-spacing: -0.028em;
    font-variation-settings: 'opsz' 72;
    white-space: nowrap;
  }

  h1 em {
    font-style: italic;
    font-weight: 400;
    background: linear-gradient(92deg, var(--tf-2), var(--rf-2));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    padding-right: 0.06em;
  }

  /* The subtitle and instructions keep one optical size at every viewport. Automatic optical sizing changes
     Newsreader's letter widths by up to 5 % between 15 and 21 px, and a fixed size lets the metric-matched fallback
     (global.css) wrap them exactly as the web font will, so the frames below do not move when it arrives. */
  .sub {
    font-family: var(--serif);
    font-variation-settings: 'opsz' 18;
    font-size: clamp(1.05rem, 0.95rem + 0.4vw, 1.3rem);
    color: #c9ced6;
    margin: 10px 0 0;
  }

  .authors {
    margin: 12px 0 0;
    color: #dfe3e8;
    font-size: 0.98rem;
  }

  .affs {
    margin: 4px 0 0;
    color: var(--stage-muted);
    font-size: 0.8rem;
  }

  .authors sup,
  .affs sup {
    font-size: max(0.68em, 0.625rem);
    line-height: 0;
    margin: 0 1px;
    color: var(--stage-muted);
  }

  .intro p {
    color: #c3c8d0;
    font-size: 0.98rem;
    max-width: 34.07em; /* 54ch of Inter; em so the width does not change when the web font swaps in */
    margin-bottom: 14px;
  }

  .intro b {
    color: #fff;
    font-weight: 600;
  }

  .ctas {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .ctas .btn {
    background: transparent;
    color: var(--stage-ink);
    border-color: var(--stage-rule);
    padding-block: 7px;
  }

  .ctas .btn:hover {
    border-color: #6b7280;
    box-shadow: none;
  }

  .ctas .btn.primary {
    background: #fff;
    color: #0d0f13;
    border-color: #fff;
  }

  .stage {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 20px;
    row-gap: 0;
    width: var(--stage-w);
    margin-inline: auto;
  }

  .panel {
    display: grid;
    grid-row: span 5;
    grid-template-rows: subgrid;
    align-content: start;
    margin: 0;
    padding: 14px 14px 12px;
    border-radius: 18px;
    background: color-mix(in srgb, var(--stage-2) 88%, transparent);
    border: 1px solid var(--stage-rule);
    min-width: 0;
  }

  .panel.S {
    box-shadow: inset 0 3px 0 -1px var(--tf-2);
  }

  .panel.I {
    box-shadow: inset 0 3px 0 -1px var(--rf-2);
  }

  /* The status pill changes length while the video plays. Where the longest one would not fit beside the name, it gets
     its own row, so the head never re-wraps mid-playback. */
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
    transition: color 0.3s, border-color 0.3s, background 0.3s;
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

  .frame {
    position: relative;
    display: block;
    width: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 12px;
    overflow: hidden;
    cursor: pointer;
    background: #000;
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

  .final {
    position: absolute;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    max-width: calc(100% - 24px);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    box-shadow: 0 6px 20px rgb(0 0 0 / 45%);
    animation: pop 0.5s var(--ease);
    pointer-events: none;
  }

  @keyframes pop {
    from {
      opacity: 0;
      transform: translate(-50%, 6px) scale(0.96);
    }
  }

  figcaption {
    container-type: inline-size;
    padding: 10px 2px 0;
  }

  .note-line {
    font-size: 0.86rem;
    color: #c3c8d0;
    margin: 0 0 10px;
    display: flex;
    gap: 10px;
    align-items: baseline;
  }

  .note-line .status {
    flex: none;
  }

  /* Beside the pill, a narrow caption would wrap every few words; stack them instead. */
  @container (max-width: 360px) {
    .note-line {
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
    }
  }

  .foot {
    container-type: inline-size;
    display: flex;
    align-items: center;
    gap: 12px 24px;
    width: var(--stage-w);
    margin: 18px auto 0;
    flex-wrap: wrap;
  }

  .foot .caption {
    margin: 0;
    flex: 1 1 380px;
  }

  /* Wide but short screens: the title block sits beside the rollouts so the frames can still fit the first screen.
     fitHero sets data-split and caps --fw so the title column keeps 31 % of the wrap, between 300 and 400 px. */
  .wrap:global([data-split]) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--stage-w);
    grid-template-rows: auto 1fr;
    column-gap: 40px;
    align-items: start;
  }

  .wrap:global([data-split]) .top {
    grid-row: 1 / span 2;
    grid-template-columns: minmax(0, 1fr);
    gap: 22px;
    margin: 0;
  }

  .wrap:global([data-split]) .titles {
    container-type: inline-size;
  }

  .wrap:global([data-split]) h1 {
    /* Two lines; the longer one, "Different Words", is 6.35em wide. */
    font-size: min(3.4rem, 100cqi / 6.6);
    white-space: normal;
  }

  .wrap:global([data-split]) .stage,
  .wrap:global([data-split]) .foot {
    grid-column: 2;
  }

  .wrap:global([data-split]) .foot {
    grid-row: 2;
  }

  /* The venue line is 370 px as a pill; in a narrower title column it wraps as plain text instead. */
  @container (max-width: 380px) {
    .venue {
      border: 0;
      padding: 0;
      border-radius: 0;
      align-items: baseline;
    }

    .venue .dot {
      transform: translateY(-1px);
    }
  }

  @media (max-width: 960px) {
    .top {
      grid-template-columns: 1fr;
      gap: 14px;
    }

    h1 {
      font-size: min(3.2rem, (100vw - 48px) / 11.8);
    }
  }

  @media (max-width: 600px) {
    h1 {
      font-size: clamp(2.2rem, 9.6vw, 2.8rem);
      white-space: normal;
      text-wrap: balance;
    }

    .venue {
      border: 0;
      padding: 0;
      border-radius: 0;
      align-items: baseline;
      font-size: 0.76rem;
    }

    .venue .dot {
      transform: translateY(-1px);
    }

    .stage {
      grid-template-columns: 1fr;
      row-gap: 16px;
    }

    .panel {
      display: block;
    }
  }
</style>
