/**
 * Sizes the two hero frames so both rollouts sit fully inside the first screen.
 *
 * The rollouts sit either under the title block or beside it (`data-split` on the hero wrap). Both layouts are
 * measured: the title moves beside the rollouts when stacked frames would not fit above the fold, or would come out at
 * least 16 px narrower than beside it. In practice that is laptops at 125-150 % display scaling, 1280-1366 px laptops
 * and landscape tablets. The layout is decided here rather than by a height media query so that a collapsing mobile URL
 * bar cannot flip it mid-scroll; callers only re-run this on width changes on touch devices.
 *
 * details.astro inlines this function's source to run it before first paint, and Hero.svelte calls it again after
 * hydration, font loading and resizes. It must therefore stay self-contained: no imports, no outer references.
 *
 * `keep` is for refits after first paint that are not caused by the window changing. The first fit measures with
 * fallback fonts; once the web fonts arrive an instruction can wrap one line shorter or longer. Resizing the frames or
 * switching layouts for that would shift the whole hero, so frames that still fit, and are within 48 px of the ideal
 * width, stay as they are.
 */
export function fitHero(el: HTMLElement | null, keep = false): void {
  const frame = el?.querySelector<HTMLElement>('.frame');
  if (!el || !frame) return;
  const vh = document.documentElement.clientHeight;
  const vw = document.documentElement.clientWidth;
  if (vw <= 600) {
    el.removeAttribute('data-split');
    el.style.removeProperty('--fw');
    return;
  }
  // Beside the title the two panels (frame + 30 px each, 20 px apart) share the row with a 40 px gap and a title column
  // of 31 % of the wrap, kept between 300 and 400 px. Mirrors the [data-split] rules in Hero.svelte. Each estimate below
  // is the widest frame (at most `cap`, at least 300 px) whose bottom stays 44 px above the fold, given the frame top.
  // They are written out rather than shared through a helper: the inlined source must not need any bundler helper.
  if (keep && el.style.getPropertyValue('--fw')) {
    const w = el.clientWidth;
    const cap = el.hasAttribute('data-split') ? Math.floor((w - Math.min(400, Math.max(300, 0.31 * w)) - 40 - 80) / 2) : 600;
    const r = frame.getBoundingClientRect();
    const ideal = Math.round(Math.min(cap, Math.max(300, ((vh - r.top - scrollY - 44) * 536) / 540)));
    if (Math.abs(ideal - r.width) < 2) return;
    if (r.bottom + scrollY <= vh && r.width <= cap + 1 && ideal - r.width < 48) return;
  }
  let best = 0;
  let bestSplit = false;
  let bestOver = 0;
  for (let s = 0; s < (vw >= 1024 ? 2 : 1); s++) {
    el.toggleAttribute('data-split', s === 1);
    const w = el.clientWidth;
    const cap = s === 1 ? Math.floor((w - Math.min(400, Math.max(300, 0.31 * w)) - 40 - 80) / 2) : 600;
    // Wider frames wrap the instructions into fewer lines and so start higher. Iterating down from the widest allowed
    // frame therefore settles on the largest width that fits, not on whichever fixed point is nearest.
    let fw = cap;
    for (let i = 0; i < 6; i++) {
      el.style.setProperty('--fw', `${fw}px`);
      const top = frame.getBoundingClientRect().top + scrollY;
      const next = Math.round(Math.min(cap, Math.max(300, ((vh - top - 44) * 536) / 540)));
      if (next >= fw - 1) break;
      fw = next;
    }
    // How far the frames reach into the 44 px margin above the fold, or past it; 0 when they fit.
    const over = Math.max(0, Math.round(frame.getBoundingClientRect().bottom + scrollY + 44 - vh - 1));
    if (s === 0 || over < bestOver || (over === 0 && fw >= best + 16)) {
      best = fw;
      bestSplit = s === 1;
      bestOver = over;
    }
  }
  el.toggleAttribute('data-split', bestSplit);
  el.style.setProperty('--fw', `${best}px`);
}
