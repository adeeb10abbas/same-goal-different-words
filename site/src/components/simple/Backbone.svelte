<script module lang="ts">
  import type { FormId } from '../../lib/study';

  export type Cls = 'c' | 'r' | 'o';
  export type BackboneRow = {
    id: string;
    name: string;
    short: string;
    lm: string;
    cells: { f: FormId; dots: Cls[] }[];
    /** Percent correct on reference-first goals with camera images and their descriptions. */
    images: number;
  };
  export type DecodeExample = {
    instruction: string;
    tokens: string[];
    /** Token index range [from, to) of the relation value. */
    bad: [number, number];
    said: string;
    gold: string;
    model: string;
    lm: string;
  };
</script>

<script lang="ts">
  import { onVisible, reducedMotion } from '../../lib/sync';
  import { FORM_NAME, FORM_SHORT } from '../../lib/study';


  let { ex, rows, more }: { ex: DecodeExample; rows: BackboneRow[]; more: string } = $props();

  const FORMS: FormId[] = ['D', 'S', 'I'];
  const correct = (d: Cls[]) => d.filter((x) => x === 'c').length;
  const DOT_LABEL: Record<Cls, string> = { c: 'correct', r: 'relation reversed', o: 'other wrong relation' };
  const img = $derived(Object.fromEntries(rows.map((r) => [r.id, r.images.toFixed(1)])));

  // SSR prints the whole answer and every dot; the client resets both and plays them once they are on screen.
  let shown = $state(Infinity);
  let waiting = $state(false);
  let timer: ReturnType<typeof setInterval> | undefined;
  const done = $derived(shown >= ex.tokens.length);
  // Once typed, the answer is three runs of text so subword tokens read as words, not adjacent fragments.
  const runs = [ex.tokens.slice(0, ex.bad[0]), ex.tokens.slice(...ex.bad), ex.tokens.slice(ex.bad[1])].map((t) => t.join(''));

  function type() {
    clearInterval(timer);
    shown = 0;
    timer = setInterval(() => {
      shown += 1;
      if (shown >= ex.tokens.length) clearInterval(timer);
    }, 95);
  }

  function arm(node: HTMLElement) {
    if (reducedMotion()) return;
    shown = 0;
    let armed = true;
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = onVisible(
      node,
      (v) => {
        if (v && armed) {
          armed = false;
          t = setTimeout(type, 500);
        }
      },
      0.5,
    );
    return () => {
      off();
      clearTimeout(t);
      clearInterval(timer);
    };
  }

  function armDots(node: HTMLElement) {
    if (reducedMotion()) return;
    waiting = true;
    return onVisible(
      node,
      (v) => {
        if (v) waiting = false;
      },
      0.35,
    );
  }
</script>

<section class="section pk-backbone" id="backbone">
  <div class="wrap">
    <header class="pk-head">
      <div class="pk-k"><b>05</b>Before the robot moves</div>
      <h2 class="pk-h">The language backbone <em>already misreads the goal.</em></h2>
      <p class="pk-p">
        We gave each model’s own language backbone just the instruction text, and asked for the object to move, the reference and the
        final relation. On reference-first wording, two of the three misread six of the ten goals.
      </p>
    </header>

    <div class="pk-body cols">
      <figure class="console" {@attach arm}>
        <div class="bar"><i></i><i></i><i></i><span>{ex.lm} · text only</span></div>
        <div class="body">
          <div class="lab">Instruction <span class="form-pill I">RF</span></div>
          <p class="instr">{ex.instruction}</p>
          <div class="lab">{ex.model}’s text encoder answers</div>
          <p class="out" aria-hidden="true">
            {#if done}<span class="t on">{runs[0]}</span><span class="t on bad">{runs[1]}</span><span class="t on">{runs[2]}</span
              >{:else}{#each ex.tokens as t, i (i)}<span class="t" class:bad={i >= ex.bad[0] && i < ex.bad[1]} class:on={i < shown}>{t}</span
                >{/each}{/if}<span
              class="caret"
              class:done
            ></span>
          </p>
          <p class="sr-only">The model answered target mustard bottle, reference raisin box, relation {ex.said}.</p>
          <p class="verdict" class:on={done}>
            <span class="x" aria-hidden="true">✕</span>
            <span>Reversed. The bottle should end up <b class="num">{ex.gold}</b> the raisin box.</span>
          </p>
        </div>
      </figure>

      <figure class="table" class:waiting {@attach armDots}>
        <div class="thead" aria-hidden="true">
          <span></span>
          {#each FORMS as f}<span class="th {f}"><span class="form-pill {f}">{FORM_SHORT[f]}</span></span>{/each}
        </div>
        {#each rows as r, ri (r.id)}
          <div class="tr">
            <div class="who">
              <b><span class="long">{r.name}</span><span class="short">{r.short}</span></b>
              <span>{r.lm}</span>
            </div>
            {#each r.cells as c, ci (c.f)}
              <div class="td {c.f}" role="img" aria-label="{r.name}, {FORM_NAME[c.f]}: {correct(c.dots)} of {c.dots.length} correct">
                <span class="dots">
                  {#each c.dots as d, di (di)}<i class={d} style:--d="{(ri * 3 + ci) * 60 + di * 22}ms" title={DOT_LABEL[d]}></i>{/each}
                </span>
                <span class="n num" class:low={correct(c.dots) < c.dots.length}>{correct(c.dots)}/{c.dots.length}</span>
              </div>
            {/each}
          </div>
        {/each}
        <div class="key" aria-hidden="true">
          <span><i class="c"></i>Correct</span>
          <span><i class="r"></i>Relation reversed</span>
          <span><i class="o"></i>Other wrong relation</span>
        </div>
        <figcaption class="sr-only">Text-only answers on ten goals per wording.</figcaption>
      </figure>
    </div>

    <p class="pk-foot">
      Ten goals per wording; bowl stacking is excluded. Adding camera images and their descriptions does not fix it: on
      reference-first goals Edge answers <b class="num">{img.E3}%</b> correctly and FLUX <b class="num">{img.F3}%</b>, and even Nano drops
      to <b class="num">{img.N3}%</b>. A misreading alone does not explain a failed rollout.
      <a class="pk-more" href={more}>Language probe&nbsp;→</a>
    </p>
  </div>
</section>

<style>
  .cols {
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
    gap: clamp(24px, 3.4vw, 56px);
    align-items: center;
  }

  .console {
    margin: 0;
    border-radius: 18px;
    overflow: hidden;
    background: var(--stage);
    color: var(--stage-ink);
    box-shadow: 0 30px 60px -30px rgb(13 15 19 / 55%);
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 12px 16px;
    background: var(--stage-2);
    border-bottom: 1px solid var(--stage-rule);
    font-family: var(--mono);
    font-size: 0.72rem;
    color: var(--stage-muted);
  }

  .bar i {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--stage-3);
    flex: none;
  }

  .bar span {
    margin-left: 8px;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .body {
    padding: clamp(18px, 2.4vw, 28px);
  }

  .lab {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: var(--mono);
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--stage-muted);
  }

  .instr {
    margin: 10px 0 22px;
    font-family: var(--serif);
    font-size: clamp(1.08rem, 1rem + 0.35vw, 1.3rem);
    line-height: 1.45;
    color: #fff;
  }

  .out {
    margin: 10px 0 0;
    min-height: 3.2em;
    font-family: var(--mono);
    font-size: clamp(0.84rem, 0.8rem + 0.2vw, 0.98rem);
    line-height: 1.7;
    color: #d5d9e0;
    overflow-wrap: anywhere;
  }

  .t {
    white-space: pre-wrap;
    opacity: 0;
    transition: opacity 0.12s;
  }

  .t.on {
    opacity: 1;
  }

  .t.bad {
    color: var(--vq-rev-2);
    background: rgb(255 107 128 / 16%);
    font-weight: 700;
  }

  .caret {
    display: inline-block;
    width: 0.55em;
    height: 1.1em;
    margin-left: 2px;
    vertical-align: -0.2em;
    background: #d5d9e0;
    animation: blink 1s steps(1) infinite;
  }

  .caret.done {
    animation: none;
    opacity: 0;
  }

  @keyframes blink {
    50% {
      opacity: 0;
    }
  }

  .verdict {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 18px 0 0;
    padding: 10px 14px;
    border-radius: 12px;
    background: rgb(255 107 128 / 12%);
    box-shadow: inset 0 0 0 1px rgb(255 107 128 / 35%);
    color: #ffe1e4;
    font-size: 0.92rem;
    line-height: 1.4;
    opacity: 0;
    transform: translateY(6px);
    transition: opacity 0.4s, transform 0.4s var(--ease);
  }

  .verdict.on {
    opacity: 1;
    transform: none;
  }

  .verdict b {
    color: var(--kept-2);
    font-family: var(--mono);
    font-weight: 600;
  }

  .x {
    display: grid;
    place-items: center;
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--vq-rev-2);
    color: #3b0710;
    font-size: 0.74rem;
    font-weight: 700;
  }

  .table {
    margin: 0;
  }

  .thead,
  .tr {
    display: grid;
    grid-template-columns: minmax(96px, 1.1fr) repeat(3, minmax(0, 1fr));
    gap: 10px;
    align-items: center;
  }

  .thead {
    padding-bottom: 10px;
  }

  .th {
    display: flex;
    justify-content: center;
  }

  .tr {
    padding: 14px 0;
    border-top: 1px solid var(--rule);
  }

  .who {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .who b {
    font-weight: 600;
    font-size: 0.95rem;
  }

  .who .short {
    display: none;
  }

  .who > span {
    font-size: 0.74rem;
    color: var(--muted);
    line-height: 1.3;
  }

  .td {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px 4px;
    border-radius: 12px;
  }

  .td.I {
    background: color-mix(in srgb, var(--rf) 7%, transparent);
  }

  .dots {
    display: grid;
    grid-template-columns: repeat(5, 12px);
    gap: 5px;
  }

  .dots i {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--vq-ok);
    transition: transform 0.4s var(--ease) var(--d);
  }

  .waiting .dots i {
    transform: scale(0);
    transition: none;
  }

  .dots i.r {
    background: var(--vq-rev);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--vq-rev) 22%, transparent);
  }

  .dots i.o {
    background: transparent;
    box-shadow: inset 0 0 0 2px var(--vq-oth);
  }

  .n {
    font-size: 0.86rem;
    font-weight: 600;
    color: var(--ink);
  }

  .n.low {
    color: var(--vq-rev);
  }

  .key {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    padding-top: 14px;
    border-top: 1px solid var(--rule);
    font-size: 0.82rem;
    color: var(--muted);
  }

  .key span {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }

  .key i {
    width: 11px;
    height: 11px;
    border-radius: 50%;
  }

  .key .c {
    background: var(--vq-ok);
  }

  .key .r {
    background: var(--vq-rev);
  }

  .key .o {
    box-shadow: inset 0 0 0 2px var(--vq-oth);
  }

  @media (max-width: 960px) {
    .cols {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 460px) {
    .thead,
    .tr {
      grid-template-columns: minmax(0, 1fr) repeat(3, auto);
      gap: 6px;
    }

    .dots {
      grid-template-columns: repeat(5, 9px);
      gap: 4px;
    }

    .dots i {
      width: 9px;
      height: 9px;
    }

    .who > span,
    .who .long {
      display: none;
    }

    .who .short {
      display: inline;
    }

    .bar i {
      display: none;
    }

    .bar span {
      margin-left: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .caret {
      animation: none;
    }

    .dots i,
    .t,
    .verdict {
      transition: none;
    }
  }
</style>
