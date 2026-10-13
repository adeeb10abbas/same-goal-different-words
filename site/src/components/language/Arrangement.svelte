<script lang="ts">
  import { goalByKey, MODELS, MODEL_SHORT, FORM_NAME, study, type FormId, type ModelId, type VqaForm } from '../../lib/study';
  import { href } from '../../lib/media';
  import { onVisible, reducedMotion } from '../../lib/sync';
  import { GOAL_WORD, SCENE_NOUN, VIEWS, VIEW_LABEL, imageUrl, type PairCard } from '../../lib/vqa';

  /** Appendix F, judging the visible arrangement: answer rates, balanced accuracy and the eleven changing-relation pairs. */
  let { pairCards }: { pairCards: PairCard[] } = $props();

  const C2 = study.vqa.c2;
  const BANKS = [
    { key: 'initial', name: 'Initial images', short: 'Initial' },
    { key: 'secondary', name: 'Saved-rollout images', short: 'Rollout' },
  ] as const;
  const MIDS = MODELS.map((m) => m.id);
  const pct = (n: number, d: number) => (d ? (100 * n) / d : 0);
  const yesOf = (a: Record<'match' | 'nonmatch' | 'unknown', number>) => pct(a.match, a.match + a.nonmatch + a.unknown);

  // Rates: how often each backbone says "yes" on answerable items, against how often that is true.
  const RMAX = 30;
  const rates = BANKS.map((b) => {
    const any = C2[MIDS[0]][b.key];
    return {
      ...b,
      answerable: any.answerable,
      truth: pct(any.goldMatch, any.answerable),
      models: MODELS.map((m) => ({ m, yes: yesOf(C2[m.id][b.key].answersAnswerable) })),
    };
  });
  const unknownTotal = MIDS.reduce((s, m) => s + C2[m].initial.answers.unknown + C2[m].secondary.answers.unknown, 0);
  const answersTotal = MIDS.reduce(
    (s, m) => s + BANKS.reduce((t, b) => t + Object.values(C2[m][b.key].answers).reduce((u, v) => u + v, 0), 0),
    0,
  );
  const maxYes = Math.max(...rates.flatMap((r) => r.models.map((x) => x.yes)));
  const truthRange = [Math.min(...rates.map((r) => r.truth)), Math.max(...rates.map((r) => r.truth))];
  const recallers = MIDS.filter((m) => BANKS.some((b) => C2[m][b.key].recall_match.est > 0));
  if (recallers.join() !== 'E3' || C2.E3.initial.recall_match.est > 0) throw new Error('Arrangement: recall summary out of date');

  // Balanced accuracy, 95% CI.
  const BLO = 44;
  const BHI = 56;
  const bx = (v: number) => ((Math.min(BHI, Math.max(BLO, v)) - BLO) / (BHI - BLO)) * 100;
  const BTICKS = [45, 50, 55];
  const bas = MODELS.flatMap((m) => BANKS.map((b, i) => ({ m, b, first: i === 0, ba: C2[m.id][b.key].balanced_accuracy })));
  const baRange = [Math.min(...bas.map((r) => r.ba.est)), Math.max(...bas.map((r) => r.ba.est))];
  const edgeRecall = C2.E3.secondary.recall_match;

  // Pairs.
  const FORMS: VqaForm[] = ['DIR', 'TF', 'RF'];
  const PILL: Record<VqaForm, FormId> = { DIR: 'D', TF: 'S', RF: 'I' };
  let form = $state<VqaForm>('RF');
  let at = $state(0);
  const groups = $derived(
    [...new Set(pairCards.map((p) => p.scene))].map((s) => ({
      scene: s,
      items: pairCards.flatMap((p, i) => (p.scene === s ? [{ p, i }] : [])),
    })),
  );
  const pair = $derived(pairCards[at]);
  const goal = $derived(goalByKey(`${pair.scene}-${pair.goal}`));
  const startNo = (p: PairCard) => Number(p.start.split('-C')[1]);
  const anyBoth = (p: PairCard) => MIDS.some((m) => p.both[m][form] > 0);
  const tally = $derived(MODELS.map((m) => ({ m, n: pairCards.filter((p) => p.both[m.id][form] > 0).length })));
  const WORD: Record<string, string> = { m: 'yes', n: 'no', u: 'can’t tell' };
  /** Source rollout of a saved frame, e.g. RWS-N3-S1-C01-L-D. */
  const source = (ep: string) => {
    const [, m, , , , f] = ep.split('-');
    return `${MODEL_SHORT[m] ?? m} ${FORM_NAME[f as FormId]?.toLowerCase() ?? ''} rollout`;
  };
  const frames = $derived(
    (['match', 'nonmatch'] as const).map((which) => {
      const fr = pair.frames[which];
      const want = which === 'match' ? 'm' : 'n';
      return {
        which,
        fr,
        initial: fr.key.endsWith('-initial'),
        answers: MODELS.map((m) => {
          const s = pair.answers[m.id][form];
          const pairIdx = which === 'match' ? [0, 1] : [2, 3];
          return { m, a: pairIdx.map((k) => ({ c: s[k], ok: s[k] === want })) };
        }),
      };
    }),
  );

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

<div class="arr" class:shown {@attach reveal}>
  <div class="card stats">
    <div class="chart">
      <h4>How often each backbone answers “yes”</h4>
      <p class="hint">Answerable items, both code orders. Outlined bars give how often the views truly show the relation.</p>
      {#each rates as r (r.key)}
        <div class="grp">
          <div class="gh">{r.name} <span class="num">· {r.answerable} items</span></div>
          <div class="rrow truth">
            <span class="rn">Truth</span>
            <span class="rt" role="img" aria-label="{r.name}: {r.truth.toFixed(1)}% truly show the relation">
              <i style:width="{shown ? (r.truth / RMAX) * 100 : 0}%"></i>
            </span>
            <span class="rv num">{r.truth.toFixed(1)}%</span>
          </div>
          {#each r.models as x (x.m.id)}
            <div class="rrow">
              <span class="rn">{x.m.short}</span>
              <span class="rt" role="img" aria-label="{x.m.short} answers yes {x.yes.toFixed(1)}% of the time">
                <i class:zero={x.yes === 0} style:width="{shown ? (x.yes / RMAX) * 100 : 0}%"></i>
              </span>
              <span class="rv num">{x.yes.toFixed(1)}%</span>
            </div>
          {/each}
        </div>
      {/each}
      <div class="rrow axis" aria-hidden="true">
        <span></span>
        <span class="ticks">{#each [0, 10, 20, 30] as t (t)}<span style:left="{(t / RMAX) * 100}%">{t}%</span>{/each}</span>
        <span></span>
      </div>
    </div>

    <div class="chart">
      <h4>Balanced accuracy, 95% CI</h4>
      <p class="hint">Weights both answers equally, so always answering “no” scores exactly 50%.</p>
      {#each bas as r (r.m.id + r.b.key)}
        <div class="brow" class:gap={r.first}>
          <span class="rn">{r.first ? r.m.short : ''}</span>
          <span class="bk">{r.b.short}</span>
          <span
            class="bt"
            role="img"
            aria-label="{r.m.short}, {r.b.name.toLowerCase()}: {r.ba.est.toFixed(1)}%, 95% CI {r.ba.ci[0].toFixed(1)} to {r.ba.ci[1].toFixed(1)}"
          >
            <i class="half" style:left="{bx(50)}%"></i>
            <i class="bar" style:left="{bx(shown ? r.ba.ci[0] : 50)}%" style:width="{shown ? bx(r.ba.ci[1]) - bx(r.ba.ci[0]) : 0}%"></i>
            <i class="dot" style:left="{bx(shown ? r.ba.est : 50)}%"></i>
          </span>
          <span class="rv num">{r.ba.est.toFixed(1)}</span>
        </div>
      {/each}
      <div class="brow axis" aria-hidden="true">
        <span></span><span></span>
        <span class="ticks">
          {#each BTICKS as t (t)}<span style:left="{bx(t)}%">{t}%</span>{/each}
          <span class="lab" style:left="{bx(50)}%">always “no”</span>
        </span>
        <span></span>
      </div>
    </div>
    <p class="sum">
      Every backbone almost always answers “no”: at most <b class="num">{maxYes.toFixed(1)}%</b> “yes”, although
      {truthRange[0].toFixed(0)}–{truthRange[1].toFixed(0)}% of the items do show the relation.
      {#if unknownTotal}{unknownTotal} of the {answersTotal.toLocaleString('en-US')} image answers chose insufficient evidence.{:else}None
        of the {answersTotal.toLocaleString('en-US')} image answers chose insufficient evidence.{/if}
      Balanced accuracy ranges from {baRange[0].toFixed(1)}% to {baRange[1].toFixed(1)}%. Only Edge ever answers “yes” when that is
      true: its recall on matching rollout frames is {edgeRecall.est.toFixed(1)}% (CI {edgeRecall.ci[0].toFixed(1)}–{edgeRecall.ci[1].toFixed(1)}).
    </p>
  </div>

  <div class="card pairs">
    <div class="phead">
      <h4>Same start, same goal, the relation changes</h4>
      <span class="seg" role="group" aria-label="Instruction form">
        {#each FORMS as f (f)}
          <button type="button" aria-pressed={form === f} onclick={() => (form = f)}>{f}</button>
        {/each}
      </span>
    </div>
    <p class="hint">
      Each image set is asked whether the views show the relation in the instruction, twice, with the yes and no answer codes swapped. A
      dot marks a pair answered correctly for both frames.
    </p>
    <div class="chips" role="group" aria-label="Pair">
      {#each groups as g (g.scene)}
        <span class="cg">
          <span class="cgl">{SCENE_NOUN[g.scene]}</span>
          {#each g.items as it (it.i)}
            <button
              type="button"
              class="chip"
              aria-pressed={at === it.i}
              onclick={() => (at = it.i)}
            >
              {GOAL_WORD[it.p.goal]} <span class="num">{startNo(it.p)}</span><span class="sr-only"
                >{`: ${goalByKey(`${it.p.scene}-${it.p.goal}`).label}, start ${startNo(it.p)}${anyBoth(it.p) ? ', answered correctly for both frames' : ''}`}</span
              >{#if anyBoth(it.p)}<i class="star" aria-hidden="true"></i>{/if}
            </button>
          {/each}
        </span>
      {/each}
    </div>
    <div class="ptitle">
      <div><b>{goal.label}</b><span class="num">{' · start ' + startNo(pair)}</span></div>
      <q>{goal.prompts[PILL[form]]}</q>
    </div>
    {#key `${at}`}
      <div class="frames">
        {#each frames as f (f.which)}
          <figure class="frame {f.which}">
            <figcaption>
              <span class="tl">{f.which === 'match' ? 'Shows the relation' : 'Does not show it'}</span>
              <span class="when">
                {#if f.initial}Initial image{:else}{f.fr.t} s into a {source(f.fr.episode ?? '')}{/if}
                {#if f.fr.episode}
                  · <a href="{href('explore/')}#{f.fr.episode}">Watch <span aria-hidden="true">↗</span></a>
                {/if}
              </span>
            </figcaption>
            <div class="views">
              {#each VIEWS as v (v)}
                <img
                  class={v}
                  src={imageUrl(f.fr.key, v)}
                  alt="{VIEW_LABEL[v]}, {goal.label.toLowerCase()} start {startNo(pair)}, {f.which === 'match'
                    ? 'relation shown'
                    : 'relation not shown'}"
                  width="640"
                  height="360"
                  loading="lazy"
                  decoding="async"
                />
              {/each}
            </div>
            <ul class="answers" aria-label="Answers under both code orders">
              {#each f.answers as x (x.m.id)}
                <li>
                  <span class="mn">{x.m.short}</span>
                  {#each x.a as a, k (k)}
                    <span class="a" class:ok={a.ok}
                      ><span class="mark" aria-hidden="true">{a.ok ? '✓' : '✗'}</span>{WORD[a.c]}<span class="sr-only"
                        >{a.ok ? ', correct' : ', wrong'}</span
                      ></span
                    >
                  {/each}
                </li>
              {/each}
            </ul>
          </figure>
        {/each}
      </div>
    {/key}
    <p class="tally">
      Both frames right under both code orders, {form}:
      {#each tally as t, i (t.m.id)}{i ? ' · ' : ''}<span class:hit={t.n > 0}>{t.m.short} {t.n}/{pairCards.length}</span>{/each}
    </p>
  </div>
</div>

<style>
  .arr {
    margin-top: clamp(24px, 3vw, 36px);
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    gap: 16px;
    align-items: start;
  }

  .card {
    min-width: 0;
    display: grid;
    gap: 18px;
    padding: clamp(18px, 2vw, 24px);
    background: var(--card);
    border: 1px solid var(--rule);
    border-radius: calc(var(--radius) + 2px);
    box-shadow: var(--shadow);
  }

  h4 {
    margin: 0;
    font-size: 0.98rem;
    line-height: 1.3;
  }

  .hint {
    margin: 2px 0 8px;
    font-size: 0.76rem;
    line-height: 1.45;
    color: var(--muted);
  }

  .chart {
    display: grid;
    gap: 5px;
  }

  .grp {
    display: grid;
    gap: 4px;
    margin-bottom: 6px;
  }

  .gh {
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--ink-2);
  }

  .gh span {
    font-weight: 400;
    color: var(--muted);
  }

  .rrow,
  .brow {
    display: grid;
    grid-template-columns: 3.3em minmax(0, 1fr) 3.4em;
    gap: 8px;
    align-items: center;
    min-height: 18px;
  }

  .brow {
    grid-template-columns: 3.3em 3.8em minmax(0, 1fr) 2.6em;
  }

  .brow.gap {
    margin-top: 5px;
  }

  .rn {
    font-size: 0.78rem;
    font-weight: 600;
  }

  .truth .rn {
    font-weight: 400;
    color: var(--muted);
  }

  .bk {
    font-size: 0.74rem;
    color: var(--muted);
  }

  .rv {
    font-family: var(--mono);
    font-size: 0.74rem;
    text-align: right;
  }

  .rt {
    position: relative;
    height: 10px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--ink) 4%, transparent);
  }

  .rt i.zero {
    min-width: 0;
  }

  .rt i {
    position: absolute;
    inset: 0 auto 0 0;
    min-width: 2px;
    border-radius: 3px;
    background: var(--mover);
    transition: width 1.1s var(--ease);
  }

  .truth .rt i {
    background: transparent;
    border: 1.5px dashed color-mix(in srgb, var(--ink) 45%, transparent);
  }

  .bt {
    position: relative;
    height: 16px;
  }

  .bt::before {
    content: '';
    position: absolute;
    inset: 7.5px 0 auto;
    height: 1px;
    background: var(--rule);
  }

  .bt i {
    position: absolute;
    transition: left 1.1s var(--ease), width 1.1s var(--ease);
  }

  .bt .half {
    top: -4px;
    bottom: -4px;
    border-left: 1px dashed var(--faint);
  }

  .bt .bar {
    top: 6px;
    height: 4px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--ink) 22%, transparent);
  }

  .bt .dot {
    top: 3px;
    width: 10px;
    height: 10px;
    margin-left: -5px;
    border-radius: 50%;
    background: var(--ink-2);
    box-shadow: 0 0 0 2px var(--card);
  }

  .axis {
    margin-top: 2px;
  }

  .ticks {
    position: relative;
    height: 26px;
  }

  .ticks span {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    font-family: var(--mono);
    font-size: 0.64rem;
    line-height: 1;
    color: var(--muted);
    white-space: nowrap;
  }

  .ticks span:first-child {
    transform: none;
  }

  .ticks .lab {
    top: 13px;
    font-family: var(--sans);
    font-size: 0.68rem;
    color: var(--muted);
  }

  .brow .ticks span:first-child {
    transform: translateX(-50%);
  }

  .sum {
    margin: 0;
    font-size: 0.86rem;
    line-height: 1.55;
    color: var(--ink-2);
  }

  /* Pairs */
  .pairs {
    gap: 14px;
  }

  .phead {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 14px;
  }

  .phead .seg button {
    min-height: 26px;
    padding: 4px 12px;
    font-family: var(--mono);
    font-size: 0.74rem;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
  }

  .cg {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
  }

  .cgl {
    font-family: var(--mono);
    font-size: 0.64rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    margin-right: 2px;
  }

  .chip {
    position: relative;
    min-height: 28px;
    padding: 3px 10px;
    border: 1px solid var(--rule-2);
    border-radius: 999px;
    background: var(--card);
    color: var(--ink-2);
    font-size: 0.78rem;
    cursor: pointer;
    transition: background 0.2s, color 0.2s, border-color 0.2s;
  }

  .chip:hover {
    border-color: var(--ink-2);
  }

  .chip[aria-pressed='true'] {
    background: var(--ink);
    border-color: var(--ink);
    color: #fff;
  }

  .star {
    position: absolute;
    top: -2px;
    right: -2px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--vq-ok);
    box-shadow: 0 0 0 2px var(--card);
  }

  .ptitle {
    display: grid;
    gap: 3px;
    font-size: 0.9rem;
  }

  .ptitle span {
    color: var(--muted);
  }

  .pairs > .hint {
    margin: -6px 0 0;
  }

  .ptitle q {
    font-family: var(--serif);
    font-size: 1rem;
    color: var(--ink-2);
  }

  .frames {
    display: grid;
    gap: 14px;
    animation: fadein 0.45s var(--ease);
  }

  @keyframes fadein {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }

  figure {
    margin: 0;
    display: grid;
    gap: 7px;
  }

  figcaption {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 10px;
    font-size: 0.78rem;
  }

  .tl {
    font-weight: 600;
  }

  .match .tl {
    color: var(--vq-ok);
  }

  .nonmatch .tl {
    color: var(--ink-2);
  }

  .when {
    color: var(--muted);
  }

  .when a {
    color: var(--ink-2);
    text-underline-offset: 2px;
  }

  .views {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    grid-template-rows: auto auto;
    gap: 4px;
  }

  .views img {
    display: block;
    width: 100%;
    height: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: 7px;
    background: var(--paper-2);
  }

  .views .wrist {
    grid-row: 1 / span 2;
  }

  .answers {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
  }

  .answers li {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.76rem;
  }

  .mn {
    font-weight: 600;
    margin-right: 1px;
  }

  .a {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 7px 1px 5px;
    border-radius: 999px;
    white-space: nowrap;
    color: var(--vq-rev);
    background: color-mix(in srgb, var(--vq-rev) 9%, var(--card));
  }

  .a.ok {
    color: var(--vq-ok);
    background: color-mix(in srgb, var(--vq-ok) 10%, var(--card));
  }

  .mark {
    font-size: 0.7rem;
  }

  .tally {
    margin: 0;
    padding-top: 10px;
    border-top: 1px solid var(--rule);
    font-size: 0.8rem;
    color: var(--muted);
  }

  .tally .hit {
    color: var(--vq-ok);
    font-weight: 600;
  }

  @media (max-width: 999px) {
    .arr {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .rt i,
    .bt i {
      transition: none;
    }

    .frames {
      animation: none;
    }
  }
</style>
