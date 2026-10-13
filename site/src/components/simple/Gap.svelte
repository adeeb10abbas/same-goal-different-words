<script module lang="ts">

  export type GapRow = { id: string; name: string; D: number; S: number; I: number };
</script>

<script lang="ts">
  import CountUp from '../CountUp.svelte';
  import { onVisible, reducedMotion } from '../../lib/sync';

  let {
    rows,
    est,
    ci,
    aOnly,
    bOnly,
    more,
  }: { rows: GapRow[]; est: number; ci: [number, number]; aOnly: number; bOnly: number; more: string } = $props();

  const MAX = 0.7;
  const x = (v: number) => `${(v / MAX) * 100}%`;
  const TICKS = [0, 0.2, 0.4, 0.6];
  const p1 = (v: number) => (100 * v).toFixed(1);

  let on = $state(false);
  function arm(node: HTMLElement) {
    if (reducedMotion()) {
      on = true;
      return;
    }
    return onVisible(
      node,
      (v) => {
        if (v) on = true;
      },
      0.45,
    );
  }
</script>

<section class="section alt pk-gap" id="gap">
  <div class="wrap">
    <div class="top">
      <header class="pk-head">
        <div class="pk-k"><b>01</b>The wording gap</div>
        <h2 class="pk-h">Name the reference first, and the robot succeeds less often.</h2>
        <p class="pk-p">
          Across three <span class="nw">world-action</span> models, the same goals worded reference-first were placed
          <b class="num">{p1(est)}&nbsp;points</b> less often than when worded target-first.
        </p>
      </header>
      <div class="big" aria-label="{p1(est)} points lower">
        <span class="pk-num"><CountUp value={-100 * est} decimals={1} duration={1600} /></span>
        <span class="unit">points</span>
      </div>
    </div>

    <figure class="pk-body dumb" class:on {@attach arm}>
      <div class="legend" aria-hidden="true">
        <span><i class="dot S"></i>Target first</span>
        <span><i class="dot I"></i>Reference first</span>
        <span><i class="dia"></i>Direct wording</span>
      </div>
      <div class="rows">
        {#each rows as r, i (r.id)}
          <div class="row" style:--d="{i * 140}ms">
            <div class="name">{r.name}</div>
            <div class="track" role="img" aria-label="{r.name}: target-first {p1(r.S)}%, reference-first {p1(r.I)}%, direct {p1(r.D)}%">
              {#each TICKS as t}<i class="grid" style:left={x(t)}></i>{/each}
              <i class="link" style:left={x(r.I)} style:width="calc({x(r.S)} - {x(r.I)})"></i>
              <i class="dia" style:left={x(r.D)} title="Direct {p1(r.D)}%"></i>
              <span class="dot S" style:left={x(r.S)}><b class="lab up">{p1(r.S)}%</b></span>
              <span class="dot I" style:left={on ? x(r.I) : x(r.S)}><b class="lab down">{p1(r.I)}%</b></span>
            </div>
            <div class="delta num">−{p1(r.S - r.I)}</div>
          </div>
        {/each}
        <div class="row axis" aria-hidden="true">
          <div class="name"></div>
          <div class="track">
            {#each TICKS as t}<span style:left={x(t)}>{Math.round(t * 100)}%</span>{/each}
          </div>
          <div class="delta"></div>
        </div>
      </div>
      <figcaption class="sr-only">Stable placement at any time, by model and wording.</figcaption>
    </figure>

    <p class="pk-foot">
      Stable placement at any point in the episode, 96 rollouts per dot, with the four scenes weighted equally. 95% CI {p1(ci[0])}–{p1(ci[1])} points. Among pairs with the same model,
      goal and start, {aOnly} succeeded only with target-first wording and {bOnly} only with reference-first.
      <a class="pk-more" href={more}>All results&nbsp;→</a>
    </p>
  </div>
</section>

<style>
  .top {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 24px 48px;
    align-items: end;
  }

  .big {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    color: var(--rf);
  }

  .big .pk-num {
    font-size: clamp(4.4rem, 2.4rem + 7vw, 9rem);
  }

  .unit {
    font-family: var(--mono);
    font-size: 0.78rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    margin-top: 6px;
  }

  .dumb {
    margin-inline: 0;
    padding: clamp(22px, 3vw, 40px) clamp(18px, 3vw, 44px) clamp(14px, 2vw, 24px);
    background: var(--card);
    border: 1px solid var(--rule);
    border-radius: 20px;
    box-shadow: var(--shadow);
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 22px;
    font-size: 0.84rem;
    color: var(--muted);
    margin-bottom: 18px;
  }

  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .legend .dot,
  .legend .dia {
    position: static;
    transform: none;
  }

  .legend .dia {
    transform: rotate(45deg);
  }

  .row {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr) 72px;
    gap: 20px;
    align-items: center;
    height: 76px;
  }

  .name {
    font-weight: 600;
    font-size: 0.95rem;
  }

  .track {
    position: relative;
    height: 100%;
  }

  .track::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 1px;
    background: var(--rule);
  }

  .grid {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: color-mix(in srgb, var(--rule) 70%, transparent);
  }

  .link {
    position: absolute;
    top: calc(50% - 2px);
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(90deg, var(--rf), var(--tf));
    transform: scaleX(0);
    transform-origin: 100% 50%;
    transition: transform 1.1s var(--ease) var(--d);
  }

  .on .link {
    transform: none;
  }

  .dot {
    position: absolute;
    top: 50%;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    border: 3px solid var(--card);
    box-shadow: 0 1px 3px rgb(0 0 0 / 25%);
    display: inline-block;
    flex: none;
  }

  .dot.S {
    background: var(--tf);
    z-index: 2;
  }

  .dot.I {
    background: var(--rf);
    z-index: 3;
    transition: left 1.1s var(--ease) var(--d);
  }

  .dia {
    position: absolute;
    top: 50%;
    width: 10px;
    height: 10px;
    background: var(--dir-2);
    transform: translate(-50%, -50%) rotate(45deg);
    border-radius: 2px;
    display: inline-block;
    flex: none;
  }

  .lab {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .lab.up {
    bottom: 18px;
    color: var(--tf);
  }

  .lab.down {
    top: 18px;
    color: var(--rf);
    opacity: 0;
    transition: opacity 0.5s calc(var(--d) + 0.8s);
  }

  .on .lab.down {
    opacity: 1;
  }

  .delta {
    font-family: var(--serif);
    font-size: 1.5rem;
    color: var(--rf);
    text-align: right;
    opacity: 0;
    transition: opacity 0.5s calc(var(--d) + 0.9s);
  }

  .on .delta {
    opacity: 1;
  }

  .axis {
    height: 26px;
  }

  .axis .track::before {
    display: none;
  }

  .axis span {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    font-family: var(--mono);
    font-size: 0.7rem;
    color: var(--muted);
  }

  .axis span:first-child {
    transform: none;
  }

  @media (max-width: 760px) {
    .top {
      grid-template-columns: minmax(0, 1fr);
    }

    .big {
      align-items: flex-start;
    }

    .row {
      grid-template-columns: minmax(0, 1fr) 56px;
      grid-template-areas: 'name delta' 'track track';
      height: auto;
      gap: 0 12px;
      padding-top: 8px;
    }

    .name {
      grid-area: name;
    }

    .delta {
      grid-area: delta;
      font-size: 1.25rem;
    }

    .track {
      grid-area: track;
      height: 64px;
    }

    .axis {
      height: auto;
      padding-top: 0;
    }

    .axis .track {
      height: 22px;
    }

    .axis .name,
    .axis .delta {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .link,
    .dot.I,
    .lab.down,
    .delta {
      transition: none;
    }
  }
</style>
