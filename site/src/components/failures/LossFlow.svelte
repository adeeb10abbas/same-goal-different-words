<script lang="ts">
  import { FORM_NAME, FORM_ORDER, MODELS, pp, type FormId } from '../../lib/study';
  import { balanced, pathValues, share, sumSplit, type Agg, type FormSel, type ModelSel } from '../../lib/failures';
  import Toggle from './Toggle.svelte';

  let { agg }: { agg: Agg } = $props();

  let model = $state<ModelSel>('all');
  let form = $state<FormSel>('all');
  const MODEL_OPTS = [{ v: 'all' as ModelSel, full: 'All models', short: 'All' }, ...MODELS.map((m) => ({ v: m.id as ModelSel, full: m.short, short: m.short }))];
  const FORM_SHORTS: Record<FormId, string> = { D: 'DIR', S: 'TF', I: 'RF' };
  const FORM_OPTS = [
    { v: 'all' as FormSel, full: 'All wordings', short: 'All' },
    ...FORM_ORDER.map((f) => ({ v: f as FormSel, full: FORM_NAME[f], short: FORM_SHORTS[f] })),
  ];

  const s = $derived(sumSplit(agg, model, form));
  const v = $derived(pathValues(s));
  const N = $derived(s.achieve.n + s.maintain.n);
  const anytime = $derived(s.achieve.se + s.maintain.se);
  const end = $derived(s.achieve.sf + s.maintain.sf);
  const lost = $derived(anytime - end);
  $effect(() => {
    // The three outcomes partition every selection.
    const sum = v.mk + v.ml + v.mn + v.ak + v.al + v.an;
    if (sum !== N || v.ak + v.mk !== end || v.al + v.ml !== lost) throw new Error('Failures flow: counts do not add up');
  });
  const scope = $derived(
    [model === 'all' ? '' : MODELS.find((m) => m.id === model)!.short, form === 'all' ? '' : `${FORM_NAME[form as FormId].toLowerCase()}`]
      .filter(Boolean)
      .join(', '),
  );
  const rows = $derived([
    { key: 'achieve', name: 'Goal must be achieved', note: 'not true at reset', n: s.achieve.n, k: v.ak, l: v.al, nv: v.an },
    { key: 'maintain', name: 'Goal already true at reset', note: 'only has to be kept', n: s.maintain.n, k: v.mk, l: v.ml, nv: v.mn },
  ]);
  const w = (x: number, of: number) => `${of > 0 ? (100 * x) / of : 0}%`;

  const rate = $derived({ all: balanced(model, form, false), excl: balanced(model, form, true) });
</script>

<div class="lf">
  <div class="bar">
    <Toggle label="Model" group="Model" options={MODEL_OPTS} bind:value={model} at={22} />
    <Toggle label="Wording" group="Wording" options={FORM_OPTS} bind:value={form} at={30} />
  </div>

  <figure class="flow" aria-label="Episodes placed at some point and still placed at the end">
    <div class="stage s0">
      <div class="head"><span class="nm">All episodes{scope ? ` · ${scope}` : ''}</span><span class="v num">{N}</span></div>
      <div class="track"><i class="bk all" style:width="100%"></i></div>
    </div>
    <div class="stage s1">
      <div class="head">
        <span class="nm">Placed at some point</span><span class="v num">{anytime} <small>{share(anytime, N)} of {N}</small></span>
      </div>
      <div class="track">
        <i class="bk kept" style:width={w(end, N)}></i><i class="bk lost" style:width={w(lost, N)}></i>
      </div>
    </div>
    <div class="stage s2">
      <div class="head">
        <span class="nm">Still placed at the end</span><span class="v num">{end} <small>{share(end, N)} of {N}</small></span>
      </div>
      <div class="track"><i class="bk kept" style:width={w(end, N)}></i><i class="bk gap" style:width={w(lost, N)}></i></div>
    </div>
    <figcaption class="legend">
      <span><i class="sw kept"></i>Placed and still placed at the end <b class="num">{end}</b></span>
      <span><i class="sw lost"></i>Placed, then lost <b class="num">{lost}</b> ({share(lost, anytime)} of placements)</span>
    </figcaption>
  </figure>

  <div class="split">
    {#each rows as r (r.key)}
      <div class="srow {r.key}">
        <div class="head">
          <span class="nm">{r.name} <small>{r.note}</small></span><span class="v num">{r.n} episodes</span>
        </div>
        <div class="track">
          <i class="bk kept" style:width={w(r.k, r.n)}></i><i class="bk lost" style:width={w(r.l, r.n)}></i><i class="bk never" style:width={w(r.nv, r.n)}
          ></i>
        </div>
        <p class="counts">
          <span><i class="sw kept"></i>kept <b class="num">{r.k}</b></span>
          <span><i class="sw lost"></i>lost <b class="num">{r.l}</b>{#if r.k + r.l > 0}&nbsp;({share(r.l, r.k + r.l)} of its placements){/if}</span>
          <span><i class="sw never"></i>never placed <b class="num">{r.nv}</b></span>
        </p>
      </div>
    {/each}
  </div>

  <p class="say" aria-live="polite">
    Across the {N} episodes{scope ? ` (${scope})` : ''}, {anytime} reach a stable placement and {end} also satisfy the episode-end criterion. Thus, {lost}
    of the {anytime} any-time passes ({share(lost, anytime)}) fail the episode-end check. Among the {s.achieve.n} episodes whose goals are not satisfied
    initially, {s.achieve.se} reach a stable placement and {s.achieve.sf} pass the final check{#if s.achieve.se > 0}; the remaining {v.al} account for {share(
        v.al,
        s.achieve.se,
      )} of that group’s any-time passes{/if}. For initially-satisfied goals, {s.maintain.sf} of {s.maintain.n} episodes pass the final check.
  </p>
  <p class="note">
    An episode can lose and regain a placement, so endpoint success does not establish continuous retention after first attainment.
  </p>

  <div class="rates">
    <p class="lbl">Scene-balanced rates, as in the paper’s figure</p>
    <dl>
      <div>
        <dt>All goals</dt>
        <dd><span class="num">{pp(rate.all.anytime)}%</span> any time <span class="arr" aria-hidden="true">→</span> <span class="num">{pp(rate.all.end)}%</span> at the end</dd>
      </div>
      <div>
        <dt>Goals not true at reset</dt>
        <dd><span class="num">{pp(rate.excl.anytime)}%</span> any time <span class="arr" aria-hidden="true">→</span> <span class="num">{pp(rate.excl.end)}%</span> at the end</dd>
      </div>
    </dl>
    <p class="caption">
      These average goals within each scene and weight scenes equally, so they need not equal the raw fractions above ({share(anytime, N)} and {share(
        end,
        N,
      )}).
    </p>
  </div>
</div>

<style>
  .lf {
    container: lf / inline-size;
    margin-top: clamp(24px, 3vw, 36px);
  }

  .bar {
    display: grid;
    gap: 14px 28px;
    align-items: start;
  }

  @container lf (min-width: 64em) {
    .bar {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .flow,
  .split,
  .rates {
    margin: 22px 0 0;
    padding: 18px 18px 16px;
    border-radius: 16px;
    background: var(--stage-2);
    border: 1px solid var(--stage-rule);
  }

  .stage + .stage {
    margin-top: 14px;
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: baseline;
    gap: 2px 12px;
    margin-bottom: 6px;
    font-size: 0.88rem;
    line-height: 1.35;
  }

  .nm {
    font-weight: 600;
    color: var(--stage-ink);
  }

  .nm small,
  .v small {
    font-weight: 400;
    font-size: 0.78rem;
    color: var(--stage-muted);
  }

  .v {
    color: var(--stage-ink);
    font-weight: 600;
  }

  .track {
    display: flex;
    height: 18px;
    border-radius: 5px;
    overflow: hidden;
    background: rgb(255 255 255 / 5%);
  }

  .bk {
    display: block;
    height: 100%;
    transition: width 0.5s var(--ease);
  }

  .bk.all {
    background: #4f5869;
  }

  .bk.kept {
    background: var(--kept-2);
  }

  .bk.lost {
    background: var(--lost-2);
  }

  .bk.never {
    background: #353b46;
  }

  .bk.gap {
    background: repeating-linear-gradient(135deg, rgb(255 201 90 / 35%) 0 2px, transparent 2px 6px);
  }

  .legend,
  .counts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    margin: 12px 0 0;
    font-size: 0.8rem;
    line-height: 1.4;
    color: #c3c8d0;
  }

  .sw {
    display: inline-block;
    width: 10px;
    height: 10px;
    margin-right: 6px;
    border-radius: 2px;
    vertical-align: -1px;
  }

  .sw.kept {
    background: var(--kept-2);
  }

  .sw.lost {
    background: var(--lost-2);
  }

  .sw.never {
    background: #4f5869;
  }

  .srow + .srow {
    margin-top: 18px;
  }

  .say {
    margin: 22px 0 0;
    max-width: 46em;
    font-family: var(--serif);
    font-size: clamp(1rem, 0.95rem + 0.25vw, 1.12rem);
    line-height: 1.6;
    color: #d5d9e0;
  }

  .note {
    margin-top: 14px;
  }

  .rates .lbl {
    margin: 0;
    color: var(--stage-muted);
  }

  .rates dl {
    display: grid;
    gap: 8px;
    margin: 10px 0 0;
  }

  .rates dl > div {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 14px;
    align-items: baseline;
  }

  .rates dt {
    min-width: 13em;
    font-size: 0.86rem;
    color: var(--stage-muted);
  }

  .rates dd {
    margin: 0;
    font-size: 0.92rem;
    color: #c9ced6;
  }

  .rates dd .num {
    font-weight: 600;
    color: var(--stage-ink);
  }

  .arr {
    color: var(--stage-muted);
  }

  .rates .caption {
    margin-top: 10px;
  }

  @media (prefers-reduced-motion: reduce) {
    .bk {
      transition: none;
    }
  }
</style>
