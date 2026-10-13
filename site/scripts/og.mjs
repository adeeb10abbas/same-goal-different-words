// Renders public/og.jpg, the 1200×630 social card, from the hero's TF/RF rollout pair.
// Needs ffmpeg and the local media folder. Usage: node scripts/og.mjs [--media ../media] [--t 36] [--out public/og.jpg]
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE } from '../src/lib/site.ts';

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const media = resolve(site, arg('media', '../media'));
const t = Number(arg('t', '36'));
const out = resolve(site, arg('out', 'public/og.jpg'));

const study = JSON.parse(readFileSync(join(site, 'src/data/study.json'), 'utf8'));
const episodes = JSON.parse(readFileSync(join(site, 'public/data/episodes.json'), 'utf8'));
const goal = study.scenes.find((s) => s.id === 'S4').goals.find((g) => g.id === 'R');
const pair = [
  { f: 'S', short: 'TF', name: 'Target-first', ep: episodes.find((e) => e.id === 'RWS-E3-S4-C02-R-S') },
  { f: 'I', short: 'RF', name: 'Reference-first', ep: episodes.find((e) => e.id === 'RWS-E3-S4-C02-R-I') },
];
const STAGE = {
  no_mover_contact: 'Never touched the target',
  contact_no_lift: 'Touched, never lifted',
  lift_no_goal: 'Lifted, never reached the goal',
  goal_unstable: 'Reached the goal, never stable',
};

const tmp = mkdtempSync(join(tmpdir(), 'sgdw-og-'));
const b64 = (p) => readFileSync(p).toString('base64');
const font = (rel) => `data:font/woff2;base64,${b64(join(site, 'node_modules/@fontsource-variable', rel))}`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const mark = (prompt) =>
  esc(prompt.trim())
    .replaceAll(goal.moverName, `<b class="mv">${goal.moverName}</b>`)
    .replaceAll(goal.referenceName, `<b class="rf">${goal.referenceName}</b>`);
const ICON = {
  kept: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 10.4l2.7 2.6L14.2 7.4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  never: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 7l6 6M13 7l-6 6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
};

const panels = pair
  .map(({ f, short, name, ep }) => {
    const png = join(tmp, `${f}.png`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', join(media, 'ep', ep.id, 'top.mp4'), '-frames:v', '1', png]);
    const kept = ep.sf === 1;
    const verdict = kept ? `Placed at ${ep.tStable.toFixed(1)}&nbsp;s, kept to the end` : STAGE[ep.stage] ?? 'Never placed';
    return `<figure class="panel ${f}">
      <div class="head"><span class="pill">${short}</span><span class="fname">${name}</span></div>
      <p class="instr">“${mark(goal.prompts[f])}”</p>
      <img class="frame" src="data:image/png;base64,${b64(png)}" alt="">
      <p class="verdict ${kept ? 'kept' : 'never'}">${ICON[kept ? 'kept' : 'never']}<span>${verdict}</span></p>
    </figure>`;
  })
  .join('');

const authors = SITE.authors.map((a) => `<span class="nw">${a.name}</span>`).join(' · ');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;src:url(${font('inter/files/inter-latin-wght-normal.woff2')}) format('woff2');font-weight:100 900}
@font-face{font-family:Newsreader;src:url(${font('newsreader/files/newsreader-latin-opsz-normal.woff2')}) format('woff2');font-weight:200 800}
@font-face{font-family:Newsreader;font-style:italic;src:url(${font('newsreader/files/newsreader-latin-opsz-italic.woff2')}) format('woff2');font-weight:200 800}
@font-face{font-family:JBM;src:url(${font('jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2')}) format('woff2');font-weight:100 800}
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px;overflow:hidden}
body{position:relative;background:#0d0f13;color:#eceef1;font:16px/1.4 Inter,sans-serif;-webkit-font-smoothing:antialiased}
.glow{position:absolute;inset:0;background:radial-gradient(40% 62% at 16% 108%,rgb(59 79 198/24%),transparent 70%),radial-gradient(42% 60% at 90% -6%,rgb(163 60 121/20%),transparent 70%)}
.grid{position:absolute;inset:40px 46px 40px 54px;display:grid;grid-template-columns:minmax(0,1fr) 636px;gap:42px;align-items:center}
.nw{white-space:nowrap}
.venue{display:inline-flex;align-items:center;gap:9px;font-size:13.5px;color:#9aa1ad;border:1px solid #2b303a;border-radius:999px;padding:5px 14px 5px 11px;white-space:nowrap}
.venue i{font-style:italic}
.dot{width:7px;height:7px;border-radius:50%;background:#6fd39a;box-shadow:0 0 0 4px rgb(111 211 154/16%)}
h1{margin-top:22px;font-family:Newsreader,serif;font-weight:450;font-size:62px;line-height:1.02;letter-spacing:-.028em;font-variation-settings:'opsz' 72;white-space:nowrap}
h1 em{font-style:italic;background:linear-gradient(92deg,#8d9cff,#f08cc4);-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.06em}
.sub{margin-top:14px;font-family:Newsreader,serif;font-variation-settings:'opsz' 18;font-size:22.5px;line-height:1.25;color:#c9ced6}
.stat{margin-top:30px;display:flex;align-items:center;gap:16px}
.big{font-family:Newsreader,serif;font-variation-settings:'opsz' 72;font-weight:480;font-size:60px;line-height:.9;letter-spacing:-.02em;color:#f08cc4;white-space:nowrap}
.big small{margin-left:5px;font:600 17px Inter,sans-serif;letter-spacing:0}
.stat p{font-size:15.5px;line-height:1.38;color:#c9ced6}
.stat p b{color:#eceef1;font-weight:600}
.authors{margin-top:30px;font-size:14px;line-height:1.45;color:#dfe3e8}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.panel{background:#161920;border:1px solid #2b303a;border-radius:14px;padding:14px 14px 13px}
.head{display:flex;align-items:center;gap:9px}
.pill{font:700 12px/1 JBM,monospace;letter-spacing:.04em;color:#fff;border-radius:6px;padding:5px 7px}
.S .pill{background:#3b4fc6}.I .pill{background:#a33c79}
.fname{font-size:15px;font-weight:600}
.instr{margin:10px 0 12px;font-size:14px;line-height:1.4;color:#c9ced6;min-height:4.2em}
.mv{color:#3fb6cc;font-weight:600}.rf{color:#ef9a62;font-weight:600}
.frame{display:block;width:100%;aspect-ratio:536/540;border-radius:8px;object-fit:cover}
.verdict{margin-top:12px;display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;white-space:nowrap}
.verdict svg{width:18px;height:18px;flex:none}
.kept{color:#6fd39a}.never{color:#ffc95a}
</style></head><body><div class="glow"></div><div class="grid">
<div class="text">
  <div class="venue"><span class="dot"></span><span>${SITE.venue} · <i>${SITE.workshop}</i></span></div>
  <h1>Same Goal,<br><em>Different Words</em></h1>
  <p class="sub">${SITE.subtitleParts[0]} <span class="nw">${SITE.subtitleParts[1]}</span></p>
  <div class="stat"><div class="big">−12.2<small>pts</small></div>
    <p>stable placement when the <b>reference is named first</b>, across 3&nbsp;world-action models and 864&nbsp;rollouts</p></div>
  <p class="authors">${authors}</p>
</div>
<div class="pair">${panels}</div>
</div></body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const problems = await page.evaluate(() => {
    const bad = [];
    const box = (el) => el.getBoundingClientRect();
    for (const el of document.querySelectorAll('.text > *, .panel *')) {
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') bad.push(`overflow: ${el.className}`);
      const r = box(el);
      if (r.right > 1200 - 40 || r.bottom > 630 - 30 || r.left < 40 || r.top < 30) bad.push(`outside safe area: ${el.className || el.tagName}`);
    }
    const text = box(document.querySelector('.text'));
    for (const el of document.querySelectorAll('.text > *')) if (box(el).right > text.right + 1) bad.push(`wider than column: ${el.className || el.tagName}`);
    if (text.right > box(document.querySelector('.pair')).left) bad.push('text column overlaps the rollouts');
    return bad;
  });
  if (problems.length) throw new Error(`Social card layout problems:\n${problems.join('\n')}`);
  const png = join(tmp, 'og@2x.png');
  await page.screenshot({ path: png });
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', png, '-vf', 'scale=1200:630:flags=lanczos', '-q:v', '2', out]);
  console.log(`wrote ${out}`);
} finally {
  await browser.close();
  rmSync(tmp, { recursive: true, force: true });
}
