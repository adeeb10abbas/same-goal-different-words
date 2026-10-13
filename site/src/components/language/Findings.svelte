<script lang="ts">
  import { goalByKey, MODELS, study, type FormId, type ModelId, type VqaCond, type VqaForm } from '../../lib/study';
  import { onVisible, reducedMotion } from '../../lib/sync';
  import {
    ERR_BY_CODE,
    ERR_CODE,
    ERR_COLOR,
    ERR_LABEL,
    ERR_ORDER,
    OBJ_SHORT,
    PLACEMENT_KEYS,
    REL_WORD,
    VQA_FORM,
    VQA_PIDS,
    type GridCodes,
    type PlacementCard,
    type VqaSel,
  } from '../../lib/vqa';

  /** The three Section 4 / Appendix F results, each linked to the console above. */
  let {
    codes,
    placement,
    placementCards,
    onshow,
    ontour,
  }: {
    codes: GridCodes;
    placement: Record<ModelId, string>;
    placementCards: PlacementCard[];
    onshow: (p: VqaSel) => void;
    ontour: (i: number) => void;
  } = $props();

  const FORMS: VqaForm[] = ['DIR', 'TF', 'RF'];
  const PILL: Record<VqaForm, FormId> = { DIR: 'D', TF: 'S', RF: 'I' };
  const FORM_TEXT: Record<VqaForm, string> = { DIR: 'direct', TF: 'target-first', RF: 'reference-first' };
  const formOf = (pid: string) => VQA_FORM[pid.slice(-1) as FormId];
  const rank = (c: string) => ERR_ORDER.indexOf(ERR_BY_CODE[c]);
  const nOk = (cs: Iterable<string>) => [...cs].filter((c) => c === 'c').length;
  const V = study.vqa;

  // A: every text-only answer by model and form, correct first.
  const pips = $derived(
    MODELS.map((m) => ({
      m,
      forms: FORMS.map((f) => {
        const cs = VQA_PIDS.flatMap((pid, i) => (formOf(pid) === f ? [{ pid, c: codes[m.id].T[i] }] : [])).sort(
          (a, b) => rank(a.c) - rank(b.c),
        );
        return { f, cs, n: nOk(cs.map((r) => r.c)) };
      }),
    })),
  );
  const classesA = $derived(ERR_ORDER.filter((e) => pips.some((p) => p.forms.some((f) => f.cs.some((r) => ERR_BY_CODE[r.c] === e)))));

  // B: Nano's reference-first contrasts (points) and the instructions that change with images.
  const C = V.contrasts.N3;
  const LO = -16;
  const HI = 4;
  const x = (v: number) => ((v - LO) / (HI - LO)) * 100;
  const TICKS = [-15, -10, -5, 0];
  const CONTRASTS = [
    { label: 'Add images to the text', c: C.image_I_minus_T.RF, key: false },
    { label: 'Add images to the text with camera descriptions', c: C.image_IH_minus_H.RF, key: true },
    { label: 'Add camera descriptions to the images', c: C.header_IH_minus_I.RF, key: false },
  ];
  const signed = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1);
  const STRIP_PIDS = ['S3-R-I', 'S1-B-I', 'S3-TOP-I'];
  let withDesc = $state(true);
  const cond = $derived<VqaCond>(withDesc ? 'IH' : 'I');
  const strips = $derived(
    STRIP_PIDS.map((pid) => {
      const c = [...codes.N3[cond][VQA_PIDS.indexOf(pid)]];
      return { pid, goal: goalByKey(pid.slice(0, -2)), c, bad: c.length - nOk(c) };
    }),
  );
  const stripClasses = $derived(
    ERR_ORDER.filter((e) => e !== 'correct' && strips.some((s) => s.c.includes(ERR_CODE[e]))),
  );
  const accs = $derived(withDesc ? V.summary.imagesCamera.N3 : V.summary.images.N3);
  const rfAcc = $derived(accs[2]);
  const dirTf = $derived([accs[0], accs[1]]);

  // C: Edge on the reference-clause placement controls.
  const P = V.placement.E3;
  const edgeRows = $derived.by(() => {
    const s = [...placement.E3];
    const pick = (early: boolean) => s.filter((_, i) => PLACEMENT_KEYS[i].endsWith('early') === early);
    return [
      { name: 'Early', c: pick(true), img: P.imagesEarly },
      { name: 'Late', c: pick(false), img: P.imagesLate },
    ];
  });
  const wrongEarly = $derived(placementCards.filter((p) => p.early && p.wrong.E3));
  const example = $derived(
    ['S1-L-reference_early', 'S1-L-reference_late'].map((k) => placementCards.find((p) => p.key === k)?.instruction ?? ''),
  );
  /** Split a placement sentence around its "relative to the …" phrase. */
  const phrase = (s: string): [string, string, string] => {
    const m = /relative to the [^,.]+/i.exec(s);
    return m ? [s.slice(0, m.index), m[0], s.slice(m.index + m[0].length)] : [s, '', ''];
  };

  if (Math.abs(P.gap.est + (P.imagesLate - P.imagesEarly)) > 0.15) throw new Error('Findings: placement gap mismatch');

  let shown = $state(true);
  function reveal(node: HTMLElement) {
    if (reducedMotion()) return;
    let first = true;
    return onVisible(
      node,
      (v) => {
        if (first) {
          first = false;
          if (!v) shown = false;
          return;
        }
        if (v) shown = true;
      },
      0.2,
    );
  }
</script>

<div class="findings" class:shown {@attach reveal}>
  <article class="card a">
    <div class="k">A · Text only</div>
    <h3>Reference-first wording is misread from text alone</h3>
    <div class="pipviz" role="img" aria-label="Text-only answers per model and form; see the summary below">
      <div class="prow phead" aria-hidden="true">
        <span></span>
        {#each FORMS as f (f)}<span class="pg"><span class="form-pill {PILL[f]}">{f}</span></span>{/each}
      </div>
      {#each pips as p (p.m.id)}
        <div class="prow">
          <span class="pm">{p.m.short}</span>
          {#each p.forms as f, j (f.f)}
            <span class="pg">
              <span class="pips">
                {#each f.cs as r, i (r.pid)}<i style:background={ERR_COLOR[ERR_BY_CODE[r.c]]} style:--d="{(j * 10 + i) * 14}ms"
                  ></i>{/each}
              </span>
              <span class="pn num" class:low={f.n < 10}>{f.n}</span>
            </span>
          {/each}
        </div>
      {/each}
    </div>
    <ul class="legend" aria-label="Answer classes">
      {#each classesA as e (e)}<li><i style:background={ERR_COLOR[e]}></i>{ERR_LABEL[e]}</li>{/each}
    </ul>
    <p class="sr-only">
      {#each pips as p (p.m.id)}{p.m.short}: {p.forms.map((f) => `${FORM_TEXT[f.f]} ${f.n} of 10`).join(', ')}.
      {/each}
    </p>
    <p>
      FLUX's text encoder reads every direct and target-first instruction correctly but only four of ten reference-first ones. All six
      errors name the right objects and <b>reverse the relation</b>. Edge also reads fewer reference-first than target-first instructions
      correctly, but it errs on direct and target-first ones too, so its difficulty is not limited to reference-first wording. Nano reads
      all 30.
    </p>
    <button type="button" class="btn go" onclick={() => ontour(0)}>Watch FLUX read one <span aria-hidden="true">↑</span></button>
  </article>

  <article class="card b">
    <div class="k">B · Nano with camera images</div>
    <h3>Adding images reverses correct readings</h3>
    <div class="forest">
      <div class="fh">Change in reference-first accuracy, points (95% CI)</div>
      {#each CONTRASTS as r (r.label)}
        <div class="frow" class:key={r.key}>
          <span class="fl">{r.label}</span>
          <span
            class="track"
            role="img"
            aria-label="{r.label}: {signed(r.c.est)} points, 95% CI {signed(r.c.ci[0])} to {signed(r.c.ci[1])}"
          >
            <i class="zero" style:left="{x(0)}%"></i>
            <i class="bar" style:left="{x(shown ? r.c.ci[0] : 0)}%" style:width="{shown ? x(r.c.ci[1]) - x(r.c.ci[0]) : 0}%"></i>
            <i class="dot" style:left="{x(shown ? r.c.est : 0)}%"></i>
          </span>
          <span class="fv num">{signed(r.c.est)}</span>
        </div>
      {/each}
      <div class="frow axis" aria-hidden="true">
        <span class="ticks">
          {#each TICKS as t (t)}<span style:left="{x(t)}%">{signed(t)}</span>{/each}
        </span>
      </div>
    </div>
    <div class="starts">
      <div class="shead">
        <span class="fh">Reference-first answers at the eight starts</span>
        <span class="seg" role="group" aria-label="Prompt">
          <button type="button" aria-pressed={withDesc} onclick={() => (withDesc = true)}>With descriptions</button>
          <button type="button" aria-pressed={!withDesc} onclick={() => (withDesc = false)}>Images only</button>
        </span>
      </div>
      {#each strips as s (s.pid)}
        <div class="srow">
          <span class="sl">{s.goal.label}</span>
          <span class="sq">
            {#each s.c as c, i (i)}
              {@const e = ERR_BY_CODE[c]}
              <button
                type="button"
                class:bad={c !== 'c'}
                style:--c={ERR_COLOR[e]}
                aria-label="{s.goal.label}, start {i + 1}: {ERR_LABEL[e]}. Show in the console"
                title="Start {i + 1}: {ERR_LABEL[e]}"
                onclick={() => onshow({ model: 'N3', images: true, camera: withDesc, pid: s.pid, slot: i + 1 })}>{i + 1}</button
              >
            {/each}
          </span>
        </div>
      {/each}
      <ul class="legend slegend" aria-label="Error classes shown">
        <li><i class="okk"></i>{ERR_LABEL.correct}</li>
        {#each stripClasses as e (e)}<li><i style:background={ERR_COLOR[e]}></i>{ERR_LABEL[e]}</li>{/each}
      </ul>
      <div class="sacc">
        Reference-first accuracy <b class="num">{rfAcc.toFixed(1)}%</b>
        <span class="num">· direct {dirTf[0].toFixed(0)}% · target-first {dirTf[1].toFixed(0)}%</span>
      </div>
    </div>
    <p>
      Nano reads all 30 instructions correctly from text, with or without camera descriptions. With images and descriptions it makes
      eight relation reversals, five for butter-right and three for cube-behind: reference-first accuracy falls
      <b class="num">{Math.abs(C.image_IH_minus_H.RF.est).toFixed(1)}&nbsp;points</b>. Images alone cause four butter-right reversals and one
      butter-on-top error that swaps in a stacking label. The descriptions' extra effect remains unresolved.
    </p>
    <button
      type="button"
      class="btn go"
      onclick={() => onshow({ model: 'N3', images: true, camera: true, pid: 'S3-R-I', slot: 3 })}
      >Show a reversed start <span aria-hidden="true">↑</span></button
    >
  </article>

  <article class="card c">
    <div class="k">C · Placement controls</div>
    <h3>Moving the reference phrase changes Edge's answers</h3>
    <div class="cbody">
      <div class="cviz">
        <div class="pair">
          {#each example as s, i (i)}
            {@const [a, ph, b] = phrase(s)}
            <div class="ex">
              <span class="lbl">Reference {i ? 'late' : 'early'}</span>
              <q>{a}<mark>{ph}</mark>{b}</q>
            </div>
          {/each}
        </div>
        <table class="edge">
          <caption>Edge, eight goals per placement</caption>
          <thead>
            <tr>
              <th scope="col">Reference</th>
              <th scope="col">Text only</th>
              <th scope="col">Images + desc.</th>
            </tr>
          </thead>
          <tbody>
            {#each edgeRows as r, j (r.name)}
              <tr>
                <th scope="row">{r.name}</th>
                <td>
                  <span class="b8" aria-hidden="true">
                    {#each r.c as c, i (i)}<i style:background={ERR_COLOR[ERR_BY_CODE[c]]} style:--d="{(j * 8 + i) * 30}ms"></i>{/each}
                  </span>
                  <span class="num">{nOk(r.c)}/8</span>
                </td>
                <td>
                  <span class="bimg" aria-hidden="true"><i style:width="{shown ? r.img : 0}%"></i></span>
                  <span class="num">{r.img.toFixed(1)}%</span>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="ctext">
        <p>
          Sixteen controls move only the reference phrase and keep the direction. Nano and FLUX answer all of them correctly. Edge answers
          5 of 8 reference-early and 8 of 8 reference-late sentences from text. With images and descriptions its reference-early accuracy
          is <b class="num">{Math.abs(P.gap.est).toFixed(1)}&nbsp;points lower</b>
          <span class="nw">(95% CI {Math.abs(P.gap.ci[1]).toFixed(1)}–{Math.abs(P.gap.ci[0]).toFixed(1)}).</span>
        </p>
        <ul class="wrong" aria-label="Edge's wrong reference-early answers">
          {#each wrongEarly as w (w.key)}
            {@const a = w.wrong.E3!}
            <li>
              <q>{w.instruction}</q>
              <span class="ans"
                ><span class="arrow" aria-hidden="true">→</span> Edge: {OBJ_SHORT[a.target] ?? a.target}
                <b>{REL_WORD[a.relation] ?? a.relation}</b>
                {OBJ_SHORT[a.reference] ?? a.reference}</span
              >
            </li>
          {/each}
        </ul>
        <p class="fine">These controls use different sentences from target-first and reference-first, so they do not settle general noun-order effects.</p>
      </div>
    </div>
  </article>
</div>

<style>
  .findings {
    margin-top: clamp(28px, 3.4vw, 44px);
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
  }

  .card {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: clamp(18px, 2vw, 24px);
    background: var(--card);
    border: 1px solid var(--rule);
    border-radius: calc(var(--radius) + 2px);
    box-shadow: var(--shadow);
  }

  .k {
    font-family: var(--mono);
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }

  h3 {
    margin: -6px 0 0;
    font-size: 1.14rem;
    line-height: 1.3;
    text-wrap: balance;
  }

  p {
    margin: 0;
    font-size: 0.88rem;
    line-height: 1.55;
    color: var(--ink-2);
  }

  .fine {
    font-size: 0.8rem;
    color: var(--muted);
  }

  .go {
    margin-top: auto;
    align-self: flex-start;
  }

  .fh {
    font-size: 0.76rem;
    color: var(--muted);
  }

  /* A: answer pips */
  .pipviz {
    container-type: inline-size;
    display: grid;
    gap: 9px;
  }

  .prow {
    display: grid;
    grid-template-columns: 3.3em repeat(3, minmax(0, 1fr));
    gap: 8px;
    align-items: center;
  }

  .pm {
    font-size: 0.82rem;
    font-weight: 600;
  }

  .pg {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }

  .pips {
    display: grid;
    grid-template-columns: repeat(5, 9px);
    grid-auto-rows: 9px;
    gap: 2px;
    flex: none;
  }

  .pips i {
    border-radius: 2px;
    transition: transform 0.5s var(--ease) var(--d), opacity 0.5s var(--ease) var(--d);
  }

  .findings:not(.shown) .pips i,
  .findings:not(.shown) .b8 i {
    opacity: 0;
    transform: scale(0.3);
  }

  .pn {
    font-family: var(--mono);
    font-size: 0.78rem;
    color: var(--muted);
  }

  .pn.low {
    color: var(--vq-rev);
    font-weight: 600;
  }

  .phead .form-pill {
    font-size: 0.64rem;
    padding: 2px 7px;
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

  /* B: forest plot */
  .forest {
    display: grid;
    gap: 9px;
  }

  .frow {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 3.1em;
    gap: 2px 10px;
    align-items: center;
  }

  .fl {
    grid-column: 1 / -1;
    font-size: 0.78rem;
    line-height: 1.35;
    color: var(--muted);
  }

  .frow.key .fl {
    color: var(--ink);
    font-weight: 600;
  }

  .track {
    position: relative;
    height: 16px;
  }

  .track::before {
    content: '';
    position: absolute;
    inset: 7.5px 0 auto;
    height: 1px;
    background: var(--rule);
  }

  .track i {
    position: absolute;
    transition: left 1.1s var(--ease), width 1.1s var(--ease);
  }

  .track .zero {
    top: -4px;
    bottom: -4px;
    border-left: 1px dashed var(--faint);
  }

  .track .bar {
    top: 6px;
    height: 4px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--rf) 32%, transparent);
  }

  .track .dot {
    top: 3px;
    width: 10px;
    height: 10px;
    margin-left: -5px;
    border-radius: 50%;
    background: var(--rf);
    box-shadow: 0 0 0 2px var(--card);
  }

  .frow:not(.key) .dot {
    background: color-mix(in srgb, var(--rf) 60%, var(--card));
  }

  .frow.key .bar {
    background: color-mix(in srgb, var(--rf) 50%, transparent);
  }

  .fv {
    font-family: var(--mono);
    font-size: 0.8rem;
    text-align: right;
  }

  .frow.key .fv {
    font-weight: 600;
    color: var(--rf);
  }

  .axis {
    margin-top: -3px;
  }

  .ticks {
    position: relative;
    height: 14px;
  }

  .ticks span {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    font-family: var(--mono);
    font-size: 0.66rem;
    line-height: 1;
    color: var(--muted);
  }

  .starts {
    display: grid;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--rule);
  }

  .shead {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px 10px;
  }

  .shead .seg button {
    padding: 4px 10px;
    font-size: 0.74rem;
    min-height: 24px;
  }

  .srow {
    display: grid;
    gap: 4px;
  }

  .sl {
    font-size: 0.8rem;
    font-weight: 500;
  }

  .sq {
    display: grid;
    grid-template-columns: repeat(8, minmax(24px, 30px));
    gap: 4px;
  }

  .sq button {
    height: 26px;
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--vq-ok) 40%, transparent);
    border-radius: 6px;
    background: color-mix(in srgb, var(--vq-ok) 10%, var(--card));
    color: var(--vq-ok);
    font-family: var(--mono);
    font-size: 0.72rem;
    cursor: pointer;
    transition: transform 0.15s var(--ease), background 0.3s, color 0.3s, border-color 0.3s;
  }

  .sq button.bad {
    background: var(--c);
    border-color: var(--c);
    color: #fff;
    font-weight: 600;
  }

  .sq button:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 6px -2px rgb(0 0 0 / 30%);
  }

  .slegend {
    margin-top: 2px;
  }

  .slegend .okk {
    border: 1px solid color-mix(in srgb, var(--vq-ok) 40%, transparent);
    background: color-mix(in srgb, var(--vq-ok) 10%, var(--card));
  }

  .sacc {
    font-size: 0.78rem;
    color: var(--muted);
  }

  .sacc b {
    color: var(--rf);
  }

  /* C: placement controls */
  .cbody {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
  }

  .cviz,
  .ctext {
    min-width: 0;
    display: grid;
    gap: 12px;
    align-content: start;
  }

  .cviz {
    container-type: inline-size;
  }

  .pair {
    display: grid;
    gap: 8px;
  }

  .ex {
    display: grid;
    gap: 2px;
  }

  .ex q {
    font-family: var(--serif);
    font-size: 0.98rem;
    line-height: 1.4;
    quotes: none;
  }

  mark {
    background: var(--ref-soft);
    color: var(--ref-ink);
    border-radius: 4px;
    padding: 0 0.16em;
    margin: 0 -0.16em;
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
  }

  .edge {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }

  .edge caption {
    caption-side: top;
    text-align: left;
    font-size: 0.76rem;
    color: var(--muted);
    padding-bottom: 6px;
  }

  .edge th,
  .edge td {
    padding: 6px 8px 6px 0;
    text-align: left;
    border-bottom: 1px solid var(--rule);
    white-space: nowrap;
  }

  .edge thead th {
    font-family: var(--mono);
    font-size: 0.64rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .edge tbody th {
    font-weight: 600;
  }

  .edge td {
    font-family: var(--mono);
  }

  .edge td > span {
    vertical-align: middle;
  }

  .b8 {
    display: inline-grid;
    grid-template-columns: repeat(8, 7px);
    gap: 2px;
    margin-right: 6px;
  }

  .b8 i {
    height: 12px;
    border-radius: 2px;
    transition: transform 0.5s var(--ease) var(--d), opacity 0.5s var(--ease) var(--d);
  }

  .bimg {
    display: inline-block;
    width: 52px;
    height: 8px;
    margin-right: 6px;
    border-radius: 4px;
    background: var(--rule);
    overflow: hidden;
  }

  .bimg i {
    display: block;
    height: 100%;
    border-radius: 4px;
    background: var(--vq-ok);
    transition: width 1.1s var(--ease);
  }

  .wrong {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }

  .wrong li {
    display: grid;
    gap: 2px;
    padding: 8px 10px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--vq-rev) 6%, var(--card));
    border: 1px solid color-mix(in srgb, var(--vq-rev) 16%, transparent);
    font-size: 0.8rem;
    line-height: 1.4;
  }

  .wrong q {
    quotes: none;
    color: var(--ink-2);
  }

  .wrong .ans {
    color: var(--muted);
  }

  .wrong .ans b {
    color: var(--vq-rev);
  }

  @media (max-width: 1179px) {
    .findings {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .card.c {
      grid-column: 1 / -1;
    }
  }

  @media (min-width: 760px) and (max-width: 1179px) {
    .cbody {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 24px;
    }
  }

  @media (max-width: 759px) {
    .findings {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* Narrow cards: counts drop under their pips, table bars sit above their values. */
  @container (max-width: 330px) {
    .pg {
      flex-direction: column;
      align-items: flex-start;
      gap: 3px;
    }

    .edge thead th {
      white-space: normal;
      vertical-align: bottom;
    }

    .edge td > span.num {
      display: block;
      margin-top: 4px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .track i,
    .bimg i,
    .pips i,
    .b8 i {
      transition: none;
    }
  }
</style>
