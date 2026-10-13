<script lang="ts">
  import { onMount } from 'svelte';
  import { study, MODELS, SCENES } from '../../lib/study';
  import { onVisible, reducedMotion } from '../../lib/sync';
  import { fmtCI, fmtP, num, spell, ROWS, type RowId } from '../../lib/results';

  const uid = $props.id();
  const TF = study.contrasts.TF_RF;
  const BOWLS = SCENES.find((s) => s.short === 'Bowls')!;
  // The no-bowls estimate is the mean of the remaining scenes' start-level differences.
  const rest = TF.anytime.All.starts.filter((st: { scene: string }) => st.scene !== BOWLS.id);
  const restMean = rest.reduce((t: number, st: { d: number }) => t + st.d, 0) / rest.length;
  if (Math.abs(restMean - TF.anytimeNoBowls.est) > 1e-4) throw new Error('results: no-bowls estimate');

  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  type Item = { id: string; name: string; notes: string[]; est: number; ci: [number, number]; tested: boolean };
  const ITEMS: Item[] = [
    {
      id: 'any',
      name: 'At any time',
      notes: ['Primary test', `Holm-adjusted p ${fmtP(TF.pHolm)}`],
      est: TF.anytime.All.est,
      ci: TF.anytime.All.ci,
      tested: true,
    },
    { id: 'end', name: 'At episode end', notes: ['Descriptive'], est: TF.end.All.est, ci: TF.end.All.ci, tested: false },
    {
      id: 'nobowls',
      name: 'Bowl scene removed',
      notes: ['Any time · descriptive', `${cap(spell(SCENES.length - 1))} scenes weighted equally`],
      est: TF.anytimeNoBowls.est,
      ci: TF.anytimeNoBowls.ci,
      tested: false,
    },
  ];
  const STEP = 0.05;
  const LO = Math.min(0, Math.floor(Math.min(...ITEMS.map((x) => x.ci[0])) / STEP) * STEP);
  const HI = Math.ceil(Math.max(...ITEMS.map((x) => x.ci[1])) / STEP) * STEP;
  const TICKS = Array.from({ length: Math.round((HI - LO) / STEP) + 1 }, (_, i) => +(LO + i * STEP).toFixed(4));

  let w = $state(0);
  const PX = 14;
  const x = $derived((v: number) => PX + ((v - LO) / (HI - LO)) * Math.max(1, w - 2 * PX));
  // Label every tick only when they have room; gridlines stay at every step.
  const every = $derived(Math.max(1, Math.ceil(28 / (Math.max(1, w - 2 * PX) / (TICKS.length - 1)))));
  const RH = 34;

  const reduce = reducedMotion();
  let shown = $state(reduce);
  let el: HTMLDivElement;
  onMount(() => {
    if (shown) return;
    const off = onVisible(
      el,
      (v) => {
        if (v) {
          shown = true;
          off();
        }
      },
      0.4,
    );
    return off;
  });

  const DIR = study.contrasts.DIR_RF;
  const rowName = (r: RowId) => (r === 'All' ? 'All models' : MODELS.find((m) => m.id === r)!.short);
</script>

<div class="rb-cq">
<div class="rb-wrap">
  <div class="fig sens" bind:this={el}>
    <h4 class="fh" id="{uid}-s">Sensitivity of the main estimate</h4>
    <div class="forest" role="img" aria-labelledby="{uid}-s" aria-describedby="{uid}-d">
      <div class="frow head" aria-hidden="true">
        <span class="fl"></span>
        <span class="ax" bind:clientWidth={w}>
          <svg width="100%" height="18">
            {#if w}
              {#each TICKS as t, i (t)}{#if i % every === 0}<text x={x(t)} y="13" text-anchor="middle">{num(t, 0)}</text>{/if}{/each}
            {/if}
          </svg>
        </span>
        <span class="fv">TF − RF, points</span>
      </div>
      {#each ITEMS as it (it.id)}
        <div class="frow" class:main={it.tested} aria-hidden="true">
          <span class="fl"><b>{it.name}</b>{#each it.notes as n (n)}<span class="fn">{n}</span>{/each}</span>
          <svg class="fp" width="100%" height={RH}>
            {#if w}
              {#each TICKS as t (t)}
                <line class="grid" class:zero={t === 0} x1={x(t)} x2={x(t)} y1="0" y2={RH} />
              {/each}
              <rect
                class="ci"
                x={x(it.ci[0])}
                y={RH / 2 - 2.5}
                width={x(it.ci[1]) - x(it.ci[0])}
                height="5"
                rx="2.5"
                style:transform-origin="{x(it.est)}px {RH / 2}px"
                style:transform="scaleX({shown ? 1 : 0})"
                data-qa-shape
              />
              <path
                class="pt"
                d="M{x(it.est)} {RH / 2 - 8}L{x(it.est) + 8} {RH / 2}L{x(it.est)} {RH / 2 + 8}L{x(it.est) - 8} {RH / 2}Z"
                data-qa-shape
              />
            {/if}
          </svg>
          <span class="fv"><b class="num">{num(it.est, 2)}</b> <span class="num">{fmtCI(it.ci)}</span></span>
        </div>
      {/each}
    </div>
    <div class="sr-only" id="{uid}-d">
      {ITEMS.map((it) => `${it.name}: ${num(it.est, 2)} points, 95% interval ${fmtCI(it.ci)}, ${it.notes.join(', ')}.`).join(' ')}
    </div>
    <p class="caption">
      Diamonds are pooled TF − RF estimates in percentage points; bars are 95% intervals from resampling the physical starts within each scene.
      Only the any-time estimate belongs to the original test family. The end-of-episode and bowl-free summaries are descriptive, and their intervals
      come from the released study data rather than the paper’s text.
    </p>
  </div>

  <div class="fig dirrf">
    <h4 class="fh" id="{uid}-t">Direct versus reference-first</h4>
    <div class="tscroll" role="region" aria-labelledby="{uid}-t" tabindex="0" data-qa-scroll="x">
      <table class="dtable" aria-describedby="{uid}-tc">
        <caption class="sr-only">Exploratory DIR − RF gaps in percentage points with 95% intervals</caption>
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col">At any time</th>
            <th scope="col">At episode end</th>
          </tr>
        </thead>
        <tbody>
          {#each ROWS as r (r)}
            <tr class:tot={r === 'All'}>
              <th scope="row">{rowName(r)}</th>
              {#each [DIR.anytime[r], DIR.end[r]] as iv, k (k)}
                <td class="num"><span class="de">{num(iv.est)}</span> <span class="dc">{fmtCI(iv.ci)}</span></td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="caption" id="{uid}-tc">
      Exploratory DIR − RF gaps in percentage points, with 95% intervals from resampling paired physical starts. Positive values favour the direct
      instruction. No new multiplicity-adjusted significance claims are made.
    </p>
  </div>
</div>
</div>

<style>
  .rb-cq {
    container-type: inline-size;
    margin-top: clamp(28px, 3.6vw, 48px);
  }

  .rb-wrap {
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr);
    gap: 22px;
    align-items: start;
  }

  .rb-wrap > .fig {
    margin: 0;
    min-width: 0;
  }

  .fh {
    margin: 0 0 14px;
    font-size: 1rem;
    font-weight: 700;
  }

  .forest {
    display: grid;
    grid-template-columns: minmax(9.5rem, 12rem) minmax(0, 1fr) max-content;
    column-gap: 14px;
  }

  .frow {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    align-items: center;
    padding: 7px 0;
    border-top: 1px solid var(--rule);
  }

  .frow.head {
    border-top: 0;
    padding: 0 0 2px;
    align-items: end;
  }

  .fl {
    display: grid;
    gap: 1px;
    min-width: 0;
    font-size: 0.88rem;
  }

  .fl b {
    font-weight: 600;
  }

  .main .fl b {
    font-weight: 700;
  }

  .fn {
    font-size: 0.74rem;
    line-height: 1.35;
    color: var(--muted);
  }

  .fl b + .fn {
    margin-top: 2px;
  }

  .ax {
    display: block;
    min-width: 0;
  }

  .ax svg,
  .fp {
    display: block;
    overflow: visible;
  }

  .ax text {
    font-family: var(--mono);
    font-size: 0.66rem;
    fill: var(--muted);
  }

  .fv {
    text-align: right;
    white-space: nowrap;
    font-size: 0.82rem;
    color: var(--muted);
  }

  .head .fv {
    font-family: var(--mono);
    font-size: 0.66rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .fv b {
    font-family: var(--mono);
    font-size: 0.92rem;
    color: var(--tf);
  }

  .fv span {
    font-family: var(--mono);
  }

  .grid {
    stroke: var(--rule);
  }

  .grid.zero {
    stroke: var(--ink-2);
    stroke-opacity: 0.55;
    stroke-dasharray: 3 3;
  }

  .ci {
    fill: var(--tf);
    opacity: 0.35;
    transition: transform 0.8s var(--ease);
  }

  .main .ci {
    opacity: 0.5;
  }

  .pt {
    fill: var(--tf);
    stroke: var(--card);
    stroke-width: 1.5;
  }

  .sens .caption {
    margin-top: 14px;
  }

  .dirrf {
    container-type: inline-size;
  }

  .dirrf .dtable td {
    white-space: nowrap;
  }

  .dirrf .caption {
    margin-top: 10px;
  }

  /* Narrow: each interval drops below its estimate so the table fits without scrolling. */
  @container (max-width: 400px) {
    .dirrf .dtable th,
    .dirrf .dtable td {
      padding-inline: 6px;
    }

    .dirrf .dtable th:first-child {
      padding-left: 0;
    }

    .dirrf .dtable td:last-child,
    .dirrf .dtable thead th:last-child {
      padding-right: 0;
    }

    .dirrf .dtable thead th {
      white-space: normal;
      vertical-align: bottom;
    }

    .dc {
      display: block;
      font-size: 0.78rem;
      font-weight: 400;
      color: var(--muted);
    }
  }

  .dirrf tr.tot th,
  .dirrf tr.tot td {
    font-weight: 700;
  }

  @container (max-width: 1060px) {
    .rb-wrap {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @container (max-width: 560px) {
    .forest {
      grid-template-columns: minmax(0, 1fr) max-content;
    }

    .frow {
      grid-template-columns: subgrid;
      grid-template-areas:
        'l l'
        'p v';
      row-gap: 4px;
    }

    .frow .fl {
      grid-area: l;
    }

    .frow .fp,
    .frow .ax {
      grid-area: p;
    }

    .frow .fv {
      grid-area: v;
    }

    .frow.head {
      grid-template-areas: 'p v';
    }

    .frow.head .fl {
      display: none;
    }
  }

  @container (max-width: 420px) {
    .forest {
      grid-template-columns: minmax(0, 1fr);
    }

    .frow {
      grid-template-areas:
        'l'
        'v'
        'p';
    }

    .frow.head {
      grid-template-areas:
        'v'
        'p';
      row-gap: 2px;
    }

    .frow .fv {
      text-align: left;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ci {
      transition: none;
    }
  }
</style>
