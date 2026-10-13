<script lang="ts">
  import { FACETS, FACET, type FacetKey, type Opt, type Sel } from '../../lib/explore';
  import { SCENES } from '../../lib/study';

  let {
    sel,
    counts,
    onset,
    notes = {},
  }: {
    sel: Sel;
    /** Faceted counts, or null while the episodes load. */
    counts: Record<FacetKey, Record<string, number>> | null;
    onset: (key: FacetKey, values: string[]) => void;
    /** Short help under a facet title. */
    notes?: Partial<Record<FacetKey, string>>;
  } = $props();

  function toggle(k: FacetKey, v: string) {
    const cur = sel[k] ?? [];
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    onset(
      k,
      FACET[k].opts.map((o) => o.v).filter((x) => next.includes(x)),
    );
  }
</script>

{#snippet opt(k: FacetKey, o: Opt, layout: string)}
  {@const n = counts ? counts[k][o.v] : null}
  <button
    type="button"
    class="opt"
    class:zero={n === 0}
    aria-pressed={(sel[k] ?? []).includes(o.v)}
    title={o.name && o.name !== o.label ? o.name : undefined}
    onclick={() => toggle(k, o.v)}
  >
    {#if layout === 'forms'}
      <span class="form-pill {o.v}">{o.label}</span><span class="lab">{o.name}</span>
    {:else if layout === 'outcomes'}
      <i class="dot {o.v}" aria-hidden="true"></i><span class="lab">{o.label}</span>
    {:else if layout === 'goals'}
      <span class="lab" aria-hidden="true">{o.label}</span><span class="sr-only">{o.name}</span>
    {:else}
      <span class="lab">{o.label}</span>
    {/if}
    <span class="n num">{n ?? '–'}</span>
  </button>
{/snippet}

<div class="facets">
  {#each FACETS as f (f.key)}
    <section class="facet {f.layout}">
      <h3 class="ft">{f.title}</h3>
      {#if notes[f.key]}<p class="fnote">{notes[f.key]}</p>{/if}
      <div class="opts" role="group" aria-label={f.aria}>
        {#if f.layout === 'goals'}
          {#each SCENES as s (s.id)}
            <div class="gscene">
              <span class="gs" aria-hidden="true">{s.short}</span>
              <div class="gopts">
                {#each f.opts.filter((o) => o.group === s.id) as o (o.v)}{@render opt(f.key, o, f.layout)}{/each}
              </div>
            </div>
          {/each}
        {:else}
          {#each f.opts as o (o.v)}{@render opt(f.key, o, f.layout)}{/each}
        {/if}
      </div>
    </section>
  {/each}
</div>

<style>
  .facets {
    display: grid;
    gap: 22px;
  }

  .ft {
    font-family: var(--sans);
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0;
    line-height: 1.3;
    color: var(--ink-2);
    margin: 0 0 8px;
  }

  .fnote {
    margin: -4px 0 8px;
    font-size: 0.74rem;
    line-height: 1.4;
    color: var(--muted);
  }

  .opts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .list .opts,
  .outcomes .opts,
  .forms .opts {
    flex-direction: column;
    flex-wrap: nowrap;
    gap: 4px;
  }

  .goals .opts {
    flex-direction: column;
    flex-wrap: nowrap;
    gap: 10px;
  }

  .gscene {
    display: grid;
    gap: 5px;
  }

  .gs {
    font-family: var(--mono);
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
    line-height: 1.2;
  }

  .gopts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .opt {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 32px;
    margin: 0;
    padding: 4px 10px;
    border: 1px solid var(--rule-2);
    border-radius: 999px;
    background: var(--card);
    color: var(--ink);
    font-size: 0.84rem;
    line-height: 1.25;
    white-space: nowrap;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }

  .opt:hover {
    border-color: var(--ink-2);
  }

  /* Rows in a list may wrap their label, so they are rounded rectangles rather than pills. */
  .list .opt,
  .outcomes .opt,
  .forms .opt {
    display: flex;
    width: 100%;
    border-radius: 8px;
    white-space: normal;
    padding: 5px 10px;
  }

  .lab {
    flex: 1 1 auto;
    min-width: 0;
  }

  .n {
    flex: none;
    min-width: 3ch;
    text-align: right;
    font-size: 0.76rem;
    color: var(--muted);
  }

  .opt[aria-pressed='true'] {
    background: var(--ink);
    border-color: var(--ink);
    color: #fff;
  }

  .opt[aria-pressed='true'] .n {
    color: rgb(255 255 255 / 78%);
  }

  .opt.zero:not([aria-pressed='true']) {
    color: var(--muted);
    background: var(--paper);
    border-style: dashed;
  }

  .dot {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .dot.kept {
    background: var(--kept);
  }

  .dot.lost {
    background: var(--lost);
  }

  .dot.never {
    background: var(--never);
    box-shadow: inset 0 0 0 1px var(--rule-2);
  }

  .form-pill {
    flex: none;
    min-width: 3.6em;
    justify-content: center;
  }
</style>
