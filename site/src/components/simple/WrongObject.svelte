<script lang="ts">
  import { onDestroy } from 'svelte';
  import { scale } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { createClock, autoplay } from '../../lib/clock.svelte';
  import { epFile, type Crop, type Episode } from '../../lib/media';
  import { goalByKey, FORM_NAME, FORM_SHORT, MODEL_NAME } from '../../lib/study';
  import { splitPair } from '../../lib/split';
  import Instruction from '../Instruction.svelte';
  import SyncVideo from '../SyncVideo.svelte';

  let {
    tf,
    rf,
    rfWins,
    tfWins,
    more,
  }: { tf: Episode; rf: Episode; rfWins: number; tfWins: number; more: string } = $props();

  /** The cube, the bowl and the gripper, cropped from the exterior camera. */
  const CROP: Crop = [60, 118, 416, 317, 536, 540];
  const goal = $derived(goalByKey(`${tf.s}-${tf.g}`));
  const words = $derived(splitPair(goal.prompts.S, goal.prompts.I));

  const { clock, state: play, destroy } = createClock(2, 2200);
  onDestroy(destroy);
  let userPaused = $state(false);

  const panels = $derived([
    {
      f: 'S' as const,
      ep: tf,
      clause: words.S,
      ok: false,
      verdict: 'Scored a failure',
      what: 'Lifted the cube, as asked, then dropped it into the bowl',
      at: Infinity,
    },
    {
      f: 'I' as const,
      ep: rf,
      clause: words.I,
      ok: true,
      verdict: 'Scored a success',
      what: 'Carried the bowl instead; the cube never moved',
      at: rf.tStable ?? Infinity,
    },
  ]);
  const ended = $derived(play.dur > 0 && play.t >= play.dur - 0.05);
  const frac = $derived(play.dur ? Math.min(1, play.t / play.dur) : 0);

  function toggle() {
    clock.toggle();
    userPaused = !clock.playing;
  }
</script>

<section class="section pk-wrong" id="wrong" {@attach autoplay(clock, () => !userPaused, 0.4)}>
  <div class="wrap">
    <header class="pk-head">
      <div class="pk-k"><b>03</b>What a success can hide</div>
      <h2 class="pk-h">The right arrangement, <em>with the wrong object.</em></h2>
      <p class="pk-p">
        One goal favoured reference-first wording: put the cube behind the bowl. Every one of its reference-first successes came from
        moving the bowl.
      </p>
    </header>

    <div class="pk-body pair">
      <p class="prefix">“<Instruction prompt={words.prefix} {goal} /> …</p>
      {#each panels as p (p.f)}
        <figure class="side {p.f}">
          <p class="clause">
            <span class="form-pill {p.f}">{FORM_SHORT[p.f]}</span>
            <span class="q">…&#8202;<Instruction prompt={p.clause} {goal} />”</span>
          </p>
          <button class="frame" type="button" onclick={toggle} aria-label={play.playing ? 'Pause both rollouts' : 'Play both rollouts'}>
            <SyncVideo
              {clock}
              src={epFile(p.ep.id, 'top_hq_web.mp4')}
              poster={epFile(p.ep.id, 'first_hq.webp')}
              label="{FORM_NAME[p.f]} rollout, exterior camera"
              crop={CROP}
            />
            <span class="bar" aria-hidden="true"><i style:transform="scaleX({frac})"></i></span>
            {#if ended || play.t >= p.at}
              <span class="chip" class:ok={p.ok} data-qa-overlay transition:scale={{ start: 0.85, duration: 380, easing: backOut }}>
                <span class="ic" aria-hidden="true">{p.ok ? '✓' : '✕'}</span>{p.verdict}
              </span>
            {/if}
          </button>
          <figcaption class:shown={ended || play.t >= p.at}>{p.what}.</figcaption>
        </figure>
      {/each}
    </div>

    <div class="stats">
      <div class="stat">
        <span class="pk-num">{rfWins}<small>/{rfWins}</small></span>
        <p>reference-first successes on this goal moved the <b class="tok-ref">bowl</b>. The cube was never lifted.</p>
      </div>
      <div class="stat">
        <span class="pk-num">{rfWins}<small>&nbsp;vs {tfWins}</small></span>
        <p>
          The only one of twelve goals where reference-first wording came out ahead, and every one of those wins moved the wrong object.
        </p>
      </div>
    </div>

    <p class="pk-foot">
      {MODEL_NAME[tf.m]} from one saved start, at 2× speed, re-rendered from the logged states. A relation check alone counts the
      bowl move as a success; checking which object moved does not. <a class="pk-more" href={more}>Failure analysis&nbsp;→</a>
    </p>
  </div>
</section>

<style>
  .pair,
  .stats {
    max-width: 1000px;
  }

  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px clamp(16px, 2.4vw, 32px);
  }

  .prefix {
    grid-column: 1 / -1;
    margin: 0;
    font-family: var(--serif);
    font-size: clamp(1.05rem, 0.95rem + 0.4vw, 1.3rem);
    color: var(--ink-2);
    line-height: 1.4;
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
    font-size: clamp(1.02rem, 0.92rem + 0.42vw, 1.26rem);
    line-height: 1.38;
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
    aspect-ratio: 336 / 256;
    padding: 0;
    border: 0;
    border-radius: 16px;
    overflow: hidden;
    background: #000;
    cursor: pointer;
    box-shadow: var(--shadow);
  }

  .bar {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3px;
    background: rgb(255 255 255 / 14%);
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

  .chip {
    position: absolute;
    left: 12px;
    top: 12px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px 6px 7px;
    border-radius: 999px;
    font-size: 0.86rem;
    font-weight: 600;
    line-height: 1.2;
    background: rgb(70 18 26 / 88%);
    color: #ffe1e4;
    box-shadow: 0 0 0 1px rgb(255 107 128 / 55%);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .chip.ok {
    background: rgb(23 70 43 / 88%);
    color: #e6fff0;
    box-shadow: 0 0 0 1px rgb(111 211 154 / 55%);
  }

  .ic {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    font-size: 0.72rem;
    background: var(--vq-rev-2);
    color: #3b0710;
  }

  .ok .ic {
    background: var(--kept-2);
    color: #0b2617;
  }

  figcaption {
    margin-top: 12px;
    font-size: 0.95rem;
    line-height: 1.45;
    color: var(--muted);
    transition: color 0.5s;
  }

  figcaption.shown {
    color: var(--ink-2);
  }

  .stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px clamp(16px, 2.4vw, 32px);
    margin-top: clamp(32px, 4vw, 52px);
  }

  .stat {
    display: flex;
    align-items: center;
    gap: 20px;
    padding-top: 20px;
    border-top: 1px solid var(--rule);
  }

  .stat .pk-num {
    font-size: clamp(3rem, 2.2rem + 2.4vw, 4.4rem);
    color: var(--rf);
    flex: none;
  }

  .stat small {
    font-size: 0.42em;
    letter-spacing: 0;
    color: var(--muted);
  }

  .stat p {
    margin: 0;
    font-size: 1rem;
    line-height: 1.5;
    color: var(--ink-2);
  }

  @media (max-width: 760px) {
    .pair,
    .stats {
      grid-template-columns: minmax(0, 1fr);
    }

    .side + .side {
      margin-top: 12px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    figcaption {
      transition: none;
    }
  }
</style>
