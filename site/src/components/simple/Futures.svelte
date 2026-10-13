<script lang="ts">
  import { onDestroy } from 'svelte';
  import { createClock, autoplay } from '../../lib/clock.svelte';
  import { epFile } from '../../lib/media';
  import PairFrames from '../forecasts/PairFrames.svelte';

  let {
    id,
    model,
    delta,
    ci,
    agree,
    more,
  }: { id: string; model: string; delta: number; ci: [number, number]; agree: number; more: string } = $props();

  const dec = (x: number) => `${x < 0 ? '−' : '+'}${Math.abs(x).toFixed(4)}`;
  const { clock, destroy } = createClock(0.5, 1200);
  onDestroy(destroy);
</script>

<section class="section dark pk-futures" id="futures">
  <div class="wrap cols">
    <header class="pk-head">
      <div class="pk-k"><b>06</b>Imagined futures</div>
      <h2 class="pk-h">The imagined future <em>added no measurable warning.</em></h2>
      <p class="pk-p">
        Each model also generates a video of what it expects to happen next. Labels of those videos did not help predict manipulation
        errors, such as handling the wrong object.
      </p>
      <dl class="stat">
        <dt>Change in error prediction (Brier) from adding the video labels</dt>
        <dd><span class="pk-num">{dec(delta)}</span><span class="ci">95% CI {dec(ci[0])} to {dec(ci[1])}</span></dd>
      </dl>
    </header>

    <figure class="vid" {@attach autoplay(clock, () => true, 0.3)}>
      <PairFrames {clock} src={epFile(id, 'forecast.mp4')} mode="side" what="future" />
      <figcaption>
        {model}’s predicted next two seconds (left) beside what the robot actually did (right), at half speed. Wrist camera above, two
        exterior cameras below.
      </figcaption>
    </figure>

    <p class="pk-foot span">
      Labels came from two vision–language models standing in for human annotators. They agreed on every label for only {agree}% of the
      videos, so this is not a verdict on the videos themselves.
      <a class="pk-more" href={more}>Forecast analysis&nbsp;→</a>
    </p>
  </div>
</section>

<style>
  .cols {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
    gap: 24px clamp(28px, 4vw, 64px);
    align-items: center;
  }

  .stat {
    margin: clamp(28px, 3.4vw, 40px) 0 0;
    padding-top: 22px;
    border-top: 1px solid var(--stage-rule);
  }

  dt {
    font-size: 0.86rem;
    color: var(--stage-muted);
    line-height: 1.45;
  }

  dd {
    margin: 10px 0 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px 16px;
  }

  dd .pk-num {
    font-size: clamp(2.8rem, 2rem + 2.4vw, 4.2rem);
    color: #fff;
  }

  .ci {
    font-family: var(--mono);
    font-size: 0.78rem;
    color: var(--stage-muted);
  }

  .vid {
    margin: 0;
    padding: 12px;
    border-radius: 18px;
    background: var(--stage-2);
    border: 1px solid var(--stage-rule);
  }

  figcaption {
    margin-top: 12px;
    font-size: 0.82rem;
    line-height: 1.5;
    color: var(--stage-muted);
  }

  .span {
    grid-column: 1 / -1;
    margin-top: 4px;
  }

  @media (max-width: 960px) {
    .cols {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
