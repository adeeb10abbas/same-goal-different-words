<script lang="ts">
  import type { Attachment } from 'svelte/attachments';
  import VirtualList from './VirtualList.svelte';
  import Thumb from './Thumb.svelte';
  import { scrub } from './sprite';
  import { GOAL_INFO, FORM_SHORT, FORM_NAME, statusText, type Rec } from '../../lib/explore';
  import { MODEL_SHORT } from '../../lib/study';

  /** One card per rollout, in the current sort order, as many columns as fit. */
  let {
    recs,
    probes,
    starts,
    onopen,
  }: {
    recs: Rec[];
    /** Cards rendered hidden to fix the row pitch: one per model × goal, so every label length is covered. */
    probes: Rec[];
    starts: number;
    onopen: (id: string) => void;
  } = $props();

  const MIN = 158;
  const GAP = 12;

  let w = $state(0);
  const cols = $derived(Math.max(2, Math.floor((w + GAP) / (MIN + GAP))));
  const rows = $derived(Math.ceil(recs.length / cols));
  const index = $derived(new Map(recs.map((r, i) => [r.e.id, i])));

  const colsIn = (r: number) => Math.min(cols, recs.length - r * cols);
  const idOf = (r: number, c: number) => recs[r * cols + c].e.id;
  function posOf(id: string) {
    const i = index.get(id);
    return i == null ? null : { r: Math.floor(i / cols), c: i % cols };
  }

  let vl = $state<ReturnType<typeof VirtualList>>();
  export const focusId = (id: string) => vl?.focusId(id) ?? Promise.resolve(false);

  const label = (x: Rec) => `${MODEL_SHORT[x.e.m]} · ${GOAL_INFO[x.goal.key].compact}`;
</script>

{#snippet card(x: Rec, c: number, ac: number, measure: Attachment<HTMLElement>, probe: boolean)}
  <div class="gc" role={probe ? undefined : 'gridcell'}>
    <button
      type="button"
      class="gb"
      data-c={c}
      data-scrub
      tabindex={ac === c ? 0 : -1}
      aria-label="{FORM_SHORT[x.e.f]} {statusText(x.e, x.o)} {label(x)}: {FORM_NAME[x.e.f]} wording, start {x.e.c} of {starts}, {x.goal.label}. {x.e.id}."
      onclick={() => onopen(x.e.id)}
      {@attach probe ? null : scrub}
    >
      <span class="gin" {@attach measure}>
        <Thumb id={probe ? '' : x.e.id}>
          <span class="form-pill {x.e.f} fp" data-qa-overlay>{FORM_SHORT[x.e.f]}</span>
          <span class="gid mono" data-qa-overlay aria-hidden="true">{x.e.id}</span>
        </Thumb>
        <span class="meta">
          <span class="status {x.o}"><span class="full">{statusText(x.e, x.o)}</span><span class="short">{statusText(x.e, x.o, true)}</span></span>
          <span class="glab">{label(x)}</span>
        </span>
      </span>
    </button>
  </div>
{/snippet}

<div class="gridv" bind:clientWidth={w} style:--cols={cols}>
  {#if w}
    <VirtualList
      bind:this={vl}
      count={rows}
      {colsIn}
      {idOf}
      {posOf}
      keyOf={(r) => String(r)}
      label="Rollouts"
      colcount={cols}
      gap={GAP}
      est={260}
    >
      {#snippet row(r, ac, measure)}
        <div class="grow">
          {#each recs.slice(r * cols, r * cols + cols) as x, c (x.e.id)}{@render card(x, c, ac, measure, false)}{/each}
        </div>
      {/snippet}
      {#snippet probe(measure)}
        <div class="grow probe">
          {#each probes as x (x.e.id)}{@render card(x, 0, -1, measure, true)}{/each}
        </div>
      {/snippet}
    </VirtualList>
  {/if}
</div>

<style>
  .gridv {
    min-height: 1px;
  }

  .grow {
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
    gap: 12px;
    height: 100%;
  }

  .grow.probe {
    height: auto;
  }

  .gc {
    container-type: inline-size;
    min-width: 0;
    height: 100%;
  }

  .gb {
    display: block;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 13px;
    background: var(--card);
    box-shadow:
      inset 0 0 0 1px var(--rule),
      0 1px 2px rgb(20 22 28 / 4%);
    text-align: left;
    cursor: pointer;
    scroll-margin-bottom: 76px;
    touch-action: pan-y;
    transition: box-shadow 0.15s;
  }

  .gb:hover {
    box-shadow:
      inset 0 0 0 1px var(--ink-2),
      0 6px 18px -8px rgb(20 22 28 / 30%);
  }

  /* Measured for the row pitch, so it carries the card's padding. */
  .gin {
    display: grid;
    gap: 7px;
    padding: 6px 6px 8px;
  }

  .fp {
    position: absolute;
    top: 6px;
    left: 6px;
    box-shadow: 0 2px 8px rgb(0 0 0 / 35%);
  }

  /* The id appears on hover and keyboard focus; it may break across two lines on narrow cards. */
  .gid {
    position: absolute;
    left: 6px;
    right: 6px;
    bottom: 6px;
    padding: 2px 6px;
    border-radius: 6px;
    background: rgb(13 15 19 / 82%);
    color: #fff;
    font-size: 0.68rem;
    line-height: 1.35;
    text-align: center;
    overflow-wrap: anywhere;
    opacity: 0;
    transition: opacity 0.15s;
    pointer-events: none;
  }

  .gb:hover .gid,
  .gb:focus-visible .gid {
    opacity: 1;
  }

  .meta {
    display: grid;
    justify-items: start;
    gap: 5px;
    padding: 0 2px;
    min-width: 0;
  }

  .glab {
    font-size: 0.78rem;
    line-height: 1.35;
    color: var(--ink-2);
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

  @media (min-width: 800px) {
    .gb {
      scroll-margin-bottom: 0;
    }
  }
</style>
