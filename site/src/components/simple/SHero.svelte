<script lang="ts">
  import { onDestroy } from 'svelte';
  import { scale } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { createClock, autoplay } from '../../lib/clock.svelte';
  import { epFile, type Crop, type Episode } from '../../lib/media';
  import { goalByKey, outcomeOf, MODEL_NAME, FORM_NAME, FORM_SHORT, type Outcome } from '../../lib/study';
  import { SITE } from '../../lib/site';
  import { splitPair } from '../../lib/split';
  import { GH_PATH } from './icons';
  import Instruction from '../Instruction.svelte';
  import SyncVideo from '../SyncVideo.svelte';
  import Logos from '../Logos.svelte';

  let { tf, rf }: { tf: Episode; rf: Episode } = $props();

  /** Robot, both objects and the tabletop from the exterior camera, in source pixels. */
  const CROP: Crop = [40, 110, 456, 348, 536, 540];
  const goal = $derived(goalByKey(`${tf.s}-${tf.g}`));
  const words = $derived(splitPair(goal.prompts.S, goal.prompts.I));

  const { clock, state: play, destroy } = createClock(2, 2600);
  onDestroy(destroy);
  let userPaused = $state(false);

  const VERDICT: Record<Outcome, string> = {
    kept: 'Placed, and kept to the end',
    lost: 'Placed, then lost',
    never: 'Never placed',
  };
  const panels = $derived(
    [
      { f: 'S' as const, ep: tf, clause: words.S },
      { f: 'I' as const, ep: rf, clause: words.I },
    ].map((p) => ({ ...p, o: outcomeOf(p.ep), at: p.ep.tStable ?? Infinity })),
  );
  const ended = $derived(play.dur > 0 && play.t >= play.dur - 0.05);
  const frac = $derived(play.dur ? Math.min(1, play.t / play.dur) : 0);

  function toggle() {
    clock.toggle();
    userPaused = !clock.playing;
  }
</script>

<section class="sh dark" data-hero id="top" {@attach autoplay(clock, () => !userPaused, 0.15)}>
  <div class="glow" aria-hidden="true"></div>
  <div class="wrap sh-in">
    <header class="sh-t">
      <div class="venue">
        <span class="dot" aria-hidden="true"></span>
        <span>{SITE.venue} · <i>{SITE.workshop}</i></span>
      </div>
      <h1>Same Goal, <em>Different Words</em></h1>
      <p class="subt">{SITE.subtitleParts[0]} <span class="nw">{SITE.subtitleParts[1]}</span></p>
      <p class="hook">Same model, same start, same goal. <span class="nw">Only the word order changes.</span></p>
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
      <div class="ctas">
        {#if SITE.paper}<a class="btn primary" href={SITE.paper}>Paper</a>{/if}
        <a class="btn primary" href="#question">The findings <span aria-hidden="true">↓</span></a>
        <a class="btn" href={SITE.code}><svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d={GH_PATH} /></svg>Code</a>
      </div>
    </header>

    <div class="duel">
      <p class="prefix">“<Instruction prompt={words.prefix} {goal} /> …</p>
      <div class="pair">
        {#each panels as p (p.f)}
          <figure class="side {p.f}">
            <p class="clause">
              <span class="form-pill {p.f}">{FORM_SHORT[p.f]}</span>
              <span class="q">…&#8202;<Instruction prompt={p.clause} {goal} />”</span>
            </p>
            <button
              class="frame"
              type="button"
              onclick={toggle}
              aria-label={play.playing ? 'Pause both rollouts' : 'Play both rollouts'}
            >
              <SyncVideo
                {clock}
                src={epFile(p.ep.id, 'top_hq.mp4')}
                poster={epFile(p.ep.id, 'first_hq.webp')}
                label="{FORM_NAME[p.f]} rollout, exterior camera"
                lazy={false}
                crop={CROP}
              />
              <span class="bar" aria-hidden="true"><i style:transform="scaleX({frac})"></i></span>
              {#if ended || play.t >= p.at}
                <span class="verdict {p.o}" data-qa-overlay transition:scale={{ start: 0.85, duration: 380, easing: backOut }}>
                  <span class="ic" aria-hidden="true">{p.o === 'never' ? '✕' : '✓'}</span>{VERDICT[p.o]}
                </span>
              {/if}
            </button>
            <figcaption class="sr-only">{FORM_NAME[p.f]}: {VERDICT[p.o]}.</figcaption>
          </figure>
        {/each}
      </div>
      <p class="cap">
        {MODEL_NAME[tf.m]} from one saved start, once per wording, at 2× speed. Re-rendered in high quality from each rollout’s logged
        states, with in-between frames interpolated. The camera faces the robot, so image left is the robot’s right.
      </p>
    </div>
  </div>
</section>

<style>
  .sh {
    position: relative;
    overflow: hidden;
    overflow: clip;
    min-height: min(100svh, 980px);
    display: flex;
    align-items: center;
    background: radial-gradient(1200px 640px at 78% -12%, #1c2232 0%, transparent 60%), var(--stage);
    color: var(--stage-ink);
    padding: 88px 0 48px;
  }

  .glow {
    position: absolute;
    inset: auto -20% -35% -20%;
    height: 70%;
    background: radial-gradient(40% 55% at 58% 50%, rgb(59 79 198 / 16%), transparent 70%),
      radial-gradient(40% 55% at 84% 50%, rgb(163 60 121 / 14%), transparent 70%);
    pointer-events: none;
  }

  .sh-in {
    position: relative;
    width: min(1320px, 100% - 48px);
    display: grid;
    grid-template-columns: minmax(330px, 0.92fr) minmax(0, 2fr);
    gap: clamp(36px, 4.4vw, 72px);
    align-items: center;
  }

  .venue {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-family: var(--mono);
    font-size: 0.72rem;
    letter-spacing: 0.06em;
    color: var(--stage-muted);
  }

  .venue i {
    font-style: normal;
    color: #d5d9e0;
  }

  .dot {
    width: 7px;
    height: 7px;
    flex: none;
    border-radius: 50%;
    background: var(--kept-2);
    box-shadow: 0 0 0 4px rgb(111 211 154 / 16%);
  }

  h1 {
    margin-top: 18px;
    font-size: clamp(2.6rem, 1.15rem + 2.75vw, 4.15rem);
    line-height: 0.98;
    letter-spacing: -0.03em;
  }

  h1 em {
    display: block;
    font-style: italic;
    font-weight: 400;
    color: #fff;
  }

  .subt {
    margin: 14px 0 0;
    font-size: clamp(1rem, 0.94rem + 0.2vw, 1.12rem);
    color: #c9ced6;
    line-height: 1.4;
  }

  .hook {
    margin: 22px 0 0;
    font-family: var(--serif);
    font-size: clamp(1.15rem, 1.05rem + 0.35vw, 1.34rem);
    line-height: 1.4;
    color: #dfe3ea;
    max-width: 21em;
  }

  .authors {
    margin: 24px 0 0;
    font-size: 0.88rem;
    color: #d5d9e0;
    line-height: 1.5;
  }

  .affs {
    margin: 4px 0 0;
    font-size: 0.76rem;
    color: var(--stage-muted);
    line-height: 1.5;
  }

  sup {
    font-size: max(10px, 0.68em);
    margin-left: 1px;
    color: var(--stage-muted);
  }

  .ctas {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 26px;
  }

  .ctas .btn {
    background: transparent;
    color: var(--stage-ink);
    border-color: rgb(255 255 255 / 22%);
  }

  .ctas .btn.primary {
    background: #fff;
    color: var(--stage);
    border-color: #fff;
  }

  .prefix {
    margin: 0 0 12px;
    font-family: var(--serif);
    font-size: clamp(1.05rem, 0.95rem + 0.4vw, 1.3rem);
    color: #c9ced6;
    line-height: 1.4;
  }

  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: clamp(14px, 1.6vw, 22px);
  }

  .side {
    margin: 0;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .clause {
    margin: 0 0 12px;
    display: flex;
    gap: 10px;
    align-items: baseline;
    font-size: clamp(1.02rem, 0.92rem + 0.42vw, 1.28rem);
    line-height: 1.38;
    color: #fff;
    flex: 1;
  }

  .clause .form-pill {
    flex: none;
    transform: translateY(-2px);
  }

  .q {
    font-family: var(--serif);
  }

  .frame {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 456 / 348;
    padding: 0;
    border: 0;
    border-radius: 14px;
    overflow: hidden;
    background: #000;
    cursor: pointer;
    box-shadow: 0 0 0 1px rgb(255 255 255 / 8%), 0 24px 60px -24px rgb(0 0 0 / 70%);
  }

  .S .frame {
    box-shadow: 0 0 0 1px rgb(141 156 255 / 30%), 0 24px 60px -24px rgb(59 79 198 / 55%);
  }

  .I .frame {
    box-shadow: 0 0 0 1px rgb(240 140 196 / 28%), 0 24px 60px -24px rgb(163 60 121 / 50%);
  }

  .bar {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3px;
    background: rgb(255 255 255 / 12%);
  }

  .bar i {
    display: block;
    height: 100%;
    transform-origin: 0 50%;
    background: var(--tf-2);
  }

  .I .bar i {
    background: var(--rf-2);
  }

  .verdict {
    position: absolute;
    left: 12px;
    bottom: 14px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px 6px 7px;
    border-radius: 999px;
    font-size: 0.86rem;
    font-weight: 600;
    line-height: 1.2;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .ic {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    font-size: 0.72rem;
  }

  .verdict.kept {
    background: rgb(23 70 43 / 88%);
    color: #e6fff0;
    box-shadow: 0 0 0 1px rgb(111 211 154 / 55%);
  }

  .verdict.kept .ic {
    background: var(--kept-2);
    color: #0b2617;
  }

  .verdict.lost {
    background: rgb(80 56 8 / 88%);
    color: #fff3d6;
    box-shadow: 0 0 0 1px rgb(255 201 90 / 55%);
  }

  .verdict.lost .ic {
    background: var(--lost-2);
    color: #3a2800;
  }

  .verdict.never {
    background: rgb(70 18 26 / 88%);
    color: #ffe1e4;
    box-shadow: 0 0 0 1px rgb(255 107 128 / 55%);
  }

  .verdict.never .ic {
    background: var(--vq-rev-2);
    color: #3b0710;
  }

  .cap {
    margin: 14px 0 0;
    font-size: 0.8rem;
    line-height: 1.5;
    color: var(--stage-muted);
  }

  @media (max-width: 1079px) {
    .sh {
      min-height: 0;
      padding-top: 96px;
    }

    .sh-in {
      grid-template-columns: minmax(0, 1fr);
      gap: 40px;
    }

    .hook {
      max-width: none;
    }
  }

  @media (max-width: 600px) {
    .pair {
      grid-template-columns: minmax(0, 1fr);
      gap: 26px;
    }

    .verdict {
      font-size: 0.8rem;
    }
  }
</style>
