<script lang="ts">
  import { onVisible, reducedMotion } from '../../lib/sync';
  import { MODEL_NAME } from '../../lib/study';

  const uid = $props.id();
  import { FC, sgn } from '../../lib/forecasts';

  const U = FC.utility;
  const P = FC.reported.permutation;
  const CTL = FC.reported.controls;
  const K = FC.reported.classifier;
  const pooled = U.rows.find((r) => r.model === 'All')!;
  const perModel = U.rows.filter((r) => r.model !== 'All');

  // Display domain for ΔB; every plotted value must fall inside it.
  const LO = -0.0025;
  const HI = 0.0015;
  const TICKS = [-0.002, -0.001, 0, 0.001];
  const pos = (x: number) => `${(100 * (x - LO)) / (HI - LO)}%`;
  for (const x of [...U.ci, ...U.rows.map((r) => r.delta), P.p025, P.p975, P.mean, CTL.missingIndicators, CTL.noMotion])
    if (x < LO || x > HI) throw new Error(`Utility: ${x} lies outside the plotted range`);
  if (pooled.delta < U.ci[0] || pooled.delta > U.ci[1]) throw new Error('Utility: pooled estimate outside its interval');

  type Row = {
    label: string;
    kind: 'ci' | 'pt' | 'ctl' | 'perm';
    x: number;
    lo?: number;
    hi?: number;
    val: string;
    sub?: [string, string];
  };
  const groups: { title: string; note: string; rows: Row[] }[] = [
    {
      title: 'Observed',
      note: 'Weights models equally, scenes equally within models and goals equally within scenes.',
      rows: [
        {
          label: 'All models, pooled',
          kind: 'ci',
          x: pooled.delta,
          lo: U.ci[0],
          hi: U.ci[1],
          val: sgn(pooled.delta),
          sub: ['95% interval', `[${sgn(U.ci[0])}, ${sgn(U.ci[1])}]`],
        },
      ],
    },
    {
      title: 'Per model, descriptive',
      note: 'Classifiers refitted on each policy’s episodes; these rows do not decompose the pooled result.',
      rows: perModel.map((r) => ({ label: MODEL_NAME[r.model], kind: 'pt' as const, x: r.delta, val: sgn(r.delta) })),
    },
    {
      title: 'Controls',
      note: 'The no-motion control did not pass repeated current images through the video annotators.',
      rows: [
        { label: 'Missing-annotation indicators only', kind: 'ctl', x: CTL.missingIndicators, val: sgn(CTL.missingIndicators, 6) },
        { label: 'Synthetic no-motion labels with the current-goal flag', kind: 'ctl', x: CTL.noMotion, val: sgn(CTL.noMotion, 6) },
      ],
    },
    {
      title: 'Permutation null',
      note: 'A permutation distribution, not a confidence interval for the observed effect.',
      rows: [
        {
          label: `Forecasts shuffled across starts, ${P.seeds} seeds`,
          kind: 'perm',
          x: P.mean,
          lo: P.p025,
          hi: P.p975,
          val: `mean ${sgn(P.mean)}`,
          sub: ['2.5th–97.5th percentile', `[${sgn(P.p025)}, ${sgn(P.p975)}]`],
        },
      ],
    },
  ];

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
      0.3,
    );
  }
  const at = (x: number) => (on ? pos(x) : pos(0));
</script>

<div class="clf">
  <div class="col">
    <h4>Baseline classifier</h4>
    <ul>
      <li>Model, scene and goal</li>
      <li>Current object and gripper states</li>
      <li>Distance to the goal, and whether it already held</li>
      <li>Object proximity along the proposed actions’ forward kinematics</li>
      <li>Prior contact and lift indicators</li>
    </ul>
  </div>
  <div class="plus" aria-hidden="true">+</div>
  <div class="col add">
    <h4>With video labels</h4>
    <ul>
      <li>Everything in the baseline</li>
      <li>The selected forecast’s video annotations, including unknown categories</li>
    </ul>
  </div>
  <p class="fit">
    Both: L2-regularized logistic regression, <span class="nw">C&nbsp;=&nbsp;{K.C}</span>, {K.folds} folds each holding out the same
    initial-state slot across all conditions, preprocessing fitted within the training fold. Wording, future states and final task success
    were excluded. The comparison uses privileged simulator information and is not a deployable failure detector.
  </p>
</div>

<figure class="fig forest" class:on {@attach reveal} style:--z={pos(0)}>
  <p class="title">
    Change in held-out Brier error from adding the video labels,
    <span class="nw">ΔB = B<sub>baseline</sub> − B<sub>with&nbsp;video</sub></span>
  </p>

  <div class="row axis top" aria-hidden="true">
    <span></span>
    <span class="track"><span class="worse">← worse</span><span class="better">better →</span></span>
    <span></span>
  </div>

  {#each groups as g (g.title)}
    <div class="grp">
      <p class="gt"><b>{g.title}</b> {g.note}</p>
      {#each g.rows as r (r.label)}
        <div class="row {r.kind}">
          <span class="lab">{r.label}</span>
          <span class="track" aria-hidden="true">
            {#if r.kind === 'perm'}
              <i class="band" style:left={at(r.lo!)} style:right="calc(100% - {at(r.hi!)})"></i>
              <i class="tick" style:left={at(r.x)}></i>
            {:else if r.kind === 'ci'}
              <i class="whisk" style:left={at(r.lo!)} style:right="calc(100% - {at(r.hi!)})"></i>
              <i class="dot" style:left={at(r.x)}></i>
            {:else}
              <i class="stem" style:left={r.x < 0 ? at(r.x) : pos(0)} style:right="calc(100% - {r.x < 0 ? pos(0) : at(r.x)})"></i>
              <i class="dot" style:left={at(r.x)}></i>
            {/if}
          </span>
          <span class="val num"><span class="v">{r.val}</span>{#if r.sub}<small>{r.sub[0]} <span class="nw">{r.sub[1]}</span></small>{/if}</span>
        </div>
      {/each}
    </div>
  {/each}

  <div class="row axis" aria-hidden="true">
    <span></span>
    <span class="track">
      {#each TICKS as t (t)}<span class="tk num" style:left={pos(t)}>{t === 0 ? '0' : sgn(t, 3)}</span>{/each}
    </span>
    <span></span>
  </div>

  <figcaption class="caption">
    Positive ΔB would favour the video labels. Adding them slightly worsened the pooled score; the 95% interval includes zero, and the small
    positive FLUX estimate does not establish a model-specific benefit. The interval resamples starts within scenes with fitted predictions
    held fixed, so it excludes annotation uncertainty and variation from refitting.
  </figcaption>
</figure>

<div class="tscroll" role="region" aria-label="Brier error by model" tabindex="0" data-qa-scroll>
  <table class="dtable" aria-describedby="{uid}-c">
    <thead>
      <tr>
        <th scope="col">Model</th>
        <th scope="col">Events / forecasts</th>
        <th scope="col">Baseline</th>
        <th scope="col">With video</th>
        <th scope="col">ΔB</th>
      </tr>
    </thead>
    <tbody>
      {#each U.rows as r (r.model)}
        <tr class:all={r.model === 'All'}>
          <th scope="row">{r.model === 'All' ? 'All models' : MODEL_NAME[r.model]}</th>
          <td class="num">{r.events} / {r.n}</td>
          <td class="num">{r.baseline.toFixed(5)}</td>
          <td class="num">{r.video.toFixed(5)}</td>
          <td class="num">{sgn(r.delta)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
<p class="caption tcap" id="{uid}-c">
  Held-out Brier error for predicting detected manipulation errors; lower is better. Model rows are descriptive.
</p>

<style>
  .clf {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) auto minmax(0, 1fr);
    gap: 14px 18px;
    align-items: stretch;
    margin-top: 30px;
  }

  .col {
    padding: 16px 18px 8px;
    border: 1px solid var(--stage-rule);
    border-radius: var(--radius);
    background: var(--stage-2);
  }

  .col.add {
    border-color: color-mix(in srgb, var(--tf-2) 45%, var(--stage-rule));
  }

  .col h4 {
    margin: 0 0 8px;
    font-family: var(--mono);
    font-size: 0.7rem;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--stage-muted);
  }

  .col.add h4 {
    color: var(--tf-2);
  }

  .col ul {
    margin: 0;
    padding-left: 1.1em;
    font-size: 0.88rem;
    line-height: 1.5;
    color: var(--stage-ink);
  }

  .col li {
    margin-bottom: 6px;
  }

  .plus {
    align-self: center;
    font-family: var(--serif);
    font-size: 2rem;
    color: var(--stage-muted);
  }

  .fit {
    grid-column: 1 / -1;
    margin: 0;
    font-size: 0.84rem;
    line-height: 1.55;
    color: #c9ced6;
  }

  .forest {
    container-type: inline-size;
    margin: 30px 0 0;
    --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  }

  .title {
    margin: 0 0 6px;
    font-size: 0.95rem;
    font-weight: 600;
    color: #fff;
  }

  .title sub {
    margin-left: 0.15em;
    font-size: 0.7em;
    font-weight: 500;
  }

  .row {
    display: grid;
    grid-template-columns: minmax(0, 15em) minmax(0, 1fr) 11em;
    gap: 4px 20px;
    align-items: center;
    min-height: 34px;
  }

  .grp {
    padding: 10px 0 8px;
    border-top: 1px solid var(--stage-rule);
  }

  .gt {
    margin: 0 0 4px;
    font-size: 0.78rem;
    line-height: 1.45;
    color: var(--stage-muted);
  }

  .gt b {
    margin-right: 4px;
    font-family: var(--mono);
    font-size: 0.68rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--stage-ink);
  }

  .lab {
    font-size: 0.88rem;
    line-height: 1.35;
    color: var(--stage-ink);
  }

  .ci .lab {
    font-weight: 600;
    color: #fff;
  }

  .track {
    position: relative;
    display: block;
    height: 22px;
  }

  .track::before {
    content: '';
    position: absolute;
    left: var(--z);
    top: -6px;
    bottom: -6px;
    border-left: 1px solid rgb(255 255 255 / 32%);
  }

  .track i {
    position: absolute;
    top: 50%;
    transition:
      left 0.9s var(--ease-out),
      right 0.9s var(--ease-out);
  }

  .dot {
    width: 11px;
    height: 11px;
    margin: -5.5px 0 0 -5.5px;
    border-radius: 50%;
    background: #c9ced6;
  }

  .ci .dot {
    width: 13px;
    height: 13px;
    margin: -6.5px 0 0 -6.5px;
    background: #fff;
  }

  .ctl .dot {
    width: 9px;
    height: 9px;
    margin: -4.5px 0 0 -4.5px;
    border-radius: 1px;
    transform: rotate(45deg);
    background: var(--stage-muted);
  }

  .whisk {
    height: 10px;
    margin-top: -5px;
    border: solid #fff;
    border-width: 0 2px;
  }

  .whisk::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 4px;
    border-top: 2px solid #fff;
  }

  .stem {
    height: 0;
    border-top: 2px solid rgb(201 206 214 / 55%);
    margin-top: -1px;
  }

  .band {
    height: 16px;
    margin-top: -8px;
    border-radius: 3px;
    background: repeating-linear-gradient(135deg, rgb(255 210 122 / 22%) 0 3px, rgb(255 210 122 / 10%) 3px 7px);
    border: 1px dashed rgb(255 210 122 / 60%);
  }

  .tick {
    width: 0;
    height: 22px;
    margin-top: -11px;
    border-left: 2px solid #ffd27a;
  }

  .val {
    display: grid;
    font-family: var(--mono);
    font-size: 0.82rem;
    color: #fff;
  }

  .val small {
    font-size: 0.68rem;
    line-height: 1.35;
    color: var(--stage-muted);
  }

  .axis {
    min-height: 0;
  }

  .axis .track {
    height: 20px;
  }

  .axis .track::before {
    display: none;
  }

  .worse,
  .better {
    position: absolute;
    bottom: 2px;
    font-family: var(--mono);
    font-size: 0.68rem;
    white-space: nowrap;
    color: var(--stage-muted);
  }

  .worse {
    right: calc(100% - var(--z) + 8px);
  }

  .better {
    left: calc(var(--z) + 8px);
  }

  .tk {
    position: absolute;
    top: 4px;
    transform: translateX(-50%);
    font-family: var(--mono);
    font-size: 0.68rem;
    color: var(--stage-muted);
  }

  .caption {
    margin-top: 14px;
  }

  .tscroll {
    margin-top: 26px;
  }

  .dtable .all th,
  .dtable .all td {
    font-weight: 600;
    color: #fff;
  }

  .dtable tbody th {
    white-space: nowrap;
  }

  .tcap {
    margin: 10px 0 0;
  }

  @container (max-width: 620px) {
    .row {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        'lab v'
        'track track'
        'sub sub';
      row-gap: 2px;
      padding: 4px 0;
    }

    .lab {
      grid-area: lab;
    }

    .val {
      display: contents;
    }

    .v {
      grid-area: v;
      text-align: right;
    }

    .val small {
      grid-area: sub;
    }

    .track {
      grid-area: track;
    }

    .track::before {
      top: 0;
      bottom: 0;
    }

    .axis {
      grid-template-areas: 'track track';
      padding: 0;
    }

    .axis > span:not(.track) {
      display: none;
    }
  }

  @media (max-width: 700px) {
    .clf {
      grid-template-columns: minmax(0, 1fr);
    }

    .plus {
      justify-self: center;
      line-height: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .track i {
      transition: none;
    }
  }
</style>
