<script lang="ts">
  import { onVisible, reducedMotion } from '../../lib/sync';

  let {
    total,
    anytime,
    end,
    initial,
    initialEnd,
    more,
  }: { total: number; anytime: number; end: number; initial: number; initialEnd: number; more: string } = $props();

  const lost = $derived(anytime - end);
  /** Column-major order: kept, then lost, then never satisfied, so the story reads left to right. */
  const cells = $derived(
    Array.from({ length: total }, (_, i) => (i < end ? 'k' : i < anytime ? 'l' : 'n') as 'k' | 'l' | 'n'),
  );

  // 0: every rollout; 1: satisfied at some point; 2: still satisfied at the end. SSR renders the final state.
  let step = $state<0 | 1 | 2>(2);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function play() {
    clearTimeout(timer);
    step = 0;
    timer = setTimeout(() => {
      step = 1;
      timer = setTimeout(() => (step = 2), 2400);
    }, 300);
  }

  function arm(node: HTMLElement) {
    if (reducedMotion()) return;
    step = 0;
    let armed = true;
    const off = onVisible(
      node,
      (v) => {
        if (v && armed) {
          armed = false;
          play();
        }
      },
      0.4,
    );
    return () => {
      off();
      clearTimeout(timer);
    };
  }

  function show(s: 1 | 2) {
    clearTimeout(timer);
    step = s;
  }
</script>

<section class="section alt pk-fragile" id="fragile">
  <div class="wrap">
    <header class="pk-head">
      <div class="pk-k"><b>04</b>Placed is not kept</div>
      <h2 class="pk-h">Half the successes <em>came undone</em> before the end.</h2>
      <p class="pk-p">
        Of all {total} rollouts, {anytime} satisfied the goal at some point. Only {end} still did when the episode ended.
      </p>
    </header>

    <figure class="pk-body board" data-step={step} style:--e={end} {@attach arm}>
      <div class="head">
        <p class="sr-only">{anytime} rollouts satisfied the goal at some point; {end} still did at the end.</p>
        <div class="tally" aria-hidden="true">
          <span class="pk-num a" class:dim={step === 2}>{anytime}</span>
          <span class="arrow" class:on={step === 2}>→</span>
          <span class="pk-num b" class:on={step === 2}>{end}</span>
        </div>
        <div class="seg" role="group" aria-label="Which moment to show">
          <button type="button" aria-pressed={step === 1} onclick={() => show(1)}>At some point</button>
          <button type="button" aria-pressed={step === 2} onclick={() => show(2)}>At the end</button>
        </div>
      </div>

      <div class="waffle" role="img" aria-label="{total} rollouts: {end} satisfied the goal at the end, {lost} satisfied it earlier but lost it, {total - anytime} never satisfied it.">
        {#each cells as c, i (i)}<i class={c} style:--i={i}></i>{/each}
      </div>

      <div class="key" aria-hidden="true">
        <span><i class="sw k"></i>Held at the end <b class="num">{end}</b></span>
        <span><i class="sw l"></i>Satisfied, then lost <b class="num">{lost}</b></span>
        <span><i class="sw n"></i>Never satisfied <b class="num">{total - anytime}</b></span>
      </div>
      <figcaption class="sr-only">Every rollout of the study as one square.</figcaption>
    </figure>

    <p class="pk-foot">
      {initial} of the {anytime} started with the arrangement already true, and the robot undid it in {initial - initialEnd}. Of the
      rollouts that had to create it, {anytime - initial} did and {end - initialEnd} kept it.
      <a class="pk-more" href={more}>Where rollouts fail&nbsp;→</a>
    </p>
  </div>
</section>

<style>
  .board {
    margin-inline: 0;
    padding: clamp(18px, 2.6vw, 36px);
    background: var(--card);
    border: 1px solid var(--rule);
    border-radius: 20px;
    box-shadow: var(--shadow);
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 16px 24px;
    margin-bottom: clamp(18px, 2.4vw, 28px);
  }

  .tally {
    display: flex;
    align-items: baseline;
    gap: 0.3em;
    font-size: clamp(3.2rem, 2.2rem + 3.4vw, 5.6rem);
  }

  .tally .pk-num {
    font-size: 1em;
    transition: color 0.6s, opacity 0.6s;
  }

  .a {
    color: var(--kept);
  }

  .a.dim {
    color: var(--muted);
  }

  .arrow {
    font-family: var(--serif);
    font-size: 0.6em;
    color: var(--faint);
    opacity: 0;
    transform: translateX(-8px);
    transition: opacity 0.5s, transform 0.5s var(--ease);
  }

  .arrow.on {
    opacity: 1;
    transform: none;
  }

  .b {
    color: var(--kept);
    opacity: 0;
    transition: opacity 0.6s 0.2s;
  }

  .b.on {
    opacity: 1;
  }

  .seg {
    display: inline-flex;
    padding: 4px;
    border-radius: 999px;
    background: var(--paper-2);
    border: 1px solid var(--rule);
  }

  .seg button {
    font: inherit;
    font-size: 0.86rem;
    font-weight: 500;
    padding: 8px 16px;
    min-height: 36px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--muted);
    white-space: nowrap;
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
  }

  .seg button[aria-pressed='true'] {
    background: var(--ink);
    color: #fff;
  }

  @media (max-width: 420px) {
    .seg {
      display: flex;
      width: 100%;
    }

    .seg button {
      flex: 1;
      padding: 8px 10px;
      font-size: 0.8rem;
    }
  }

  .waffle {
    --rows: 18;
    display: grid;
    grid-template-rows: repeat(var(--rows), auto);
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    gap: clamp(2px, 0.28vw, 4px);
  }

  .waffle i {
    display: block;
    aspect-ratio: 1;
    border-radius: 2px;
    background: var(--never);
    transition: background-color 0.45s, transform 0.45s var(--ease);
  }

  /* Waves sweep left to right: the delay follows the cell's column. */
  [data-step='1'] .waffle i:is(.k, .l) {
    background: var(--kept-2);
    transition-delay: calc(var(--i) / var(--rows) * 32ms);
  }

  [data-step='2'] .waffle i.k {
    background: var(--kept);
  }

  [data-step='2'] .waffle i.l {
    background: var(--lost-2);
    transform: scale(0.72);
    transition-delay: calc((var(--i) - var(--e)) / var(--rows) * 60ms);
  }

  .key {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 24px;
    margin-top: 18px;
    font-size: 0.86rem;
    color: var(--muted);
  }

  .key span {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .key b {
    color: var(--ink);
    font-weight: 600;
  }

  .sw {
    width: 12px;
    height: 12px;
    border-radius: 2px;
  }

  .sw.k {
    background: var(--kept);
  }

  .sw.l {
    background: var(--lost-2);
  }

  .sw.n {
    background: var(--never);
  }

  @media (max-width: 900px) {
    .waffle {
      --rows: 24;
    }
  }

  @media (max-width: 560px) {
    .waffle {
      --rows: 32;
      gap: 2px;
    }

    .waffle i {
      border-radius: 1px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .waffle i,
    .tally .pk-num,
    .arrow {
      transition: none !important;
    }
  }
</style>
