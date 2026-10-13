<script lang="ts">
  import { study, MODELS, SCENES, GOALS, FORM_ORDER, FORM_SHORT, FORM_NAME, goalByKey, type FormId } from '../../lib/study';
  import { href } from '../../lib/media';
  import Instruction from '../Instruction.svelte';
  import { cell, signed, fmtCI, spell, REL_TEXT, SCENE_PAIR, SCENE_COLOR, STARTS, OUT_LABEL, type OutcomeId } from '../../lib/results';

  const uid = $props.id();

  // Sequential ramp for counts out of eight: equal lightness steps, dark text on 0–4 and white text on 5–8 (both ≥ 4.5:1).
  const RAMP = ['#f9f5ef', '#dedad4', '#c3bfba', '#a8a49e', '#8d8a84', '#74716b', '#5b5853', '#44413c', '#2f2c27'];
  const LIGHT_MAX = 4;

  type Rel = (typeof study.relation)[number];
  const REL: Record<string, Rel> = Object.fromEntries(study.relation.map((r) => [r.key, r]));
  const POOLED = MODELS.length * STARTS;
  const RUNS = POOLED * FORM_ORDER.length;
  if (study.relation.length !== GOALS.length) throw new Error('results: relation rows');

  // The goals the paper singles out are found from the data, not named by hand.
  const byEst = [...study.relation].sort((a, b) => b.est - a.est);
  const TOP = byEst[0];
  const REV = byEst[byEst.length - 1];
  if (!(TOP.est > 0) || !(REV.est < 0)) throw new Error('results: expected a positive largest gap and a reversal');
  const nNeg = study.relation.filter((r) => r.est < 0).length;

  const OUTS: { id: OutcomeId; label: string }[] = [
    { id: 'anytime', label: 'Any time' },
    { id: 'end', label: 'At episode end' },
  ];
  let out = $state<OutcomeId>('anytime');
  let sel = $state(TOP.key);
  let hov = $state<string | null>(null);
  const goal = $derived(goalByKey(sel));
  const rel = $derived(REL[sel]);

  // Forest scale: derived from the widest interval, rounded out to whole quarters.
  const lo = Math.min(0, Math.floor(Math.min(...study.relation.map((r) => r.ci[0])) * 4) / 4);
  const hi = Math.max(0, Math.ceil(Math.max(...study.relation.map((r) => r.ci[1])) * 4) / 4);
  let pw = $state(0);
  const PX = 8;
  const fx = (v: number) => PX + ((v - lo) / (hi - lo)) * (pw - 2 * PX);
  const ticks = $derived.by(() => {
    const stepT = pw && pw < 300 ? 0.5 : 0.25;
    const t: number[] = [];
    for (let v = Math.ceil(lo / stepT) * stepT; v <= hi + 1e-9; v += stepT) t.push(+v.toFixed(4));
    return t;
  });
  const tickLabel = (t: number) => (t > 0 ? `+${Math.round(100 * t)}` : t < 0 ? `−${Math.round(-100 * t)}` : '0');
  const RH = 34;

  const count = (m: string, key: string, f: FormId, o: OutcomeId) => cell(m as 'N3', key, f)[o === 'anytime' ? 0 : 1];
  const tint = (v: number) => RAMP[v];
  const ink = (v: number) => (v > LIGHT_MAX ? '#fff' : v === 0 ? 'var(--muted)' : 'var(--ink)');

  const rowLabel = (key: string) => {
    const g = goalByKey(key);
    return `${g.label}${g.initiallyTrue ? ', already true at the start' : ''}. ${OUT_LABEL[out][0].toUpperCase()}${OUT_LABEL[out].slice(1)}, out of ${STARTS}: ${MODELS.map(
      (m) => `${m.short} ${FORM_ORDER.map((f) => `${FORM_SHORT[f]} ${count(m.id, key, f, out)}`).join(', ')}`,
    ).join('; ')}.`;
  };
  const forestLabel = (r: Rel) =>
    `${goalByKey(r.key).label}: TF minus RF ${signed(r.est)} points, 95% interval ${fmtCI(r.ci)}. TF ${r.tf}, RF ${r.rf}, DIR ${r.dir} of ${POOLED}.`;

  const scenePair = (id: string) => (SCENE_PAIR[id][1] === 'bowl' && SCENE_PAIR[id][0] === 'Bowl' ? 'Two bowls' : `${SCENE_PAIR[id][0]} · ${SCENE_PAIR[id][1]}`);
  const short = (key: string) => goalByKey(key).short;

  const sums = $derived(
    FORM_ORDER.map((f) => MODELS.reduce((t, m) => t + count(m.id, sel, f, 'anytime'), 0)).concat(
      FORM_ORDER.map((f) => MODELS.reduce((t, m) => t + count(m.id, sel, f, 'end'), 0)),
    ),
  );
  const never = $derived(FORM_ORDER.every((f) => MODELS.every((m) => count(m.id, sel, f, 'anytime') === 0)));
  const select = (key: string) => (sel = key);
  const live = $derived(
    `${goal.label}. ${goal.initiallyTrue ? 'Already true at every start. ' : ''}TF minus RF ${signed(rel.est)} points, 95% interval ${fmtCI(rel.ci)}. TF ${rel.tf}, RF ${rel.rf}, DIR ${rel.dir} of ${POOLED} at any time.`,
  );
</script>

<div class="fig gb" style:--rh="{RH}px">
  <div class="controls">
    <div class="ctl">
      <span class="cl" id="{uid}-o">Heatmap outcome</span>
      <div class="seg" role="group" aria-labelledby="{uid}-o">
        {#each OUTS as o (o.id)}
          <button type="button" aria-pressed={out === o.id} onclick={() => (out = o.id)}>{o.label}</button>
        {/each}
      </div>
    </div>
    <div class="ctl">
      <span class="cl">Jump to</span>
      <div class="jumps">
        <button type="button" class="jump" class:on={sel === TOP.key} onclick={() => select(TOP.key)}
          ><span class="jk">Largest gap</span><span class="jg">{short(TOP.key)}</span><b class="pos">{signed(TOP.est)}</b></button
        >
        <button type="button" class="jump" class:on={sel === REV.key} onclick={() => select(REV.key)}
          ><span class="jk">{nNeg === 1 ? 'The reversal' : 'Largest reversal'}</span><span class="jg">{short(REV.key)}</span><b class="neg"
            >{signed(REV.est)}</b
          ></button
        >
      </div>
    </div>
  </div>

  <div class="board">
    <div class="heat">
      <div class="hhead" aria-hidden="true">
        <span class="hl">Goal</span>
        {#each MODELS as m (m.id)}
          <span class="grp gh">
            <span class="mn">{m.short}</span>
            <span class="fh">
              {#each FORM_ORDER as f (f)}<i class="fb {f}"><span>{FORM_SHORT[f]}</span></i>{/each}
            </span>
          </span>
        {/each}
      </div>
      <div class="hbody" role="group" aria-label="Goals: select one for details">
        {#each SCENES as s (s.id)}
          <div class="shead"><i class="sw" style:background={SCENE_COLOR[s.id]}></i>{scenePair(s.id)}</div>
          {#each s.goals as g (g.key)}
            <button
              type="button"
              class="hrow"
              class:sel={sel === g.key}
              class:hov={hov === g.key}
              class:init={g.initiallyTrue}
              aria-pressed={sel === g.key}
              onclick={() => select(g.key)}
              onpointerenter={() => (hov = g.key)}
              onpointerleave={() => (hov = null)}
            >
              <span class="sr-only">{rowLabel(g.key)}</span>
              <span class="gl" aria-hidden="true">{REL_TEXT[g.id]}{#if g.initiallyTrue}<sup>†</sup>{/if}</span>
              {#each MODELS as m (m.id)}
                <span class="grp" aria-hidden="true">
                  {#each FORM_ORDER as f (f)}
                    {@const v = count(m.id, g.key, f, out)}
                    {#if g.initiallyTrue && out === 'anytime'}
                      <span class="c hatch">{v}</span>
                    {:else}
                      <span class="c" style:background={tint(v)} style:color={ink(v)}>{v}</span>
                    {/if}
                  {/each}
                </span>
              {/each}
            </button>
          {/each}
        {/each}
      </div>
      <div class="legend" aria-hidden="true">
        <span class="ramp">
          {#each RAMP as c, i (i)}<i style:background={c}></i>{/each}
        </span>
        <span class="rl">0 to {STARTS} of {STARTS} starts placed, {OUT_LABEL[out]}</span>
        <span class="hk"><i class="hatch"></i>† already true at the start</span>
      </div>
    </div>

    <div class="forest">
      <div class="fhead" aria-hidden="true">
        <span class="fl"></span>
        <span class="fp" bind:clientWidth={pw}>
          <span class="ft">TF − RF at any time, points</span>
          <svg width="100%" height="18">
            {#if pw}
              {#each ticks as t (t)}
                <text x={fx(t)} y="13" text-anchor="middle">{tickLabel(t)}</text>
              {/each}
            {/if}
          </svg>
        </span>
        <span class="fc">
          <span class="cth">of {POOLED}</span>
          <span class="cnts"><i class="S">TF</i><i class="I">RF</i><i class="D">DIR</i></span>
        </span>
      </div>
      <div class="fbody">
        {#each SCENES as s (s.id)}
          <div class="shead fsh"><i class="sw" style:background={SCENE_COLOR[s.id]}></i><span>{scenePair(s.id)}</span></div>
          {#each s.goals as g (g.key)}
            {@const r = REL[g.key]}
            <button
              type="button"
              class="frow"
              class:sel={sel === g.key}
              class:hov={hov === g.key}
              tabindex="-1"
              aria-pressed={sel === g.key}
              onclick={() => select(g.key)}
              onpointerenter={() => (hov = g.key)}
              onpointerleave={() => (hov = null)}
            >
              <span class="sr-only">{forestLabel(r)}</span>
              <span class="fl" aria-hidden="true">{REL_TEXT[g.id]}{#if g.initiallyTrue}<sup>†</sup>{/if}</span>
              <svg class="fp" width="100%" height={RH} aria-hidden="true">
                {#if pw}
                  {#each ticks as t (t)}
                    <line class="grid" class:zero={t === 0} x1={fx(t)} x2={fx(t)} y1="0" y2={RH} />
                  {/each}
                  {#if r.ci[1] > r.ci[0]}
                    <rect class="ci" x={fx(r.ci[0])} y={RH / 2 - 1} width={fx(r.ci[1]) - fx(r.ci[0])} height="2" data-qa-shape />
                    <rect class="cap" x={fx(r.ci[0]) - 0.75} y={RH / 2 - 5} width="1.5" height="10" data-qa-shape />
                    <rect class="cap" x={fx(r.ci[1]) - 0.75} y={RH / 2 - 5} width="1.5" height="10" data-qa-shape />
                  {/if}
                  <circle
                    class="mk"
                    class:hollow={g.initiallyTrue}
                    class:pos={r.est > 0}
                    class:neg={r.est < 0}
                    cx={fx(r.est)}
                    cy={RH / 2}
                    r={sel === g.key ? 6 : 5}
                    data-qa-shape
                  />
                {/if}
              </svg>
              <span class="fc cnts num" aria-hidden="true"><b class="S">{r.tf}</b><b class="I">{r.rf}</b><b class="D">{r.dir}</b></span>
            </button>
          {/each}
        {/each}
      </div>
      <div class="ffoot" aria-hidden="true">
        <span class="fl"></span>
        <span class="fav">
          {#if pw}
            <span class="fv l" style:right="{pw - fx(0) + 6}px">← RF</span>
            <span class="fv r" style:left="{fx(0) + 6}px">TF →</span>
          {/if}
        </span>
        <span class="fc"></span>
      </div>
    </div>
  </div>

  <p class="sr-only" aria-live="polite">{live}</p>

  <div class="detail">
    <div class="dh">
      <h4>{goal.label}</h4>
      <div class="tags">
        {#if sel === TOP.key}<span class="tag pos">Largest TF − RF gap</span>{/if}
        {#if rel.est < 0}<span class="tag neg">RF placed more often</span>{/if}
        {#if goal.initiallyTrue}<span class="tag">Already true at the start</span>{/if}
        {#if goal.native}<span class="tag q">Original benchmark goal</span>{:else}<span class="tag q">Added goal</span>{/if}
      </div>
    </div>
    <div class="dgrid">
      <ul class="prompts">
        {#each FORM_ORDER as f (f)}
          <li>
            <span class="form-pill {f}" title={FORM_NAME[f]}>{FORM_SHORT[f]}</span>
            <Instruction prompt={goal.prompts[f]} {goal} />
          </li>
        {/each}
      </ul>
      <div class="dstat">
        <div class="big">
          <span class="bl">TF − RF</span>
          <span class="bv num" class:pos={rel.est > 0} class:neg={rel.est < 0}>{signed(rel.est)}</span>
          <span class="bu">points</span>
        </div>
        <p class="bci">
          {#if goal.initiallyTrue}
            Already true at all {spell(STARTS)} starts, so every run passes at any time and the difference is zero by construction.
          {:else if never}
            No model placed it under any wording, so all {spell(FORM_ORDER.length)} wordings tie at zero.
          {:else}
            95% CI {fmtCI(rel.ci)} · descriptive, from {spell(STARTS)} physical starts
          {/if}
        </p>
        <div class="tscroll" role="region" aria-label="Counts for {goal.label}" tabindex="0" data-qa-scroll>
          <table class="dtable mini">
            <thead>
              <tr>
                <th scope="col">Any time / end</th>
                {#each FORM_ORDER as f (f)}<th scope="col"><span class="fhd {f}">{FORM_SHORT[f]}</span></th>{/each}
              </tr>
            </thead>
            <tbody>
              {#each MODELS as m (m.id)}
                <tr>
                  <th scope="row">{m.short}</th>
                  {#each FORM_ORDER as f (f)}<td class="num">{count(m.id, sel, f, 'anytime')}/{count(m.id, sel, f, 'end')}</td>{/each}
                </tr>
              {/each}
              <tr class="tot">
                <th scope="row">All models</th>
                {#each FORM_ORDER as f, k (f)}<td class="num">{sums[k]}/{sums[k + 3]}</td>{/each}
              </tr>
            </tbody>
            <caption>Out of {STARTS} starts per model; {POOLED} for all models.</caption>
          </table>
        </div>
      </div>
    </div>
    <div class="links">
      <a class="btn" href={href(`explore/?g=${sel}`)}>Watch all {RUNS} runs <span aria-hidden="true">→</span></a>
      <a class="btn ghost" href={href(`explore/?g=${sel}&f=S,I`)}>TF and RF only <span aria-hidden="true">→</span></a>
    </div>
  </div>

  <p class="caption">
    Left: runs out of {STARTS} that reached a stable placement, for each model and wording. Right: the paired TF − RF difference for each
    goal at any time, pooled over the {spell(MODELS.length)} models, with a 95% interval from that scene’s {spell(STARTS)} physical starts. Counts on the right
    are any-time placements out of {POOLED} runs. Per-goal estimates rest on only {spell(STARTS)} starts each and are descriptive. Goals marked † are
    already true in all {spell(STARTS)} starting states: they pass at any time under every wording and contribute zero to the difference.
  </p>
</div>

<style>
  .gb {
    container-type: inline-size;
  }

  .controls {
    gap: 14px 30px;
    align-items: flex-start;
  }

  .ctl {
    display: grid;
    gap: 6px;
    justify-items: start;
  }

  .cl {
    font-family: var(--mono);
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .jumps {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .jump {
    display: inline-flex;
    align-items: baseline;
    gap: 7px;
    padding: 6px 13px;
    border-radius: 999px;
    border: 1px solid var(--rule-2);
    background: var(--card);
    color: var(--ink);
    font-size: 0.82rem;
    cursor: pointer;
    transition:
      border-color 0.2s,
      box-shadow 0.2s;
  }

  .jump:hover {
    border-color: var(--ink-2);
  }

  .jump.on {
    border-color: var(--ink);
    box-shadow: inset 0 0 0 1px var(--ink);
  }

  .jk {
    font-family: var(--mono);
    font-size: 0.66rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .jg {
    font-weight: 600;
  }

  .jump b {
    font-family: var(--mono);
    font-size: 0.8rem;
  }

  .pos {
    color: var(--tf);
  }

  .neg {
    color: var(--rf);
  }

  /* Board: heatmap and forest share row heights so each goal reads straight across. */
  .board {
    margin-top: 26px;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 34px;
  }

  .heat,
  .forest {
    min-width: 0;
  }

  .hhead,
  .hrow {
    display: grid;
    grid-template-columns: minmax(5.6rem, 8.4rem) repeat(3, minmax(0, 8rem));
    column-gap: 10px;
    align-items: center;
  }

  .hhead {
    height: 3.1rem;
    align-items: end;
    padding: 0 0 6px 8px;
  }

  .hl {
    font-family: var(--mono);
    font-size: 0.66rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .grp {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 2px;
  }

  .gh {
    gap: 3px;
    grid-template-columns: minmax(0, 1fr);
  }

  .mn {
    font-size: 0.78rem;
    font-weight: 600;
    text-align: center;
  }

  .fh {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 2px;
  }

  .fb {
    display: grid;
    place-items: center;
    height: 1.15rem;
    border-radius: 4px;
    font-style: normal;
    font-family: var(--mono);
    font-size: 0.6rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: #fff;
    overflow: hidden;
  }

  .fb.D {
    background: var(--dir);
  }

  .fb.S {
    background: var(--tf);
  }

  .fb.I {
    background: var(--rf);
  }

  .shead {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 1.9rem;
    padding: 0 8px;
    margin-top: 4px;
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--ink-2);
    border-top: 1px solid var(--rule);
    white-space: nowrap;
    overflow: hidden;
  }

  .sw {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: none;
  }

  .hrow,
  .frow {
    width: 100%;
    height: var(--rh);
    padding: 0 0 0 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
    position: relative;
  }

  .hrow.hov,
  .frow.hov {
    background: color-mix(in srgb, var(--ink) 4%, transparent);
  }

  .hrow.sel,
  .frow.sel {
    background: color-mix(in srgb, var(--tf) 9%, transparent);
    box-shadow: inset 3px 0 0 var(--ink);
  }

  .hrow:focus-visible,
  .frow:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: -2px;
  }

  .gl,
  .fl {
    font-size: 0.84rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sel .gl,
  .sel .fl {
    font-weight: 600;
  }

  sup {
    font-size: 0.7em;
    margin-left: 1px;
    color: var(--muted);
  }

  .c {
    display: grid;
    place-items: center;
    height: calc(var(--rh) - 8px);
    border-radius: 4px;
    font-family: var(--mono);
    font-size: 0.74rem;
    font-weight: 600;
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 6%);
    transition:
      background 0.45s var(--ease),
      color 0.45s var(--ease);
  }

  .hatch {
    color: var(--muted);
    background: repeating-linear-gradient(-45deg, #f1eee8 0 3px, #e4e0d8 3px 5px);
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 14px;
    margin-top: 14px;
    padding-left: 8px;
    font-size: 0.76rem;
    color: var(--muted);
  }

  .ramp {
    display: inline-flex;
    gap: 1px;
  }

  .ramp i {
    width: 12px;
    height: 12px;
    border-radius: 2px;
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 6%);
  }

  .hk {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .hk i {
    width: 14px;
    height: 12px;
    border-radius: 2px;
  }

  /* Forest */
  .fhead,
  .frow,
  .ffoot {
    display: grid;
    grid-template-columns: 6.6rem minmax(0, 1fr) 6.3rem;
    column-gap: 10px;
    align-items: center;
  }

  .fhead {
    height: 3.1rem;
    align-items: end;
    padding: 0 0 6px 8px;
  }

  .ffoot {
    padding-left: 8px;
    height: 1.6rem;
  }

  .fp {
    display: block;
    min-width: 0;
    position: relative;
  }

  .fhead .fp {
    display: grid;
    gap: 2px;
  }

  .ft {
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--ink-2);
    text-align: center;
    white-space: nowrap;
  }

  .fhead svg {
    display: block;
    overflow: visible;
  }

  .fhead text {
    font-family: var(--mono);
    font-size: 0.64rem;
    fill: var(--muted);
  }

  .fc {
    display: grid;
    gap: 3px;
    justify-items: stretch;
  }

  .cth {
    font-family: var(--mono);
    font-size: 0.62rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
    text-align: center;
  }

  .cnts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 2px;
    text-align: center;
  }

  .cnts i {
    font-style: normal;
    font-family: var(--mono);
    font-size: 0.6rem;
    font-weight: 600;
    color: #fff;
    border-radius: 4px;
    padding: 1px 0;
  }

  .cnts i.S {
    background: var(--tf);
  }

  .cnts i.I {
    background: var(--rf);
  }

  .cnts i.D {
    background: var(--dir);
  }

  .cnts b {
    font-family: var(--mono);
    font-size: 0.8rem;
    font-weight: 600;
  }

  .cnts b.S {
    color: var(--tf);
  }

  .cnts b.I {
    color: var(--rf);
  }

  .cnts b.D {
    color: var(--dir);
  }

  .frow .fp {
    overflow: visible;
  }

  .grid {
    stroke: var(--rule);
  }

  .grid.zero {
    stroke: var(--ink-2);
    stroke-opacity: 0.5;
    stroke-dasharray: 3 3;
  }

  .ci,
  .cap {
    fill: var(--ink-2);
  }

  .mk {
    fill: var(--muted);
    stroke: var(--card);
    stroke-width: 1.5;
    transition: r 0.2s;
  }

  .mk.pos {
    fill: var(--tf);
  }

  .mk.neg {
    fill: var(--rf);
  }

  .mk.hollow {
    fill: var(--card);
    stroke: var(--muted);
    stroke-width: 1.6;
  }

  .fav {
    position: relative;
    height: 100%;
    font-size: 0.74rem;
    font-weight: 600;
  }

  .fv {
    position: absolute;
    top: 3px;
    white-space: nowrap;
  }

  .fv.l {
    color: var(--rf);
  }

  .fv.r {
    color: var(--tf);
  }

  .fsh span {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Detail */
  .detail {
    margin-top: 30px;
    padding-top: 24px;
    border-top: 1px solid var(--rule);
  }

  .dh {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px 14px;
  }

  .dh h4 {
    font-size: 1.15rem;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .tag {
    font-size: 0.72rem;
    font-weight: 600;
    padding: 2px 9px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--ink) 6%, transparent);
    color: var(--ink-2);
  }

  .tag.pos {
    background: color-mix(in srgb, var(--tf) 12%, transparent);
    color: var(--tf);
  }

  .tag.neg {
    background: color-mix(in srgb, var(--rf) 12%, transparent);
    color: var(--rf);
  }

  .tag.q {
    font-weight: 500;
    color: var(--muted);
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--rule-2);
  }

  .dgrid {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
    gap: 18px 40px;
    margin-top: 16px;
  }

  .prompts {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 12px;
    align-content: start;
  }

  .prompts li {
    display: grid;
    grid-template-columns: 3.4rem minmax(0, 1fr);
    gap: 10px;
    align-items: baseline;
    font-size: 1.02rem;
    line-height: 1.5;
  }

  .prompts .form-pill {
    justify-self: start;
  }

  .big {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }

  .bl {
    font-family: var(--mono);
    font-size: 0.74rem;
    color: var(--muted);
  }

  .bv {
    font-family: var(--mono);
    font-size: 2rem;
    font-weight: 500;
    letter-spacing: -0.03em;
    line-height: 1.1;
  }

  .bu {
    color: var(--muted);
    font-size: 0.86rem;
  }

  .bci {
    margin: 4px 0 12px;
    font-size: 0.82rem;
    color: var(--muted);
  }

  .mini {
    font-size: 0.84rem;
  }

  .mini th,
  .mini td {
    padding: 6px 8px;
  }

  .fhd {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 999px;
    color: #fff;
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  .fhd.D {
    background: var(--dir);
  }

  .fhd.S {
    background: var(--tf);
  }

  .fhd.I {
    background: var(--rf);
  }

  .mini td {
    font-family: var(--mono);
    font-size: 0.8rem;
  }

  .tot th,
  .tot td {
    font-weight: 600;
    border-top: 1px solid var(--rule-2);
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 20px;
  }

  .btn.ghost {
    background: transparent;
  }

  .gb > .caption {
    margin-top: 22px;
  }

  @container (min-width: 940px) {
    .board {
      grid-template-columns: auto minmax(0, 1fr);
      gap: 0 26px;
    }

    .hhead,
    .hrow {
      grid-template-columns: 8.6rem repeat(3, 7.4rem);
    }

    .forest .fl {
      visibility: hidden;
    }

    .fhead,
    .frow,
    .ffoot {
      grid-template-columns: 0 minmax(0, 1fr) 6.3rem;
      padding-left: 0;
    }

    .frow {
      padding-left: 0;
    }

    .fsh {
      padding-left: 0;
    }

    .fsh span,
    .fsh .sw {
      visibility: hidden;
    }
  }

  @container (max-width: 520px) {
    .hhead,
    .hrow {
      grid-template-columns: minmax(4.9rem, 1fr) repeat(3, minmax(0, 1.25fr));
      column-gap: 6px;
    }

    .fb span {
      display: none;
    }

    .fb {
      height: 6px;
    }

    .hhead {
      height: 2.5rem;
    }

    .gl,
    .fl {
      font-size: 0.78rem;
    }

    .frow {
      height: auto;
      grid-template-columns: minmax(0, 1fr) 5.4rem;
      grid-template-areas:
        'l l'
        'p c';
      padding-top: 4px;
    }

    .gl {
      white-space: normal;
      line-height: 1.1;
    }

    .frow .fl {
      grid-area: l;
    }

    .frow .fp {
      grid-area: p;
    }

    .frow .fc {
      grid-area: c;
    }

    .fhead,
    .ffoot {
      grid-template-columns: minmax(0, 1fr) 5.4rem;
    }

    .fhead .fl,
    .ffoot .fl {
      display: none;
    }

    .dgrid {
      grid-template-columns: minmax(0, 1fr);
    }

    .prompts li {
      grid-template-columns: minmax(0, 1fr);
      gap: 4px;
      font-size: 0.98rem;
    }

    .jumps {
      display: grid;
      width: 100%;
    }

    .jump {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 1px 10px;
      padding: 8px 14px;
      border-radius: 14px;
      text-align: left;
    }

    .jk {
      grid-column: 1 / -1;
    }

    .mini th,
    .mini td {
      padding: 6px 4px;
    }

    .mini thead th:first-child {
      white-space: normal;
    }
  }

  @container (min-width: 521px) and (max-width: 939px) {
    .dgrid {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @container (max-width: 939px) {
    .fhead {
      height: auto;
      min-height: 3.1rem;
    }

    .ft {
      white-space: normal;
    }
  }

  @container (max-width: 520px) {
    .legend {
      padding-left: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .c,
    .mk {
      transition: none;
    }
  }
</style>
