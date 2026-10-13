<script lang="ts">
  import { onVisible, reducedMotion } from '../lib/sync';
  import { SCENES, MODELS, goalByKey, study, type ModelId } from '../lib/study';
  import CountUp from './CountUp.svelte';
  import GoalGlyph from './GoalGlyph.svelte';
  import SentenceMorph from './SentenceMorph.svelte';
  import OutcomeStrips, { type StripData } from './OutcomeStrips.svelte';

  let { strips }: { strips: Record<string, StripData> } = $props();

  let key = $state('S4-R');
  let form = $state<'S' | 'I'>('S');
  let auto = $state(true);
  const goal = $derived(goalByKey(key));
  const obj = (name: string) => study.objects[name] ?? name;
  // The scorer's directional relations: the target's origin within 45 degrees of the named direction, in the robot frame.
  const DIR_RULE: Record<string, string> = {
    L: 'within 45° of straight left of',
    R: 'within 45° of straight right of',
    F: 'within 45° of straight in front of',
    B: 'within 45° of straight behind',
  };

  const CHIP: Record<string, string> = {
    L: 'left of',
    R: 'right of',
    F: 'in front of',
    B: 'behind',
    TOP: 'on top of',
    LR: 'left onto right',
    RL: 'right onto left',
  };
  const GROUP: Record<string, [string, string] | null> = {
    S1: ['Cube', 'bowl'],
    S3: ['Butter', 'raisin box'],
    S4: ['Mustard', 'raisin box'],
    S5: null,
  };

  const placedIn = (codes: string) => [...codes].filter((c) => c === 'K' || c === 'L').length;

  // Headline numbers, all read from the exported study data.
  const tfrf = study.contrasts.TF_RF;
  const head = tfrf.anytime.All as { est: number; ci: [number, number] };
  const perModel = MODELS.map((m) => ({ m, est: (tfrf.anytime[m.id as ModelId] as { est: number }).est }));
  const disc = tfrf.discordant as { aOnly: number; bOnly: number };
  const tally = $derived.by(() => {
    const all = Object.values(strips)
      .flatMap((g) => Object.values(g).map((x) => x.codes))
      .join('');
    const pairs = Object.keys(strips).length * 24;
    if (pairs !== 288 || disc.aOnly + disc.bOnly > pairs) throw new Error('Finding: unexpected strip totals');
    return { pairs, lost: [...all].filter((c) => c === 'L').length, placed: placedIn(all) };
  });
  const fluxText = study.vqa.errors.F3.T;
  const total = (c: Partial<Record<string, number>>) => Object.values(c).reduce((a: number, b) => a + (b ?? 0), 0);
  const fluxRev = fluxText.RF.reversed ?? 0;
  const fluxRFok = fluxText.RF.correct ?? 0;
  const fluxRF = Array.from({ length: total(fluxText.RF) }, (_, i) => i < fluxRFok);
  const fluxTF = total(fluxText.TF);
  const fluxTFerr = fluxTF - (fluxText.TF.correct ?? 0);

  if (fluxRev + fluxRFok !== fluxRF.length) throw new Error('Finding: unexpected study totals');

  const pts = (x: number) => (100 * x).toFixed(1);
  const pmMax = Math.max(...perModel.map((p) => p.est), 0.2);

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
      0.3,
    );
  }

  const waffle = $derived(
    Array.from({ length: tally.pairs }, (_, i) => (i < disc.aOnly ? 'S' : i < disc.aOnly + disc.bOnly ? 'I' : 'n')),
  );
  const WC = 24;
</script>

<section class="section finding" id="finding">
  <div class="wrap">
    <header class="intro">
      <div class="eyebrow">02 · The finding</div>
      <h2>Put the reference first, and placements drop</h2>
      <p class="lede">
        Target-first and reference-first start with the same command and ask the robot to move the same object. They differ only after
        “so that”: reference-first makes the <span class="tok-ref">reference</span> the subject and states the relation from its side. Across
        the three models, that lowers the rate of stable placement by <b class="num">{pts(head.est)} percentage points</b>, and the gap
        appears in every model.
      </p>
    </header>

    <div class="fig">
      <div class="picker" role="group" aria-label="Choose a goal">
        {#each SCENES as s (s.id)}
          {@const gl = GROUP[s.id]}
          <div class="group">
            <span class="gname">
              {#if gl}<span class="gm">{gl[0]}</span><span class="gsep">·</span><span class="gr">{gl[1]}</span>{:else}Two bowls{/if}
            </span>
            <div class="chips">
              {#each s.goals as g (g.key)}
                {@const tf = placedIn(strips[g.key].S.codes)}
                {@const rf = placedIn(strips[g.key].I.codes)}
                <button type="button" class="chip" aria-pressed={key === g.key} onclick={() => (key = g.key)}>
                  <span class="ct" aria-hidden="true">{CHIP[g.id]}</span>
                  <span class="mini" aria-hidden="true">
                    <i class="S" style:height="{Math.max(6, (tf / 24) * 100)}%" class:zero={!tf}></i>
                    <i class="I" style:height="{Math.max(6, (rf / 24) * 100)}%" class:zero={!rf}></i>
                  </span>
                  {#if g.initiallyTrue}<span class="init" aria-hidden="true" title="Already true at the start">✓</span>{/if}
                  <span class="sr-only">{g.label}. TF {tf} of 24, RF {rf} of 24{g.initiallyTrue ? '. Already true at the start' : ''}</span>
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
      <p class="try">
        Try <button type="button" onclick={() => (key = 'S4-R')}>mustard · right of</button>, the largest gap, and
        <button type="button" onclick={() => (key = 'S1-B')}>cube · behind</button>, where it reverses.
      </p>

      <div class="body">
        <div class="sent">
          <SentenceMorph {goal} bind:form bind:auto />
        </div>
        <figure class="glyph">
          <GoalGlyph {goal} />
          <figcaption class="caption">
            {#if goal.initiallyTrue}
              Already true at the start: the relation holds before the robot moves, so every run counts.
            {:else}
              One of the eight starts, seen from above as the camera sees it: robot at the top, so its left is your right.
            {/if}
            <span class="sw"></span>{#if DIR_RULE[goal.relation]}Counts when the {obj(goal.mover)}’s origin (+) lies {DIR_RULE[goal.relation]}
              the {obj(goal.reference)}’s origin, in the robot’s frame. Origins are the assets’ own reference points and can sit just outside
              the object.
            {:else if goal.relation === 'supported_on'}Counts when the {obj(goal.mover)} rests on the {obj(goal.reference)} with its centre
              (+) over the {obj(goal.reference)}’s footprint, give or take 1&nbsp;cm.
            {:else}Counts when the {obj(goal.mover)} sits inside the {obj(goal.reference)} and touches it.
            {/if}
            {#if !goal.initiallyTrue}Dashed: one example placement.{/if}
          </figcaption>
        </figure>
        <div class="out">
          <OutcomeStrips {goal} data={strips[key]} active={form} />
        </div>
      </div>
    </div>

    <p class="note caveat">
      TF and RF change both the order of the objects and the relation word, so this comparison cannot say which of the two drives the
      effect. Per-goal and per-model numbers are descriptive.
    </p>

    <div class="cards" class:shown {@attach reveal}>
      <article class="card">
        <div class="big"><CountUp value={+pts(head.est)} decimals={1} sign /><span class="unit">points</span></div>
        <p class="what">Higher rate of stable placement under target-first than reference-first, any time in the episode.</p>
        <div class="pm" aria-label="Difference by model">
          {#each perModel as p, i}
            <span class="pmn">{p.m.short}</span>
            <span class="pmb"><i style:width="{shown ? (p.est / pmMax) * 100 : 0}%" style:transition-delay="{200 + i * 120}ms"></i></span>
            <span class="pmv num">+{pts(p.est)}</span>
          {/each}
        </div>
        <p class="fine">95% interval {pts(head.ci[0])}–{pts(head.ci[1])} · adjusted <i>p</i>&nbsp;&lt;&nbsp;0.001</p>
        <a class="more" href="#results">How the effect varies <span aria-hidden="true">→</span></a>
      </article>

      <article class="card">
        <div class="big"><CountUp value={disc.aOnly} /><span class="vs">vs</span><CountUp value={disc.bOnly} delay={150} /></div>
        <p class="what">
          Paired runs where only <b class="tf">TF</b> placed versus only <b class="rf">RF</b>. The other {tally.pairs - disc.aOnly - disc.bOnly} of
          {tally.pairs} pairs agreed.
        </p>
        <svg class="waffle" viewBox="0 0 {WC * 9} {(tally.pairs / WC) * 9}" aria-hidden="true">
          {#each waffle as w, i}
            <rect
              class={w}
              x={(i % WC) * 9}
              y={Math.floor(i / WC) * 9}
              width="7"
              height="7"
              rx="1.5"
              style:transition-delay="{shown ? i * 2.5 : 0}ms"
            />
          {/each}
        </svg>
        <a class="more" href="#results">Same start, same model <span aria-hidden="true">→</span></a>
      </article>

      <article class="card">
        <div class="big"><CountUp value={tally.lost} /><span class="of">of {tally.placed}</span></div>
        <p class="what">Stable placements undone before the episode ended. The overall rate halves from any time to the final second.</p>
        <div class="ae">
          <span class="ael">Any time</span>
          <span class="aeb" aria-hidden="true"
            ><i class="k" style:width="{shown ? study.rates.end * 200 : 0}%"></i><i
              class="l"
              style:width="{shown ? (study.rates.anytime - study.rates.end) * 200 : 0}%"
            ></i></span
          >
          <span class="aev num">{pts(study.rates.anytime)}%</span>
          <span class="ael">At the end</span>
          <span class="aeb" aria-hidden="true"><i class="k" style:width="{shown ? study.rates.end * 200 : 0}%"></i></span>
          <span class="aev num">{pts(study.rates.end)}%</span>
        </div>
        <div class="key">
          <p class="fine"><i class="sq k"></i>Still placed in the final second</p>
          <p class="fine"><i class="sq l"></i>Undone before the end</p>
          <p class="fine wt">Rates weight the four scenes equally.</p>
        </div>
        <a class="more" href="#failures">Where runs fail <span aria-hidden="true">→</span></a>
      </article>

      <article class="card">
        <div class="big"><CountUp value={fluxRev} /><span class="of">of {fluxRF.length}</span></div>
        <p class="what">
          RF instructions that FLUX’s text encoder, tested alone, read with the relation reversed. TF: {fluxTFerr} of {fluxTF} errors.
        </p>
        <div class="vq" aria-hidden="true">
          <span class="vql">TF</span>
          <span class="vqr">{#each Array(fluxTF) as _, i}<i class="ok" style:transition-delay="{i * 40}ms"></i>{/each}</span>
          <span class="vql">RF</span>
          <span class="vqr"
            >{#each fluxRF as ok, i}<i class={ok ? 'ok' : 'rev'} style:transition-delay="{400 + i * 40}ms">{ok ? '' : '⇄'}</i>{/each}</span
          >
        </div>
        <p class="fine">A test of the language model, not a causal explanation of rollouts.</p>
        <a class="more" href="#language">Language tests <span aria-hidden="true">→</span></a>
      </article>
    </div>
  </div>
</section>

<style>
  .intro {
    max-width: 880px;
  }

  .fig {
    margin-top: clamp(32px, 4vw, 52px);
    background: var(--card);
    border: 1px solid var(--rule);
    border-radius: calc(var(--radius) + 4px);
    box-shadow: var(--shadow);
    padding: clamp(18px, 2.6vw, 34px);
  }

  .picker {
    display: flex;
    flex-wrap: wrap;
    gap: 14px 28px;
  }

  .group {
    display: grid;
    gap: 7px;
    align-content: start;
  }

  .gname {
    font-family: var(--mono);
    font-size: 0.66rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .gm {
    color: var(--mover-ink);
  }

  .gr {
    color: var(--ref-ink);
  }

  .gsep {
    margin-inline: 0.5em;
    color: var(--faint);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 5px 8px 5px 11px;
    border-radius: 999px;
    border: 1px solid var(--rule-2);
    background: var(--paper);
    font-size: 0.84rem;
    color: var(--ink-2);
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s, color 0.2s, box-shadow 0.2s;
    position: relative;
  }

  .chip:hover {
    border-color: var(--ink-2);
    color: var(--ink);
  }

  .chip[aria-pressed='true'] {
    background: var(--ink);
    border-color: var(--ink);
    color: #fff;
    box-shadow: 0 4px 14px -6px rgb(0 0 0 / 45%);
  }

  .mini {
    display: inline-flex;
    align-items: flex-end;
    gap: 2px;
    height: 14px;
    padding-bottom: 1px;
    border-bottom: 1px solid color-mix(in srgb, currentColor 30%, transparent);
  }

  .mini i {
    display: block;
    width: 4px;
    border-radius: 1px 1px 0 0;
    transition: height 0.4s var(--ease);
  }

  .mini .S {
    background: var(--tf);
  }

  .mini .I {
    background: var(--rf);
  }

  .chip[aria-pressed='true'] .mini .S {
    background: var(--tf-2);
  }

  .chip[aria-pressed='true'] .mini .I {
    background: var(--rf-2);
  }

  .mini i.zero {
    opacity: 0.35;
  }

  .init {
    font-size: 0.72rem;
    color: var(--kept);
    font-weight: 700;
  }

  .chip[aria-pressed='true'] .init {
    color: var(--kept-2);
  }

  .try {
    margin: 14px 0 0;
    font-size: 0.84rem;
    color: var(--muted);
  }

  .try button {
    min-height: 24px;
    border: 0;
    background: none;
    padding: 0;
    color: var(--ink);
    font-weight: 500;
    text-decoration: underline;
    text-decoration-color: var(--rule-2);
    text-underline-offset: 0.2em;
    cursor: pointer;
  }

  .try button:hover {
    text-decoration-color: currentColor;
  }

  .body {
    display: grid;
    grid-template-columns: minmax(0, 1.22fr) minmax(0, 1fr);
    grid-template-areas:
      'sent glyph'
      'out glyph';
    gap: 28px clamp(28px, 4vw, 56px);
    margin-top: 22px;
    padding-top: 26px;
    border-top: 1px solid var(--rule);
    align-items: start;
  }

  .sent {
    grid-area: sent;
  }

  .glyph {
    grid-area: glyph;
    margin: 0;
    display: grid;
    gap: 10px;
  }

  .out {
    grid-area: out;
    align-self: end;
  }

  .glyph .caption {
    font-size: 0.78rem;
    margin: 0;
  }

  .sw {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--kept) 35%, transparent);
    border: 1px solid color-mix(in srgb, var(--kept) 55%, transparent);
    margin: 0 5px -1px 2px;
  }

  .caveat {
    margin: 22px 0 0;
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 18px;
    margin-top: clamp(36px, 5vw, 64px);
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 22px 22px 18px;
    border-radius: var(--radius);
    background: var(--card);
    border: 1px solid var(--rule);
  }

  .big {
    font-family: var(--serif);
    font-size: clamp(2.3rem, 1.8rem + 1.4vw, 3.1rem);
    line-height: 1;
    letter-spacing: -0.02em;
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }

  .big .unit,
  .big .of,
  .big .vs {
    font-family: var(--sans);
    font-size: 0.95rem;
    letter-spacing: 0;
    color: var(--muted);
  }

  .what {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--ink-2);
  }

  .what .tf {
    color: var(--tf);
  }

  .what .rf {
    color: var(--rf);
  }

  .fine {
    margin: 0;
    font-size: 0.76rem;
    color: var(--muted);
  }

  .more {
    margin-top: auto;
    font-size: 0.82rem;
    font-weight: 500;
    color: var(--ink);
    text-decoration: none;
    padding-top: 4px;
  }

  .more:hover span {
    display: inline-block;
    transform: translateX(3px);
    transition: transform 0.2s;
  }

  .pm {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 5px 10px;
    font-size: 0.78rem;
  }

  .pmn {
    color: var(--muted);
  }

  .pmb {
    height: 7px;
    border-radius: 4px;
    background: var(--paper-2);
    overflow: hidden;
  }

  .pmb i {
    display: block;
    height: 100%;
    border-radius: 4px;
    background: linear-gradient(90deg, var(--rf), var(--tf));
    transition: width 0.9s var(--ease);
  }

  .pmv {
    color: var(--ink-2);
    font-weight: 500;
  }

  .waffle {
    width: 100%;
    height: auto;
  }

  .waffle rect {
    fill: var(--never);
    transition: fill 0.35s, opacity 0.35s;
  }

  .waffle rect.S {
    fill: var(--tf);
  }

  .waffle rect.I {
    fill: var(--rf);
  }

  .cards:not(.shown) .waffle rect.S,
  .cards:not(.shown) .waffle rect.I {
    fill: var(--never);
  }

  .ae {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 6px 10px;
    font-size: 0.78rem;
  }

  .ael {
    color: var(--muted);
  }

  .aeb {
    display: flex;
    height: 9px;
    border-radius: 5px;
    background: var(--paper-2);
    overflow: hidden;
  }

  .aeb i {
    display: block;
    height: 100%;
    transition: width 0.9s var(--ease);
  }

  .k {
    background: var(--kept);
  }

  .l {
    background: var(--lost);
  }

  .aeb .l {
    transition-delay: 0.6s;
  }

  .sq {
    display: inline-block;
    width: 8px;
    height: 8px;
    margin: 0 4px 0 2px;
    border-radius: 2px;
    vertical-align: -0.02em;
  }

  .key {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 14px;
  }

  /* Hanging indent, so a wrapped legend label lines up after its swatch. */
  .key .fine {
    padding-left: 14px;
    text-indent: -14px;
  }

  .key .wt {
    flex-basis: 100%;
    margin-top: 2px;
  }

  .aev {
    font-weight: 500;
    color: var(--ink-2);
  }

  .vq {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 6px 10px;
  }

  .vql {
    font-family: var(--mono);
    font-size: 0.68rem;
    font-weight: 600;
    color: var(--muted);
  }

  .vqr {
    display: grid;
    grid-template-columns: repeat(10, 1fr);
    gap: 3px;
  }

  .vqr i {
    aspect-ratio: 1;
    border-radius: 3px;
    display: grid;
    place-items: center;
    font-style: normal;
    font-size: 0.66rem;
    line-height: 1;
    color: #fff;
    transition: background-color 0.3s, transform 0.4s var(--ease);
  }

  .vqr .ok {
    background: color-mix(in srgb, var(--kept) 70%, white);
  }

  .vqr .rev {
    background: var(--rf);
  }

  .cards:not(.shown) .vqr i {
    background: var(--never);
    transform: scale(0.6);
  }

  @media (max-width: 1080px) {
    .cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 860px) {
    .body {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        'sent'
        'glyph'
        'out';
    }

    .glyph {
      max-width: 520px;
    }
  }

  @media (max-width: 560px) {
    .cards {
      grid-template-columns: minmax(0, 1fr);
    }

    .picker {
      gap: 12px 18px;
    }

    .chip {
      font-size: 0.8rem;
      padding: 4px 7px 4px 10px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pmb i,
    .aeb i,
    .waffle rect,
    .vqr i,
    .mini i {
      transition: none;
    }
  }
</style>
