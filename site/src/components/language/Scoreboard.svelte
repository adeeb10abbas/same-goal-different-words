<script lang="ts">
  import { MODELS, study, type FormId, type ModelId, type VqaCond, type VqaForm } from '../../lib/study';
  import {
    COND_LABEL,
    ERR_BY_CODE,
    ERR_COLOR,
    ERR_LABEL,
    ERR_ORDER,
    VQA_FORM,
    VQA_PIDS,
    hasImages,
    type GridCodes,
    type VqaSel,
  } from '../../lib/vqa';
  import type { VqaErr } from '../../lib/study';

  /** Every model, form and prompt condition from Section 4 and Appendix F; each cell opens its first error in the console. */
  let { codes, onshow }: { codes: GridCodes; onshow: (p: VqaSel) => void } = $props();

  type Key = 'text' | 'camera' | 'images' | 'imagesCamera';
  const PANELS: { cond: VqaCond; key: Key; unit: string; src: string }[] = [
    { cond: 'T', key: 'text', unit: 'correct of 10', src: 'Sec. 4' },
    { cond: 'H', key: 'camera', unit: 'correct of 10', src: 'App. F' },
    { cond: 'I', key: 'images', unit: 'scene-balanced %', src: 'App. F' },
    { cond: 'IH', key: 'imagesCamera', unit: 'scene-balanced %', src: 'Sec. 4' },
  ];
  const FORMS: VqaForm[] = ['DIR', 'TF', 'RF'];
  const PILL: Record<VqaForm, FormId> = { DIR: 'D', TF: 'S', RF: 'I' };
  const FORM_TEXT: Record<VqaForm, string> = { DIR: 'direct', TF: 'target-first', RF: 'reference-first' };
  const formOf = (pid: string) => VQA_FORM[pid.slice(-1) as FormId];
  const IDX: Record<VqaForm, number[]> = Object.fromEntries(
    FORMS.map((f) => [f, VQA_PIDS.flatMap((pid, i) => (formOf(pid) === f ? [i] : []))]),
  ) as Record<VqaForm, number[]>;

  interface Cell {
    f: VqaForm;
    v: number;
    acc: number;
    mix: { e: VqaErr; n: number }[];
    total: number;
    sel: VqaSel;
    aux: boolean;
  }

  const cells = $derived(
    PANELS.map((p) => ({
      p,
      rows: MODELS.map((m) => ({
        m,
        cells: FORMS.map((f, fi): Cell => {
          const img = hasImages(p.cond);
          const all = IDX[f].flatMap((i) => [...codes[m.id][p.cond][i]]);
          const mix = ERR_ORDER.map((e) => ({ e, n: all.filter((c) => ERR_BY_CODE[c] === e).length })).filter((s) => s.n);
          const v = study.vqa.summary[p.key][m.id][fi];
          if (!img && all.filter((c) => c === 'c').length !== v) throw new Error(`Scoreboard: ${m.id} ${p.cond} ${f} mismatch`);
          let pid = VQA_PIDS[IDX[f][0]];
          let slot: number | undefined = img ? 1 : undefined;
          for (const i of IDX[f]) {
            const j = [...codes[m.id][p.cond][i]].findIndex((c) => c !== 'c');
            if (j >= 0) {
              pid = VQA_PIDS[i];
              if (img) slot = j + 1;
              break;
            }
          }
          return {
            f,
            v,
            acc: img ? v / 100 : v / 10,
            mix,
            total: all.length,
            sel: { model: m.id, images: img, camera: p.cond === 'H' || p.cond === 'IH', pid, slot },
            aux: img && m.id === 'F3',
          };
        }),
      })),
    })),
  );

  const fmt = (c: Cell, img: boolean) => (img ? c.v.toFixed(1) : String(c.v));
  const tint = (acc: number) =>
    acc >= 0.999
      ? 'color-mix(in srgb, var(--vq-ok) 10%, var(--card))'
      : `color-mix(in srgb, var(--vq-rev) ${Math.round(9 + 30 * (1 - acc))}%, var(--card))`;
  const describe = (c: Cell) => c.mix.map((s) => `${s.n} ${ERR_LABEL[s.e].toLowerCase()}`).join(', ');
  const usedClasses = $derived(ERR_ORDER.filter((e) => cells.some((p) => p.rows.some((r) => r.cells.some((c) => c.mix.some((s) => s.e === e))))));

  let picked = $state('');
</script>

<div class="board">
  {#each cells as panel (panel.p.cond)}
    {@const img = hasImages(panel.p.cond)}
    <div class="panel">
      <table>
        <caption>
          <span class="ct">{COND_LABEL[panel.p.cond]}</span>
          <span class="cu">{panel.p.unit} · {panel.p.src}</span>
        </caption>
        <thead>
          <tr>
            <th scope="col"><span class="sr-only">Model</span></th>
            {#each FORMS as f (f)}<th scope="col"><span class="form-pill {PILL[f]}">{f}</span></th>{/each}
          </tr>
        </thead>
        <tbody>
          {#each panel.rows as r (r.m.id)}
            <tr>
              <th scope="row">{r.m.short}{#if r.cells.some((c) => c.aux)}<sup aria-hidden="true">†</sup><span class="sr-only"> (auxiliary)</span>{/if}</th>
              {#each r.cells as c (c.f)}
                {@const id = `${panel.p.cond}-${r.m.id}-${c.f}`}
                <td>
                  <button
                    type="button"
                    class="cell"
                    class:perfect={c.acc >= 0.999}
                    class:picked={picked === id}
                    style:background={tint(c.acc)}
                    aria-label="{r.m.short}, {COND_LABEL[panel.p.cond].toLowerCase()}, {FORM_TEXT[c.f]}: {fmt(c, img)}{img
                      ? '%'
                      : ' of 10'}{c.aux ? ' (auxiliary)' : ''}. {describe(c)}. Show {c.acc >= 0.999 ? 'an example' : 'the first error'} in the console"
                    onclick={() => {
                      picked = id;
                      onshow(c.sel);
                    }}
                  >
                    <span class="v num">{fmt(c, img)}</span>
                    <span class="mix" aria-hidden="true">
                      {#each c.mix as s (s.e)}<i style:flex-grow={s.n} style:background={ERR_COLOR[s.e]}></i>{/each}
                    </span>
                  </button>
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/each}
</div>
<div class="foot">
  <ul class="legend" aria-label="Bar colours under each score">
    {#each usedClasses as e (e)}<li><i style:background={ERR_COLOR[e]}></i>{ERR_LABEL[e]}</li>{/each}
  </ul>
  <p>
    Bars under each score split that cell's answers by class: 10 instructions without images, 80 image prompts with them. Select a cell to
    load its first error in the console. <sup>†</sup>FLUX's policy uses this encoder for text only and processes images separately, so
    its image results are auxiliary.
  </p>
</div>

<style>
  .board {
    margin-top: clamp(24px, 3vw, 36px);
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }

  .panel {
    min-width: 0;
    padding: 14px 14px 12px;
    background: var(--card);
    border: 1px solid var(--rule);
    border-radius: calc(var(--radius) + 2px);
    box-shadow: var(--shadow);
  }

  table {
    border-collapse: separate;
    border-spacing: 4px;
    margin: -4px;
    width: calc(100% + 8px);
    table-layout: fixed;
  }

  caption {
    text-align: left;
    padding: 0 4px 8px;
  }

  .ct {
    display: block;
    font-weight: 600;
    font-size: 0.92rem;
    line-height: 1.3;
  }

  .cu {
    display: block;
    font-family: var(--mono);
    font-size: 0.64rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
    margin-top: 2px;
  }

  thead th {
    padding: 0 0 2px;
    font-weight: 500;
  }

  thead th:first-child {
    width: 3.4em;
  }

  .form-pill {
    font-size: 0.64rem;
    padding: 2px 6px;
  }

  tbody th {
    text-align: left;
    font-size: 0.8rem;
    font-weight: 600;
    padding: 0;
  }

  td {
    padding: 0;
  }

  .cell {
    width: 100%;
    min-height: 44px;
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 5px;
    padding: 7px 4px 8px;
    border: 1px solid transparent;
    border-radius: 9px;
    color: var(--ink);
    cursor: pointer;
    transition: transform 0.15s var(--ease), box-shadow 0.2s, border-color 0.2s;
  }

  .cell:hover {
    transform: translateY(-1px);
    box-shadow: 0 3px 10px -4px rgb(0 0 0 / 28%);
    border-color: var(--rule-2);
  }

  .cell.picked {
    border-color: var(--ink);
    box-shadow: 0 0 0 1px var(--ink);
  }

  .v {
    font-family: var(--mono);
    font-size: 0.9rem;
    font-weight: 600;
    line-height: 1;
  }

  .cell.perfect .v {
    color: var(--vq-ok);
  }

  /* The footnote mark sits on the row label so "100.0" keeps the full cell width. */
  sup {
    font-size: 0.7rem;
    line-height: 0;
    margin-left: 1px;
  }

  .mix {
    display: flex;
    width: 100%;
    max-width: 52px;
    height: 4px;
    border-radius: 2px;
    overflow: hidden;
    gap: 1px;
  }

  .mix i {
    flex-basis: 0;
    min-width: 2px;
  }

  .foot {
    margin-top: 14px;
    display: grid;
    gap: 8px;
  }

  .foot p {
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.5;
    color: var(--muted);
    max-width: 49.21em;
  }

  .legend {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    font-size: 0.76rem;
    color: var(--muted);
  }

  .legend li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .legend i {
    width: 9px;
    height: 9px;
    border-radius: 2px;
  }

  /* em breakpoints follow the reader's default text size, so larger text gets wider panels. */
  @media (max-width: 68.6875em) {
    .board {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 37.4375em) {
    .board {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
