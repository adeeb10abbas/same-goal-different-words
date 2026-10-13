<script lang="ts">
  import { study, MODELS, SCENES, GOALS, FORM_ORDER, FORM_SHORT, FORM_NAME, FORM_COLOR } from '../../lib/study';
  import { href } from '../../lib/media';
  import { cell, countsCsv, spell, STARTS } from '../../lib/results';

  let { open = false }: { open?: boolean } = $props();
  const uid = $props.id();

  // Per-model, per-wording totals over all twelve goals, checked against the published flow counts.
  const TOT = Object.fromEntries(
    MODELS.map((m) => [
      m.id,
      Object.fromEntries(
        FORM_ORDER.map((f) => {
          const a = GOALS.reduce((t, g) => t + cell(m.id, g.key, f)[0], 0);
          const e = GOALS.reduce((t, g) => t + cell(m.id, g.key, f)[1], 0);
          const want = study.flow.byModel[m.id][f];
          if (want.n !== GOALS.length * STARTS || want.anytime !== a || want.end !== e) throw new Error(`results: totals ${m.id} ${f}`);
          return [f, [a, e]];
        }),
      ),
    ]),
  ) as Record<string, Record<string, [number, number]>>;
  const N_CELLS = MODELS.length * GOALS.length * FORM_ORDER.length;

  function download() {
    const blob = new Blob([countsCsv()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'same-goal-different-words-placement-counts.csv';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // The scroller is a tab stop only while it actually overflows, so keyboard users can scroll it.
  let scroller = $state<HTMLDivElement>();
  let overflows = $state(true);
  $effect(() => {
    const el = scroller;
    if (!el) return;
    const check = () => {
      overflows = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  });
</script>

<details class="ct" {open}>
  <summary>
    <span class="st">Every count: {GOALS.length} goals × {FORM_ORDER.length} wordings × {MODELS.length} models</span>
    <span class="sh">{N_CELLS} cells, each any time / at episode end, out of {STARTS}</span>
  </summary>
  <div class="inner">
    <div class="top">
      <p class="note">
        Each entry gives any-time and episode-end stable-placement counts, both out of {spell(STARTS)} starts. A dagger marks a goal already satisfied
        in all {spell(STARTS)} starting states. Zeros are observed failures. These scores assess the resulting arrangement and do not establish that the
        requested object moved.
      </p>
      <button type="button" class="btn dl" onclick={download}>
        <svg viewBox="0 0 16 16" aria-hidden="true"
          ><path d="M8 2v8m0 0-3-3m3 3 3-3M3 13h10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg
        >
        Download CSV
      </button>
    </div>
    <div class="tscroll" role="region" aria-labelledby="{uid}-c" tabindex={overflows ? 0 : undefined} bind:this={scroller} data-qa-scroll>
      <table class="dtable ctab" aria-describedby="{uid}-d">
        <caption class="sr-only" id="{uid}-c">Stable-placement counts by goal, model and wording</caption>
        <thead>
          <tr>
            <th scope="col" rowspan="2" class="gcol">Goal</th>
            {#each MODELS as m (m.id)}
              <th scope="colgroup" colspan={FORM_ORDER.length} class="mh">{m.short}</th>
            {/each}
          </tr>
          <tr>
            {#each MODELS as m (m.id)}
              {#each FORM_ORDER as f, fi (f)}
                <th scope="col" class:first={fi === 0} style:color={FORM_COLOR[f]}><abbr title={FORM_NAME[f]}>{FORM_SHORT[f]}</abbr></th>
              {/each}
            {/each}
          </tr>
        </thead>
        {#each SCENES as sc (sc.id)}
          <tbody>
            <tr class="sc">
              <th scope="rowgroup" colspan={1 + MODELS.length * FORM_ORDER.length}><span class="scn">{sc.title}</span></th>
            </tr>
            {#each sc.goals as g (g.key)}
              <tr class:it={g.initiallyTrue}>
                <th scope="row" class="gcol">
                  <a href={href(`explore/?g=${g.key}`)}
                    ><span class="gl-l">{g.label}</span><span class="gl-s" aria-hidden="true">{g.short}</span></a
                  >{#if g.initiallyTrue}<span class="dag" title="Already true at reset">†</span>{/if}
                </th>
                {#each MODELS as m (m.id)}
                  {#each FORM_ORDER as f, fi (f)}
                    {@const c = cell(m.id, g.key, f)}
                    <td class="num" class:first={fi === 0} class:zero={c[0] === 0} class:full={c[0] === STARTS && !g.initiallyTrue}
                      >{c[0]}<span class="sl">/</span>{c[1]}</td
                    >
                  {/each}
                {/each}
              </tr>
            {/each}
          </tbody>
        {/each}
        <tfoot>
          <tr>
            <th scope="row" class="gcol">
              <span class="gl-l">All {spell(GOALS.length)} goals, of {GOALS.length * STARTS}</span><span class="gl-s" aria-hidden="true">All goals, of {GOALS.length * STARTS}</span>
            </th>
            {#each MODELS as m (m.id)}
              {#each FORM_ORDER as f, fi (f)}
                <td class="num" class:first={fi === 0}>{TOT[m.id][f][0]}<span class="sl">/</span>{TOT[m.id][f][1]}</td>
              {/each}
            {/each}
          </tr>
        </tfoot>
      </table>
    </div>
    <p class="caption cap" id="{uid}-d">
      Entries are any-time / end stable-placement counts, each out of {spell(STARTS)}; † marks a goal already true at reset. Bold entries placed at any
      time from all {spell(STARTS)} starts on a goal that was not already true. Goal names open their episodes in the explorer.
    </p>
  </div>
</details>

<style>
  .ct {
    container-type: inline-size;
    margin-top: 22px;
    border: 1px solid var(--rule-2);
    border-radius: var(--radius);
    background: var(--card);
  }

  summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      't c'
      'h c';
    align-items: center;
    gap: 2px 16px;
    padding: 16px 20px;
    cursor: pointer;
    list-style: none;
    border-radius: var(--radius);
  }

  summary::-webkit-details-marker {
    display: none;
  }

  summary::after {
    grid-area: c;
    content: '';
    width: 10px;
    height: 10px;
    border-right: 2px solid var(--ink-2);
    border-bottom: 2px solid var(--ink-2);
    transform: translateY(-3px) rotate(45deg);
    transition: transform 0.25s var(--ease);
  }

  .ct[open] > summary::after {
    transform: translateY(2px) rotate(-135deg);
  }

  summary:hover .st {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .st {
    grid-area: t;
    font-weight: 700;
  }

  .sh {
    grid-area: h;
    font-size: 0.82rem;
    color: var(--muted);
  }

  .inner {
    padding: 0 20px 20px;
  }

  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px 24px;
    padding-top: 4px;
    border-top: 1px solid var(--rule);
  }

  .note {
    margin: 12px 0 0;
    max-width: var(--measure);
    font-size: 0.88rem;
    color: var(--ink-2);
  }

  .dl {
    margin-top: 12px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 7px 14px;
    font-size: 0.84rem;
  }

  .dl svg {
    width: 14px;
    height: 14px;
  }

  .tscroll {
    margin-top: 16px;
  }

  .ctab {
    min-width: 640px;
  }

  .ctab th,
  .ctab td {
    padding: 6px 8px;
  }

  .ctab thead th.mh {
    text-align: center;
    color: var(--ink-2);
    font-weight: 700;
    border-bottom: 1px solid var(--rule-2);
  }

  .ctab abbr {
    text-decoration: none;
    cursor: help;
  }

  .ctab .first {
    border-left: 1px solid var(--rule-2);
  }

  .ctab th.gcol {
    position: sticky;
    left: 0;
    z-index: 1;
    text-align: left;
    white-space: nowrap;
    padding-right: 14px;
    background: var(--card);
  }

  .ctab th.gcol a {
    scroll-margin: 12px;
  }

  .ctab tr.it th.gcol {
    background: var(--paper-2);
  }

  .scn {
    position: sticky;
    left: 0;
  }

  .gl-s {
    display: none;
  }

  .cap {
    margin-top: 10px;
  }

  .ctab tbody th.gcol a {
    color: var(--ink);
    text-decoration-color: var(--rule-2);
    text-underline-offset: 3px;
  }

  .ctab tbody th.gcol a:hover {
    text-decoration-color: currentColor;
  }

  .dag {
    margin-left: 3px;
    color: var(--muted);
  }

  .ctab tr.sc th {
    padding-top: 14px;
    font-family: var(--mono);
    font-size: 0.66rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    text-align: left;
  }

  .ctab td {
    white-space: nowrap;
  }

  .sl {
    margin: 0 1px;
    color: var(--muted);
  }

  .ctab td.zero {
    color: var(--muted);
  }

  .ctab td.full {
    font-weight: 700;
  }

  .ctab tr.it td {
    background: var(--paper-2);
  }

  .ctab tfoot th,
  .ctab tfoot td {
    font-weight: 700;
    border-top: 1px solid var(--rule-2);
    border-bottom: 0;
  }

  /* Narrow: the paper's short goal names keep the sticky column slim while the counts scroll. */
  @container (max-width: 820px) {
    .tscroll {
      max-height: max(220px, calc(100svh - 140px));
    }

    /* The full name stays in the link's accessible name; only the short name is drawn. */
    .gl-l {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }

    .gl-s {
      display: inline;
    }

    .ctab th.gcol {
      box-shadow: 1px 0 0 var(--rule-2);
      font-variant-numeric: normal;
    }
  }

  @container (max-width: 600px) {
    .ctab {
      min-width: 0;
    }

    .ctab thead th.mh {
      text-align: left;
    }

    summary {
      padding: 14px 16px;
    }

    .inner {
      padding: 0 16px 16px;
    }
  }
</style>
