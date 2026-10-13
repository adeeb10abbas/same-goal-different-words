<script lang="ts">
  import { FORM_ORDER, FORM_NAME, FORM_SHORT, study, type FormId, type ModelId, type VqaCond, type VqaErr } from '../../lib/study';
  import {
    ERR_BY_CODE,
    ERR_COLOR_DARK,
    ERR_LABEL,
    ERR_ORDER,
    GOAL_WORD,
    OBJ_SHORT,
    STARTS,
    VQA_GOALS,
    VQA_PIDS,
    hasImages,
    pidOf,
    type GridCodes,
  } from '../../lib/vqa';

  /** Every answer of one model and condition: ten goals by three wordings, with one bar per start when images are
   *  supplied. Arrow keys move the selection. */
  let {
    codes,
    model,
    cond,
    pid,
    slot,
    onpick,
  }: {
    codes: GridCodes;
    model: ModelId;
    cond: VqaCond;
    pid: string;
    slot: number;
    onpick: (p: { pid?: string; slot?: number }) => void;
  } = $props();

  const SUMMARY_KEY: Record<VqaCond, 'text' | 'camera' | 'images' | 'imagesCamera'> = {
    T: 'text',
    H: 'camera',
    I: 'images',
    IH: 'imagesCamera',
  };
  const GROUPS = (['S1', 'S3', 'S4'] as const).map((s) => {
    const goals = VQA_GOALS.filter((g) => g.scene.id === s);
    return { scene: s, title: `${OBJ_SHORT[goals[0].mover]} and ${OBJ_SHORT[goals[0].reference]}`, goals };
  });

  const img = $derived(hasImages(cond));
  const row = (p: string) => codes[model][cond][VQA_PIDS.indexOf(p)];
  const errAt = (p: string, s: number): VqaErr => ERR_BY_CODE[img ? row(p)[s - 1] : row(p)];
  const counts = $derived.by(() => {
    const c: Partial<Record<VqaErr, number>> = {};
    for (const ch of codes[model][cond].join('')) c[ERR_BY_CODE[ch]] = (c[ERR_BY_CODE[ch]] ?? 0) + 1;
    return ERR_ORDER.filter((e) => c[e]).map((e) => ({ e, n: c[e]! }));
  });
  const summary = $derived(study.vqa.summary[SUMMARY_KEY[cond]][model]);
  const fmt = (x: number) => (img ? `${x.toFixed(1)}%` : `${x}/10`);

  function cellLabel(goalLabel: string, f: FormId, p: string) {
    if (!img) return `${goalLabel}, ${FORM_NAME[f]}: ${ERR_LABEL[errAt(p, 1)].toLowerCase()}`;
    const ok = [...row(p)].filter((ch) => ch === 'c').length;
    return `${goalLabel}, ${FORM_NAME[f]}: correct at ${ok} of ${STARTS} starts`;
  }

  let gridEl: HTMLElement | undefined = $state();
  function onkeydown(e: KeyboardEvent) {
    const i = VQA_PIDS.indexOf(pid);
    const r = Math.floor(i / 3);
    const c = i % 3;
    const to: Record<string, number> = {
      ArrowUp: Math.max(0, r - 1) * 3 + c,
      ArrowDown: Math.min(VQA_PIDS.length / 3 - 1, r + 1) * 3 + c,
      ArrowLeft: r * 3 + Math.max(0, c - 1),
      ArrowRight: r * 3 + Math.min(2, c + 1),
      Home: r * 3,
      End: r * 3 + 2,
    };
    if (!(e.key in to)) return;
    e.preventDefault();
    const next = VQA_PIDS[to[e.key]];
    onpick({ pid: next });
    queueMicrotask(() => gridEl?.querySelector<HTMLElement>(`[data-pid="${next}"]`)?.focus());
  }

  function onclick(e: MouseEvent, p: string) {
    const bar = (e.target as HTMLElement).closest<HTMLElement>('[data-start]');
    onpick(bar ? { pid: p, slot: Number(bar.dataset.start) } : { pid: p });
  }
</script>

<div class="ag">
  <div class="grid" bind:this={gridEl} role="group" aria-label="Answers by goal and wording">
    <span class="corner" aria-hidden="true"></span>
    {#each FORM_ORDER as f (f)}
      <span class="colh"><span class="form-pill {f}">{FORM_SHORT[f]}</span></span>
    {/each}
    {#each GROUPS as g (g.scene)}
      <span class="grp">{g.title}</span>
      {#each g.goals as goal (goal.key)}
        <span class="rowh">{GOAL_WORD[goal.id]}</span>
        {#each FORM_ORDER as f (f)}
          {@const p = pidOf(goal.key, f)}
          <button
            class="cell"
            class:text={!img}
            data-pid={p}
            aria-pressed={p === pid}
            tabindex={p === pid ? 0 : -1}
            aria-label={cellLabel(goal.label, f, p)}
            onclick={(e) => onclick(e, p)}
            {onkeydown}
          >
            {#if img}
              {#each { length: STARTS } as _, s (s)}
                <span
                  class="bar"
                  class:sel={p === pid && s + 1 === slot}
                  data-start={s + 1}
                  style:--c={ERR_COLOR_DARK[errAt(p, s + 1)]}
                ></span>
              {/each}
            {:else}
              {@const e = errAt(p, 1)}
              <span class="block" style:--c={ERR_COLOR_DARK[e]}>{e === 'correct' ? '✓' : '✗'}</span>
            {/if}
          </button>
        {/each}
      {/each}
    {/each}
  </div>

  {#if img}
    <div class="starts">
      <span class="lbl">Start</span>
      <div class="sbtns" role="group" aria-label="Initial scene">
        {#each { length: STARTS } as _, s (s)}
          {@const e = errAt(pid, s + 1)}
          <button
            class="sb"
            aria-pressed={s + 1 === slot}
            style:--c={ERR_COLOR_DARK[e]}
            aria-label="Start {s + 1}: {ERR_LABEL[e].toLowerCase()}"
            onclick={() => onpick({ slot: s + 1 })}>{s + 1}</button
          >
        {/each}
      </div>
    </div>
  {/if}

  <div class="legend">
    <p class="acc">
      {#each FORM_ORDER as f, i (f)}
        <span><b class="f-{f}">{FORM_SHORT[f]}</b> {fmt(summary[i])}{model === 'F3' && img ? '†' : ''}</span>
      {/each}
    </p>
    <ul>
      {#each counts as { e, n } (e)}
        <li><i style:--c={ERR_COLOR_DARK[e]}></i>{ERR_LABEL[e]} <b>{n}</b></li>
      {/each}
    </ul>
  </div>
</div>

<style>
  .ag {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
    align-content: start;
  }

  .grid {
    display: grid;
    grid-template-columns: minmax(52px, auto) repeat(3, minmax(44px, 66px));
    gap: 5px 6px;
    align-items: center;
  }

  .corner {
    grid-column: 1;
  }

  .colh {
    display: flex;
    justify-content: center;
    padding-bottom: 2px;
  }

  .colh .form-pill {
    font-size: 0.64rem;
    padding: 2px 8px;
  }

  .grp {
    grid-column: 1 / -1;
    margin-top: 6px;
    font-family: var(--mono);
    font-size: 0.64rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--stage-muted);
  }

  .rowh {
    font-size: 0.8rem;
    color: #c9ced6;
    white-space: nowrap;
  }

  .cell {
    display: flex;
    gap: 2px;
    justify-content: center;
    height: 24px;
    padding: 2px;
    border: 0;
    border-radius: 5px;
    background: rgb(255 255 255 / 4%);
    cursor: pointer;
    outline-offset: 2px;
    transition: background 0.2s;
  }

  .cell:hover {
    background: rgb(255 255 255 / 12%);
  }

  .cell[aria-pressed='true'] {
    outline: 2px solid #fff;
    background: rgb(255 255 255 / 14%);
  }

  .cell:focus-visible {
    outline: 2px solid var(--tf-2);
  }

  .bar {
    flex: 1;
    border-radius: 2px;
    background: var(--c);
    opacity: 0.92;
    transition: background 0.35s;
  }

  .bar.sel {
    box-shadow: 0 0 0 1.5px var(--stage), 0 0 0 3px #fff;
    position: relative;
    z-index: 1;
  }

  .block {
    flex: 1;
    display: grid;
    place-items: center;
    border-radius: 3px;
    background: color-mix(in srgb, var(--c) 82%, transparent);
    color: var(--stage);
    font-size: 0.72rem;
    font-weight: 700;
    line-height: 1;
    transition: background 0.35s;
  }

  .starts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
  }

  .starts .lbl {
    color: var(--stage-muted);
  }

  .sbtns {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .sb {
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: 6px;
    font: 600 0.74rem/1 var(--mono);
    color: var(--stage);
    background: var(--c);
    cursor: pointer;
    opacity: 0.85;
  }

  .sb[aria-pressed='true'] {
    opacity: 1;
    outline: 2px solid #fff;
    outline-offset: 2px;
  }

  .legend {
    border-top: 1px solid var(--stage-rule);
    padding-top: 10px;
    font-size: 0.78rem;
    color: #c9ced6;
  }

  .acc {
    margin: 0 0 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    font-variant-numeric: tabular-nums;
  }

  .acc span {
    white-space: nowrap;
  }

  .acc b {
    font: 600 0.7rem var(--mono);
    letter-spacing: 0.04em;
    margin-right: 3px;
  }

  .f-D {
    color: var(--dir-2);
  }

  .f-S {
    color: var(--tf-2);
  }

  .f-I {
    color: var(--rf-2);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 3px;
  }

  li {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  li i {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    background: var(--c);
    flex: none;
  }

  li b {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
</style>
