<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { loadEpisodes } from '../lib/media';
  import { study, MODELS, SCENES, GOALS } from '../lib/study';
  import Facets from './explore/Facets.svelte';
  import PairsView from './explore/PairsView.svelte';
  import GridView from './explore/GridView.svelte';
  import Modal from './explore/Modal.svelte';
  import Player from './explore/Player.svelte';
  import Compare from './explore/Compare.svelte';
  import {
    TOTAL,
    FACETS,
    FACET,
    FORM_ORDER,
    SORTS,
    build,
    matcher,
    facetCounts,
    nActive,
    sortRecs,
    sortRows,
    recSortKey,
    rowSortKey,
    cmpPos,
    parseQuery,
    toQuery,
    parseHash,
    type Data,
    type Sel,
    type View,
    type SortKey,
    type HashState,
    type PairItem,
    type FacetKey,
  } from '../lib/explore';

  const STARTS_PER_SCENE = study.settings.stats.starts / SCENES.length;
  const SETS = TOTAL / FORM_ORDER.length;
  const ALL_ON = [true, true, true] as const;
  const nb = (n: number, word: string) => `${n}\u00a0${word}`;

  let data = $state.raw<Data | null>(null);
  let err = $state<string | null>(null);
  let sel = $state.raw<Sel>({});
  let view = $state<View>('pairs');
  let sort = $state<SortKey>('id');
  let open = $state.raw<HashState>(null);
  let from = $state<string | null>(null);
  let ready = $state(false);
  let wide = $state(true);
  let drawer = $state(false);
  /** History entries this page pushed for the open layer; closing goes back over all of them. */
  let depth = 0;
  let lastFocus: HTMLElement | null = null;

  let pv = $state<ReturnType<typeof PairsView>>();
  let gv = $state<ReturnType<typeof GridView>>();
  let listEl = $state<HTMLElement>();
  let drawerEl = $state<HTMLDialogElement>();

  // ---------------------------------------------------------------------------------------------- derived lists
  const match = $derived(matcher(sel));
  const fc = $derived(data ? facetCounts(data.recs, sel) : null);
  const count = $derived(fc?.total ?? TOTAL);
  const nAct = $derived(nActive(sel));
  const pairItems = $derived.by(() => {
    if (!data) return [] as PairItem[];
    const out: PairItem[] = [];
    for (const row of data.rows) {
      const on = row.cells.map((c) => match(c)) as [boolean, boolean, boolean];
      if (on.some(Boolean)) out.push({ row, on });
    }
    return sortRows(out, sort);
  });
  const greyed = $derived(pairItems.some((x) => !x.on.every(Boolean)));
  const gridRecs = $derived(data ? sortRecs(data.recs.filter((r) => match(r)), sort) : []);
  const pairProbes = $derived(data ? data.rows.filter((r) => r.cells[0].e.m === 'F3' && r.cells[0].e.c === 1) : []);
  const gridProbes = $derived(data ? data.recs.filter((r) => r.e.c === 1 && r.e.f === 'D') : []);

  const itemIndex = $derived(new Map(pairItems.map((x, k) => [x.row.key, k])));
  const navIds = $derived(
    view === 'pairs'
      ? pairItems.flatMap((x) => x.row.cells.filter((_, j) => x.on[j]).map((c) => c.e.id))
      : gridRecs.map((r) => r.e.id),
  );
  const navIndex = $derived(new Map(navIds.map((id, k) => [id, k])));
  const rowIds = $derived(pairItems.map((x) => x.row.key));
  const rowIndex = $derived(new Map(rowIds.map((id, k) => [id, k])));

  function rowOn(key: string) {
    const k = itemIndex.get(key);
    return k == null ? ALL_ON : pairItems[k].on;
  }

  function epKey(id: string): number[] {
    const r = data!.byId.get(id)!;
    if (view === 'grid') return [recSortKey(r, sort), r.i];
    const row = data!.byRow.get(r.row)!;
    return [rowSortKey(row, rowOn(row.key), sort), row.i, FORM_ORDER.indexOf(r.e.f)];
  }

  function setKey(key: string): number[] {
    const row = data!.byRow.get(key)!;
    return [rowSortKey(row, rowOn(key), sort), row.i];
  }

  /** Neighbours of `id` in the current order; a rollout outside the filters sits where it would sort. */
  function around(ids: string[], index: Map<string, number>, id: string, key: (x: string) => number[]) {
    const k = index.get(id);
    if (k != null) return { prev: ids[k - 1] ?? null, next: ids[k + 1] ?? null, where: `${k + 1} of ${ids.length}` };
    const me = key(id);
    let lo = 0;
    let hi = ids.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cmpPos(key(ids[mid]), me) < 0) lo = mid + 1;
      else hi = mid;
    }
    return { prev: ids[lo - 1] ?? null, next: ids[lo] ?? null, where: 'Outside filters' };
  }

  const layer = $derived.by(() => {
    if (!data || !open) return null;
    if (open.kind === 'ep') {
      const rec = data.byId.get(open.id);
      return rec ? { kind: 'ep' as const, rec, nav: around(navIds, navIndex, rec.e.id, epKey) } : null;
    }
    const row = data.byRow.get(open.row);
    return row ? { kind: 'cmp' as const, row, nav: around(rowIds, rowIndex, row.key, setKey) } : null;
  });

  // ---------------------------------------------------------------------------------------------- URL
  const hashOf = (h: HashState) => (h ? `#${h.kind === 'ep' ? h.id : `compare=${h.row}`}` : '');
  const urlOf = (h: HashState) => location.pathname + location.search + hashOf(h);

  function push(h: HashState, extra: { from?: string } = {}) {
    depth += 1;
    history.pushState({ ex: depth, ...extra }, '', urlOf(h));
    open = h;
    from = extra.from ?? null;
  }

  function replace(h: HashState) {
    history.replaceState(history.state, '', urlOf(h));
    open = h;
  }

  function openEp(id: string) {
    lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    push({ kind: 'ep', id });
  }

  function openCompare(row: string) {
    lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    push({ kind: 'compare', row });
  }

  async function restoreFocus(h: HashState) {
    await tick();
    let ok = false;
    if (h?.kind === 'ep') ok = (await (view === 'pairs' ? pv : gv)?.focusId(h.id)) ?? false;
    else if (h?.kind === 'compare')
      ok = (await (view === 'pairs' ? pv?.focusCompare(h.row) : gv?.focusId(`${h.row}-${FORM_ORDER[0]}`))) ?? false;
    if (!ok && lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
  }

  let closing = false;

  function close() {
    const was = open;
    open = null;
    from = null;
    if (depth > 0) {
      const d = depth;
      depth = 0;
      closing = true;
      history.go(-d);
    } else history.replaceState(history.state, '', urlOf(null));
    restoreFocus(was);
  }

  /** A layer hash without our history state (typed, linked or loaded): add an entry below it so Back closes the layer. */
  function normalize() {
    const h = parseHash(location.hash);
    if (!h || typeof history.state?.ex === 'number') return;
    history.replaceState({ ex: 0 }, '', location.pathname + location.search);
    history.pushState({ ex: 1 }, '', location.pathname + location.search + hashOf(h));
  }

  function onpop() {
    if (closing) {
      closing = false;
      if (parseHash(location.hash)) history.replaceState(history.state, '', location.pathname + location.search);
    } else normalize();
    syncFromUrl();
  }

  function syncFromUrl() {
    const st = parseQuery(location.search);
    sel = st.sel;
    view = st.view;
    sort = st.sort;
    open = parseHash(location.hash);
    depth = typeof history.state?.ex === 'number' ? history.state.ex : 0;
    from = history.state?.from ?? null;
  }

  $effect(() => {
    if (!ready) return;
    const q = toQuery({ sel, view, sort });
    if (q !== location.search) history.replaceState(history.state, '', location.pathname + q + location.hash);
  });

  // ---------------------------------------------------------------------------------------------- filters
  function setFacet(k: FacetKey, values: string[]) {
    const next: Sel = { ...sel };
    if (values.length) next[k] = values;
    else delete next[k];
    sel = next;
    changed();
  }

  function clearAll() {
    sel = {};
    changed();
  }

  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Fade the list in after a filter change and bring its top back into view when the page has scrolled past it. */
  async function changed() {
    await tick();
    if (!listEl) return;
    const top = listEl.getBoundingClientRect().top;
    if (top < 0) scrollTo({ top: scrollY + top - 84, behavior: 'instant' });
    if (!reduced()) listEl.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.2,.7,.2,1)' });
  }

  const chips = $derived(
    FACETS.flatMap((f) =>
      (sel[f.key] ?? []).map((v) => {
        const o = f.opts.find((x) => x.v === v)!;
        return { k: f.key, v, text: `${f.chip}: ${o.label}`, name: `${f.chip}: ${o.name ?? o.label}` };
      }),
    ),
  );

  const notes: Partial<Record<FacetKey, string>> = {
    ev: 'Detected from simulator state in the primary forecast window; not all visually verified.',
    ref: 'A filter only. The paper does not estimate how often the reference moves.',
  };

  const countText = $derived(
    !data
      ? 'Loading rollouts…'
      : view === 'pairs'
        ? `${nb(count, count === 1 ? 'rollout' : 'rollouts')} in ${nb(pairItems.length, pairItems.length === 1 ? 'paired set' : 'paired sets')}`
        : `${nb(count, count === 1 ? 'rollout' : 'rollouts')} of ${TOTAL}`,
  );

  function setView(v: View) {
    if (view === v) return;
    view = v;
    changed();
  }

  // ---------------------------------------------------------------------------------------------- drawer
  $effect(() => {
    if (!drawerEl) return;
    if (drawer && !drawerEl.open) drawerEl.showModal();
    else if (!drawer && drawerEl.open) drawerEl.close();
  });

  $effect(() => {
    if (wide && drawer) drawer = false;
  });

  onMount(() => {
    const mq = matchMedia('(min-width: 800px)');
    wide = mq.matches;
    const onmq = () => (wide = mq.matches);
    mq.addEventListener('change', onmq);

    const st = parseQuery(location.search);
    sel = st.sel;
    view = st.view;
    sort = st.sort;
    const h = parseHash(location.hash);
    if (h) {
      if (!(typeof history.state?.ex === 'number' && history.state.ex >= 1)) history.replaceState(null, '', location.href);
      normalize();
      depth = history.state.ex;
      from = history.state?.from ?? null;
    } else if (location.hash && !document.getElementById(decodeURIComponent(location.hash.slice(1)))) {
      history.replaceState(history.state, '', location.pathname + location.search);
    }
    open = h;
    ready = true;

    addEventListener('popstate', onpop);

    loadEpisodes()
      .then((eps) => {
        const d = build(eps);
        if (d.starts * SCENES.length !== study.settings.stats.starts)
          throw new Error(`explore: ${d.starts} starts per scene, expected ${study.settings.stats.starts / SCENES.length}`);
        data = d;
        if (open && !(open.kind === 'ep' ? d.byId.has(open.id) : d.byRow.has(open.row))) close();
      })
      .catch((x) => {
        err = x instanceof Error ? x.message : String(x);
        console.error(x);
      });

    return () => {
      mq.removeEventListener('change', onmq);
      removeEventListener('popstate', onpop);
    };
  });
</script>

<div class="explore">
  <div class="wrap">
    <header class="top">
      <p class="eyebrow">Rollout explorer</p>
      <h1>Every rollout, side by side</h1>
      <p class="lede">
        All {TOTAL} simulator rollouts: {MODELS.length} models, {GOALS.length} goals across {SCENES.length} scenes, {STARTS_PER_SCENE} starts per scene
        and {FORM_ORDER.length} wordings of every goal. Pairs lines up the {SETS} paired sets, so each row is one start under the three wordings.
      </p>
      <p class="note">
        Orientation: the close view is rotated 90° with the robot at the top, so the robot’s left is image right. The front view is in native
        orientation.
      </p>
    </header>

    <div class="layout">
      <aside class="side" aria-label="Filters" data-qa-scroll="y">
        <div class="sh">
          <h2 class="fh">Filters</h2>
          <button type="button" class="clear" onclick={clearAll} disabled={!nAct}>Clear all</button>
        </div>
        <Facets {sel} counts={fc?.counts ?? null} onset={setFacet} {notes} />
      </aside>

      <section class="results" aria-label="Results">
        <div class="bar">
          <button type="button" class="fbtn" onclick={() => (drawer = true)} aria-haspopup="dialog">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M4.5 8h7M7 12h2" /></svg>
            Filters{#if nAct}<span class="badge num">{nAct}</span>{/if}
          </button>
          <div class="seg" role="group" aria-label="View">
            <button type="button" aria-pressed={view === 'pairs'} onclick={() => setView('pairs')}>Pairs</button>
            <button type="button" aria-pressed={view === 'grid'} onclick={() => setView('grid')}>Grid</button>
          </div>
          <label class="sort">
            <span>Sort by</span>
            <select bind:value={sort} onchange={changed}>
              {#each SORTS as s (s.v)}<option value={s.v}>{s.label}</option>{/each}
            </select>
          </label>
          <p class="count num" aria-live="polite">{countText}</p>
        </div>

        {#if chips.length}
          <ul class="chips" aria-label="Active filters">
            {#each chips as c (c.k + c.v)}
              <li>
                <button
                  type="button"
                  class="chip"
                  aria-label="Remove filter {c.name}"
                  onclick={() =>
                    setFacet(
                      c.k,
                      (sel[c.k] ?? []).filter((x) => x !== c.v),
                    )}
                  >{c.text}<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 4.5 7 7M11.5 4.5l-7 7" /></svg></button
                >
              </li>
            {/each}
          </ul>
        {/if}

        {#if view === 'pairs'}
          <p class="hint">
            {greyed
              ? 'Greyed cells fall outside the filters; they stay in place so every row keeps its three wordings.'
              : 'Each row is one model, start and goal under the three wordings. Hover a thumbnail to scrub all three.'}
          </p>
        {/if}

        <div class="list" bind:this={listEl} class:loading={!data}>
          {#if err}
            <p class="error" role="alert">The rollouts could not be loaded ({err}). Reload the page to try again.</p>
          {:else if !data}
            <div class="skel" aria-hidden="true">
              {#each { length: 6 } as _, k (k)}
                <div class="srow">
                  <span class="slab"></span>
                  <span class="scell"></span>
                  <span class="scell"></span>
                  <span class="scell"></span>
                </div>
              {/each}
            </div>
          {:else if count === 0}
            <div class="empty">
              <p class="et">No rollouts match these filters.</p>
              <p class="es">Remove a filter, or clear them all.</p>
              <button type="button" class="btn" onclick={clearAll}>Clear all filters</button>
            </div>
          {:else if view === 'pairs'}
            <PairsView bind:this={pv} items={pairItems} probes={pairProbes} starts={data.starts} onopen={openEp} oncompare={openCompare} />
          {:else}
            <GridView bind:this={gv} recs={gridRecs} probes={gridProbes} starts={data.starts} onopen={openEp} />
          {/if}
        </div>
      </section>
    </div>
  </div>
</div>

{#if !wide}
  <dialog
    bind:this={drawerEl}
    class="drawer"
    aria-label="Filters"
    oncancel={(e) => {
      e.preventDefault();
      drawer = false;
    }}
    onclick={(e) => {
      if (e.target === drawerEl) drawer = false;
    }}
  >
    {#if drawer}
      <div class="dsheet">
        <div class="dh">
          <h2 class="fh">Filters</h2>
          <button type="button" class="dx" onclick={() => (drawer = false)} aria-label="Close filters">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
          </button>
        </div>
        <div class="dbody" data-qa-scroll="y">
          <Facets {sel} counts={fc?.counts ?? null} onset={setFacet} {notes} />
        </div>
        <div class="df">
          <button type="button" class="clear" onclick={clearAll} disabled={!nAct}>Clear all</button>
          <button type="button" class="btn primary" onclick={() => (drawer = false)}>Show {nb(count, count === 1 ? 'rollout' : 'rollouts')}</button>
        </div>
      </div>
    {/if}
  </dialog>
{/if}

<Modal
  open={!!layer}
  label={layer?.kind === 'cmp' ? `Compare wordings, ${layer.row.key}` : layer ? `Rollout ${layer.rec.e.id}` : 'Rollout'}
  onclose={close}
>
  {#if layer?.kind === 'ep' && data}
    <Player
      rec={layer.rec}
      starts={data.starts}
      where={layer.nav.where}
      prev={layer.nav.prev}
      next={layer.nav.next}
      onnav={(id) => replace({ kind: 'ep', id })}
      oncompare={(row) => push({ kind: 'compare', row }, { from: layer.rec.e.id })}
      onclose={close}
    />
  {:else if layer?.kind === 'cmp' && data}
    <Compare
      row={layer.row}
      starts={data.starts}
      where={layer.nav.where}
      prev={layer.nav.prev}
      next={layer.nav.next}
      onnav={(row) => replace({ kind: 'compare', row })}
      onopen={(id) => push({ kind: 'ep', id })}
      onback={from ? () => history.back() : null}
      onclose={close}
    />
  {/if}
</Modal>

<style>
  .explore {
    padding: calc(60px + clamp(28px, 4vw, 52px)) 0 96px;
  }

  .wrap {
    width: min(1440px, 100% - 48px);
  }

  .top {
    max-width: 880px;
    margin-bottom: clamp(24px, 3vw, 40px);
  }

  h1 {
    font-size: clamp(2.1rem, 1.4rem + 2.6vw, 3.4rem);
  }

  .top .note {
    margin: 18px 0 0;
  }

  .layout {
    display: grid;
    gap: 24px;
  }

  .side {
    display: none;
  }

  .fh {
    font-family: var(--sans);
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: 0;
  }

  .sh {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 10px;
    margin-bottom: 4px;
    border-bottom: 1px solid var(--rule);
  }

  .clear {
    padding: 4px 8px;
    border: 0;
    background: none;
    color: var(--ink-2);
    font-size: 0.82rem;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .clear:disabled {
    color: var(--faint);
    text-decoration: none;
    cursor: default;
  }

  .results {
    min-width: 0;
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 14px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--rule);
  }

  .fbtn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 38px;
    padding: 0 14px;
    border: 1px solid var(--rule-2);
    border-radius: 10px;
    background: var(--card);
    color: var(--ink);
    font-size: 0.88rem;
    font-weight: 500;
    cursor: pointer;
  }

  .fbtn svg,
  .chip svg,
  .dx svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
  }

  .badge {
    display: inline-grid;
    place-items: center;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    border-radius: 6px;
    background: var(--ink);
    color: var(--paper);
    font-size: 0.72rem;
  }

  .sort {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 0.84rem;
    color: var(--muted);
  }

  select {
    height: 36px;
    padding: 0 30px 0 10px;
    border: 1px solid var(--rule-2);
    border-radius: 9px;
    background: var(--card)
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='m3 4.5 3 3 3-3' fill='none' stroke='%23666' stroke-width='1.5'/%3E%3C/svg%3E")
      no-repeat right 9px center / 12px;
    appearance: none;
    color: var(--ink);
    font: inherit;
    font-size: 0.86rem;
    cursor: pointer;
  }

  .seg button[aria-pressed='false'] {
    color: var(--ink-2);
  }

  .count {
    margin: 0 0 0 auto;
    font-size: 0.86rem;
    color: var(--ink-2);
    text-align: right;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 12px 0 0;
    padding: 0;
    list-style: none;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px 5px 10px;
    border: 1px solid var(--rule-2);
    border-radius: 8px;
    background: var(--card);
    color: var(--ink);
    font-size: 0.8rem;
    line-height: 1.3;
    text-align: left;
    cursor: pointer;
  }

  .chip:hover {
    border-color: var(--ink-2);
  }

  .hint {
    margin: 12px 0 0;
    font-size: 0.82rem;
    color: var(--muted);
  }

  .list {
    margin-top: 16px;
  }

  .list.loading {
    min-height: 150vh;
  }

  .skel {
    display: grid;
    gap: 14px;
  }

  .srow {
    display: grid;
    grid-template-columns: minmax(0, 0.8fr) repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .srow span {
    border-radius: 12px;
    background: linear-gradient(100deg, var(--paper-2) 40%, color-mix(in srgb, var(--paper-2) 50%, #fff) 50%, var(--paper-2) 60%) 0 0 / 200% 100%;
    animation: shimmer 1.4s linear infinite;
  }

  .slab {
    height: 72px;
  }

  .scell {
    aspect-ratio: 180 / 181;
  }

  @keyframes shimmer {
    to {
      background-position: -200% 0;
    }
  }

  .empty {
    display: grid;
    justify-items: start;
    gap: 6px;
    padding: 40px 28px;
    border: 1px dashed var(--rule-2);
    border-radius: 14px;
  }

  .et {
    margin: 0;
    font-family: var(--serif);
    font-size: 1.3rem;
  }

  .es {
    margin: 0 0 10px;
    color: var(--muted);
    font-size: 0.9rem;
  }

  .error {
    padding: 20px;
    border: 1px solid color-mix(in srgb, var(--lost) 40%, transparent);
    border-radius: 12px;
    color: var(--ink);
  }

  @media (min-width: 800px) {
    .layout {
      grid-template-columns: 264px minmax(0, 1fr);
      align-items: start;
      gap: 32px;
    }

    .side {
      display: block;
      position: sticky;
      top: 70px;
      max-height: calc(100dvh - 80px);
      overflow: auto;
      overscroll-behavior: contain;
      margin: -6px 0 0 -8px;
      padding: 6px 10px 16px 8px;
      scroll-padding-block: 16px;
      scrollbar-width: thin;
    }

    .fbtn {
      display: none;
    }
  }

  @media (max-width: 520px) {
    .wrap {
      width: calc(100% - 28px);
    }

    .count {
      flex-basis: 100%;
      margin: 0;
      text-align: left;
    }
  }

  .drawer {
    position: fixed;
    inset: 0 0 0 auto;
    width: min(420px, 100%);
    height: 100%;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 0;
    border: 0;
    background: var(--paper);
    color: var(--ink);
  }

  .drawer::backdrop {
    background: rgb(8 9 12 / 50%);
  }

  .dsheet {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    height: 100%;
  }

  .dh,
  .df {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
  }

  .dh {
    border-bottom: 1px solid var(--rule);
  }

  .df {
    border-top: 1px solid var(--rule);
  }

  .dbody {
    overflow: auto;
    overscroll-behavior: contain;
    padding: 8px 16px 16px;
  }

  .dx {
    display: inline-grid;
    place-items: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 1px solid var(--rule-2);
    border-radius: 10px;
    background: var(--card);
    color: var(--ink);
    cursor: pointer;
  }

  @media (prefers-reduced-motion: reduce) {
    .srow span {
      animation: none;
    }
  }
</style>
