#!/usr/bin/env node
/**
 * UI QA. Renders pages in Chromium and WebKit over a viewport matrix, drives the interactive states (hero scrubbing,
 * every toggle group, every goal in both wordings, strip tooltips at the corners) and checks the layout of each state:
 * overlapping, clipped, escaping, off-screen and tiny text; words run together across elements; wrapped pills;
 * numbers split from their units at a line break; text over media or boxes; overlapping or small tap
 * targets; horizontal overflow; stray scrollbars; tooltips leaving the viewport; the fixed header covering text or
 * controls; keyboard focus (every Tab stop visible, uncovered and fully ringed); layout shift; media resolution and
 * loading; links; console errors; and axe (Chromium).
 * Writes report.md, report.json and annotated screenshots to qa/report/. Exits 1 if anything is an error.
 *
 *   node qa/ui-check.mjs [--base URL] [--pages ,explore/] [--engines chromium,webkit] [--viewports 390x844,1440x900]
 *                        [--motion 390x844] [--text 390x844] [--jobs 3] [--out qa/report]
 *                        [--no-states] [--no-axe] [--no-shots] [--no-links] [--no-header] [--no-keys]
 *
 * Needs the site (astro dev or astro preview) and the media server (scripts/media-server.mjs) running.
 * Runs use prefers-reduced-motion: reduce so states are deterministic; --motion lists extra Chromium viewports that
 * run with full motion (animations are finished before each check), and --text extra Chromium viewports that run
 * with a 20 px browser default font size. Viewports at most 500 px tall (phones in landscape) or narrow and
 * portrait are emulated as touch phones.
 */
import { chromium, webkit } from 'playwright';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');
const INPAGE = path.join(HERE, 'inpage.js');
const ENGINES = { chromium, webkit };
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
/** Toggle groups whose options are crossed: every option of the first with every option of the second. */
const CROSS = [['Choose a goal', 'Wording']];
const MAX_SHOTS_PER_RUN = 60;
/** Root font size of the large-text runs: Chrome's "Large" setting. */
const TEXT_PX = 20;

const DEFAULTS = {
  base: 'http://127.0.0.1:4321/same-goal-different-words/',
  pages: '',
  engines: 'chromium,webkit',
  // Device screens plus real browser viewports of common laptops (1366x768 at 100 %, 1920x1080 at 125 % and 150 %; 1024x700 is a
  // landscape tablet): the last four exercise the hero's side-by-side layout for short screens.
  viewports: '320x640,375x667,390x844,667x375,768x1024,842x939,844x390,1024x768,1280x800,1440x900,1920x1080,2560x1440,1024x700,1280x610,1366x657,1536x730',
  motion: '390x844,1440x900',
  text: '390x844,1280x800',
  jobs: '3',
  out: path.join(HERE, 'report'),
  states: true,
  axe: true,
  shots: true,
  links: true,
  header: true,
  keys: true,
};

function parseArgs(argv) {
  const o = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    const m = /^--(no-)?([a-z-]+)(?:=(.*))?$/.exec(argv[i]);
    if (!m || !(m[2] in DEFAULTS)) throw new Error(`unknown argument ${argv[i]}`);
    if (m[1]) o[m[2]] = false;
    else if (typeof DEFAULTS[m[2]] === 'boolean') o[m[2]] = true;
    else o[m[2]] = m[3] ?? argv[++i] ?? '';
  }
  const list = (s) => String(s).split(',').map((x) => x.trim());
  const vps = (s) =>
    list(s)
      .filter(Boolean)
      .map((v) => {
        const [w, h] = v.split('x').map(Number);
        if (!w || !h) throw new Error(`bad viewport ${v}`);
        return { w, h };
      });
  return {
    ...o,
    base: o.base.replace(/\/?$/, '/'),
    pages: list(o.pages),
    engines: list(o.engines).filter(Boolean),
    viewports: vps(o.viewports),
    motion: vps(o.motion),
    text: vps(o.text),
    jobs: Math.max(1, +o.jobs || 1),
    out: path.resolve(o.out),
  };
}

const opts = parseArgs(process.argv.slice(2));
for (const e of opts.engines) if (!ENGINES[e]) throw new Error(`unknown engine ${e}`);

// ------------------------------------------------------------------------------------------------ helpers
const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'state';
const keyOf = (i) => [i.type, i.sel, i.text, i.sel2 ?? '', i.text2 ?? ''].join('|');
const union = (rs) => {
  const x = Math.min(...rs.map((r) => r.x));
  const y = Math.min(...rs.map((r) => r.y));
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
};

async function pool(items, n, fn) {
  const out = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const k = next++;
        out[k] = await fn(items[k], k);
      }
    }),
  );
  return out;
}

/** Issues of one run, deduplicated by what and where; states lists every state an issue appeared in. */
class Log {
  constructor(run) {
    this.run = run;
    this.map = new Map();
    this.state = 'load';
    this.shots = 0;
    this.stats = { states: 0, text: 0, targets: 0, cls: null, clsScroll: null };
  }

  add(issues, state = this.state) {
    const fresh = [];
    for (const i of issues) {
      const key = keyOf(i);
      let e = this.map.get(key);
      if (!e) {
        this.map.set(key, (e = { ...i, key, states: [] }));
        fresh.push(e);
      }
      if (!e.states.includes(state)) e.states.push(state);
    }
    return fresh;
  }

  note(type, sev, msg, extra = {}) {
    return this.add([{ type, sev, sel: '', text: '', msg, ...extra }]);
  }
}

async function step(L, name, fn) {
  try {
    await fn();
    return true;
  } catch (e) {
    L.note('qa-step-failed', 'warn', `${name}: ${String(e?.message ?? e).split('\n')[0]}`, { sel: name });
    return false;
  }
}

// ------------------------------------------------------------------------------------------------ page setup
/** Layout shifts with their sources, recorded from the first paint. */
function CLS_INIT() {
  window.__shifts = [];
  window.__clsSupported = false;
  try {
    if (!(PerformanceObserver.supportedEntryTypes || []).includes('layout-shift')) return;
    window.__clsSupported = true;
    const name = (n) => {
      if (!n) return '?';
      if (n.nodeType !== 1) return n.parentElement ? name(n.parentElement) : '#text';
      const cls = [...n.classList].filter((c) => !/^(svelte|astro)-/.test(c)).slice(0, 2);
      return n.tagName.toLowerCase() + (n.id ? `#${n.id}` : '') + (cls.length ? `.${cls.join('.')}` : '');
    };
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__shifts.push({ v: e.value, t: e.startTime, src: (e.sources || []).map((s) => name(s.node)) });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {
    window.__clsSupported = false;
  }
}

/** Largest session window (shifts less than 1 s apart, at most 5 s long), as in the CLS definition. */
function clsOf(shifts) {
  let best = 0;
  let bestSrc = [];
  let cur = 0;
  let curSrc = [];
  let start = -Infinity;
  let prev = -Infinity;
  for (const s of [...shifts].sort((a, b) => a.t - b.t)) {
    if (s.t - prev > 1000 || s.t - start > 5000) {
      cur = 0;
      curSrc = [];
      start = s.t;
    }
    cur += s.v;
    curSrc.push(...s.src);
    prev = s.t;
    if (cur > best) [best, bestSrc] = [cur, [...curSrc]];
  }
  return { value: best, sources: [...new Set(bestSrc)].slice(0, 6) };
}

const FREEZE = `
  *, *::before, *::after {
    transition-duration: 0s !important; transition-delay: 0s !important;
    animation-duration: 0s !important; animation-delay: 0s !important; animation-iteration-count: 1 !important;
  }
  html { scroll-behavior: auto !important; }
  astro-dev-toolbar { display: none !important; }
`;

async function settle(page, run, ms) {
  await page.evaluate(async (ms) => {
    const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
    await raf();
    await raf();
    await new Promise((r) => setTimeout(r, ms));
    for (const a of document.getAnimations?.() ?? []) {
      try {
        if (a.effect?.getComputedTiming?.().endTime !== Infinity) a.finish();
      } catch {}
    }
    await raf();
  }, ms ?? (run.motion === 'reduce' ? 120 : 700));
}

/** Load, measure load CLS, then freeze transitions, walk the page once (hydration, lazy media, reveals) and inject the checker. */
async function prepare(page, L, run) {
  L.state = 'load';
  const resp = await page.goto(run.url, { waitUntil: 'load', timeout: 60_000 });
  if (!resp || resp.status() >= 400) throw new Error(`HTTP ${resp?.status()} for ${run.url}`);
  await page.evaluate(() => document.fonts.ready.then(() => 0));
  await page.waitForTimeout(1200);
  const load = await page.evaluate(() => ({ shifts: window.__shifts ?? [], ok: !!window.__clsSupported, now: performance.now() }));
  if (load.ok) {
    const c = clsOf(load.shifts);
    L.stats.cls = +c.value.toFixed(4);
    if (c.value > 0.02)
      L.note('layout-shift', c.value > 0.1 ? 'error' : 'warn', `CLS ${c.value.toFixed(3)} while loading; moved: ${c.sources.join(', ') || '?'}`, {
        sel: c.sources[0] ?? '',
      });
  }

  await page.addStyleTag({ content: FREEZE });
  await page.evaluate(async () => {
    const H = () => document.documentElement.scrollHeight;
    for (let y = 0; y < H(); y += innerHeight * 0.7) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 90));
    }
    scrollTo(0, H());
    await new Promise((r) => setTimeout(r, 250));
    document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'));
  });
  await page
    .waitForFunction(() => !document.querySelector('astro-island[ssr]'), null, { timeout: 15_000 })
    .catch(() => L.note('hydration-timeout', 'error', 'islands did not hydrate within 15 s', { sel: 'astro-island[ssr]' }));
  await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
  await page
    .waitForFunction(() => [...document.querySelectorAll('video')].every((v) => v.preload === 'none' || v.readyState >= 1 || v.error), null, {
      timeout: 8000,
    })
    .catch(() => {});

  const later = await page.evaluate((t0) => (window.__shifts ?? []).filter((s) => s.t > t0), load.now);
  if (load.ok) {
    const c = clsOf(later);
    L.stats.clsScroll = +c.value.toFixed(4);
    if (c.value > 0.05) L.note('layout-shift-scroll', 'warn', `CLS ${c.value.toFixed(3)} while scrolling; moved: ${c.sources.join(', ') || '?'}`, { sel: c.sources[0] ?? '' });
  }

  await page.evaluate(() => scrollTo(0, 0));
  await settle(page, run);
  await page.addScriptTag({ path: INPAGE });
}

function wire(page, L) {
  page.on('console', (m) => {
    const t = m.type();
    if (t !== 'error' && t !== 'warning') return;
    const text = m.text();
    if (/\[vite\]|Download the Svelte|DevTools/i.test(text)) return;
    const loc = m.location();
    L.add([
      {
        type: t === 'error' ? 'console-error' : 'console-warn',
        sev: t === 'error' ? 'error' : 'warn',
        sel: loc?.url ? `${loc.url.split('?')[0].split('/').pop()}:${loc.lineNumber}` : '',
        text: text.slice(0, 160),
        msg: text.slice(0, 500),
      },
    ]);
  });
  page.on('pageerror', (e) =>
    L.add([{ type: 'page-error', sev: 'error', sel: '', text: String(e.message).slice(0, 160), msg: String(e.stack || e.message).split('\n').slice(0, 4).join(' ') }]),
  );
  page.on('requestfailed', (r) => {
    const f = r.failure()?.errorText ?? '';
    if (/ERR_ABORTED|cancel|NS_BINDING_ABORTED|interrupted/i.test(f)) return;
    L.add([{ type: 'request-failed', sev: 'error', sel: r.resourceType(), text: r.url().split('?')[0].slice(-160), msg: `${f} ${r.url()}` }]);
  });
  page.on('response', (r) => {
    if (r.status() < 400) return;
    L.add([{ type: `http-${r.status()}`, sev: 'error', sel: r.request().resourceType(), text: r.url().split('?')[0].slice(-160), msg: `${r.status()} ${r.url()}` }]);
  });
}

// ------------------------------------------------------------------------------------------------ states
const optName = (loc) =>
  loc.evaluate((b) =>
    (b.getAttribute('aria-label') || b.querySelector('.sr-only')?.textContent || b.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .split('. ')[0]
      .slice(0, 48),
  );
const pressedIndex = (opts) => opts.evaluateAll((bs) => bs.findIndex((b) => b.getAttribute('aria-pressed') === 'true'));

async function seeked(page) {
  await page.evaluate(() =>
    Promise.race([
      Promise.all(
        [...document.querySelectorAll('[data-hero] video')].map((v) => (v.seeking ? new Promise((r) => v.addEventListener('seeked', r, { once: true })) : 0)),
      ),
      new Promise((r) => setTimeout(r, 3000)),
    ]),
  );
}

async function* heroStates(page, L) {
  const track = page.locator('[data-hero] [role=slider]').first();
  if (!(await track.count())) return;
  for (const f of [0.3, 0.6]) {
    const ok = await step(L, `hero scrub ${f}`, async () => {
      await track.scrollIntoViewIfNeeded();
      const b = await track.boundingBox();
      await track.click({ position: { x: b.width * f, y: b.height / 2 } });
      await seeked(page);
    });
    if (ok) yield { key: `hero@${Math.round(f * 100)}%` };
  }
  const end = await step(L, 'hero End key', async () => {
    await track.focus();
    await page.keyboard.press('End');
    await seeked(page);
  });
  if (end) yield { key: 'hero@end' };
  await step(L, 'hero Home key', async () => {
    await track.focus();
    await page.keyboard.press('Home');
    await seeked(page);
  });
}

async function* cycle(L, group, label, prefix = "") {
  const opts = group.locator('button[aria-pressed]');
  const k = await opts.count();
  const orig = await pressedIndex(opts);
  for (let i = 0; i < k; i++) {
    if (i === orig) continue;
    let name = '';
    const ok = await step(L, `${label} option ${i + 1}`, async () => {
      await opts.nth(i).click();
      name = await optName(opts.nth(i));
    });
    if (ok) yield { key: `${prefix}${label}=${name}` };
  }
  if (orig >= 0) await step(L, `${label} restore`, () => opts.nth(orig).click());
}

async function* groupStates(page, L) {
  const crossed = new Set(CROSS.flat());
  // Responsive layouts may hide a control and offer a compact equivalent, so only visible groups are exercised.
  const groups = page.locator('main [role=group]:has(button[aria-pressed])').filter({ visible: true });
  const n = await groups.count();
  for (let i = 0; i < n; i++) {
    const label = (await groups.nth(i).getAttribute('aria-label')) ?? `group ${i + 1}`;
    if (!crossed.has(label)) yield* cycle(L, groups.nth(i), label);
  }
  // Compact cycling buttons (e.g. the transport's speed button) step through every value and back to the start.
  const cyclers = page.locator('main button.rate').filter({ visible: true });
  for (let i = 0, nc = await cyclers.count(); i < nc; i++) {
    const btn = cyclers.nth(i);
    const start = await btn.getAttribute('aria-label');
    for (let s = 1; s <= 6; s++) {
      let name = '';
      const ok = await step(L, `cycle ${start} step ${s}`, async () => {
        await btn.click();
        name = (await btn.getAttribute('aria-label')) ?? '';
      });
      if (!ok || name === start) break;
      yield { key: name };
    }
  }
  for (const [a, b] of CROSS) {
    const ga = page.locator(`main [role=group][aria-label="${a}"]`).first();
    const gb = page.locator(`main [role=group][aria-label="${b}"]`).first();
    if (!(await ga.count())) continue;
    const opts = ga.locator('button[aria-pressed]');
    const k = await opts.count();
    const orig = await pressedIndex(opts);
    for (let i = 0; i < k; i++) {
      let name = '';
      const ok = await step(L, `${a} option ${i + 1}`, async () => {
        await opts.nth(i).click();
        name = await optName(opts.nth(i));
      });
      if (!ok) continue;
      if (i !== orig) yield { key: `${a}=${name}` };
      if (await gb.count()) yield* cycle(L, gb, b, `${a}=${name} · `);
    }
    if (orig >= 0) await step(L, `${a} restore`, () => opts.nth(orig).click());
  }
}

/** Strip tooltips at the corner dots with the row just under the header (worst case for the flip), and one mid-screen. */
async function* tipStates(page, L, run) {
  const rows = page.locator('.strips .row.form');
  const rc = await rows.count();
  if (!rc) return;
  const cases = [
    [0, 'first', 'top'],
    [0, 'last', 'top'],
    [rc - 1, 'first', 'top'],
    [rc - 1, 'last', 'top'],
    [Math.floor(rc / 2), 'mid', 'middle'],
    [rc - 1, 'last', 'bottom'],
  ];
  for (const [ri, which, where] of cases) {
    const row = rows.nth(ri);
    const dots = row.locator('.dot');
    const nd = await dots.count();
    const dot = dots.nth(which === 'first' ? 0 : which === 'last' ? nd - 1 : Math.floor(nd / 2));
    const url = page.url();
    const ok = await step(L, `tooltip ${ri}/${which}/${where}`, async () => {
      if (!run.mobile) await page.mouse.move(1, 1);
      await row.evaluate((el, where) => {
        const nb = document.querySelector('[data-nav]')?.getBoundingClientRect().bottom ?? 0;
        const r = el.getBoundingClientRect();
        const to = where === 'top' ? nb + 4 : where === 'bottom' ? innerHeight - r.height - 4 : (innerHeight - r.height) / 2;
        scrollBy(0, r.top - to);
      }, where);
      await settle(page, run, 60);
      // Point at the dot where it is: Playwright's own hover/tap would scroll it out of the
      // scroll-padding band first, and the strips dismiss their tooltip on scroll.
      const at = await dot.evaluate((d) => {
        const r = d.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const e = document.elementFromPoint(x, y);
        const hit = d.closest('.hit') ?? d;
        const desc = (n) => (n ? n.tagName.toLowerCase() + [...n.classList].map((c) => '.' + c).join('') : 'nothing');
        return { x, y, ok: !!e && (e === d || hit.contains(e)), at: desc(e) };
      });
      if (!at.ok) throw new Error(`strip dot is covered by ${at.at}`);
      if (run.mobile) await page.touchscreen.tap(at.x, at.y);
      else await page.mouse.move(at.x, at.y, { steps: 2 });
      await settle(page, run);
      if (page.url() !== url) throw new Error(`tapping a strip dot navigated to ${page.url()}`);
      if (!(await page.locator('.strip-tip').isVisible())) throw new Error('no tooltip after pointing at a strip dot');
    });
    if (page.url() !== url) {
      L.note('tap-navigated', 'error', `first tap on a strip dot navigated to ${page.url()} instead of showing the tooltip`, { sel: '.strips .hit' });
      await prepare(page, L, run);
      return;
    }
    if (ok) yield { key: `tooltip row ${ri + 1} ${which} @${where}`, pin: true };
  }
  if (!run.mobile) await page.mouse.move(1, 1);
  await page.evaluate(() => scrollBy(0, 1));
}

async function* states(page, L, run) {
  yield { key: 'initial' };
  if (!opts.states) return;
  yield* heroStates(page, L);
  yield* groupStates(page, L);
  yield* tipStates(page, L, run);
}

// ------------------------------------------------------------------------------------------------ checks
const shotKeys = new Set();

async function shootOne(page, run, issue, pin, file) {
  const vp = page.viewportSize();
  let rects = issue.rects;
  if (pin) rects = rects.map((r) => ({ ...r, y: r.y - (issue.scroll ?? 0) }));
  else {
    const U = union(rects);
    await page.evaluate(
      ([x, y, w, h]) => {
        const nb = document.querySelector('[data-nav]')?.getBoundingClientRect().bottom ?? 0;
        scrollTo(Math.max(0, x + w / 2 - innerWidth / 2), Math.max(0, y - Math.max(nb + 12, (innerHeight + nb - h) / 2)));
      },
      [U.x, U.y, U.w, U.h],
    );
    await settle(page, run, 40);
  }
  const s = await page.evaluate(([rects, pin]) => {
    window.__qa.mark(rects, pin);
    return { x: scrollX, y: scrollY };
  }, [rects, pin]);
  const V = union(pin ? rects : rects.map((r) => ({ ...r, x: r.x - s.x, y: r.y - s.y })));
  const pad = 16;
  let x1 = Math.max(0, V.x - pad);
  let y1 = Math.max(0, V.y - pad);
  let x2 = Math.min(vp.width, V.x + V.w + pad);
  let y2 = Math.min(vp.height, V.y + V.h + pad);
  const grow = (a, b, min, max) => {
    if (b - a >= min) return [a, b];
    const c = (a + b) / 2;
    const lo = Math.max(0, Math.min(c - min / 2, max - min));
    return [lo, Math.min(max, lo + min)];
  };
  [x1, x2] = grow(x1, x2, Math.min(360, vp.width), vp.width);
  [y1, y2] = grow(y1, y2, Math.min(200, vp.height), vp.height);
  let ok = false;
  if (x2 - x1 >= 4 && y2 - y1 >= 4) {
    await page.screenshot({ path: file, clip: { x: x1, y: y1, width: x2 - x1, height: y2 - y1 } });
    ok = true;
  }
  await page.evaluate(() => window.__qa.unmark());
  return ok;
}

async function shootAll(page, L, run, issues, st) {
  if (!opts.shots) return;
  const todo = issues.filter((i) => i.rects?.length && !shotKeys.has(`${run.engine}|${i.key}`));
  if (!todo.length) return;
  const y0 = await page.evaluate(() => scrollY);
  const pinned = (i) => !!(i.fixed || st.pin);
  for (const i of [...todo.filter(pinned), ...todo.filter((i) => !pinned(i))]) {
    if (L.shots >= MAX_SHOTS_PER_RUN) break;
    shotKeys.add(`${run.engine}|${i.key}`);
    const file = `${run.id}--${slug(st.key)}--${++L.shots}.png`;
    try {
      if (await shootOne(page, run, i, pinned(i), path.join(opts.out, 'shots', file))) i.shot = `shots/${file}`;
    } catch (e) {
      L.note('qa-shot-failed', 'warn', String(e?.message ?? e).split('\n')[0]);
    }
  }
  await page.evaluate((y) => scrollTo(0, y), y0);
  await settle(page, run, 40);
}

async function analyzeState(page, L, run, st) {
  L.state = st.key;
  await settle(page, run);
  const overlay = await page.evaluate(() => {
    const o = document.querySelector('vite-error-overlay');
    return o ? (o.shadowRoot?.querySelector('.message')?.textContent || 'error overlay').slice(0, 300) : null;
  });
  if (overlay) L.note('vite-error', 'error', overlay, { sel: 'vite-error-overlay' });
  const res = await page.evaluate(() => window.__qa.analyze());
  L.stats.states++;
  L.stats.text = Math.max(L.stats.text, res.stats.shown);
  L.stats.targets = Math.max(L.stats.targets, res.stats.targets);
  await shootAll(page, L, run, L.add(res.issues), st);
}

async function axeRun(page, L, run, state, { include = null, rules = null } = {}) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const vs = await page.evaluate(
    async ({ include, rules, tags }) => {
      const context = { exclude: [['#__qa-mark'], ['astro-dev-toolbar']] };
      if (include) context.include = [[include]];
      const r = await window.axe.run(context, {
        runOnly: rules ? { type: 'rule', values: rules } : { type: 'tag', values: tags },
        resultTypes: ['violations'],
      });
      return r.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        tags: v.tags,
        help: v.help,
        nodes: v.nodes.map((n) => {
          const el = typeof n.target[0] === 'string' ? document.querySelector(n.target[0]) : null;
          const b = el?.getBoundingClientRect();
          return {
            target: n.target.join(' '),
            html: n.html.replace(/\s+/g, ' ').slice(0, 140),
            why: (n.failureSummary || '').split('\n').slice(1).join(' ').trim().slice(0, 300),
            rect: b && b.width ? { x: Math.round(b.left + scrollX), y: Math.round(b.top + scrollY), w: Math.round(b.width), h: Math.round(b.height) } : null,
          };
        }),
      }));
    },
    { include, rules, tags: AXE_TAGS },
  );
  const issues = [];
  for (const v of vs)
    for (const n of v.nodes) {
      const wcag = v.tags.some((t) => /^wcag/.test(t));
      issues.push({
        type: `axe:${v.id}`,
        sev: wcag && (v.impact === 'serious' || v.impact === 'critical') ? 'error' : 'warn',
        sel: n.target,
        text: n.html,
        msg: `${v.help} (${v.impact}). ${n.why}`,
        rects: n.rect ? [n.rect] : [],
        scroll: await page.evaluate(() => Math.round(scrollY)),
      });
    }
  const fresh = L.add(issues, state);
  await shootAll(page, L, run, fresh, { key: state, pin: !!include });
}

async function checkMedia(page, L) {
  const M = await page.evaluate(() => window.__qa.media());
  const out = [];
  for (const m of M.items) {
    if (m.hidden) continue;
    const file = m.src.split('?')[0].split('/').slice(-2).join('/');
    const base = { sel: m.sel, text: file, rects: m.rect ? [m.rect] : [] };
    if (m.kind === 'video') {
      if (m.err) out.push({ ...base, type: 'video-error', sev: 'error', msg: `MediaError ${m.err} for ${m.src}` });
      else if (m.preload !== 'none' && m.ready < 1) out.push({ ...base, type: 'video-not-loaded', sev: 'warn', msg: `no metadata after load for ${m.src}` });
    } else if (m.broken) out.push({ ...base, type: 'img-broken', sev: 'error', msg: `image failed to load: ${m.src}` });
    if (m.nw && m.w) {
      const up = (m.w * M.dpr) / m.nw;
      if (up > 2.5)
        out.push({
          ...base,
          type: 'media-upscaled',
          sev: 'warn',
          msg: `${m.nw}×${m.nh} source drawn ${Math.round(m.w)} CSS px wide at ${M.dpr}× DPR: ${up.toFixed(1)}× upscale`,
        });
      if (m.fit === 'fill' && m.h && Math.abs(m.w / m.h / (m.nw / m.nh) - 1) > 0.02)
        out.push({ ...base, type: 'media-stretched', sev: 'warn', msg: `aspect ${(m.w / m.h).toFixed(3)} vs source ${(m.nw / m.nh).toFixed(3)}` });
    }
  }
  L.add(out, 'media');
}

const linkedPages = new Set();
async function checkLinks(page, L, run) {
  if (linkedPages.has(run.page)) return;
  linkedPages.add(run.page);
  const ls = await page.evaluate(() => window.__qa.links());
  const out = [];
  for (const l of ls) if (!l.exists) out.push({ type: 'link-missing-target', sev: 'error', sel: l.sel, text: l.text, msg: `#${l.target} does not exist on this page` });
  const seen = new Map();
  for (const l of ls) {
    const u = l.href.split('#')[0];
    if (l.same || !/^https?:/.test(u) || seen.has(u)) continue;
    seen.set(u, l);
  }
  await pool([...seen], 6, async ([u, l]) => {
    let status = 0;
    let err = '';
    try {
      const r = await page.request.get(u, { timeout: 15_000, maxRedirects: 5, failOnStatusCode: false });
      status = r.status();
      await r.dispose();
    } catch (e) {
      err = String(e?.message ?? e).split('\n')[0];
    }
    if (status && status < 400) return;
    out.push({
      type: l.internal ? 'link-broken' : 'link-external',
      sev: l.internal ? 'error' : 'warn',
      sel: l.sel,
      text: l.text,
      msg: `${u} → ${status || err}`,
    });
  });
  L.add(out, 'links');
}

/** The fixed header at several scroll positions: text must not show through it and it must not cover controls. */
async function headerPass(page, L, run) {
  const ys = await page.evaluate(() => {
    const H = document.documentElement.scrollHeight - innerHeight;
    const hero = document.querySelector('[data-hero]')?.offsetHeight ?? 0;
    const raw = [0, 12, 200, hero - 100, hero - 50, hero + 10, H / 2, H];
    return [...new Set(raw.map(Math.round).filter((y) => y >= 0 && y <= H))].sort((a, b) => a - b);
  });
  for (const y of ys) {
    const st = { key: `scroll@${y}`, pin: true };
    L.state = st.key;
    await page.evaluate((y) => scrollTo(0, y), y);
    await settle(page, run);
    const res = await page.evaluate(() => [...window.__qa.header(), ...window.__qa.obscured()]);
    await shootAll(page, L, run, L.add(res), st);
    if (opts.axe && run.engine === 'chromium') await axeRun(page, L, run, st.key, { include: '[data-nav]', rules: ['color-contrast'] });
  }
}

/** Keyboard: Tab through every stop from the top of the page and check each focused element and its ring. */
async function focusPass(page, L, run) {
  await page.evaluate(() => {
    scrollTo(0, 0);
    const s = document.createElement('button');
    s.id = '__qa-start';
    s.setAttribute('data-qa-ignore', '');
    s.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0';
    document.body.prepend(s);
    s.focus();
  });
  let first = null;
  for (let i = 1; i <= 400; i++) {
    await page.keyboard.press('Tab');
    if (i === 1) await page.evaluate(() => document.getElementById('__qa-start')?.remove());
    await settle(page, run, 30);
    const res = await page.evaluate(() => window.__qa.focus());
    if (res.done || res.key === first) break;
    first ??= res.key;
    L.stats.tabs = i;
    L.state = `tab ${i}`;
    await shootAll(page, L, run, L.add(res.issues), { key: `tab-${i}`, pin: true });
  }
  await page.evaluate(() => document.activeElement?.blur?.());
}

// ------------------------------------------------------------------------------------------------ one run
async function runOne(browser, run) {
  const t0 = Date.now();
  const L = new Log(run);
  const ctx = await browser.newContext({
    viewport: { width: run.vp.w, height: run.vp.h },
    deviceScaleFactor: run.mobile ? 2 : 1,
    isMobile: run.mobile,
    hasTouch: run.mobile,
    reducedMotion: run.motion,
    colorScheme: 'light',
  });
  await ctx.addInitScript(CLS_INIT);
  const page = await ctx.newPage();
  page.setDefaultTimeout(10_000);
  // A larger browser default font size, as set by Chrome's "Font size: Large" or Android font scaling.
  if (run.text) await (await ctx.newCDPSession(page)).send('Page.setFontSizes', { fontSizes: { standard: run.text, fixed: Math.round((run.text * 13) / 16) } });
  wire(page, L);
  try {
    await prepare(page, L, run);
    await checkMedia(page, L);
    if (opts.links) await checkLinks(page, L, run);
    if (opts.axe && run.engine === 'chromium') {
      L.state = 'axe';
      await axeRun(page, L, run, 'initial');
      await page.evaluate(() => scrollTo(0, 0));
      await settle(page, run);
    }
    for await (const st of states(page, L, run)) await analyzeState(page, L, run, st);
    if (opts.header) await headerPass(page, L, run);
    if (opts.keys && run.engine === 'chromium' && run.motion === 'reduce') await focusPass(page, L, run);
    if (opts.shots) {
      await page.evaluate(() => scrollTo(0, 0));
      await settle(page, run);
      await page.screenshot({ path: path.join(opts.out, 'pages', `${run.id}.jpg`), fullPage: true, type: 'jpeg', quality: 60 }).catch(() => {});
    }
  } catch (e) {
    L.note('qa-crash', 'error', String(e?.stack ?? e).split('\n').slice(0, 3).join(' '));
  } finally {
    await ctx.close().catch(() => {});
  }
  const issues = [...L.map.values()];
  const errors = issues.filter((i) => i.sev === 'error').length;
  const ms = Date.now() - t0;
  console.log(
    `${errors ? '✗' : '✓'} ${run.id.padEnd(34)} ${String(errors).padStart(3)} errors ${String(issues.length - errors).padStart(4)} warnings  ${L.stats.states} states  ${(ms / 1000).toFixed(0)} s`,
  );
  return { run, ms, stats: L.stats, issues };
}

// ------------------------------------------------------------------------------------------------ report
function merge(results) {
  const M = new Map();
  for (const r of results)
    for (const e of r.issues) {
      let m = M.get(e.key);
      if (!m)
        M.set(
          e.key,
          (m = { type: e.type, sev: e.sev, msg: e.msg, sel: e.sel, text: e.text, sel2: e.sel2, text2: e.text2, runs: [], states: new Set(), shot: e.shot }),
        );
      if (e.sev === 'error') m.sev = 'error';
      m.runs.push(r.run.id);
      for (const s of e.states) m.states.add(s);
      m.shot ||= e.shot;
    }
  return [...M.values()]
    .map((m) => ({ ...m, states: [...m.states] }))
    .sort((a, b) => (a.sev === b.sev ? 0 : a.sev === 'error' ? -1 : 1) || a.type.localeCompare(b.type) || b.runs.length - a.runs.length);
}

function runsText(ids, runs) {
  const groups = new Map();
  for (const r of runs) {
    const g = `${r.engine}${r.motion === 'reduce' ? '' : ' (motion)'}${r.page ? ` ${r.page}` : ''}`;
    if (!groups.has(g)) groups.set(g, { all: [], hit: [] });
    groups.get(g).all.push(r);
    if (ids.includes(r.id)) groups.get(g).hit.push(r);
  }
  return [...groups]
    .filter(([, v]) => v.hit.length)
    .map(([g, v]) => `${g}: ${v.hit.length === v.all.length ? 'all' : v.hit.map((r) => `${r.vp.w}×${r.vp.h}`).join(', ')}`)
    .join(' · ');
}

async function report(results, runs, t0) {
  const all = merge(results);
  const errors = all.filter((i) => i.sev === 'error');
  const warns = all.filter((i) => i.sev !== 'error');
  const byType = new Map();
  for (const i of all) {
    const t = byType.get(i.type) ?? { e: 0, w: 0 };
    i.sev === 'error' ? t.e++ : t.w++;
    byType.set(i.type, t);
  }
  const md = [];
  md.push('# UI QA report', '');
  md.push(`${new Date().toISOString()} · ${opts.base} · ${runs.length} runs (${opts.engines.join(', ')}) · ${((Date.now() - t0) / 1000).toFixed(0)} s`, '');
  md.push(`**${errors.length} errors, ${warns.length} warnings** (unique issues across runs)`, '');
  if (all.length) {
    md.push('| Type | Errors | Warnings |', '|---|---:|---:|');
    for (const [t, c] of [...byType].sort((a, b) => b[1].e - a[1].e || b[1].w - a[1].w)) md.push(`| ${t} | ${c.e} | ${c.w} |`);
    md.push('');
  }
  const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
  const entry = (i, n) => {
    const where = [`\`${esc(i.sel)}\`${i.text ? ` “${esc(i.text)}”` : ''}`];
    if (i.sel2 || i.text2) where.push(`\`${esc(i.sel2)}\`${i.text2 ? ` “${esc(i.text2)}”` : ''}`);
    const st = i.states.length > 6 ? `${i.states.slice(0, 6).join(', ')} (+${i.states.length - 6})` : i.states.join(', ');
    return [
      `### ${n}. ${i.type}: ${esc(i.msg)}`,
      '',
      `- ${where.join(' ↔ ')}`,
      `- Runs: ${runsText(i.runs, runs)}`,
      `- States: ${st}`,
      ...(i.shot ? ['', `![${i.type}](${i.shot})`] : []),
      '',
    ].join('\n');
  };
  if (errors.length) md.push('## Errors', '', ...errors.map((i, k) => entry(i, k + 1)));
  if (warns.length) md.push('## Warnings', '', ...warns.map((i, k) => entry(i, k + 1)));
  md.push('## Runs', '', '| Run | Time | States | Text runs | Targets | CLS load | CLS scroll | Errors | Warnings |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of results) {
    const e = r.issues.filter((i) => i.sev === 'error').length;
    md.push(
      `| ${r.run.id} | ${(r.ms / 1000).toFixed(0)} s | ${r.stats.states} | ${r.stats.text} | ${r.stats.targets} | ${r.stats.cls ?? 'n/a'} | ${r.stats.clsScroll ?? 'n/a'} | ${e} | ${r.issues.length - e} |`,
    );
  }
  await writeFile(path.join(opts.out, 'report.md'), md.join('\n') + '\n');
  await writeFile(
    path.join(opts.out, 'report.json'),
    JSON.stringify({ base: opts.base, at: new Date().toISOString(), runs: results.map((r) => ({ id: r.run.id, ms: r.ms, stats: r.stats })), issues: all }, null, 1),
  );

  console.log(`\n${errors.length} errors, ${warns.length} warnings → ${path.relative(process.cwd(), path.join(opts.out, 'report.md'))}`);
  for (const [t, c] of [...byType].sort((a, b) => b[1].e - a[1].e || b[1].w - a[1].w)) console.log(`  ${t.padEnd(26)} ${String(c.e).padStart(3)} errors ${String(c.w).padStart(4)} warnings`);
  return errors.length;
}

// ------------------------------------------------------------------------------------------------ main
const runs = [];
for (const engine of opts.engines)
  for (const p of opts.pages) {
    for (const vp of opts.viewports) runs.push({ engine, page: p, vp, motion: 'reduce' });
    if (engine === 'chromium') {
      for (const vp of opts.motion) runs.push({ engine, page: p, vp, motion: 'no-preference' });
      for (const vp of opts.text) runs.push({ engine, page: p, vp, motion: 'reduce', text: TEXT_PX });
    }
  }
for (const r of runs) {
  // Phones in portrait, and any viewport this short (phones in landscape), are touch devices.
  r.mobile = (r.vp.w <= 820 && r.vp.h > r.vp.w) || r.vp.h <= 500;
  r.url = new URL(r.page, opts.base).href;
  r.id = `${r.engine}-${r.vp.w}x${r.vp.h}${r.motion === 'reduce' ? '' : '-motion'}${r.text ? `-text${r.text}` : ''}${r.page ? `-${slug(r.page)}` : ''}`;
}

const t0 = Date.now();
await rm(opts.out, { recursive: true, force: true });
await mkdir(path.join(opts.out, 'shots'), { recursive: true });
await mkdir(path.join(opts.out, 'pages'), { recursive: true });
console.log(`UI QA: ${runs.length} runs on ${opts.base}`);

const results = (
  await Promise.all(
    opts.engines.map(async (e) => {
      const browser = await ENGINES[e].launch();
      try {
        return await pool(
          runs.filter((r) => r.engine === e),
          opts.jobs,
          (r) => runOne(browser, r),
        );
      } finally {
        await browser.close();
      }
    }),
  )
).flat();
const order = new Map(runs.map((r, i) => [r.id, i]));
results.sort((a, b) => order.get(a.run.id) - order.get(b.run.id));
const nErrors = await report(results, runs, t0);
process.exit(nErrors ? 1 : 0);
