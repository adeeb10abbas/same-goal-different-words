/*
 * In-page layout checks for qa/ui-check.mjs (injected with page.addScriptTag; exposes window.__qa).
 * Everything returns plain JSON. Rects are document coordinates ({x, y, w, h}) unless noted.
 *
 * Opt-outs in markup:
 *   data-qa-ignore           skip the element and its subtree entirely
 *   data-qa-overlay          intentional overlay (badge on a video, marker on a track, tooltip): its text and boxes are
 *                            only compared with other content of the same overlay
 *   data-qa-scroll           intentional scroll container; ="x" or ="y" declares its only scroll axis
 *   data-qa-fold="<query>"   element must end above the fold at scroll 0 while the media query matches
 *
 * Opt-ins:
 *   data-qa-shape            SVG shape whose fill no SVG text in the same drawing may cover (objects, markers)
 *   data-qa-line             SVG path whose stroke no SVG text in the same drawing may cross (arrows, ticks)
 */
(() => {
  if (window.__qa) return;

  const SVG = 'http://www.w3.org/2000/svg';
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TITLE', 'TEXTAREA', 'OPTION']);
  const SVG_UNRENDERED = new Set(['defs', 'clipPath', 'mask', 'symbol', 'marker', 'pattern', 'linearGradient', 'radialGradient', 'filter', 'title', 'desc', 'metadata']);
  const TARGETS = [
    'a[href]',
    'button',
    'input:not([type=hidden])',
    'select',
    'textarea',
    'summary',
    '[role=button]',
    '[role=slider]',
    '[role=tab]',
    '[role=checkbox]',
    '[role=switch]',
    '[role=radio]',
    '[role=link]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  const BIG = 1e7;

  // ---------------------------------------------------------------- caches, reset at the start of every pass
  let S = new Map();
  let I = new Map();
  let C = null;
  const fresh = () => {
    S = new Map();
    I = new Map();
    C = null;
  };
  const cs = (el) => {
    let s = S.get(el);
    if (!s) S.set(el, (s = getComputedStyle(el)));
    return s;
  };

  // ---------------------------------------------------------------- geometry
  const doc = (r) => ({ x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height });
  const inter = (a, b) => {
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const w = Math.min(a.x + a.w, b.x + b.w) - x;
    const h = Math.min(a.y + a.h, b.y + b.h) - y;
    return w > 0 && h > 0 ? { x, y, w, h } : null;
  };
  const area = (r) => (r ? r.w * r.h : 0);
  const sum = (xs) => xs.reduce((s, v) => s + v, 0);
  const clipTo = (r, clips) => {
    let o = r;
    for (const c of clips) if (o) o = inter(o, c.r);
    return o;
  };
  const union = (rs) => {
    const x = Math.min(...rs.map((r) => r.x));
    const y = Math.min(...rs.map((r) => r.y));
    return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
  };
  const pageBox = () => ({ x: 0, y: 0, w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight });
  const rnd = (r) => {
    const c = r && inter(r, pageBox());
    return c && { x: Math.round(c.x), y: Math.round(c.y), w: Math.max(1, Math.round(c.w)), h: Math.max(1, Math.round(c.h)) };
  };
  const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  const distToRect = (p, r) => Math.hypot(Math.max(r.x - p.x, 0, p.x - (r.x + r.w)), Math.max(r.y - p.y, 0, p.y - (r.y + r.h)));

  // ---------------------------------------------------------------- styles
  function alpha(c) {
    if (!c || c === 'transparent' || c === 'none') return 0;
    const m = /\(([^)]*)\)/.exec(c);
    if (!m) return 1;
    let a = null;
    const slash = m[1].split('/');
    if (slash.length > 1) a = slash[1].trim();
    else {
      const p = m[1].split(',');
      if (p.length === 4) a = p[3].trim();
    }
    if (a == null) return 1;
    return a.endsWith('%') ? parseFloat(a) / 100 : parseFloat(a);
  }

  /** Paints a visible box: a background or a border on all four sides. */
  function boxed(s) {
    if (alpha(s.backgroundColor) >= 0.08) return true;
    return ['Top', 'Right', 'Bottom', 'Left'].every(
      (k) => parseFloat(s[`border${k}Width`]) >= 1 && !/none|hidden/.test(s[`border${k}Style`]) && alpha(s[`border${k}Color`]) >= 0.15,
    );
  }

  const zeroClip = (s) => {
    if (/inset\(\s*50%/.test(s.clipPath)) return true;
    if (!s.clip || s.clip === 'auto' || (s.position !== 'absolute' && s.position !== 'fixed')) return false;
    const n = (s.clip.match(/-?[\d.]+/g) || []).map(Number);
    return n.length === 4 && n[1] - n[3] <= 1 && n[2] - n[0] <= 1;
  };

  const makesContainingBlock = (t) =>
    t.transform !== 'none' ||
    t.perspective !== 'none' ||
    t.filter !== 'none' ||
    (t.backdropFilter && t.backdropFilter !== 'none') ||
    (t.webkitBackdropFilter && t.webkitBackdropFilter !== 'none') ||
    /paint|layout|strict|content/.test(t.contain) ||
    /size/.test(t.containerType || '') ||
    /transform|perspective|filter/.test(t.willChange);

  /** Containing block of an absolutely or fixed positioned element; null = viewport; undefined = in flow. */
  function containingBlock(el, s) {
    if (s.position !== 'absolute' && s.position !== 'fixed') return undefined;
    for (let e = el.parentElement; e; e = e.parentElement) {
      const t = cs(e);
      if (makesContainingBlock(t)) return e;
      if (s.position === 'absolute' && t.position !== 'static') return e;
    }
    return null;
  }

  const ROOT = { hidden: false, skipKids: false, op: 1, self: [], kids: [], layer: null, ignore: false, overlay: null };

  /**
   * Content the browser lays out but never paints, so getBoundingClientRect returns boxes for it wherever it would
   * sit (e.g. over the next section): everything in a closed <details> but its summary, and anything else skipped by
   * content-visibility: hidden (hidden=until-found). checkVisibility() covers the general case; elements without a
   * box of their own (display: contents) inherit from their parent instead.
   */
  function skipped(el, parent, p, s) {
    if (p.skipKids) return true;
    if (parent && parent.tagName === 'DETAILS' && !parent.open && el !== parent.querySelector(':scope > summary')) return true;
    return s.display !== 'contents' && typeof el.checkVisibility === 'function' && !el.checkVisibility();
  }

  /**
   * Visibility of an element. self = clips that apply to the element itself; kids = clips for its content
   * (self plus its own overflow clip). Clips follow containing blocks, so positioned content escapes the
   * overflow of ancestors between it and its containing block, as in CSS.
   */
  function info(el) {
    if (!el || el.nodeType !== 1) return ROOT;
    let n = I.get(el);
    if (n) return n;
    const parent = el.parentElement || (el.parentNode && el.parentNode.host) || null;
    const p = parent ? info(parent) : ROOT;
    const s = cs(el);
    const svg = el.namespaceURI === SVG;

    let self = p.kids;
    const cb = containingBlock(el, s);
    if (cb !== undefined) self = self.filter((c) => cb && (c.el === cb || c.el.contains(cb)));
    if (s.clipPath && s.clipPath !== 'none' && !zeroClip(s)) self = [...self, { r: doc(el.getBoundingClientRect()), hard: true, el }];

    let kids = self;
    const root = el === document.documentElement || el === document.body;
    const clipper = !root && (!svg || el.tagName === 'svg' || el.tagName === 'foreignObject');
    const cx = s.overflowX !== 'visible';
    const cy = s.overflowY !== 'visible';
    const paint = /paint|strict|content/.test(s.contain);
    if (clipper && (cx || cy || paint)) {
      const r = el.getBoundingClientRect();
      const bl = parseFloat(s.borderLeftWidth) || 0;
      const br = parseFloat(s.borderRightWidth) || 0;
      const bt = parseFloat(s.borderTopWidth) || 0;
      const bb = parseFloat(s.borderBottomWidth) || 0;
      const X = cx || paint;
      const Y = cy || paint;
      const rect = {
        x: X ? r.left + scrollX + bl : -BIG,
        y: Y ? r.top + scrollY + bt : -BIG,
        w: X ? r.width - bl - br : 2 * BIG,
        h: Y ? r.height - bt - bb : 2 * BIG,
      };
      const hardAxis = (o) => o === 'hidden' || o === 'clip';
      const hard = paint || ((!cx || hardAxis(s.overflowX)) && (!cy || hardAxis(s.overflowY)));
      kids = [...self, { r: rect, hard, el }];
    }

    n = {
      hidden: p.hidden || s.display === 'none' || zeroClip(s) || (svg && SVG_UNRENDERED.has(el.tagName)) || skipped(el, parent, p, s),
      skipKids: s.contentVisibility === 'hidden',
      op: p.op * parseFloat(s.opacity),
      self,
      kids,
      layer: p.layer || (s.position === 'fixed' ? el : null),
      ignore: p.ignore || el.hasAttribute('data-qa-ignore'),
      overlay: p.overlay || (el.hasAttribute('data-qa-overlay') ? el : null),
    };
    I.set(el, n);
    return n;
  }

  /** Parts of r outside c (at most four rects). */
  function minus(r, c) {
    const x = inter(r, c);
    if (!x) return [r];
    return [
      { x: r.x, y: r.y, w: r.w, h: x.y - r.y },
      { x: r.x, y: x.y + x.h, w: r.w, h: r.y + r.h - x.y - x.h },
      { x: r.x, y: x.y, w: x.x - r.x, h: x.h },
      { x: x.x + x.w, y: x.y, w: r.x + r.w - x.x - x.w, h: x.h },
    ].filter((p) => p.w >= 0.5 && p.h >= 0.5);
  }

  /** Nearest ancestor that scrolls its content, or null for the page. */
  function scrollerOf(el) {
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const s = cs(e);
      if (/auto|scroll/.test(s.overflowX) || /auto|scroll/.test(s.overflowY)) return e;
    }
    return null;
  }

  const stuck = (el, stop) => {
    for (let e = el; e && e !== stop; e = e.parentElement) if (cs(e).position === 'sticky') return true;
    return false;
  };

  /**
   * Opaque sticky boxes inside a scroll container (a frozen first table column) hide what scrolls beneath them, so
   * their rects are cut out of all other non-sticky content of that scroller.
   */
  function covers() {
    if (C) return C;
    C = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (el.namespaceURI === SVG) continue;
      const s = cs(el);
      if (s.position !== 'sticky' || alpha(s.backgroundColor) < 0.9 || s.visibility !== 'visible') continue;
      const inf = info(el);
      if (inf.hidden || inf.ignore || inf.op < 0.9) continue;
      const sc = scrollerOf(el);
      const r = sc && clipTo(doc(el.getBoundingClientRect()), inf.self);
      if (r) C.push({ el, sc, r });
    }
    return C;
  }

  function uncovered(el, rs) {
    let out = rs;
    for (const c of covers()) {
      if (!out.length) break;
      if (c.el.contains(el) || el.contains(c.el) || !c.sc.contains(el) || stuck(el, c.sc)) continue;
      out = out.flatMap((r) => minus(r, c.r));
    }
    return out;
  }

  // ---------------------------------------------------------------- naming
  const NOISE = /^(svelte-|astro-)/;
  function sel(el) {
    if (!el || el.nodeType !== 1) return '';
    const parts = [];
    for (let e = el; e && e.nodeType === 1 && parts.length < 4; e = e.parentElement) {
      if (e === document.body || e === document.documentElement) break;
      let p = e.tagName.toLowerCase();
      if (e.id) {
        parts.unshift(`${p}#${e.id}`);
        break;
      }
      const cls = [...e.classList].filter((c) => !NOISE.test(c)).slice(0, 2);
      if (cls.length) p += '.' + cls.join('.');
      parts.unshift(p);
    }
    return parts.join(' > ');
  }
  const snip = (t) => (t || '').replace(/\s+/g, ' ').trim().slice(0, 60);

  // ---------------------------------------------------------------- text inventory
  /** Core ink band of a text box: cap height to baseline, ignoring descenders and line-height slack. */
  function band(r, it) {
    if (it.rot && !it.vert) return { x: r.x + 0.1 * r.w, y: r.y + 0.1 * r.h, w: 0.8 * r.w, h: 0.8 * r.h };
    if (it.vert) {
      const w = Math.min(r.w, 0.74 * it.fs);
      return { x: r.x + (r.w - w) / 2, y: r.y + 0.5, w, h: Math.max(0, r.h - 1) };
    }
    const h = Math.min(r.h, 0.74 * it.fs);
    return { x: r.x + 0.5, y: r.y + (r.h - h) / 2, w: Math.max(0, r.w - 1), h };
  }

  function prep(it) {
    it.bands = it.rects.map((r) => band(r, it));
    it.vis = uncovered(it.el, it.bands.map((b) => clipTo(b, it.clips)).filter(Boolean)).filter((b) => b.w >= 1 && b.h >= 1);
    it.hard = it.clips.filter((c) => c.hard);
    it.gone = sum(it.vis.map(area)) < 3;
    it.layer = it.inf.layer;
    it.overlay = it.inf.overlay;
    return it;
  }

  function textItems() {
    const items = [];
    const range = document.createRange();
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const el = n.parentElement;
      if (!el || SKIP.has(el.tagName) || el.namespaceURI === SVG || !/\S/.test(n.data)) continue;
      const inf = info(el);
      // Text directly inside a skipped container (a closed <details>, content-visibility: hidden) is not painted.
      if (inf.hidden || inf.skipKids || (el.tagName === 'DETAILS' && !el.open)) continue;
      if (inf.ignore || inf.op < 0.05 || cs(el).visibility !== 'visible') continue;
      range.selectNodeContents(n);
      const rects = [...range.getClientRects()].filter((r) => r.width >= 1 && r.height >= 1).map(doc);
      if (!rects.length) continue;
      let sb = el;
      while (sb.parentElement && cs(sb).display === 'inline') sb = sb.parentElement;
      // offsetWidth is rounded to whole pixels, so only a difference above 1 px is a real scale transform.
      const bw = sb.getBoundingClientRect().width;
      const k = sb.offsetWidth && Math.abs(bw - sb.offsetWidth) > 1 ? Math.min(4, Math.max(0.25, bw / sb.offsetWidth)) : 1;
      items.push(prep({ el, node: n, svg: false, text: snip(n.data), fs: parseFloat(cs(el).fontSize) * k, rects, inf, clips: inf.kids }));
    }
    for (const t of document.querySelectorAll('svg text')) {
      if (!/\S/.test(t.textContent)) continue;
      const inf = info(t);
      if (inf.hidden || inf.ignore || inf.op < 0.05 || cs(t).visibility !== 'visible') continue;
      const m = t.getScreenCTM();
      if (!m) continue;
      const k = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
      const rot = Math.abs(m.b) > 0.02 * k || Math.abs(m.c) > 0.02 * k;
      const vert = rot && Math.abs(m.a) < 0.1 * k;
      const lines = [...t.querySelectorAll('tspan')].filter((x) => x.hasAttribute('x') || x.hasAttribute('y') || x.hasAttribute('dy'));
      const rects = (lines.length ? lines : [t]).map((x) => doc(x.getBoundingClientRect())).filter((r) => r.w >= 1 && r.h >= 1);
      if (!rects.length) continue;
      items.push(prep({ el: t, svg: true, text: snip(t.textContent), fs: parseFloat(cs(t).fontSize) * k, rects, inf, clips: inf.self, rot, vert }));
    }
    return items;
  }

  const issue = (type, sev, it, extra = {}) => ({
    type,
    sev,
    sel: sel(it.el),
    text: it.text || '',
    fixed: !!it.layer,
    ...extra,
    rects: (extra.rects || it.vis || []).map(rnd).filter(Boolean),
    hit: extra.hit ? rnd(extra.hit) : undefined,
  });

  // ---------------------------------------------------------------- text checks
  function overlaps(items) {
    const segs = [];
    items.forEach((it, i) => {
      if (!it.gone) for (const b of it.vis) segs.push({ i, b });
    });
    segs.sort((p, q) => p.b.x - q.b.x);
    const active = [];
    const best = new Map();
    for (const s of segs) {
      let k = 0;
      for (const a of active) if (a.b.x + a.b.w > s.b.x) active[k++] = a;
      active.length = k;
      for (const a of active) {
        if (a.i === s.i) continue;
        const A = items[a.i];
        const B = items[s.i];
        if (A.layer !== B.layer || A.overlay !== B.overlay) continue;
        const x = inter(a.b, s.b);
        if (!x || x.w < 1.5 || x.h < 1.5 || area(x) < 4) continue;
        const key = `${Math.min(a.i, s.i)}:${Math.max(a.i, s.i)}`;
        const prev = best.get(key);
        if (!prev || area(prev.x) < area(x)) best.set(key, { i: a.i, j: s.i, x, a: a.b, b: s.b });
      }
      active.push(s);
    }
    return [...best.values()].map(({ i, j, x, a, b }) =>
      issue('text-overlap', 'error', items[i], {
        sel2: sel(items[j].el),
        text2: items[j].text,
        msg: `ink overlaps by ${Math.round(x.w)}×${Math.round(x.h)} px`,
        rects: [a, b],
        hit: x,
      }),
    );
  }

  function ellipsisBetween(el, stop) {
    for (let e = el; e; e = e.parentElement) {
      if (cs(e).textOverflow === 'ellipsis') return true;
      if (e === stop) break;
    }
    return false;
  }

  function clipped(items) {
    const out = [];
    for (const it of items) {
      if (it.gone || !it.hard.length) continue;
      // Text scrolled out of a scroll container is still reachable, so hard clips outside the innermost scroller
      // are measured only against the part of the text inside that scroller's viewport (catching a scroller that
      // is itself cut off), while hard clips nested inside it are measured against the whole text.
      const s = it.clips.findLastIndex((c) => !c.hard);
      const passes = [{ bands: it.bands, hard: it.clips.slice(s + 1).filter((c) => c.hard) }];
      if (s >= 0)
        passes.push({
          bands: it.bands.map((b) => inter(b, it.clips[s].r)).filter(Boolean),
          hard: it.clips.slice(0, s).filter((c) => c.hard),
        });
      for (const { bands, hard } of passes) {
        if (!hard.length || !bands.length) continue;
        const full = sum(bands.map(area));
        const vis = sum(bands.map((b) => area(clipTo(b, hard))));
        if (full - vis < 4 || vis > 0.97 * full) continue;
        let worst = hard[0];
        let loss = -1;
        for (const c of hard) {
          const l = full - sum(bands.map((b) => area(inter(b, c.r))));
          if (l > loss) [loss, worst] = [l, c];
        }
        const ell = ellipsisBetween(it.el, worst.el);
        out.push(
          issue(ell ? 'text-ellipsis' : 'text-clipped', ell ? 'warn' : 'error', it, {
            sel2: sel(worst.el),
            msg: `${Math.round(100 - (100 * vis) / full)}% of the text is cut off by ${sel(worst.el)}`,
            rects: [...bands, worst.r],
          }),
        );
        break;
      }
    }
    return out;
  }

  function boxOf(el) {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const s = cs(e);
      if (s.display !== 'inline' && s.display !== 'contents' && boxed(s)) return e;
      if (s.position === 'absolute' || s.position === 'fixed') return null;
    }
    return null;
  }

  function escapes(items) {
    const out = [];
    for (const it of items) {
      if (it.gone || it.svg) continue;
      const box = boxOf(it.el);
      if (!box) continue;
      const B = doc(box.getBoundingClientRect());
      let worst = 0;
      for (const b of it.vis) worst = Math.max(worst, B.x - b.x, b.x + b.w - (B.x + B.w), B.y - b.y, b.y + b.h - (B.y + B.h));
      if (worst > 1.5)
        out.push(issue('text-escapes-box', 'error', it, { sel2: sel(box), msg: `ink extends ${Math.round(worst)} px outside its box`, rects: [...it.vis, B] }));
    }
    return out;
  }

  function offscreen(items, vw) {
    const out = [];
    for (const it of items) {
      if (it.gone) continue;
      const L = Math.min(...it.vis.map((b) => b.x));
      const R = Math.max(...it.vis.map((b) => b.x + b.w));
      if (R < -200 || L > vw + 200) continue; // deliberately parked off-screen (skip link)
      if (L < -1) out.push(issue('text-offscreen', 'error', it, { msg: `starts ${Math.round(-L)} px left of the viewport` }));
      else if (R > vw + 1) out.push(issue('text-offscreen', 'error', it, { msg: `ends ${Math.round(R - vw)} px past the right edge` }));
    }
    return out;
  }

  function small(items) {
    const out = [];
    for (const it of items) {
      if (it.gone) continue;
      const fs = Math.round(it.fs * 10) / 10;
      if (fs < 8) out.push(issue('text-tiny', 'error', it, { msg: `${fs} px` }));
      else if (fs < (it.svg ? 9.5 : 10)) out.push(issue('text-small', 'warn', it, { msg: `${fs} px` }));
    }
    return out;
  }

  // ---------------------------------------------------------------- words run together, wrapped pills
  const WORD_END = /[\p{L}\p{N}]$/u;
  const WORD_START = /^[\p{L}\p{N}]/u;
  const DIGIT = /^\p{N}$/u;

  /** Advance box of the character at offset i of text node n (viewport coordinates). */
  function charRect(n, i) {
    const r = document.createRange();
    r.setStart(n, i);
    r.setEnd(n, i + 1);
    const rs = [...r.getClientRects()].filter((x) => x.width > 0 && x.height > 0);
    return rs.length ? rs[rs.length - 1] : null;
  }

  /** Innermost superscript or subscript around el (<sup>, <sub> or vertical-align: super/sub) within its line box. */
  function script(el) {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const s = cs(e);
      if (e.tagName === 'SUP' || e.tagName === 'SUB' || s.verticalAlign === 'super' || s.verticalAlign === 'sub') return e;
      if (s.display !== 'inline') return null;
    }
    return null;
  }

  /**
   * Words from neighbouring elements that render with no space between them, e.g. "commit9a6fcde" when a template
   * drops the whitespace before an inline element. Digit pairs are allowed (counters split into spans), and so is the
   * edge of a superscript or subscript, which attaches to its word by design ("Abbas¹", "¹RIVeR Lab", "B_baseline").
   */
  function joined(items) {
    const out = [];
    const html = items.filter((it) => !it.svg && !it.gone);
    for (let k = 1; k < html.length; k++) {
      const a = html[k - 1];
      const b = html[k];
      if (a.el === b.el || a.layer !== b.layer || a.overlay !== b.overlay) continue;
      const ca = a.node.data.slice(-1);
      const cb = b.node.data[0];
      if (!WORD_END.test(ca) || !WORD_START.test(cb) || (DIGIT.test(ca) && DIGIT.test(cb))) continue;
      if (script(a.el) !== script(b.el)) continue;
      const ra = charRect(a.node, a.node.data.length - 1);
      const rb = charRect(b.node, 0);
      if (!ra || !rb) continue;
      const same = Math.abs(ra.top + ra.height / 2 - (rb.top + rb.height / 2)) < 0.5 * Math.min(ra.height, rb.height);
      const gap = rb.left - ra.right;
      if (!same || gap > 0.1 * Math.min(a.fs, b.fs) || gap < -2) continue;
      out.push(
        issue('text-joined', 'error', a, {
          sel2: sel(b.el),
          text: `${a.node.data.trim().split(/\s+/).pop()}|${b.node.data.trim().split(/\s+/)[0]}`,
          msg: `"${ca}" and "${cb}" touch across an element boundary (gap ${gap.toFixed(1)} px): missing space?`,
          rects: [doc(ra), doc(rb)],
        }),
      );
    }
    return out;
  }

  /** Number of lines the in-flow content of el occupies (child boxes clustered by vertical position). */
  function lineCount(el) {
    const rs = [];
    const range = document.createRange();
    for (const c of el.childNodes) {
      if (c.nodeType === 3) {
        if (!/\S/.test(c.data)) continue;
        range.selectNodeContents(c);
        rs.push(...range.getClientRects());
      } else if (c.nodeType === 1) {
        const s = cs(c);
        if (info(c).hidden || s.position === 'absolute' || s.position === 'fixed') continue;
        rs.push(...c.getClientRects());
      }
    }
    let lines = 0;
    let bottom = -Infinity;
    for (const r of rs.filter((x) => x.width >= 1 && x.height >= 1).sort((p, q) => p.top - q.top)) {
      if (r.top + r.height / 2 > bottom) {
        lines++;
        bottom = r.bottom;
      } else bottom = Math.max(bottom, r.bottom);
    }
    return lines;
  }

  /** Pill-shaped boxes (fully rounded ends) whose content wraps: segmented controls, chips, badges. */
  function pills() {
    const out = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (el.namespaceURI === SVG) continue;
      const s = cs(el);
      const rad = s.borderTopLeftRadius;
      if (!rad.endsWith('px') || parseFloat(rad) < 40 || s.display === 'inline' || s.display === 'contents') continue;
      const inf = info(el);
      if (inf.hidden || inf.ignore || inf.op < 0.05 || s.visibility !== 'visible') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const n = lineCount(el);
      if (n > 1)
        out.push(
          issue('pill-wrapped', 'error', { el, text: snip(el.textContent), layer: inf.layer }, {
            msg: `pill-shaped ${el.tagName.toLowerCase()} wraps its content onto ${n} lines`,
            rects: [doc(r)],
          }),
        );
    }
    return out;
  }

  function obstacles() {
    const out = [];
    for (const el of document.body.querySelectorAll('*')) {
      const svg = el.namespaceURI === SVG;
      if (svg && (el.tagName !== 'svg' || el.parentElement?.closest('svg'))) continue;
      const inf = info(el);
      if (inf.hidden || inf.ignore || inf.op < 0.05) continue;
      const s = cs(el);
      if (s.visibility !== 'visible') continue;
      const tag = el.tagName;
      let kind = null;
      if (tag === 'IMG' || tag === 'VIDEO' || tag === 'CANVAS' || tag === 'IFRAME') kind = 'media';
      else if (tag === 'svg') kind = 'graphic';
      else if (/url\(/.test(s.backgroundImage)) kind = 'media';
      else if (s.display !== 'inline' && s.display !== 'contents' && boxed(s)) kind = 'box';
      if (!kind) continue;
      const r = clipTo(doc(el.getBoundingClientRect()), inf.self);
      if (!r || r.w < 4 || r.h < 4) continue;
      const parts = uncovered(el, [r]).filter((p) => p.w >= 2 && p.h >= 2);
      if (parts.length) out.push({ el, kind, r, parts, inf });
    }
    return out;
  }

  function overObstacles(items) {
    const out = [];
    const obs = obstacles();
    for (const it of items) {
      if (it.gone) continue;
      for (const o of obs) {
        if (o.el.contains(it.el) || o.inf.layer !== it.layer || o.inf.overlay !== it.overlay) continue;
        let hit = null;
        for (const b of it.vis)
          for (const p of o.parts) {
            const x = inter(b, p);
            if (x && x.w >= 2 && x.h >= 2 && area(x) >= 6 && (!hit || area(x) > area(hit))) hit = x;
          }
        if (hit)
          out.push(
            issue(`text-over-${o.kind}`, o.kind === 'graphic' ? 'warn' : 'error', it, {
              sel2: sel(o.el),
              msg: `ink overlaps ${o.kind} ${sel(o.el)} by ${Math.round(hit.w)}×${Math.round(hit.h)} px`,
              rects: [...it.vis, o.r],
              hit,
            }),
          );
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- tap targets
  function targets() {
    const T = [];
    for (const el of document.querySelectorAll(TARGETS)) {
      const inf = info(el);
      if (inf.hidden || inf.ignore || inf.op < 0.05) continue;
      const s = cs(el);
      if (s.visibility !== 'visible' || s.pointerEvents === 'none' || el.disabled) continue;
      const boxes = [...el.getClientRects()].map(doc);
      const frags = uncovered(
        el,
        boxes.map((r) => clipTo(r, inf.self)).filter(Boolean),
      ).filter((r) => r.w >= 1 && r.h >= 1);
      if (!frags.length) continue;
      // A target cut by the edge of a scroll container is partly scrolled out of view, not small: its size counts only
      // hard clips (overflow: hidden or clip) that scroll with it, i.e. those inside its nearest scroll container.
      const sc = scrollerOf(el);
      const hard = inf.self.filter((c) => c.hard && (!sc || sc.contains(c.el)));
      const whole = boxes.map((r) => clipTo(r, hard)).filter((r) => r && r.w >= 1 && r.h >= 1);
      T.push({ el, r: union(frags), size: union(whole.length ? whole : frags), frags, inf, inline: s.display === 'inline' });
    }
    return T;
  }

  const label = (el) => snip(el.textContent || el.getAttribute('aria-label'));

  function targetIssues(T) {
    const out = [];
    for (let i = 0; i < T.length; i++)
      for (let j = i + 1; j < T.length; j++) {
        const A = T[i];
        const B = T[j];
        if (A.inf.layer !== B.inf.layer || A.inf.overlay !== B.inf.overlay || !inter(A.r, B.r)) continue;
        if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
        let hit = null;
        for (const a of A.frags)
          for (const b of B.frags) {
            const x = inter(a, b);
            if (x && area(x) >= 4 && (!hit || area(x) > area(hit))) hit = x;
          }
        if (hit)
          out.push(
            issue('targets-overlap', 'error', { el: A.el, text: label(A.el), layer: A.inf.layer }, {
              sel2: sel(B.el),
              text2: label(B.el),
              msg: `tap targets overlap by ${Math.round(hit.w)}×${Math.round(hit.h)} px`,
              rects: [A.r, B.r],
              hit,
            }),
          );
      }
    // WCAG 2.5.8: at least 24×24 px, or a 24 px circle around the target that touches no other target.
    const undersized = new Set(T.filter((t) => !t.inline && (t.size.w < 23.5 || t.size.h < 23.5)));
    for (const t of undersized) {
      const c = center(t.r);
      const crowded = T.some(
        (u) =>
          u !== t &&
          u.inf.layer === t.inf.layer &&
          !u.el.contains(t.el) &&
          !t.el.contains(u.el) &&
          (undersized.has(u) ? Math.hypot(c.x - center(u.r).x, c.y - center(u.r).y) < 24 : distToRect(c, u.r) < 12),
      );
      if (crowded)
        out.push(
          issue('target-small', 'warn', { el: t.el, text: label(t.el), layer: t.inf.layer }, {
            msg: `${Math.round(t.size.w)}×${Math.round(t.size.h)} px with neighbours closer than the 24 px spacing`,
            rects: [t.r],
          }),
        );
    }
    return out;
  }

  // ---------------------------------------------------------------- page-level layout
  function overflowX(vw) {
    const out = [];
    const de = document.documentElement;
    const sw = Math.max(de.scrollWidth, document.body.scrollWidth);
    const over = (r) => r && Math.max(r.x + r.w - vw, -r.x) > 1 && r.x + r.w > -200 && r.x < vw + 200;
    for (const el of document.body.querySelectorAll('*')) {
      const inf = info(el);
      if (inf.hidden || inf.ignore || inf.layer) continue;
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      const c = clipTo(doc(b), inf.self);
      if (!over(c)) continue;
      const p = el.parentElement;
      if (p && p !== document.body && over(clipTo(doc(p.getBoundingClientRect()), info(p).self))) continue;
      out.push(
        issue('overflow-x', 'error', { el, text: snip(el.textContent).slice(0, 30) }, {
          msg: `${Math.round(c.x + c.w - vw > 1 ? c.x + c.w - vw : -c.x)} px outside the ${vw} px viewport`,
          rects: [c],
        }),
      );
    }
    if (sw > vw + 1) out.push({ type: 'page-hscroll', sev: 'error', sel: 'html', text: '', msg: `document is ${sw} px wide in a ${vw} px viewport`, rects: [] });
    return out;
  }

  function scrollers() {
    const out = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (el.namespaceURI === SVG) continue;
      const s = cs(el);
      const sx = /auto|scroll/.test(s.overflowX);
      const sy = /auto|scroll/.test(s.overflowY);
      if (!sx && !sy) continue;
      const inf = info(el);
      if (inf.hidden || inf.ignore) continue;
      const dx = el.scrollWidth - el.clientWidth;
      const dy = el.scrollHeight - el.clientHeight;
      if (el.hasAttribute('data-qa-scroll')) {
        // A declared axis (data-qa-scroll="y" for a sheet or sidebar) makes overflow on the other axis a layout bug.
        const axis = el.getAttribute('data-qa-scroll');
        const d = axis === 'y' ? (sx ? dx : 0) : axis === 'x' ? (sy ? dy : 0) : 0;
        if (d > 1)
          out.push(
            issue('scroll-axis', 'error', { el, text: '', layer: inf.layer }, {
              msg: `scrolls ${d} px ${axis === 'y' ? 'sideways' : 'vertically'}; declared data-qa-scroll="${axis}"`,
              rects: [doc(el.getBoundingClientRect())],
            }),
          );
        continue;
      }
      if ((sx && dx > 1) || (sy && dy > 1))
        out.push(
          issue('unexpected-scroll', 'warn', { el, text: '' }, { msg: `scrolls by ${Math.max(sx ? dx : 0, sy ? dy : 0)} px`, rects: [doc(el.getBoundingClientRect())] }),
        );
    }
    return out;
  }

  /** Fixed overlays (tooltips) must sit fully inside the viewport and clear of the fixed header. */
  function overlays() {
    const out = [];
    const nav = document.querySelector('[data-nav]');
    const nb = nav ? nav.getBoundingClientRect().bottom : 0;
    const vw = document.documentElement.clientWidth;
    for (const el of document.querySelectorAll('[data-qa-overlay]')) {
      const inf = info(el);
      if (inf.hidden || inf.op < 0.05 || cs(el).position !== 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const msg =
        r.left < -0.5 || r.right > vw + 0.5 || r.top < -0.5 || r.bottom > innerHeight + 0.5
          ? `outside the viewport (${Math.round(r.left)},${Math.round(r.top)} – ${Math.round(r.right)},${Math.round(r.bottom)})`
          : r.top < nb - 0.5
            ? `${Math.round(nb - r.top)} px hidden under the fixed header`
            : null;
      if (msg) out.push(issue('overlay-offscreen', 'error', { el, text: snip(el.textContent), layer: el }, { msg, rects: [doc(r)] }));
    }
    return out;
  }

  function fold() {
    const out = [];
    if (scrollY > 0) return out;
    for (const el of document.querySelectorAll('[data-qa-fold]')) {
      const q = el.getAttribute('data-qa-fold');
      if ((q && !matchMedia(q).matches) || info(el).hidden) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom > innerHeight + 0.5)
        out.push(issue('below-fold', 'warn', { el, text: '' }, { msg: `ends ${Math.round(r.bottom - innerHeight)} px below the fold`, rects: [doc(r)] }));
    }
    return out;
  }

  // ---------------------------------------------------------------- numbers split from their units
  /** A number and its unit, or a comparator and its operands: "25 s", "12 %", "12.2 points", "< 0.001", "p <". */
  const UNIT_PAIR = /\p{N}[\s\u00a0\u202f]+(?:s|ms|min|h|%|×|°|px|cm|mm|m|pp|points?|pts?)(?![\p{L}\p{N}])|[<>≤≥=][\s\u00a0\u202f]*\p{N}|(?<![\p{L}\p{N}])[pn][\s\u00a0\u202f]*[<>≤≥=]/gu;

  /** A line break inside such a pair reads as two separate values ("From 25 | s"); join them with a no-break space. */
  function unitSplit(items) {
    const out = [];
    const r = document.createRange();
    for (const it of items) {
      if (it.gone || it.svg) continue;
      const t = it.node.data;
      UNIT_PAIR.lastIndex = 0;
      for (let m; (m = UNIT_PAIR.exec(t)); ) {
        r.setStart(it.node, m.index);
        r.setEnd(it.node, m.index + m[0].length);
        const mids = [...r.getClientRects()].filter((x) => x.width > 0 && x.height > 0).map((x) => x.top + x.height / 2);
        if (mids.length < 2 || Math.max(...mids) - Math.min(...mids) < 0.5 * it.fs) continue;
        const pair = m[0].replace(/[\s\u00a0\u202f]+/g, ' ');
        out.push(issue('unit-split', 'error', it, { text: pair, msg: `"${pair}" breaks across lines: use a no-break space` }));
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- SVG labels against drawn shapes
  /**
   * Text in a drawing must not sit on the shapes it annotates. Samples the core ink band of every SVG text on a grid
   * and tests each point against the opted-in shapes of the same outermost <svg>, in their own coordinate systems.
   */
  function svgInk(items) {
    const out = [];
    const shapes = new Map();
    const drawn = (root) => {
      if (!shapes.has(root)) {
        const list = [...root.querySelectorAll('[data-qa-shape],[data-qa-line]')].filter((el) => {
          if (typeof el.isPointInFill !== 'function') return false;
          const inf = info(el);
          return !inf.hidden && !inf.ignore && inf.op >= 0.05 && cs(el).visibility === 'visible';
        });
        shapes.set(root, list);
      }
      return shapes.get(root);
    };
    for (const it of items) {
      if (it.gone || !it.svg) continue;
      let root = it.el.ownerSVGElement;
      while (root?.ownerSVGElement) root = root.ownerSVGElement;
      if (!root) continue;
      for (const el of drawn(root)) {
        const m = el.getScreenCTM();
        if (!m) continue;
        const inv = m.inverse();
        const line = el.hasAttribute('data-qa-line');
        let n = 0;
        let hits = 0;
        let hit = null;
        for (const b of it.vis) {
          for (let a = 0; a <= 24; a++) {
            for (let c = 0; c <= 5; c++) {
              const x = b.x + (b.w * a) / 24;
              const y = b.y + (b.h * c) / 5;
              const p = new DOMPoint(x - scrollX, y - scrollY).matrixTransform(inv);
              n++;
              if (line ? el.isPointInStroke(p) : el.isPointInFill(p)) {
                hits++;
                const r = { x: x - 1, y: y - 1, w: 2, h: 2 };
                hit = hit ? union([hit, r]) : r;
              }
            }
          }
        }
        if (!hits) continue;
        const pct = (100 * hits) / n;
        const what = line ? 'line' : 'shape';
        out.push(
          issue(`svg-text-over-${what}`, line || pct >= 1.5 ? 'error' : 'warn', it, {
            sel2: sel(el),
            msg: `ink ${line ? 'crosses' : 'covers'} ${what} ${sel(el)} (${pct.toFixed(1)}% of samples)`,
            rects: [...it.vis, doc(el.getBoundingClientRect())],
            hit,
          }),
        );
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- public API
  function analyze() {
    fresh();
    const vw = document.documentElement.clientWidth;
    const items = textItems();
    const T = targets();
    const issues = [
      ...overlaps(items),
      ...clipped(items),
      ...escapes(items),
      ...offscreen(items, vw),
      ...small(items),
      ...joined(items),
      ...unitSplit(items),
      ...pills(),
      ...overObstacles(items),
      ...svgInk(items),
      ...targetIssues(T),
      ...overflowX(vw),
      ...scrollers(),
      ...overlays(),
      ...fold(),
    ];
    for (const x of issues) x.scroll = Math.round(scrollY);
    return { issues, stats: { text: items.length, shown: items.filter((i) => !i.gone).length, targets: T.length } };
  }

  /** Page text that sits under the fixed header must not show through it. */
  function header() {
    fresh();
    const nav = document.querySelector('[data-nav]');
    if (!nav) return [];
    const a = alpha(cs(nav).backgroundColor);
    const N = doc(nav.getBoundingClientRect());
    const under = textItems().filter((it) => !it.layer && !it.gone && it.vis.some((b) => inter(b, N)));
    if (!under.length || a >= 0.6) return [];
    return [
      {
        type: 'header-over-text',
        sev: 'error',
        fixed: true,
        sel: sel(nav),
        text: under
          .slice(0, 3)
          .map((i) => i.text)
          .join(' | '),
        msg: `page text scrolls under the header while its background alpha is ${a.toFixed(2)}`,
        rects: [N, ...under.slice(0, 4).flatMap((i) => i.vis)].map(rnd).filter(Boolean),
        scroll: Math.round(scrollY),
      },
    ];
  }

  /** Tap targets fully on screen must receive the pointer at their centre. */
  function obscured() {
    fresh();
    const out = [];
    const nav = document.querySelector('[data-nav]');
    const nb = nav ? nav.getBoundingClientRect().bottom : 0;
    const vw = document.documentElement.clientWidth;
    for (const t of targets()) {
      const r = t.el.getClientRects()[0];
      if (!r) continue;
      if (r.top < (t.inf.layer ? 0 : nb) || r.bottom > innerHeight || r.left < 0 || r.right > vw || r.width < 2 || r.height < 2) continue;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit || t.el.contains(hit) || hit.contains(t.el) || hit.closest('[data-qa-ignore]')) continue;
      if (info(hit).overlay) continue;
      out.push(
        issue('target-obscured', 'error', { el: t.el, text: label(t.el), layer: t.inf.layer }, {
          sel2: sel(hit),
          msg: `centre is covered by ${sel(hit)}`,
          rects: [doc(r), doc(hit.getBoundingClientRect())],
          scroll: Math.round(scrollY),
        }),
      );
    }
    return out;
  }

  /** Whether focus restyles a descendant of el (compared with el blurred), which then draws the focus ring. */
  function innerRing(el) {
    const kids = [...el.querySelectorAll('*')];
    const P = ['stroke', 'stroke-width', 'fill', 'outline-style', 'outline-color', 'box-shadow', 'opacity', 'visibility', 'display'];
    const snap = () => kids.map((k) => P.map((p) => getComputedStyle(k).getPropertyValue(p)).join('|'));
    const on = snap();
    el.blur();
    const off = snap();
    el.focus({ preventScroll: true });
    return on.some((v, i) => v !== off[i]);
  }

  /**
   * The element focused by the last Tab press. It must be visible, on screen below the fixed header, not covered by
   * another element, and draw a focus ring that no ancestor clip, the header or the viewport edge cuts off.
   * Returns { done } once focus has left the page, else { key, issues }.
   */
  function focus() {
    fresh();
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) return { done: true, issues: [] };
    const inf = info(el);
    const s = cs(el);
    const r = el.getBoundingClientRect();
    const R = doc(r);
    const key = `${sel(el)}|${label(el)}`;
    const out = [];
    const put = (type, sev, msg, rects, extra = {}) =>
      out.push(issue(type, sev, { el, text: label(el) || sel(el), layer: inf.layer }, { msg, rects, scroll: Math.round(scrollY), ...extra }));
    if (inf.hidden || s.visibility !== 'visible' || inf.op < 0.05 || r.width < 1 || r.height < 1) {
      put('focus-hidden', 'error', 'receives keyboard focus but is not visible', [R]);
      return { key, issues: out };
    }

    const vw = document.documentElement.clientWidth;
    const nav = document.querySelector('[data-nav]');
    const nb = nav ? nav.getBoundingClientRect() : null;
    // The header clips focus unless the element paints above it (a skip link, a menu).
    const probe = nb && !inf.layer && inter(R, doc(nb));
    const hitP = probe && document.elementFromPoint(probe.x - scrollX + probe.w / 2, probe.y - scrollY + probe.h / 2);
    const top = nb && !inf.layer && !(hitP && (el.contains(hitP) || hitP.contains(el))) ? Math.max(0, nb.bottom) : 0;
    const view = { x: scrollX, y: scrollY + top, w: vw, h: innerHeight - top };
    const shown = clipTo(inter(R, view), inf.self);
    const want = Math.min(R.w, view.w) * Math.min(R.h, view.h);
    if (!shown || area(shown) < 0.98 * want) {
      const under = top > 0 && R.y < view.y && R.y + R.h > scrollY;
      put(
        under ? 'focus-under-header' : 'focus-offscreen',
        'error',
        `${Math.round(100 * (1 - (shown ? area(shown) : 0) / want))}% of the focused element is ${under ? 'under the header' : 'outside the viewport or clipped'}`,
        [R, ...(under ? [doc(nb)] : [])],
      );
    }

    if (shown) {
      const hits = new Map();
      for (const [fx, fy] of [[0.5, 0.5], [0.12, 0.2], [0.88, 0.2], [0.12, 0.8], [0.88, 0.8]]) {
        const h = document.elementFromPoint(shown.x - scrollX + fx * shown.w, shown.y - scrollY + fy * shown.h);
        if (!h || el.contains(h) || h.contains(el) || h.closest('[data-qa-ignore]')) continue;
        hits.set(h, (hits.get(h) || 0) + (fx === 0.5 ? 3 : 1));
      }
      const [h, n] = [...hits].sort((a, b) => b[1] - a[1])[0] || [];
      if (h)
        put('focus-covered', n >= 3 ? 'error' : 'warn', `partly covered by ${sel(h)}`, [R, doc(h.getBoundingClientRect())], {
          sel2: sel(h),
          text2: label(h),
        });
    }

    const ow = s.outlineStyle !== 'none' ? parseFloat(s.outlineWidth) || 0 : 0;
    const shadow = !!s.boxShadow && s.boxShadow !== 'none';
    const clear = (c) => c === 'transparent' || /rgba\([^)]*,\s*0\)$|\/\s*0\)$/.test(c);
    // WebKit paints no outline or box-shadow on SVG content, and a transparent outline shows only in forced-colours mode,
    // so in those cases the ring has to come from something that focus restyles inside the element (a stroke, a fill).
    const svgKid = el instanceof SVGElement && !(el instanceof SVGSVGElement);
    if (svgKid || (ow >= 1 && clear(s.outlineColor) && !shadow)) {
      if (!innerRing(el))
        put(
          'focus-ring-missing',
          'error',
          svgKid
            ? 'is SVG content, where WebKit paints no outline or box-shadow, and focus restyles nothing inside it'
            : 'has a transparent outline and focus restyles nothing inside it',
          [R],
        );
    } else if (ow < 1 && !shadow) {
      put('focus-ring-missing', 'error', 'shows no outline or box-shadow while focused', [R]);
    } else if (ow >= 1) {
      // Sample the middle of the outline stroke all the way round; every sample must survive every clip.
      const o = (parseFloat(s.outlineOffset) || 0) + ow / 2;
      const M = { x: R.x - o, y: R.y - o, w: R.w + 2 * o, h: R.h + 2 * o };
      const clips = [...inf.self.map((c) => c.r), view];
      const P = 2 * (M.w + M.h);
      const N = 96;
      const sides = new Set();
      const cutBy = new Set();
      let cut = 0;
      for (let i = 0; i < N; i++) {
        let d = ((i + 0.5) / N) * P;
        let x, y, side;
        if (d < M.w) [x, y, side] = [M.x + d, M.y, 'top'];
        else if ((d -= M.w) < M.h) [x, y, side] = [M.x + M.w, M.y + d, 'right'];
        else if ((d -= M.h) < M.w) [x, y, side] = [M.x + M.w - d, M.y + M.h, 'bottom'];
        else [x, y, side] = [M.x, M.y + M.h - (d - M.w), 'left'];
        const by = clips.filter((c) => x < c.x - 0.5 || x > c.x + c.w + 0.5 || y < c.y - 0.5 || y > c.y + c.h + 0.5);
        if (!by.length) continue;
        cut++;
        sides.add(side);
        for (const c of by) cutBy.add(c);
      }
      if (cut) {
        const what = [...cutBy].map((c) => (c === view ? (top && M.y < view.y ? 'the header' : 'the viewport') : sel(inf.self.find((k) => k.r === c)?.el)));
        put(
          'focus-ring-clipped',
          cut / N >= 0.5 ? 'error' : 'warn',
          `${Math.round((100 * cut) / N)}% of the focus ring (${[...sides].join(', ')}) is cut off by ${[...new Set(what)].join(', ')}`,
          [M, ...[...cutBy].filter((c) => c !== view)],
        );
      }
    }
    return { key, issues: out };
  }

  function links() {
    return [...document.querySelectorAll('a[href]')].map((a) => {
      const u = new URL(a.href, location.href);
      const id = u.hash ? decodeURIComponent(u.hash.slice(1)) : '';
      const same = u.origin === location.origin && u.pathname === location.pathname;
      return {
        href: u.href,
        sel: sel(a),
        text: label(a),
        same,
        internal: u.origin === location.origin,
        target: id,
        exists: !same || !id || id === 'top' || !!document.getElementById(id),
      };
    });
  }

  function media() {
    fresh();
    const out = [];
    for (const v of document.querySelectorAll('video')) {
      const r = v.getBoundingClientRect();
      out.push({
        kind: 'video',
        sel: sel(v),
        src: v.currentSrc || v.getAttribute('src') || '',
        err: v.error ? v.error.code : 0,
        ready: v.readyState,
        preload: v.preload,
        nw: v.videoWidth,
        nh: v.videoHeight,
        w: r.width,
        h: r.height,
        fit: cs(v).objectFit,
        hidden: info(v).hidden || !r.width,
        rect: rnd(doc(r)),
      });
    }
    for (const im of document.images) {
      const r = im.getBoundingClientRect();
      out.push({
        kind: 'img',
        sel: sel(im),
        src: im.currentSrc || im.src,
        broken: im.complete && !!im.getAttribute('src') && im.naturalWidth === 0,
        nw: im.naturalWidth,
        nh: im.naturalHeight,
        w: r.width,
        h: r.height,
        fit: cs(im).objectFit,
        hidden: info(im).hidden || !r.width,
        rect: rnd(doc(r)),
      });
    }
    return { dpr: devicePixelRatio, items: out };
  }

  /** Outline rects for a screenshot: document coordinates, or viewport coordinates when pinned (fixed). */
  function mark(rects, pin) {
    unmark();
    const box = document.createElement('div');
    box.id = '__qa-mark';
    box.setAttribute('data-qa-ignore', '');
    box.style.cssText = `position:${pin ? 'fixed' : 'absolute'};left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none`;
    const colors = ['#ff0055', '#ff9900', '#00b3ff', '#22cc66'];
    rects.forEach((r, i) => {
      const d = document.createElement('div');
      const c = colors[Math.min(i, colors.length - 1)];
      d.style.cssText = `position:absolute;left:${r.x - 2}px;top:${r.y - 2}px;width:${r.w + 4}px;height:${r.h + 4}px;outline:2px solid ${c};background:${c}1f;border-radius:2px`;
      box.appendChild(d);
    });
    document.body.appendChild(box);
  }

  function unmark() {
    document.getElementById('__qa-mark')?.remove();
  }

  window.__qa = { analyze, header, obscured, focus, links, media, mark, unmark };
})();
