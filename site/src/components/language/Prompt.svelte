<script lang="ts">
  import { tick } from 'svelte';
  import { slide } from 'svelte/transition';
  import { reducedMotion } from '../../lib/sync';
  import { tokenize, type Goal } from '../../lib/study';
  import { VIEW_LABEL, fill, imageUrl, startId, type Segment, type View, type VqaPrompt } from '../../lib/vqa';

  /** The exact prompt of one item. It always renders the image template: the text-only prompts are the same text with
   *  an empty line where each image would go, so the empty slots are drawn there. */
  let {
    segments,
    prompt,
    goal,
    images,
    slot,
    tokens,
    textTokens,
  }: {
    segments: Segment[];
    prompt: VqaPrompt;
    goal: Goal;
    images: boolean;
    slot: number;
    tokens: number;
    textTokens: number;
  } = $props();

  type Raw = { t: string } | { image: View };
  type Block =
    | { k: 'line'; s: string; cls: string }
    | { k: 'blank' }
    | { k: 'instr' }
    | { k: 'fold'; id: 'pre' | 'post'; label: string; lines: string[] }
    | { k: 'cams'; cams: { view: View; desc: string | null }[] };

  const MAX_TOKENS = 3000;
  const HEAD = 'Camera views of the current scene';

  const blocks = $derived.by((): Block[] => {
    const lines: Raw[][] = [[]];
    for (const s of segments) {
      if ('image' in s) {
        lines[lines.length - 1].push({ image: s.image });
        continue;
      }
      fill(s.t, prompt)
        .split('\n')
        .forEach((part, i) => {
          if (i) lines.push([]);
          if (part) lines[lines.length - 1].push({ t: part });
        });
    }
    const text = (l: Raw[] | undefined) => (l && l.length === 1 && 't' in l[0] ? l[0].t : null);
    const isImage = (l: Raw[]) => l.length === 1 && 'image' in l[0];
    const head = lines.findIndex((l) => text(l)?.startsWith(HEAD));
    const vocab = lines.findIndex((l) => text(l)?.startsWith('Object vocabulary'));
    const instr = lines.findIndex((l) => text(l) === prompt.instruction);
    if (head < 0 || vocab < head || instr < vocab) throw new Error('vqa prompt: unexpected template');

    const cams: { view: View; desc: string | null }[] = [];
    for (let i = head + 1; i < vocab; i++)
      if (isImage(lines[i])) cams.push({ view: (lines[i][0] as { image: View }).image, desc: i - 1 > head ? text(lines[i - 1]) : null });
    const plain = (l: Raw[]): Block => {
      const t = text(l);
      return t === null ? { k: 'blank' } : { k: 'line', s: t, cls: /^(Object|Relation) vocabulary/.test(t) ? 'vocab' : '' };
    };
    const trim = (ls: Raw[][]) => {
      const t = ls.map((l) => text(l) ?? '');
      while (t.length && !t[0]) t.shift();
      while (t.length && !t[t.length - 1]) t.pop();
      return t;
    };
    return [
      { k: 'fold', id: 'pre', label: 'task and coordinate frame', lines: trim(lines.slice(0, head)) },
      { k: 'blank' },
      { k: 'line', s: text(lines[head])!, cls: '' },
      { k: 'cams', cams },
      ...lines.slice(vocab, instr).map(plain),
      { k: 'instr' },
      { k: 'blank' },
      { k: 'fold', id: 'post', label: 'answer format', lines: trim(lines.slice(instr + 1)) },
    ];
  });

  const toks = $derived(tokenize(prompt.instruction, goal));
  const frame = $derived(`${startId(prompt.scene, slot)}-initial`);
  let open = $state<Record<string, boolean>>({});
  const all = $derived(!!open.pre && !!open.post);

  let box: HTMLElement | undefined = $state();
  let instrEl: HTMLElement | undefined = $state();
  /** Keep the instruction in view inside the scroll box without scrolling the page (again once images slide in). */
  function reveal() {
    if (!box || !instrEl || box.scrollHeight <= box.clientHeight + 1) return;
    const top = instrEl.offsetTop;
    const want = top + instrEl.offsetHeight + 12 - box.clientHeight;
    if (want > box.scrollTop || top < box.scrollTop)
      box.scrollTo({ top: Math.max(0, want), behavior: reducedMotion() ? 'auto' : 'smooth' });
  }
  $effect(() => {
    void prompt.instruction;
    void images;
    void segments;
    tick().then(reveal);
    const t = setTimeout(reveal, 420);
    return () => clearTimeout(t);
  });
</script>

<section class="pp" aria-label="Exact prompt">
  <header>
    <span class="lbl">Prompt</span>
    <span class="tok"><b>{tokens.toLocaleString('en-US')}</b> tokens</span>
    <span class="meter" aria-hidden="true">
      <i class="t" style:width="{(100 * textTokens) / MAX_TOKENS}%"></i>
      <i class="im" style:width="{(100 * Math.max(0, tokens - textTokens)) / MAX_TOKENS}%"></i>
    </span>
    <span class="split">
      {textTokens.toLocaleString('en-US')} text{#if images}<span class="imtxt"
          >{` + ${(tokens - textTokens).toLocaleString('en-US')} from 3 images`}</span
        >{/if}
    </span>
    <button class="all" aria-pressed={all} onclick={() => (open = all ? {} : { pre: true, post: true })}>
      {all ? 'Fold fixed lines' : 'Show every line'}
    </button>
  </header>

  <div class="box" bind:this={box} data-qa-scroll>
    {#each blocks as b, bi (bi)}
      {#if b.k === 'fold'}
        {#if open[b.id]}
          <div class="fold-open">
            {#each b.lines as l, li (li)}
              {#if l}<p class="ln">{l}</p>{:else}<p class="ln blank" aria-hidden="true"></p>{/if}
            {/each}
          </div>
        {:else}
          <button class="fold" onclick={() => (open[b.id] = true)}>
            ⋯ {b.lines.filter(Boolean).length} lines: {b.label}
          </button>
        {/if}
      {:else if b.k === 'line'}
        <p class="ln {b.cls}">{b.s}</p>
      {:else if b.k === 'blank'}
        <p class="ln blank" aria-hidden="true"></p>
      {:else if b.k === 'instr'}
        <p class="ln instr" bind:this={instrEl}>
          {#each toks as t, ti (ti)}{#if t.kind === 'plain'}{t.text}{:else}<span class="tok-{t.kind}">{t.text}</span>{/if}{/each}
        </p>
      {:else}
        <div class="cams" class:on={images} class:hasdesc={b.cams.some((c) => c.desc)}>
          {#each b.cams as c (c.view)}
            <div class="cam">
              {#if c.desc}<p class="ln desc">{c.desc}</p>{/if}
              {#if images}
                <figure class="shot" transition:slide={{ duration: reducedMotion() ? 0 : 380 }}>
                  <img src={imageUrl(frame, c.view)} width="640" height="360" alt="{VIEW_LABEL[c.view]}, start {slot}" loading="lazy" />
                  <figcaption data-qa-overlay>{VIEW_LABEL[c.view]}</figcaption>
                </figure>
              {:else}
                <p class="slot">empty line: no image</p>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    {/each}
  </div>
</section>

<style>
  .pp {
    min-width: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    border: 1px solid var(--stage-rule);
    border-radius: 12px;
    background: var(--stage-2);
    overflow: hidden;
  }

  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
    padding: 9px 12px;
    border-bottom: 1px solid var(--stage-rule);
    font-size: 0.78rem;
    color: var(--stage-muted);
  }

  header .lbl {
    color: var(--stage-muted);
  }

  .tok {
    color: var(--stage-ink);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .meter {
    flex: 1 1 90px;
    max-width: 220px;
    height: 7px;
    border-radius: 4px;
    background: rgb(255 255 255 / 7%);
    display: flex;
    overflow: hidden;
  }

  .meter i {
    display: block;
    height: 100%;
    transition: width 0.7s var(--ease);
  }

  .meter .t {
    background: #c9ced6;
  }

  .meter .im {
    background: var(--tf-2);
  }

  .split {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .imtxt {
    color: var(--tf-2);
  }

  .all {
    margin-left: auto;
    min-height: 24px;
    border: 1px solid var(--stage-rule);
    background: transparent;
    color: var(--stage-muted);
    border-radius: 999px;
    padding: 3px 10px;
    font-size: 0.72rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .all:hover {
    color: #fff;
    border-color: var(--stage-muted);
  }

  .box {
    position: relative;
    padding: 10px 12px 12px;
    font-family: var(--mono);
    font-size: 0.74rem;
    line-height: 1.55;
    color: #c9ced6;
    overflow: auto;
    overscroll-behavior: contain;
  }

  @media (min-width: 900px) {
    .box {
      max-height: min(420px, 56vh);
    }
  }

  .ln {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .ln.blank {
    height: 0.55em;
  }

  .ln.vocab {
    color: var(--stage-muted);
  }

  .ln.instr {
    margin-top: 2px;
    font-family: var(--sans);
    font-size: 0.95rem;
    line-height: 1.6;
    color: #fff;
  }

  .fold {
    display: block;
    width: 100%;
    min-height: 24px;
    text-align: left;
    margin: 2px 0;
    padding: 2px 8px;
    border: 1px dashed var(--stage-rule);
    border-radius: 6px;
    background: transparent;
    color: var(--stage-muted);
    font: inherit;
    font-size: 0.7rem;
    cursor: pointer;
  }

  .fold:hover {
    color: #fff;
    border-color: var(--stage-muted);
  }

  .fold-open {
    border-left: 2px solid var(--stage-rule);
    padding-left: 8px;
    margin: 2px 0;
  }

  .cams {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin: 6px 0 4px;
  }

  .cam {
    min-width: 0;
    display: grid;
    align-content: start;
    gap: 5px;
  }

  .desc {
    font-size: 0.66rem;
    line-height: 1.45;
    padding: 3px 6px;
    border-radius: 5px;
    background: rgb(255 255 255 / 6%);
    color: #dfe3e8;
  }

  .shot {
    position: relative;
    margin: 0;
    border-radius: 6px;
    overflow: hidden;
    background: #000;
  }

  .shot img {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 16 / 9;
    object-fit: cover;
  }

  .shot figcaption {
    position: absolute;
    left: 5px;
    bottom: 5px;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgb(0 0 0 / 62%);
    font-family: var(--sans);
    font-size: 0.64rem;
    color: #fff;
    white-space: nowrap;
  }

  .slot {
    margin: 0;
    padding: 4px 6px;
    border: 1px dashed rgb(255 255 255 / 16%);
    border-radius: 6px;
    font-family: var(--sans);
    font-size: 0.66rem;
    color: var(--stage-muted);
    text-align: center;
  }

  /* Narrow screens: one camera per row, the description beside its picture. */
  @media (max-width: 639px) {
    .cams.hasdesc {
      grid-template-columns: 1fr;
    }

    .cams.hasdesc .cam {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
      align-items: start;
    }

    .cams.hasdesc .cam .desc {
      order: 2;
    }
  }
</style>
