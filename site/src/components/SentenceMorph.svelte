<script lang="ts">
  import { fade } from 'svelte/transition';
  import { cubicInOut } from 'svelte/easing';
  import { onVisible, reducedMotion } from '../lib/sync';
  import { FORM_NAME, FORM_SHORT, type Goal } from '../lib/study';
  import Instruction from './Instruction.svelte';

  type Form = 'S' | 'I';
  type Key = 'm' | 'is' | 'rel' | 'r';

  let {
    goal,
    form = $bindable<Form>('S'),
    auto = $bindable(true),
  }: { goal: Goal; form?: Form; auto?: boolean } = $props();

  const CLAUSE =
    /^(the .+?) is (to the (?:left|right) of|in front of|behind|on top of and supported by|underneath and supporting|stacked on) (the .+?)\.?$/;

  function parse(prompt: string) {
    const p = prompt.trim();
    const i = p.indexOf(' so that ');
    if (i < 0) throw new Error(`SentenceMorph: no "so that" in "${p}"`);
    const m = p.slice(i + ' so that '.length).match(CLAUSE);
    if (!m) throw new Error(`SentenceMorph: cannot parse "${p}"`);
    return { prefix: p.slice(0, i), a: m[1], rel: m[2], b: m[3] };
  }

  const parts = $derived.by(() => {
    const tf = parse(goal.prompts.S);
    const rf = parse(goal.prompts.I);
    if (tf.prefix !== rf.prefix || tf.a !== rf.b || tf.b !== rf.a)
      throw new Error(`SentenceMorph: ${goal.key} TF and RF differ beyond clause order and relation`);
    return { prefix: tf.prefix, mover: tf.a.replace(/^the /, ''), ref: tf.b.replace(/^the /, ''), rel: { S: tf.rel, I: rf.rel } };
  });

  const tokens = $derived(
    ((form === 'S' ? ['m', 'is', 'rel', 'r'] : ['r', 'is', 'rel', 'm']) as Key[]).map((k, i) => ({ k, end: i === 3 })),
  );

  const LIFT: Record<Key, number> = { m: -0.95, r: 0.95, is: 0, rel: 0 };

  /** FLIP with an arc: the two noun phrases pass each other, one above the line and one below. */
  function swap(node: Element, { from, to }: { from: DOMRect; to: DOMRect }, { lift = 0 }: { lift?: number } = {}) {
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    const em = parseFloat(getComputedStyle(node).fontSize) || 16;
    const h = lift * em * Math.min(1, Math.abs(dx) / (4 * em) + 0.3);
    return {
      duration: reducedMotion() ? 0 : Math.max(650, Math.min(1100, 520 + Math.hypot(dx, dy) * 0.9)),
      easing: cubicInOut,
      css: (t: number, u: number) => {
        const s = Math.sin(Math.PI * t);
        return `transform: translate(${(u * dx).toFixed(2)}px, ${(u * dy + h * s).toFixed(2)}px) scale(${(1 + (lift ? 0.045 : 0) * s).toFixed(4)})`;
      },
    };
  }

  let visible = $state(false);
  let reduce = $state(false);
  $effect(() => {
    if (!auto || !visible || reduce) return;
    void form;
    void goal.key;
    const id = setTimeout(() => (form = form === 'S' ? 'I' : 'S'), 3600);
    return () => clearTimeout(id);
  });

  function watch(node: HTMLElement) {
    reduce = reducedMotion();
    return onVisible(node, (v) => (visible = v), 0.5);
  }

  function pick(f: Form) {
    form = f;
    auto = false;
  }
</script>

<div class="morph" {@attach watch}>
  <div class="bar">
    <div class="seg" role="group" aria-label="Wording">
      {#each ['S', 'I'] as const as f}
        <button type="button" class="f{f}" aria-pressed={form === f} onclick={() => pick(f)}>
          <b>{FORM_SHORT[f]}</b>
          {FORM_NAME[f]}
        </button>
      {/each}
    </div>
    {#if !reduce}
      <button
        type="button"
        class="auto"
        aria-pressed={auto}
        onclick={() => (auto = !auto)}
        title={auto ? 'Stop alternating the wordings' : 'Alternate the wordings automatically'}
      >
        {#if auto}
          <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="2" width="2.4" height="8" rx="0.6" /><rect x="7.1" y="2" width="2.4" height="8" rx="0.6" /></svg>
          <span>Alternating</span>
        {:else}
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.8v8.4L10 6z" /></svg>
          <span>Alternate</span>
        {/if}
      </button>
    {/if}
  </div>

  <p class="sentence form-{form}">
    <span class="q" aria-hidden="true">“</span><span class="prefix"><Instruction prompt={parts.prefix} {goal} /> so that</span>
    {#each tokens as t (t.k)}
      <span class="tk tk-{t.k}" animate:swap={{ lift: LIFT[t.k] }}
        >{#if t.k === 'is'}is{:else if t.k === 'rel'}{#key parts.rel[form]}<span
              class="tok-rel"
              in:fade={{ duration: 420, delay: 160 }}>{parts.rel[form]}</span
            >{/key}{:else}the <span class={t.k === 'm' ? 'tok-mover' : 'tok-ref'}>{t.k === 'm' ? parts.mover : parts.ref}</span
          >{/if}{#if t.end}.<span class="q" aria-hidden="true">”</span>{/if}</span
      >
    {/each}
  </p>

  <div class="why" aria-live="off">
    {#key form}
      <p in:fade={{ duration: 300 }}>
        {#if form === 'S'}
          The <span class="tok-mover">object to move</span> is the subject of the clause.
        {:else}
          The <span class="tok-ref">reference</span> is the subject, so the relation is stated as its converse.
        {/if}
      </p>
    {/key}
  </div>

  <p class="dir">
    <span class="form-pill D">DIR</span>
    <span class="dlabel">Direct command, for comparison:</span>
    <span class="dtext">“<Instruction prompt={goal.prompts.D.trim()} {goal} />”</span>
  </p>
</div>

<style>
  .morph {
    container-type: inline-size;
    display: grid;
    gap: 14px;
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 14px;
  }

  .seg button {
    display: inline-flex;
    align-items: baseline;
    gap: 7px;
    padding: 6px 14px;
  }

  .seg button b {
    font-family: var(--mono);
    font-size: 0.72rem;
    letter-spacing: 0.06em;
  }

  .seg button.fS[aria-pressed='true'] b {
    color: var(--tf);
  }

  .seg button.fI[aria-pressed='true'] b {
    color: var(--rf);
  }

  .auto {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    background: none;
    padding: 4px 6px;
    font-family: var(--mono);
    font-size: 0.68rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    cursor: pointer;
    border-radius: 6px;
  }

  .auto:hover {
    color: var(--ink);
  }

  .auto svg {
    width: 11px;
    height: 11px;
    fill: currentColor;
  }

  .sentence {
    font-family: var(--serif);
    font-size: clamp(1.32rem, 1.05rem + 1.05vw, 2.05rem);
    line-height: 1.55;
    letter-spacing: -0.008em;
    margin: 6px 0 0;
    min-height: 3.1em;
    text-wrap: initial;
  }

  .prefix {
    color: var(--muted);
  }

  .prefix :global(.tok-mover) {
    background: none;
    padding: 0;
    margin: 0;
    color: inherit;
    box-shadow: inset 0 -0.1em 0 color-mix(in srgb, var(--mover) 35%, transparent);
    border-radius: 0;
  }

  .prefix :global(.instr) {
    font-family: inherit;
  }

  .q {
    color: var(--faint);
  }

  .tk {
    display: inline-block;
    white-space: nowrap;
    position: relative;
    will-change: transform;
  }

  .tk:not(:last-child) {
    margin-right: 0.26em;
  }

  .tk-m,
  .tk-r {
    z-index: 1;
  }

  .tk .tok-rel {
    display: inline-block;
    transition: box-shadow 0.4s;
  }

  .form-S .tk .tok-rel {
    box-shadow: inset 0 -0.14em 0 color-mix(in srgb, var(--tf) 45%, transparent);
  }

  .form-I .tk .tok-rel {
    box-shadow: inset 0 -0.14em 0 color-mix(in srgb, var(--rf) 50%, transparent);
  }

  .why {
    min-height: 1.6em;
    display: grid;
  }

  .why p {
    grid-area: 1 / 1;
    margin: 0;
    font-size: 0.92rem;
    color: var(--ink-2);
  }

  .why :global(.tok-mover),
  .why :global(.tok-ref) {
    font-size: 0.95em;
  }

  .dir {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 10px;
    margin: 4px 0 0;
    padding-top: 14px;
    border-top: 1px dashed var(--rule-2);
    font-size: 0.92rem;
    color: var(--muted);
  }

  .dlabel {
    font-size: 0.84rem;
  }

  .dtext {
    font-family: var(--serif);
    font-size: 1.05rem;
    color: var(--ink-2);
  }

  @media (max-width: 560px) {
    .seg button {
      padding: 6px 11px;
      font-size: 0.78rem;
    }
  }

  /* Too narrow for one row: two equal buttons with the code above the name. */
  @container (max-width: 270px) {
    .bar .seg {
      display: grid;
      grid-template-columns: 1fr 1fr;
      width: 100%;
      border-radius: 14px;
    }

    .seg button {
      flex-direction: column;
      align-items: center;
      gap: 1px;
      padding: 6px 8px;
      border-radius: 11px;
      line-height: 1.25;
    }
  }
</style>
