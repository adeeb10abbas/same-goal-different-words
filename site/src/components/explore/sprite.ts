import { epFile } from '../../lib/media';

/** Frames in each sprite.webp strip (180×181 each, one row, evenly spaced over the episode). */
export const FRAMES = 12;

let io: IntersectionObserver | null = null;
const pending = new WeakMap<Element, string>();

function observer() {
  if (io || typeof IntersectionObserver === 'undefined') return io;
  io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const el = en.target as HTMLElement;
        const url = pending.get(el);
        if (url) el.style.backgroundImage = `url("${url}")`;
        pending.delete(el);
        io!.unobserve(el);
      }
    },
    { rootMargin: '320px 0px' },
  );
  return io;
}

/** Attachment for a sprite element: sets its background strip once it comes within a screen of the viewport. */
export function lazySprite(id: string) {
  return (el: HTMLElement) => {
    const url = epFile(id, 'sprite.webp');
    el.style.backgroundImage = '';
    const o = observer();
    if (!o) {
      el.style.backgroundImage = `url("${url}")`;
      return;
    }
    pending.set(el, url);
    o.observe(el);
    return () => {
      o.unobserve(el);
      pending.delete(el);
    };
  };
}

/**
 * Attachment for the element that hosts a thumbnail (a card or cell button): moving a pointer across it shows the
 * matching frame. The frame index is written as `--k` on the closest `[data-scrub]` ancestor, so every thumbnail in a
 * paired row follows the same pointer. A touch drag scrubs instead of opening the card.
 */
export function scrub(node: HTMLElement) {
  let x0 = 0;
  let down = false;
  let dragged = false;
  const scope = () => (node.closest('[data-scrub]') as HTMLElement | null) ?? node;
  const strip = () => (node.querySelector('[data-strip]') as HTMLElement | null) ?? node;

  const set = (e: PointerEvent) => {
    const r = strip().getBoundingClientRect();
    if (!r.width) return;
    const k = Math.min(FRAMES - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * FRAMES)));
    const s = scope();
    s.style.setProperty('--k', String(k));
    s.dataset.scrubbing = '';
  };
  const reset = () => {
    const s = scope();
    s.style.removeProperty('--k');
    delete s.dataset.scrubbing;
  };

  const onmove = (e: PointerEvent) => {
    if (e.pointerType === 'touch' && !down) return;
    if (down && Math.abs(e.clientX - x0) > 8) dragged = true;
    set(e);
  };
  const ondown = (e: PointerEvent) => {
    down = true;
    dragged = false;
    x0 = e.clientX;
    if (e.pointerType === 'touch') set(e);
  };
  const onup = (e: PointerEvent) => {
    down = false;
    if (e.pointerType === 'touch') reset();
  };
  const oncancel = () => {
    down = false;
    reset();
  };
  const onclick = (e: MouseEvent) => {
    if (!dragged) return;
    dragged = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  node.addEventListener('pointermove', onmove);
  node.addEventListener('pointerdown', ondown);
  node.addEventListener('pointerup', onup);
  node.addEventListener('pointercancel', oncancel);
  node.addEventListener('pointerleave', oncancel);
  node.addEventListener('click', onclick, true);
  return () => {
    node.removeEventListener('pointermove', onmove);
    node.removeEventListener('pointerdown', ondown);
    node.removeEventListener('pointerup', onup);
    node.removeEventListener('pointercancel', oncancel);
    node.removeEventListener('pointerleave', oncancel);
    node.removeEventListener('click', onclick, true);
  };
}
