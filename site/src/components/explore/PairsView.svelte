<script lang="ts">
  import type { Attachment } from 'svelte/attachments';
  import VirtualList from './VirtualList.svelte';
  import Thumb from './Thumb.svelte';
  import { scrub } from './sprite';
  import { GOAL_INFO, FORM_ORDER, FORM_SHORT, FORM_NAME, statusText, rowKey, type PairItem, type PairRow, type FormId } from '../../lib/explore';
  import { MODEL_NAME, MODEL_SHORT } from '../../lib/study';

  /**
   * One row per paired set (model × start × goal): the same start under the three wordings, side by side. Cells outside
   * the filters stay in place, greyed, so the pair is always complete. Moving a pointer across any thumbnail scrubs all
   * three at the same episode time.
   */
  let {
    items,
    probes,
    starts,
    onopen,
    oncompare,
  }: {
    items: PairItem[];
    /** Rows rendered hidden to fix the row pitch: one per goal, so every label length is covered. */
    probes: PairRow[];
    /** Start slots per scene. */
    starts: number;
    onopen: (id: string) => void;
    oncompare: (row: string) => void;
  } = $props();

  const CMP = 'compare:';
  let vl = $state<ReturnType<typeof VirtualList>>();

  const index = $derived(new Map(items.map((x, r) => [x.row.key, r])));

  function posOf(id: string) {
    if (id.startsWith(CMP)) {
      const r = index.get(id.slice(CMP.length));
      return r == null ? null : { r, c: 0 };
    }
    const r = index.get(rowKey(id));
    const c = FORM_ORDER.indexOf(id.slice(-1) as FormId);
    return r == null || c < 0 ? null : { r, c: c + 1 };
  }

  const idOf = (r: number, c: number) => (c === 0 ? CMP + items[r].row.key : items[r].row.cells[c - 1].e.id);

  /** Focus the cell of an episode, or the Compare button of a paired set (`compare:<row>`). */
  export const focusId = (id: string) => vl?.focusId(id) ?? Promise.resolve(false);
  export const focusCompare = (row: string) => focusId(CMP + row);

  const NONE: [boolean, boolean, boolean] = [true, true, true];
</script>

{#snippet card(row: PairRow, on: boolean[], ac: number, measure: Attachment<HTMLElement>, probe: boolean)}
  {@const info = GOAL_INFO[row.goal.key]}
  {@const e0 = row.cells[0].e}
  {@const where = `${MODEL_SHORT[e0.m]}, start ${e0.c} of ${starts}, ${row.goal.label}`}
  <div class="pcard" data-scrub>
    <div class="pin" {@attach measure}>
      <div class="rh" role={probe ? undefined : 'rowheader'}>
        <div class="rtext">
          <p class="rmeta">
            <span class="model" title={MODEL_NAME[e0.m]}>{MODEL_SHORT[e0.m]}</span>
            <span class="start">Start {e0.c} of {starts}</span>
            <span class="rid mono">{row.key}</span>
          </p>
          <p class="rgoal"><span class="tok-mover">{info.parts.mover}</span> {info.parts.rel} <span class="tok-ref">{info.parts.ref}</span></p>
          {#if probe || row.diff || e0.init}
            <p class="badges">
              {#if probe || row.diff}<span class="badge diff"><b aria-hidden="true">≠</b>Outcome differs</span>{/if}
              {#if probe || e0.init}<span class="badge init">Goal true at start</span>{/if}
            </p>
          {/if}
        </div>
        <button
          type="button"
          class="cmp"
          data-c="0"
          tabindex={ac === 0 ? 0 : -1}
          aria-haspopup="dialog"
          aria-label="Compare wordings · {where}"
          onclick={() => oncompare(row.key)}
        >
          <svg viewBox="0 0 20 14" aria-hidden="true"
            ><rect x="0.75" y="0.75" width="5" height="12.5" rx="1.4" /><rect x="7.5" y="0.75" width="5" height="12.5" rx="1.4" /><rect
              x="14.25"
              y="0.75"
              width="5"
              height="12.5"
              rx="1.4"
            /></svg
          >
          <span class="cl"><span class="cw">Compare</span><span class="cx">{' wordings'}</span></span>
        </button>
      </div>
      {#each row.cells as c, j (c.e.id)}
        <div class="cell" class:off={!on[j]} role={probe ? undefined : 'gridcell'}>
          <button
            type="button"
            class="cb"
            data-c={j + 1}
            tabindex={ac === j + 1 ? 0 : -1}
            aria-haspopup="dialog"
            aria-label="{FORM_SHORT[c.e.f]} {statusText(c.e, c.o)}: {FORM_NAME[c.e.f]} wording. {where}.{on[j] ? '' : ' Outside the current filters.'}"
            onclick={() => onopen(c.e.id)}
            {@attach probe ? null : scrub}
          >
            <Thumb id={probe ? '' : c.e.id} dim={!on[j]}>
              <span class="form-pill {c.e.f} fp" data-qa-overlay>{FORM_SHORT[c.e.f]}</span>
            </Thumb>
            <span class="st"
              ><span class="status {c.o}"><span class="full">{statusText(c.e, c.o)}</span><span class="short">{statusText(c.e, c.o, true)}</span></span
              ></span
            >
          </button>
        </div>
      {/each}
    </div>
  </div>
{/snippet}

<div class="pairs">
  <VirtualList
    bind:this={vl}
    count={items.length}
    colsIn={() => 4}
    {idOf}
    {posOf}
    keyOf={(r) => items[r].row.key}
    label="Paired rollouts: the same start under the three wordings"
    colcount={4}
    gap={12}
    est={250}
    defaultCol={1}
  >
    {#snippet row(r, ac, measure)}
      {@render card(items[r].row, items[r].on, ac, measure, false)}
    {/snippet}
    {#snippet probe(measure)}
      {#each probes as p (p.key)}{@render card(p, NONE, -1, measure, true)}{/each}
    {/snippet}
  </VirtualList>
</div>

<style>
  .pairs {
    container-type: inline-size;
  }

  .pcard {
    height: 100%;
    border-radius: 14px;
    background: var(--card);
    box-shadow:
      inset 0 0 0 1px var(--rule),
      0 1px 2px rgb(20 22 28 / 4%);
  }

  .pin {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px 8px;
    padding: 10px;
    align-items: start;
  }

  /* ------------------------------------------------------------------ row header */
  .rh {
    grid-column: 1 / -1;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    min-width: 0;
  }

  .rtext {
    flex: 1 1 auto;
    min-width: 0;
    display: grid;
    gap: 5px;
  }

  .rmeta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    margin: 0;
    font-size: 0.78rem;
    line-height: 1.35;
    color: var(--muted);
  }

  .model {
    font-family: var(--mono);
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--ink);
    background: var(--paper-2);
    border: 1px solid var(--rule);
    border-radius: 6px;
    padding: 1px 6px;
  }

  .rid {
    display: none;
    font-size: 0.7rem;
    letter-spacing: 0.01em;
  }

  .rgoal {
    margin: 0;
    font-family: var(--serif);
    font-size: 1rem;
    line-height: 1.45;
    color: var(--ink);
  }

  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin: 1px 0 0;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.72rem;
    font-weight: 500;
    line-height: 1.3;
    padding: 2px 7px;
    border-radius: 6px;
    white-space: nowrap;
  }

  .badge.diff {
    color: var(--ink);
    border: 1px solid var(--ink-2);
  }

  .badge.diff b {
    font-weight: 600;
  }

  .badge.init {
    color: var(--ink-2);
    background: var(--paper-2);
    border: 1px solid var(--rule);
  }

  .cmp {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 34px;
    margin: 0;
    padding: 6px 12px;
    border: 1px solid var(--rule-2);
    border-radius: 999px;
    background: var(--card);
    color: var(--ink);
    font-size: 0.8rem;
    font-weight: 500;
    line-height: 1.2;
    white-space: nowrap;
    cursor: pointer;
    transition:
      border-color 0.15s,
      background 0.15s,
      color 0.15s;
  }

  .cmp:hover {
    background: var(--ink);
    border-color: var(--ink);
    color: #fff;
  }

  .cmp svg {
    width: 17px;
    height: 12px;
    flex: none;
  }

  .cmp rect {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
  }

  .cx {
    display: none;
  }

  /* ------------------------------------------------------------------ cells */
  .cell {
    container-type: inline-size;
    min-width: 0;
  }

  .cb {
    display: grid;
    gap: 7px;
    width: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 11px;
    background: none;
    text-align: left;
    cursor: pointer;
    scroll-margin-bottom: 76px;
    touch-action: pan-y;
  }

  .cb :global(.thumb) {
    transition: box-shadow 0.15s;
  }

  .cb:hover :global(.thumb) {
    box-shadow: 0 0 0 2px var(--ink-2);
  }

  .off .cb {
    outline: 1px dashed var(--rule-2);
    outline-offset: 3px;
  }

  .off .cb:focus-visible {
    outline: 2px solid var(--tf);
    outline-offset: 2px;
  }

  .fp {
    position: absolute;
    top: 6px;
    left: 6px;
    box-shadow: 0 2px 8px rgb(0 0 0 / 35%);
  }

  .st {
    display: flex;
    justify-content: center;
    min-width: 0;
  }

  .short {
    display: none;
  }

  .status.lost {
    color: color-mix(in srgb, #a86f00 70%, #000);
  }

  @container (max-width: 150px) {
    .full {
      display: none;
    }

    .short {
      display: inline;
    }
  }

  /* ------------------------------------------------------------------ wide rows: header column beside the cells */
  @container (min-width: 720px) {
    .pin {
      grid-template-columns: minmax(220px, 1fr) repeat(3, minmax(0, 200px));
      gap: 14px;
      padding: 14px;
    }

    .rh {
      grid-column: auto;
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
    }

    .rtext {
      gap: 7px;
    }

    .rgoal {
      font-size: 1.08rem;
    }

    .rid {
      display: inline;
    }

    .cx {
      display: inline;
    }
  }

  @media (min-width: 800px) {
    .cb {
      scroll-margin-bottom: 0;
    }
  }
</style>
