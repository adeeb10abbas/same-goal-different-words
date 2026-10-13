<script lang="ts">
  import { onVisible, reducedMotion } from '../../lib/sync';
  import { FC, N_ALL } from '../../lib/forecasts';

  const R = FC.reported;
  const rows = FC.agreement;
  const release = rows.find((r) => r[0] === 'Possible release')!;
  const yes = FC.labels.fc_possible_release.yes ?? 0;
  if (!release || rows.length !== 7) throw new Error('Agreement: unexpected agreement table');

  let on = $state(true);
  function reveal(node: HTMLElement) {
    if (reducedMotion()) return;
    let first = true;
    return onVisible(
      node,
      (v) => {
        if (first) {
          first = false;
          if (!v) on = false;
          return;
        }
        if (v) on = true;
      },
      0.25,
    );
  }
</script>

<figure class="fig agree" class:on {@attach reveal}>
  <div class="chart" aria-hidden="true">
    <div class="row head">
      <span class="name"></span>
      <span class="colh">Raw agreement <small>% of forecasts, 0–100</small></span>
      <span class="colh">Cohen’s κ <small>beyond chance, 0–1</small></span>
    </div>
    {#each rows as [name, pct, k], i (name)}
      <div class="row" style:--i={i}>
        <span class="name">{name}</span>
        <span class="cell">
          <span class="bar"><i style:width="{pct}%"></i></span>
          <span class="v num">{pct.toFixed(1)}%</span>
        </span>
        <span class="cell">
          <span class="bar k">
            <i style:width="{k * 100}%"></i>
            <b class="bound" style:left="{R.startKappaMax * 100}%"></b>
          </span>
          <span class="v num">{k.toFixed(3)}</span>
        </span>
      </div>
    {/each}
    <div class="row all" style:--i={rows.length}>
      <span class="name">All {rows.length} fields at once</span>
      <span class="cell">
        <span class="bar"><i style:width="{R.allFieldsAgree}%"></i></span>
        <span class="v num">{R.allFieldsAgree.toFixed(1)}%</span>
      </span>
      <span class="cell"><span class="na">not reported</span></span>
    </div>
  </div>

  <div class="sr-only">
    <table>
      <caption>Agreement between the two video annotators on {N_ALL} selected forecasts</caption>
      <thead><tr><th scope="col">Field</th><th scope="col">Agreement (%)</th><th scope="col">Cohen’s κ</th></tr></thead>
      <tbody>
        {#each rows as [name, pct, k] (name)}
          <tr><th scope="row">{name}</th><td>{pct.toFixed(1)}</td><td>{k.toFixed(3)}</td></tr>
        {/each}
        <tr><th scope="row">All {rows.length} fields at once</th><td>{R.allFieldsAgree.toFixed(1)}</td><td>not reported</td></tr>
      </tbody>
    </table>
  </div>

  <div class="legend">
    <span class="sw" aria-hidden="true"></span>
    <p>
      On the {R.startForecasts} additional episode-start forecasts, every field’s κ stayed below <span class="nw">{R.startKappaMax}</span>.
    </p>
  </div>

  <figcaption class="caption">
    Agreement between the two independent annotators on the {N_ALL} selected forecasts, before disagreements were resolved. High agreement
    on a rare answer mostly reflects its rarity: the annotators agreed on possible release in {release[1].toFixed(1)}% of forecasts, yet κ
    was {release[2].toFixed(3)}, and only {yes} of {N_ALL} final labels said release was possible. Neither annotation set has been validated
    against human judgments, so these numbers measure agreement, not accuracy.
  </figcaption>
</figure>

<style>
  .agree {
    container-type: inline-size;
    margin: clamp(28px, 3.6vw, 48px) 0 0;
    --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  }

  .chart {
    display: grid;
    gap: 2px;
  }

  .row {
    display: grid;
    grid-template-columns: minmax(150px, 0.8fr) minmax(0, 1fr) minmax(0, 1fr);
    gap: 6px 24px;
    align-items: center;
    padding: 7px 0;
    border-bottom: 1px solid var(--stage-rule);
  }

  .row.head {
    align-items: end;
    padding-top: 0;
    border-bottom-color: #3a404c;
  }

  .row.all {
    border-bottom: 0;
    padding-top: 12px;
  }

  .name {
    font-size: 0.9rem;
    color: var(--stage-ink);
  }

  .all .name {
    font-weight: 600;
    color: #fff;
  }

  .colh {
    font-family: var(--mono);
    font-size: 0.68rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--stage-muted);
  }

  .colh small {
    display: block;
    margin-top: 2px;
    font-family: var(--sans);
    font-size: 0.72rem;
    letter-spacing: 0;
    text-transform: none;
  }

  .cell {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 3.6em;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .bar {
    position: relative;
    height: 12px;
    border-radius: 3px;
    background: linear-gradient(90deg, transparent calc(50% - 0.5px), rgb(255 255 255 / 10%) 0 calc(50% + 0.5px), transparent 0),
      rgb(255 255 255 / 5%);
  }

  .bar i {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    border-radius: 3px;
    background: #c9ced6;
    transform-origin: left;
    transition: transform 0.9s var(--ease-out) calc(var(--i) * 70ms);
  }

  .bar.k i {
    background: var(--tf-2);
  }

  .all .bar i {
    background: #fff;
  }

  .agree:not(.on) .bar i {
    transform: scaleX(0);
  }

  .bound {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 0;
    border-left: 1.5px dashed #ffd27a;
  }

  .v {
    font-family: var(--mono);
    font-size: 0.8rem;
    text-align: right;
    color: var(--stage-ink);
  }

  .na {
    grid-column: 1 / -1;
    font-size: 0.78rem;
    color: var(--stage-muted);
  }

  .legend {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-top: 16px;
  }

  .legend p {
    margin: 0;
    font-size: 0.84rem;
    color: #c9ced6;
  }

  .sw {
    flex: none;
    width: 0;
    height: 14px;
    border-left: 1.5px dashed #ffd27a;
    transform: translateY(2px);
  }

  .caption {
    margin-top: 12px;
  }

  @container (max-width: 560px) {
    .row {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      column-gap: 14px;
    }

    .name {
      grid-column: 1 / -1;
    }

    .row.head .name {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .bar i {
      transition: none;
    }
  }
</style>
