<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import type { Attachment } from 'svelte/attachments';

  /**
   * A window-scrolled, virtualized ARIA grid. Rows share one pitch: the tallest natural content height among the rendered
   * rows and a hidden worst-case probe row, so every row and card has the same height and nothing overlaps. Focus is
   * roving: the grid is one tab stop; arrows, Home/End (Ctrl for the corners) and PageUp/PageDown move between cells.
   * Focusable cells carry `data-c`; the row snippet sets `tabindex={c === ac ? 0 : -1}`.
   */
  let {
    count,
    colsIn,
    idOf,
    posOf,
    keyOf,
    label,
    colcount,
    gap = 12,
    est = 240,
    defaultCol = 0,
    row,
    probe,
  }: {
    count: number;
    colsIn: (r: number) => number;
    idOf: (r: number, c: number) => string;
    posOf: (id: string) => { r: number; c: number } | null;
    keyOf: (r: number) => string;
    label: string;
    colcount: number;
    gap?: number;
    /** Row height used until the first measurement. */
    est?: number;
    defaultCol?: number;
    row: Snippet<[r: number, ac: number, measure: Attachment<HTMLElement>]>;
    probe: Snippet<[measure: Attachment<HTMLElement>]>;
  } = $props();

  let el: HTMLDivElement;
  let pitch = $state(0);
  const H = $derived(pitch || est);
  const P = $derived(H + gap);

  // ---------------------------------------------------------------------------------------------- measurement
  const sizes = new Map<Element, number>();
  let ro: ResizeObserver | undefined;
  let fit = 0;
  const refit = () => {
    fit = 0;
    const m = Math.ceil(Math.max(0, ...sizes.values()));
    if (m && m !== pitch) pitch = m;
  };
  // Deferred to the next frame so that re-rendering rows never happens inside a ResizeObserver delivery (WebKit reports a loop error).
  const queueFit = () => {
    fit ||= requestAnimationFrame(refit);
  };
  const measure: Attachment<HTMLElement> = (node) => {
    ro ??= new ResizeObserver((entries) => {
      for (const e of entries) sizes.set(e.target, e.borderBoxSize?.[0]?.blockSize ?? (e.target as HTMLElement).offsetHeight);
      queueFit();
    });
    ro.observe(node);
    return () => {
      ro?.unobserve(node);
      sizes.delete(node);
      queueFit();
    };
  };
  $effect(() => () => {
    ro?.disconnect();
    cancelAnimationFrame(fit);
  });

  // ---------------------------------------------------------------------------------------------- window
  let y = $state(0);
  let vh = $state(900);
  let top = $state(0);

  $effect(() => {
    let raf = 0;
    const upd = () => {
      raf = 0;
      y = scrollY;
      vh = innerHeight;
      top = el.getBoundingClientRect().top + scrollY;
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(upd);
    };
    upd();
    addEventListener('scroll', on, { passive: true });
    addEventListener('resize', on);
    const watch = new ResizeObserver(on);
    if (el.parentElement) watch.observe(el.parentElement);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('scroll', on);
      removeEventListener('resize', on);
      watch.disconnect();
    };
  });

  let activeId = $state<string | null>(null);
  const act = $derived.by(() => {
    if (!count) return null;
    const p = activeId ? posOf(activeId) : null;
    if (p && p.r < count && p.c < colsIn(p.r)) return p;
    return { r: 0, c: Math.min(defaultCol, colsIn(0) - 1) };
  });

  const over = $derived(Math.max(480, vh * 0.8));
  const first = $derived(Math.max(0, Math.floor((y - top - over) / P)));
  const last = $derived(Math.min(count - 1, Math.floor((y + vh - top + over) / P)));
  const shown = $derived.by(() => {
    const a: number[] = [];
    for (let r = first; r <= last; r++) a.push(r);
    if (act && (act.r < first || act.r > last)) a.push(act.r);
    return a;
  });

  // ---------------------------------------------------------------------------------------------- focus
  const cellAt = (r: number, c: number) => el?.querySelector<HTMLElement>(`[role='row'][data-r='${r}'] [data-c='${c}']`) ?? null;

  async function go(r: number, c: number) {
    if (!count) return;
    r = Math.max(0, Math.min(count - 1, r));
    c = Math.max(0, Math.min(colsIn(r) - 1, c));
    activeId = idOf(r, c);
    await tick();
    const node = cellAt(r, c);
    if (!node) return;
    node.focus({ preventScroll: true });
    node.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }

  function here(t: EventTarget | null) {
    const n = t as HTMLElement | null;
    const c = n?.closest<HTMLElement>('[data-c]');
    const rr = n?.closest<HTMLElement>('[data-r]');
    return c && rr ? { r: +rr.dataset.r!, c: +c.dataset.c! } : act;
  }

  function onkeydown(e: KeyboardEvent) {
    const p = here(e.target);
    if (!p || e.altKey || e.metaKey || e.shiftKey) return;
    const { r, c } = p;
    const page = Math.max(1, Math.floor(vh / P) - 1);
    let to: [number, number] | null = null;
    switch (e.key) {
      case 'ArrowRight':
        to = [r, c + 1];
        break;
      case 'ArrowLeft':
        to = [r, c - 1];
        break;
      case 'ArrowDown':
        to = [r + 1, c];
        break;
      case 'ArrowUp':
        to = [r - 1, c];
        break;
      case 'Home':
        to = e.ctrlKey ? [0, 0] : [r, 0];
        break;
      case 'End':
        to = e.ctrlKey ? [count - 1, colsIn(count - 1) - 1] : [r, colsIn(r) - 1];
        break;
      case 'PageDown':
        to = [r + page, c];
        break;
      case 'PageUp':
        to = [r - page, c];
        break;
    }
    if (!to || (e.ctrlKey && e.key !== 'Home' && e.key !== 'End')) return;
    e.preventDefault();
    go(to[0], to[1]);
  }

  function onfocusin(e: FocusEvent) {
    const p = here(e.target);
    if (p && p !== act) activeId = idOf(p.r, p.c);
  }

  /** Make `id` the active cell and focus it, scrolling it to the middle of the window when it is off screen. */
  export async function focusId(id: string) {
    const p = posOf(id);
    if (!p) return false;
    activeId = id;
    const yr = top + p.r * P;
    if (yr < scrollY + 80 || yr + H > scrollY + innerHeight - 16)
      window.scrollTo({ top: Math.max(0, yr - (innerHeight - H) / 2), behavior: 'instant' });
    await tick();
    const node = cellAt(p.r, p.c);
    node?.focus({ preventScroll: true });
    return !!node;
  }

  /** Top of the row holding `id`, in document coordinates. */
  export const rowTop = (id: string) => {
    const p = posOf(id);
    return p ? top + p.r * P : null;
  };
</script>

<div class="vl" bind:this={el} style:height="{count ? count * P - gap : 0}px">
  <div class="probe" aria-hidden="true" inert data-qa-ignore>
    {@render probe(measure)}
  </div>
  {#if count}
    <div class="grid" role="grid" aria-label={label} aria-rowcount={count} aria-colcount={colcount} {onkeydown} {onfocusin}>
      {#each shown as r (keyOf(r))}
        <div class="vrow" role="row" aria-rowindex={r + 1} data-r={r} style:height="{H}px" style:transform="translateY({r * P}px)">
          {@render row(r, act && act.r === r ? act.c : -1, measure)}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .vl {
    position: relative;
  }

  /* Zero height and clipped, so a tall probe never adds scroll space below a short list; its children still lay out
     at their natural size for the measurement. */
  .probe {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 0;
    overflow: hidden;
    visibility: hidden;
    pointer-events: none;
  }

  .grid {
    position: absolute;
    inset: 0;
    outline: none;
  }

  .vrow {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
  }

  :global([data-anim]) .vrow {
    transition: transform 0.45s var(--ease);
  }

  @media (prefers-reduced-motion: reduce) {
    :global([data-anim]) .vrow {
      transition: none;
    }
  }
</style>
