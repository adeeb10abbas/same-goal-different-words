import { chromium } from 'playwright';
const base = 'http://127.0.0.1:4321/same-goal-different-words/';
const out = process.argv[2] ?? '/tmp/sgdw-el';
const widths = (process.argv[3] ?? '320').split(',').map(Number);
const b = await chromium.launch();
for (const w of widths) {
  const p = await b.newPage({ viewport: { width: w, height: 800 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  await p.goto(base, { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  const shoot = async (sel, name) => {
    const el = p.locator(sel).first();
    if (!(await el.count())) return console.log('missing', sel);
    await el.scrollIntoViewIfNeeded();
    await p.waitForTimeout(300);
    await el.screenshot({ path: `${out}/${w}-${name}.png` });
  };
  await shoot('[data-hero] .panel.I', 'hero-rf');
  await shoot('[data-hero] .foot', 'hero-foot');
  await p.evaluate(() => document.querySelector('#finding')?.scrollIntoView());
  await p.waitForTimeout(1500);
  await shoot('.cards .card:nth-child(3)', 'card3');
  await shoot('.cards .card:nth-child(1)', 'card1');
  await shoot('figure.glyph', 'glyph');
  await p.close();
}
await b.close();
