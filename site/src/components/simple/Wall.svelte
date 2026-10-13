<script module lang="ts">
  import type { Outcome } from '../../lib/study';

  export type WallTile = { id: string; m: string; c: number; o: Outcome };
  /** Per-goal change from target-first to reference-first wording, in points. */
  export type GoalGap = { key: string; label: string; d: number };
</script>

<script lang="ts">
  import { onVisible, reducedMotion } from '../../lib/sync';
  import { href } from '../../lib/media';
  import { goalByKey, FORM_NAME, FORM_SHORT, MODELS } from '../../lib/study';
  import { lazySprite, FRAMES } from '../explore/sprite';
  import { splitPair } from '../../lib/split';
  import Instruction from '../Instruction.svelte';

  let {
    goalKey,
    tiles,
    gaps,
    more,
  }: { goalKey: string; tiles: Record<'S' | 'I', WallTile[]>; gaps: GoalGap[]; more: string } = $props();

  const goal = $derived(goalByKey(goalKey));
  const words = $derived(splitPair(goal.prompts.S, goal.prompts.I));
  const boards = $derived(
    (['S', 'I'] as const).map((f) => ({
      f,
      clause: words[f],
      rows: MODELS.map((m) => ({ m, tiles: tiles[f].filter((t) => t.m === m.id) })),
      placed: tiles[f].filter((t) => t.o !== 'never').length,
      kept: tiles[f].filter((t) => t.o === 'kept').length,
    })),
  );
  const LAST = FRAMES - 1;

  const LO = -80;
  const HI = 30;
  const sx = (d: number) => `${((d - LO) / (HI - LO)) * 100}%`;
  const TICKS = [-75, -50, -25, 0, 25];
  const revKey = $derived(gaps.reduce((a, b) => (b.d > a.d ? b : a)).key);
  /** Goals with equal gaps stack upward. */
  const dots = $derived.by(() => {
    const seen = new Map<number, number>();
    return [...gaps]
      .sort((a, b) => a.d - b.d)
      .map((g) => {
        const k = seen.get(g.d) ?? 0;
        seen.set(g.d, k + 1);
        return { ...g, k, hl: g.key === goalKey ? 'this' : g.key === revKey ? 'rev' : '' };
      });
  });
  const fmtD = (d: number) => `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)}`;
  const here = $derived(dots.find((g) => g.hl === 'this')!);
  const rev = $derived(dots.find((g) => g.hl === 'rev')!);
  const OUT: Record<Outcome, string> = { kept: 'placed and kept', lost: 'placed, then lost', never: 'never placed' };

  // SSR shows the final frame with outcomes; the client rewinds and plays the timelapse once the wall is on screen.
  let k = $state(LAST);
  let done = $state(true);
  let timer: ReturnType<typeof setInterval> | undefined;

  function run() {
    clearInterval(timer);
    done = false;
    k = 0;
    timer = setInterval(() => {
      if (k >= LAST) {
        clearInterval(timer);
        done = true;
        return;
      }
      k += 1;
    }, 420);
  }

  function arm(node: HTMLElement) {
    if (reducedMotion()) return;
    k = 0;
    done = false;
    let armed = true;
    const off = onVisible(
      node,
      (v) => {
        if (v && armed) {
          armed = false;
          run();
        }
      },
      0.35,
    );
    return () => {
      off?.();
      clearInterval(timer);
    };
  }

  function scrubTo(e: Event) {
    clearInterval(timer);
    k = Number((e.currentTarget as HTMLInputElement).value);
    if (k === LAST) done = true;
  }
</script>

<section class="section dark pk-wall" id="wall">
  <div class="wrap wide">
    <header class="pk-head">
      <div class="pk-k"><b>02</b>One goal, up close</div>
      <h2 class="pk-h">Twenty placements against two.</h2>
      <p class="pk-p">
        Goal: the mustard bottle to the right of the raisin box. Each wording got the same 24 tries: three models from the same eight
        starts.
      </p>
    </header>

    <div class="pk-body boards" class:done style:--k={k} {@attach arm}>
      {#each boards as b (b.f)}
        <figure class="board {b.f}">
          <figcaption>
            <span class="form-pill {b.f}">{FORM_SHORT[b.f]}</span>
            <span class="q">“…&#8202;<Instruction prompt={b.clause} {goal} />”</span>
          </figcaption>
          <div class="tally">
            <span class="pk-num n">{b.placed}</span>
            <span class="of">
              <b>of 24 placed</b>
              <span>{b.kept ? `${b.kept} kept to the end` : 'none kept to the end'}</span>
            </span>
          </div>
          <div class="grid">
            {#each b.rows as r (r.m.id)}
              <span class="rl">{r.m.short}</span>
              {#each r.tiles as t (t.id)}
                <a
                  class="tile {t.o}"
                  href={href(`explore/#${t.id}`)}
                  aria-label="{r.m.name}, start {t.c}, {FORM_NAME[b.f]}: {OUT[t.o]}. Open in the explorer."
                >
                  <span class="img" {@attach lazySprite(t.id)}></span>
                </a>
              {/each}
            {/each}
          </div>
        </figure>
      {/each}
    </div>

    <div class="ctl">
      <button class="btn" type="button" onclick={run}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3 2.5v11l10-5.5z" /></svg>Replay
      </button>
      <label class="scrub">
        <span class="lbl">Episode time</span>
        <input type="range" min="0" max={LAST} step="1" value={k} oninput={scrubTo} aria-valuetext="frame {k + 1} of {FRAMES}" />
      </label>
      <div class="key" aria-hidden="true">
        <span><i class="sw kept"></i>Placed, kept</span>
        <span><i class="sw lost"></i>Placed, then lost</span>
        <span><i class="sw never"></i>Never placed</span>
      </div>
    </div>

    <figure class="spread">
      <figcaption>
        <b>All twelve goals.</b> Switching to reference-first wording moved placement by
        <span class="num">{fmtD(here.d)}</span> to <span class="num">{fmtD(rev.d)}</span> points, depending on the goal.
      </figcaption>
      <div class="axis" role="img" aria-label="Per-goal change from target-first to reference-first wording: {dots.map((g) => `${g.label} ${fmtD(g.d)}`).join('; ')}.">
        {#each TICKS as t}<i class="tick" class:zero={t === 0} style:left={sx(t)}><span>{fmtD(t)}</span></i>{/each}
        {#each dots as g (g.key)}
          <span class="g {g.hl}" style:left={sx(g.d)} style:--k={g.k} title="{g.label}: {fmtD(g.d)} points"></span>
        {/each}
        <span class="call this" style:left={sx(here.d)} aria-hidden="true">{here.label} <i>(above)</i></span>
        <span class="call rev" style:left={sx(rev.d)} aria-hidden="true">{rev.label} <i>(next)</i></span>
      </div>
      <p class="keys" aria-hidden="true">
        <span class="key this"><i></i>{here.label}, above</span>
        <span class="key rev"><i></i>{rev.label}, next</span>
      </p>
    </figure>

    <p class="pk-foot">
      Each tile is one rollout, sampled at twelve moments from start to end; rows are models, columns the eight starts. Click a tile to
      watch it. <a class="pk-more" href={more}>Every goal&nbsp;→</a>
    </p>
  </div>
</section>

<style>
  .wide {
    width: min(1320px, 100% - 48px);
  }

  .boards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: clamp(20px, 3vw, 44px);
  }

  .board {
    margin: 0;
    padding: clamp(16px, 2vw, 24px);
    border-radius: 20px;
    background: var(--stage-2);
    border: 1px solid var(--stage-rule);
    min-width: 0;
  }

  .board.S {
    background: linear-gradient(180deg, rgb(59 79 198 / 14%), transparent 50%), var(--stage-2);
  }

  .board.I {
    background: linear-gradient(180deg, rgb(163 60 121 / 14%), transparent 50%), var(--stage-2);
  }

  figcaption {
    display: flex;
    gap: 10px;
    align-items: baseline;
    font-size: clamp(1rem, 0.94rem + 0.3vw, 1.18rem);
    line-height: 1.38;
    color: #fff;
    min-height: 2.8em;
  }

  figcaption .form-pill {
    flex: none;
    transform: translateY(-2px);
  }

  .q {
    font-family: var(--serif);
  }

  .tally {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 14px 0 16px;
  }

  .n {
    font-size: clamp(3.6rem, 2.4rem + 3.6vw, 5.6rem);
    min-width: 1.15em;
  }

  .S .n {
    color: var(--tf-2);
  }

  .I .n {
    color: var(--rf-2);
  }

  .of {
    display: flex;
    flex-direction: column;
    font-size: 0.92rem;
    line-height: 1.4;
    color: var(--stage-muted);
  }

  .of b {
    color: #fff;
    font-weight: 600;
    font-size: 1rem;
  }

  .grid {
    display: grid;
    grid-template-columns: auto repeat(8, minmax(0, 1fr));
    gap: 6px;
    align-items: center;
  }

  .rl {
    font-family: var(--mono);
    font-size: 0.68rem;
    letter-spacing: 0.04em;
    color: var(--stage-muted);
    padding-right: 4px;
  }

  .tile {
    display: block;
    position: relative;
    border-radius: 7px;
    outline-offset: 2px;
  }

  .img {
    display: block;
    aspect-ratio: 180 / 130;
    border-radius: 7px;
    background-color: var(--stage-3);
    background-repeat: no-repeat;
    background-size: 1200% 138.46%;
    background-position: calc(var(--k, 11) / 11 * 100%) 100%;
    transition: opacity 0.6s, filter 0.6s, box-shadow 0.5s;
  }

  .tile::after {
    content: '';
    position: absolute;
    inset: -3px;
    border-radius: 9px;
    border: 2px solid transparent;
    transition: border-color 0.5s, transform 0.5s var(--ease);
    transform: scale(0.92);
    pointer-events: none;
  }

  .done .tile.kept::after {
    border-color: var(--kept-2);
    transform: none;
  }

  .done .tile.lost::after {
    border-color: var(--lost-2);
    transform: none;
  }

  .done .tile.never .img {
    opacity: 0.38;
    filter: grayscale(0.7);
  }

  .tile:hover .img {
    opacity: 1;
    filter: none;
  }

  .ctl {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 14px 28px;
    margin-top: 22px;
  }

  .ctl .btn {
    background: transparent;
    color: var(--stage-ink);
    border-color: rgb(255 255 255 / 22%);
  }

  .scrub {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .scrub .lbl {
    color: var(--stage-muted);
  }

  input[type='range'] {
    width: min(260px, 50vw);
    accent-color: #fff;
  }

  .key {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    margin-left: auto;
    font-size: 0.82rem;
    color: var(--stage-muted);
  }

  .key span {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }

  .sw {
    width: 14px;
    height: 11px;
    border-radius: 3px;
    border: 2px solid;
  }

  .sw.kept {
    border-color: var(--kept-2);
  }

  .sw.lost {
    border-color: var(--lost-2);
  }

  .sw.never {
    border-color: transparent;
    background: var(--stage-3);
  }

  .spread {
    margin: clamp(36px, 4vw, 52px) 0 0;
    padding-top: 22px;
    border-top: 1px solid var(--stage-rule);
  }

  .spread figcaption {
    display: block;
    min-height: 0;
    font-family: var(--sans);
    font-size: 0.95rem;
    color: var(--stage-muted);
  }

  .spread figcaption b {
    color: #fff;
    font-weight: 600;
  }

  .spread figcaption .num {
    color: #fff;
  }

  .axis {
    position: relative;
    height: 108px;
    margin: 18px 6px 0;
  }

  .axis::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 22px;
    height: 1px;
    background: var(--stage-rule);
  }

  .tick {
    position: absolute;
    bottom: 22px;
    width: 1px;
    height: 6px;
    background: var(--stage-muted);
  }

  .tick.zero {
    height: 80px;
    background: rgb(255 255 255 / 25%);
  }

  .tick span {
    position: absolute;
    top: calc(100% + 4px);
    left: 50%;
    transform: translateX(-50%);
    font-family: var(--mono);
    font-size: 0.68rem;
    font-style: normal;
    color: var(--stage-muted);
    white-space: nowrap;
  }

  .tick.zero span {
    top: auto;
    bottom: -18px;
  }

  .g {
    position: absolute;
    bottom: calc(22px + 4px + var(--k) * 15px);
    width: 12px;
    height: 12px;
    margin-left: -6px;
    border-radius: 50%;
    background: var(--stage-muted);
  }

  .g.this {
    background: var(--rf-2);
    box-shadow: 0 0 0 4px rgb(240 140 196 / 22%);
  }

  .g.rev {
    background: var(--kept-2);
    box-shadow: 0 0 0 4px rgb(111 211 154 / 22%);
  }

  .call {
    position: absolute;
    top: 0;
    font-size: 0.78rem;
    line-height: 1.3;
    white-space: nowrap;
  }

  .call i {
    font-style: normal;
    opacity: 0.7;
  }

  .keys {
    display: none;
    flex-wrap: wrap;
    gap: 6px 18px;
    margin: 4px 0 0;
    font-size: 0.82rem;
  }

  .key {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .key i {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: currentColor;
  }

  .key.this {
    color: var(--rf-2);
  }

  .key.rev {
    color: var(--kept-2);
  }

  @media (max-width: 760px) {
    .call {
      display: none;
    }

    .keys {
      display: flex;
    }

    .axis {
      height: 96px;
    }

    .tick.zero {
      height: 66px;
    }

    .g {
      width: 10px;
      height: 10px;
      margin-left: -5px;
      bottom: calc(22px + 4px + var(--k) * 12px);
    }
  }

  .call.this {
    color: var(--rf-2);
    transform: translateX(-6px);
  }

  .call.rev {
    color: var(--kept-2);
    transform: translateX(calc(-100% + 6px));
  }

  @media (max-width: 960px) {
    .boards {
      grid-template-columns: minmax(0, 1fr);
    }

    figcaption {
      min-height: 0;
    }
  }

  @media (max-width: 520px) {
    .grid {
      gap: 4px;
    }

    .rl {
      font-size: 0.64rem;
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      padding: 0 2px 0 0;
    }

    .key {
      margin-left: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .img,
    .tile::after {
      transition: none;
    }
  }
</style>
