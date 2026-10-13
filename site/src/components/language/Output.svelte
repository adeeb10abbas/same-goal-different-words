<script lang="ts">
  import { ERR_COLOR_DARK, ERR_HINT, ERR_LABEL, outputText, valueSpans, type Answer } from '../../lib/vqa';
  import type { VqaErr } from '../../lib/study';
  import RelationGlyph from './RelationGlyph.svelte';

  /** The decoded answer, one generated token at a time, with the vocabulary the grammar allows at each value and the
   *  reading it implies next to the requested one. */
  let {
    seq,
    shown,
    phase,
    gold,
    schema,
    err,
    mover,
    tokens,
  }: {
    seq: string[] | null;
    shown: number;
    phase: 'encoding' | 'decoding' | 'done';
    gold: Answer;
    schema: Record<keyof Answer, string[]>;
    err: VqaErr | null;
    mover: string;
    tokens: number;
  } = $props();

  const KEYS = ['target', 'reference', 'relation'] as const;
  const END = '<|im_end|>';

  const text = $derived(seq ? outputText(seq) : '');
  const answer = $derived.by((): Answer | null => {
    try {
      return text ? (JSON.parse(text) as Answer) : null;
    } catch {
      return null;
    }
  });
  const spans = $derived(valueSpans(text));
  const chips = $derived.by(() => {
    if (!seq) return [];
    let at = 0;
    return seq.map((t) => {
      const from = at;
      at += t === END ? 0 : t.length;
      const key = t === END ? null : (spans.find((s) => from < s.to && at > s.from)?.key ?? null);
      const lead = /^ +/.exec(t)?.[0].length ?? 0;
      return { t, end: t === END, lead, body: t.slice(lead), key, to: at };
    });
  });
  const revealed = $derived(chips.length ? (chips[Math.min(shown, chips.length) - 1]?.to ?? 0) : 0);
  const done = $derived(phase === 'done' && !!answer);

  /** Options still allowed by the grammar given the characters generated so far, and whether the value is complete. */
  function state(key: (typeof KEYS)[number]) {
    const s = spans.find((x) => x.key === key);
    if (!s || !answer) return { prefix: '', decided: false, active: false };
    const upto = Math.min(revealed, s.to);
    return {
      prefix: upto > s.from ? text.slice(s.from, upto) : '',
      decided: done || revealed >= s.to,
      active: !done && revealed > s.from - 2 && revealed < s.to + 2,
    };
  }
  const rows = $derived(KEYS.map((k) => ({ key: k, ...state(k) })));
  const reading = $derived(done && answer ? answer : gold);
</script>

<div class="out">
  <div class="grid">
    <section class="dec" aria-label="Decoded answer">
      <header>
        <span class="lbl">Output</span>
        {#if phase === 'encoding'}
          <span class="st enc">{tokens ? `reading ${tokens.toLocaleString('en-US')} prompt tokens…` : 'loading answers…'}</span>
        {:else}
          <span class="st">{Math.min(shown, chips.length)}/{chips.length} tokens</span>
        {/if}
      </header>
      <div class="chips" class:enc={phase === 'encoding'} aria-hidden="true">
        {#each chips as c, i (i)}
          <span
            class="chip k-{c.key ?? 'none'}"
            class:end={c.end}
            class:on={i < shown}
            class:caret={phase === 'decoding' && i === shown}
            class:mv={c.key === 'target' || c.key === 'reference'
              ? (c.key === 'target' ? answer?.target : answer?.reference) === mover
              : false}
            >{#if c.lead}<span class="sp">{'·'.repeat(c.lead)}</span>{/if}{c.body}</span
          >
        {/each}
      </div>
      <p class="sr">{phase === 'done' ? text : ''}</p>

      <div class="opts">
        {#each rows as r (r.key)}
          <div class="row" class:active={r.active}>
            <span class="key">{r.key}</span>
            <span class="vals">
              {#each schema[r.key] as o (o)}
                {@const cut = !!r.prefix && !o.startsWith(r.prefix)}
                {@const pick = r.decided && answer?.[r.key] === o}
                <span
                  class="opt"
                  class:cut
                  class:pick
                  class:bad={pick && done && gold[r.key] !== o}
                  class:gold={done && gold[r.key] === o}>{o}</span
                >
              {/each}
            </span>
          </div>
        {/each}
      </div>
      <p class="meta">greedy · temperature 0 · JSON constrained to these values · thinking off</p>
    </section>

    <section class="verdict" aria-label="Verdict">
      <div class="glyphs">
        <RelationGlyph answer={gold} {mover} label="Requested" />
        <RelationGlyph
          answer={reading}
          {mover}
          label="Model's reading"
          pending={!done}
          tone={done ? (err === 'correct' ? 'ok' : 'bad') : 'neutral'}
        />
      </div>
      <div class="cls" aria-live="polite">
        {#if done && err}
          <span class="badge" style:--c={ERR_COLOR_DARK[err]}><i></i>{ERR_LABEL[err]}</span>
          <span class="hint">{ERR_HINT[err]}</span>
        {:else}
          <span class="badge wait"><i></i>{phase === 'encoding' ? 'Reading the prompt' : 'Decoding'}</span>
          <span class="hint">A green outline marks the correct value once the answer is complete.</span>
        {/if}
      </div>
    </section>
  </div>
</div>

<style>
  .out {
    container-type: inline-size;
    min-width: 0;
  }

  .grid {
    display: grid;
    gap: 14px;
  }

  @container (min-width: 720px) {
    .grid {
      grid-template-columns: minmax(0, 1fr) minmax(0, 430px);
      align-items: start;
    }
  }

  .dec {
    min-width: 0;
    border: 1px solid var(--stage-rule);
    border-radius: 12px;
    background: var(--stage-2);
    padding: 10px 12px 12px;
  }

  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 8px;
  }

  header .lbl {
    color: var(--stage-muted);
  }

  .st {
    font-size: 0.74rem;
    color: var(--stage-muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .st.enc {
    color: var(--tf-2);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    min-height: 52px;
    align-content: flex-start;
    font-family: var(--mono);
    font-size: 0.74rem;
    line-height: 1;
  }

  .chips.enc {
    animation: pulse 1s ease-in-out infinite;
  }

  .chip {
    padding: 4px 5px;
    border-radius: 5px;
    background: rgb(255 255 255 / 7%);
    color: #dfe3e8;
    white-space: pre;
    opacity: 0;
    transform: translateY(3px);
    transition:
      opacity 0.16s,
      transform 0.16s;
  }

  .chip.on {
    opacity: 1;
    transform: none;
  }

  .chip.caret {
    opacity: 0.35;
    outline: 1px dashed var(--stage-muted);
    color: transparent;
  }

  .chip .sp {
    color: var(--stage-muted);
  }

  .chip.k-target,
  .chip.k-reference {
    background: color-mix(in srgb, var(--ref) 30%, transparent);
    color: #ffc39b;
  }

  .chip.k-target.mv,
  .chip.k-reference.mv {
    background: color-mix(in srgb, var(--mover) 32%, transparent);
    color: #8fe1f0;
  }

  .chip.k-relation {
    background: rgb(255 255 255 / 16%);
    color: #fff;
    font-weight: 600;
  }

  .chip.end {
    background: transparent;
    border: 1px solid var(--stage-rule);
    color: var(--stage-muted);
  }

  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .opts {
    display: grid;
    gap: 5px;
    margin-top: 12px;
  }

  .row {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    gap: 8px;
    align-items: baseline;
    padding: 3px 6px;
    margin-inline: -6px;
    border-radius: 6px;
    transition: background 0.2s;
  }

  .row.active {
    background: rgb(255 255 255 / 5%);
  }

  .key {
    font-family: var(--mono);
    font-size: 0.68rem;
    color: var(--stage-muted);
  }

  .vals {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .opt {
    padding: 2px 7px;
    border-radius: 999px;
    border: 1px solid rgb(255 255 255 / 12%);
    font-family: var(--mono);
    font-size: 0.66rem;
    line-height: 1.4;
    color: #c9ced6;
    transition:
      opacity 0.2s,
      background 0.25s,
      border-color 0.25s,
      color 0.25s;
  }

  /* Pruned codes stay legible (>= 4.5:1 on the console) and read as struck out. */
  .opt.cut {
    color: #8a8f98;
    border-color: rgb(255 255 255 / 5%);
    text-decoration: line-through;
    text-decoration-color: rgb(255 255 255 / 35%);
  }

  .opt.pick {
    background: #e9edf2;
    border-color: #e9edf2;
    color: var(--stage);
    font-weight: 600;
  }

  .opt.pick.bad {
    background: var(--vq-rev-2);
    border-color: var(--vq-rev-2);
  }

  .opt.gold {
    border-color: var(--vq-ok-2);
    box-shadow: 0 0 0 1px var(--vq-ok-2);
  }

  .opt.pick.gold {
    background: var(--vq-ok-2);
  }

  .meta {
    margin: 10px 0 0;
    font-size: 0.68rem;
    color: var(--stage-muted);
  }

  .verdict {
    min-width: 0;
    display: grid;
    gap: 10px;
  }

  .glyphs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  @container (max-width: 719px) {
    .glyphs {
      grid-template-columns: repeat(2, minmax(0, 250px));
    }
  }

  @container (max-width: 379px) {
    .glyphs {
      grid-template-columns: minmax(0, 280px);
      justify-content: center;
    }
  }

  .cls {
    display: grid;
    gap: 4px;
    justify-items: start;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 3px 10px 3px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--c) 18%, transparent);
    border: 1px solid color-mix(in srgb, var(--c) 55%, transparent);
    color: #fff;
    font-size: 0.82rem;
    font-weight: 600;
  }

  .badge i {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--c);
  }

  .badge.wait {
    --c: var(--stage-muted);
    font-weight: 500;
    color: var(--stage-muted);
  }

  .hint {
    font-size: 0.8rem;
    line-height: 1.45;
    color: #c9ced6;
  }

  @keyframes pulse {
    50% {
      opacity: 0.55;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .chip,
    .opt {
      transition: none;
    }

    .chips.enc {
      animation: none;
    }
  }
</style>
