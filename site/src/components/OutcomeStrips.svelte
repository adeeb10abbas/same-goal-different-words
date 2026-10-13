<script module lang="ts">
  import type { FormId as F } from '../lib/study';
  export type StripData = Record<F, { codes: string; t: (number | null)[] }>;
</script>

<script lang="ts">
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { epFile, epId, href, TABLE_CROP, cropBackground } from '../lib/media';
  import { reducedMotion } from '../lib/sync';
  import { MODELS, FORM_NAME, FORM_SHORT, STAGE_LABEL, type FormId, type Goal, type Scene } from '../lib/study';

  let { goal, data, active = null }: { goal: Goal & { scene: Scene }; data: StripData; active?: FormId | null } = $props();

  const ROWS: FormId[] = ['D', 'S', 'I'];
  const STAGE: Record<string, string> = {
    u: 'goal_unstable',
    f: 'lift_no_goal',
    c: 'contact_no_lift',
    m: 'no_mover_contact',
  };
  const cls = (ch: string) => (ch === 'K' ? 'kept' : ch === 'L' ? 'lost' : 'never');
  const placed = (ch: string) => ch === 'K' || ch === 'L';
  const count = (codes: string) => [...codes].filter(placed).length;

  // svelte-ignore state_referenced_locally
  const tweens = Object.fromEntries(ROWS.map((f) => [f, new Tween(count(data[f].codes), { duration: 600, easing: cubicOut })])) as Record<
    FormId,
    Tween<number>
  >;
  $effect(() => {
    const now = reducedMotion() ? { duration: 0 } : undefined;
    for (const f of ROWS) tweens[f].set(count(data[f].codes), now);
  });

  const links = $derived(
    [...data.S.codes].map((a, i) => {
      const tf = placed(a);
      const rf = placed(data.I.codes[i]);
      return tf && !rf ? 'S' : rf && !tf ? 'I' : '';
    }),
  );
  const tfOnly = $derived(links.filter((x) => x === 'S').length);
  const rfOnly = $derived(links.filter((x) => x === 'I').length);

  function outcomeText(ch: string, t: number | null) {
    if (ch === 'K') return t === 0 ? 'True from the start and kept' : `Placed at ${t?.toFixed(1)}\u00a0s, kept to the end`;
    if (ch === 'L') return t === 0 ? 'True from the start, then lost' : `Placed at ${t?.toFixed(1)}\u00a0s, then lost`;
    return STAGE_LABEL[STAGE[ch]] ?? 'Never placed';
  }

  function summary(f: FormId) {
    const codes = data[f].codes;
    const per = MODELS.map((m, mi) => `${m.short} ${count(codes.slice(mi * 8, mi * 8 + 8))} of 8`).join(', ');
    const kept = [...codes].filter((c) => c === 'K').length;
    return `${FORM_NAME[f]}: stable placement in ${count(codes)} of 24 runs (${per}); ${kept} kept it to the end.`;
  }

  // Each row is one magnetic target: pointing anywhere on it previews the nearest dot, so the small dots stay easy to hit.
  // Mouse: hover previews, click opens. Touch: tap or drag along a row previews, a second tap on the same dot opens.
  type Tip = { f: FormId; i: number; id: string; cx: number; top: number; bottom: number };
  let tip = $state<Tip | null>(null);
  let touch = $state(false);
  let armed: string | null = null;
  let root: HTMLDivElement;

  const idOf = (f: FormId, i: number) => epId(MODELS[Math.floor(i / 8)].id, goal.scene.id, (i % 8) + 1, goal.id, f);

  function point(e: PointerEvent, f: FormId) {
    const dots = (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.dot');
    let i = 0;
    let best = Infinity;
    dots.forEach((d, k) => {
      const r = d.getBoundingClientRect();
      const dx = Math.abs(r.left + r.width / 2 - e.clientX);
      if (dx < best) [best, i] = [dx, k];
    });
    if (tip?.f === f && tip.i === i) return;
    const r = dots[i].getBoundingClientRect();
    tip = { f, i, id: idOf(f, i), cx: r.left + r.width / 2, top: r.top, bottom: r.bottom };
  }

  function down(e: PointerEvent, f: FormId) {
    touch = e.pointerType === 'touch';
    if (!touch) return;
    armed = tip?.id ?? null;
    point(e, f);
  }

  function click(e: MouseEvent, f: FormId) {
    if (tip?.f !== f || (touch && armed !== tip.id)) e.preventDefault();
    armed = tip?.id ?? null;
  }

  // Keep the tooltip inside the viewport and clear of the fixed header: above the dot, else below, else clamped.
  let tipEl = $state<HTMLDivElement>();
  let pos = $state<{ x: number; y: number; below: boolean } | null>(null);
  $effect(() => {
    const t = tip;
    const el = tipEl;
    if (!t || !el) return void (pos = null);
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const gap = 12;
    const m = 8;
    const nav = Math.max(0, document.querySelector('[data-nav]')?.getBoundingClientRect().bottom ?? 0);
    const lo = nav + m;
    const hi = innerHeight - h - m;
    const x = Math.max(m, Math.min(innerWidth - w - m, t.cx - w / 2));
    const above = t.top - gap - h;
    if (above >= lo) pos = { x, y: above, below: false };
    else if (t.bottom + gap <= hi) pos = { x, y: t.bottom + gap, below: true };
    else pos = { x, y: Math.max(lo, Math.min(hi, above)), below: false };
  });

  $effect(() => {
    void data;
    tip = null;
  });

  const thumb = (id: string) => cropBackground(epFile(id, 'last.webp'), TABLE_CROP);
</script>

<svelte:window
  onscroll={() => (tip = null)}
  onresize={() => (tip = null)}
  onkeydown={(e) => e.key === 'Escape' && (tip = null)}
  onpointerdown={(e) => {
    const t = e.target as Element;
    if (!root?.contains(t) || !t.closest?.('.hit')) tip = null;
  }}
/>

<div class="strips" bind:this={root}>
<div class="in">
  <div class="row head" aria-hidden="true">
    <span class="lab"></span>
    <div class="groups">
      {#each MODELS as m}
        <span class="mname">{m.short}</span>
      {/each}
    </div>
    <span class="cnt lbl">placed</span>
  </div>

  {#each ROWS as f}
    {#if f === 'I'}
      <div class="row links" aria-hidden="true">
        <span class="lab"></span>
        <div class="groups">
          {#each MODELS as m, mi}
            <div class="g">
              {#each links.slice(mi * 8, mi * 8 + 8) as l}
                <span class="link {l}"></span>
              {/each}
            </div>
          {/each}
        </div>
        <span class="cnt"></span>
      </div>
    {/if}
    <div class="row form {f}" class:on={active === f} class:dim={active && f !== 'D' && active !== f}>
      <span class="lab"><span class="form-pill {f}">{FORM_SHORT[f]}</span></span>
      <a
        class="groups hit"
        href={href(`explore/#${tip?.f === f ? tip.id : idOf(f, 0)}`)}
        tabindex="-1"
        aria-hidden="true"
        draggable="false"
        onpointerdown={(e) => down(e, f)}
        onpointermove={(e) => point(e, f)}
        onpointerleave={(e) => {
          if (e.pointerType !== 'touch') tip = null;
        }}
        onpointercancel={() => (tip = null)}
        onclick={(e) => click(e, f)}
      >
        {#each MODELS as m, mi}
          <div class="g">
            {#each [...data[f].codes.slice(mi * 8, mi * 8 + 8)] as ch, j}
              <span class="dot {cls(ch)}" class:hot={tip?.f === f && tip.i === mi * 8 + j}></span>
            {/each}
          </div>
        {/each}
      </a>
      <span class="cnt num"><b>{Math.round(tweens[f].current)}</b>/24</span>
      <span class="sr-only">{summary(f)}</span>
    </div>
  {/each}

  <div class="foot">
    <p class="pairs">
      {#if goal.initiallyTrue}
        Already true at the start, so every run counts as placed at 0&nbsp;s.
      {:else}
        Same model, same start: <b class="tfo">{tfOnly}</b> placed under TF only, <b class="rfo">{rfOnly}</b> under RF only.
      {/if}
    </p>
    <ul class="legend" aria-label="Legend">
      <li><i class="dot kept"></i>Placed, kept</li>
      <li><i class="dot lost"></i>Placed, then lost</li>
      <li><i class="dot never"></i>Never placed</li>
      <li><i class="lk S"></i>TF only</li>
      <li><i class="lk I"></i>RF only</li>
    </ul>
  </div>
</div>
</div>

{#if tip}
  {@const ch = data[tip.f].codes[tip.i]}
  <div
    class="tooltip strip-tip"
    class:below={pos?.below}
    bind:this={tipEl}
    style:left="{pos?.x ?? 0}px"
    style:top="{pos?.y ?? 0}px"
    style:visibility={pos ? null : 'hidden'}
    data-qa-overlay
    aria-hidden="true"
  >
    <span class="thumb" style={thumb(tip.id)}></span>
    <span class="meta"
      ><b>{MODELS[Math.floor(tip.i / 8)].short}</b> · start {(tip.i % 8) + 1} ·
      <span class="form-pill {tip.f}">{FORM_SHORT[tip.f]}</span></span
    >
    <span class="out {cls(ch)}">{outcomeText(ch, data[tip.f].t[tip.i])}</span>
    <span class="hint">Final frame, robot at the top · {touch ? 'tap again' : 'click'} to open the rollout</span>
  </div>
{/if}

<style>
  .strips {
    container-type: inline-size;
  }

  /* dot size follows the container: fixed columns plus 24 dots, 21 small gaps and 2 group gaps */
  .in {
    --lab: 3rem;
    --cnt: 3.6rem;
    --cg: 12px;
    --fixed: calc(var(--lab) + var(--cnt) + 2 * var(--cg) + 6px);
    --d: clamp(6px, calc((100cqi - var(--fixed)) / 35.4), 14px);
    --gap: calc(var(--d) * 0.42);
    --ggap: calc(var(--d) * 1.25);
    display: grid;
    font-size: 0.82rem;
  }

  /* Narrow: each strip takes the full width, with its pill and count on a line of their own. TF's line sits above its
     dots and RF's below, so the two strips stay adjacent and the pair links still join them. */
  @container (max-width: 460px) {
    .in {
      --d: clamp(5px, calc((100cqi - 4px) / 35.4), 14px);
      grid-template-columns: minmax(0, 1fr);
    }

    .row {
      grid-template-columns: 1fr auto;
      grid-template-areas: 'lab cnt' 'dots dots';
      row-gap: 4px;
    }

    .row.form.I {
      grid-template-areas: 'dots dots' 'lab cnt';
    }

    .row.head,
    .row.links {
      grid-template-columns: auto;
      grid-template-areas: 'dots';
    }

    .row.head > :not(.groups),
    .row.links > :not(.groups) {
      display: none;
    }

    .lab {
      grid-area: lab;
    }

    .groups {
      grid-area: dots;
    }

    .cnt {
      grid-area: cnt;
    }

    .cnt.num::after {
      content: ' placed';
    }
  }

  .row {
    display: grid;
    grid-template-columns: var(--lab) auto var(--cnt);
    align-items: center;
    column-gap: var(--cg);
    justify-content: start;
  }

  .groups {
    display: grid;
    grid-template-columns: repeat(3, auto);
    column-gap: var(--ggap);
  }

  .g {
    display: grid;
    grid-template-columns: repeat(8, var(--d));
    column-gap: var(--gap);
  }

  .head {
    margin-bottom: 6px;
  }

  .mname {
    font-family: var(--mono);
    font-size: 0.66rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    border-bottom: 1px solid var(--rule-2);
    padding-bottom: 3px;
    width: calc(8 * var(--d) + 7 * var(--gap));
  }

  .form {
    padding: 5px 0;
    border-radius: 8px;
    transition: opacity 0.35s, background 0.35s;
    position: relative;
    isolation: isolate;
  }

  .form::before {
    content: '';
    position: absolute;
    inset: 0 -8px;
    border-radius: 9px;
    background: transparent;
    transition: background 0.35s;
    z-index: -1;
  }

  .form.on.S::before {
    background: color-mix(in srgb, var(--tf) 8%, transparent);
  }

  .form.on.I::before {
    background: color-mix(in srgb, var(--rf) 8%, transparent);
  }

  /* Dim the data, not the labels, so the pill and count stay readable. */
  .form.dim .groups {
    opacity: 0.45;
  }

  .form.dim .cnt b {
    color: var(--muted);
  }

  .form.D {
    margin-bottom: 8px;
  }

  .lab {
    display: flex;
  }

  /* The row target is at least 24 px tall (WCAG 2.5.8); the extra height is padding cancelled by negative margins, so the
     strip keeps its visual pitch. */
  .hit {
    --hp: max(0px, calc((24px - var(--d)) / 2));
    padding-block: var(--hp);
    margin-block: calc(-1 * var(--hp));
    color: inherit;
    text-decoration: none;
    cursor: pointer;
    touch-action: pan-y;
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
    user-select: none;
    transition: opacity 0.35s;
  }

  .dot {
    display: block;
    width: var(--d);
    height: var(--d);
    border-radius: 50%;
    box-sizing: border-box;
    transition: background-color 0.35s, border-color 0.35s, transform 0.15s, box-shadow 0.15s;
  }

  .dot.hot {
    transform: scale(1.35);
    box-shadow: 0 0 0 1.5px var(--paper, #fff), 0 0 0 3px var(--ink);
  }

  .dot.kept {
    background: var(--kept);
  }

  .dot.lost {
    background: var(--lost);
  }

  .dot.never {
    border: 1.5px solid var(--rule-2);
    background: transparent;
  }

  .links {
    height: 14px;
    margin: -3px 0;
    pointer-events: none;
  }

  .link {
    justify-self: center;
    width: 2px;
    height: 14px;
    border-radius: 2px;
    transform: scaleY(0);
    transition: transform 0.4s var(--ease), background-color 0.3s;
  }

  .link.S {
    background: var(--tf);
    transform: none;
  }

  .link.I {
    background: var(--rf);
    transform: none;
  }

  .cnt {
    text-align: right;
    color: var(--muted);
    white-space: nowrap;
  }

  .cnt b {
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--ink);
  }

  .form.S .cnt b {
    color: var(--tf);
  }

  .form.I .cnt b {
    color: var(--rf);
  }

  .foot {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 8px 18px;
    margin-top: 12px;
  }

  .pairs {
    margin: 0;
    font-size: 0.86rem;
    color: var(--ink-2);
  }

  .tfo {
    color: var(--tf);
  }

  .rfo {
    color: var(--rf);
  }

  .legend {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    font-size: 0.74rem;
    color: var(--muted);
  }

  .legend li {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .legend .dot {
    --d: 9px;
  }

  .lk {
    width: 2px;
    height: 11px;
    border-radius: 2px;
  }

  .lk.S {
    background: var(--tf);
  }

  .lk.I {
    background: var(--rf);
  }

  .strip-tip {
    display: grid;
    gap: 5px;
    width: 236px;
    padding: 7px 7px 9px;
    transform: none;
  }

  .thumb {
    display: block;
    width: 100%;
    aspect-ratio: 536 / 390;
    border-radius: 6px;
    background-color: #000;
    background-repeat: no-repeat;
  }

  .meta,
  .out,
  .hint {
    padding-inline: 4px;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .meta .form-pill {
    font-size: 0.66rem;
    padding: 1px 6px;
  }

  .out.kept {
    color: var(--kept-2);
  }

  .out.lost {
    color: var(--lost-2);
  }

  .out.never {
    color: var(--stage-muted);
  }

  .hint {
    font-size: 0.7rem;
    color: var(--stage-muted);
  }

  @media (prefers-reduced-motion: reduce) {
    .link,
    .dot,
    .hit,
    .form {
      transition: none;
    }
  }
</style>
