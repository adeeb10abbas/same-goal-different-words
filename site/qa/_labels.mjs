import { chromium } from 'playwright';
const url = 'http://127.0.0.1:4321/same-goal-different-words/dev-glyphs/';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
await p.goto(url, { waitUntil: 'networkidle' });
for (const cw of (process.argv[2] ?? '234,300,400,520').split(',').map(Number)) {
  await p.evaluate((cw) => { document.querySelector('.dg').style.gridTemplateColumns = `repeat(auto-fill, ${cw}px)`; }, cw);
  await p.waitForTimeout(700);
  const res = await p.evaluate(() => {
    const rows = [];
    for (const cell of document.querySelectorAll('.dg-cell')) {
      const svg = cell.querySelector('svg.glyph');
      const pt = svg.createSVGPoint();
      const labels = [...svg.querySelectorAll('text.label')];
      const fills = [...svg.querySelectorAll('path.obj, path.ghost, circle.ghost')];
      const strokes = [...svg.querySelectorAll('path.arrow')];
      const robot = svg.querySelector('.robot text');
      const marks = [...svg.querySelectorAll('.mark .plus')];
      const issues = [];
      const boxes = labels.map((l) => l.getBBox());
      labels.forEach((l, i) => {
        const bb = boxes[i];
        // glyph ink: drop most of the descender/ascender band
        const y0 = bb.y + bb.height * 0.22, y1 = bb.y + bb.height * 0.8;
        const hits = { obj: 0, arc: 0, mark: 0 };
        let n = 0;
        for (let a = 0; a <= 24; a++) for (let c = 0; c <= 5; c++) {
          pt.x = bb.x + (bb.width * a) / 24; pt.y = y0 + ((y1 - y0) * c) / 5; n++;
          if (fills.some((f) => f.isPointInFill(pt))) hits.obj++;
          if (strokes.some((s) => s.isPointInStroke(pt))) hits.arc++;
          if (marks.some((m) => m.isPointInStroke(pt))) hits.mark++;
        }
        for (const [k, v] of Object.entries(hits)) if (v) issues.push(`${l.textContent}~${k} ${Math.round((v / n) * 100)}%`);
        boxes.forEach((o, j) => {
          if (j <= i) return;
          const ix = Math.min(bb.x + bb.width, o.x + o.width) - Math.max(bb.x, o.x);
          const iy = Math.min(y1, o.y + o.height * 0.8) - Math.max(y0, o.y + o.height * 0.22);
          if (ix > 0 && iy > 0) issues.push(`${l.textContent}~label:${labels[j].textContent}`);
        });
        if (robot) {
          const rb = robot.getBoundingClientRect(), lb = l.getBoundingClientRect();
          if (Math.min(rb.right, lb.right) - Math.max(rb.left, lb.left) > 0 && Math.min(rb.bottom, lb.bottom) - Math.max(rb.top, lb.top) > 0) issues.push(`${l.textContent}~robot`);
        }
        // association: the label's own object (matched by role class) has the nearest outline
        const role = [...l.classList].find((c) => c !== 'label');
        const ink = { x0: bb.x, x1: bb.x + bb.width, y0: y0, y1: y1 };
        const dist = (path) => {
          const L = path.getTotalLength();
          let d = Infinity;
          for (let s = 0; s <= 160; s++) {
            const q = path.getPointAtLength((L * s) / 160);
            d = Math.min(d, Math.hypot(Math.max(0, ink.x0 - q.x, q.x - ink.x1), Math.max(0, ink.y0 - q.y, q.y - ink.y1)));
          }
          return d;
        };
        const objs = [...svg.querySelectorAll('path.obj')].map((o) => ({ role: [...o.classList].find((c) => c !== 'obj'), g: dist(o) }));
        const own = objs.find((o) => o.role === role);
        const rival = objs.filter((o) => o.role !== role).sort((a, b) => a.g - b.g)[0];
        if (own && rival && rival.g < own.g) issues.push(`${l.textContent}~closer-to-${rival.role} (${own.g.toFixed(0)} vs ${rival.g.toFixed(0)})`);
        if (own && own.g > 30) issues.push(`${l.textContent}~far ${own.g.toFixed(0)}`);
        // neighbouring labels: at least ~0.8em apart when their text bands overlap
        const lb = l.getBoundingClientRect();
        labels.forEach((m, j) => {
          if (j <= i) return;
          const mb = m.getBoundingClientRect();
          const vOverlap = Math.min(lb.bottom, mb.bottom) - Math.max(lb.top, mb.top) > -3;
          const hGap = Math.max(mb.left - lb.right, lb.left - mb.right);
          if (vOverlap && hGap >= 0 && hGap < 9) issues.push(`${l.textContent}~near:${m.textContent} ${hGap.toFixed(1)}px`);
        });
        const vb = svg.viewBox.baseVal;
        if (bb.x < 2 || bb.x + bb.width > vb.width - 2 || bb.y < 0 || bb.y + bb.height > vb.height) issues.push(`${l.textContent}~edge`);
      });
      if (issues.length) rows.push(`${cell.dataset.goal}: ${issues.join(', ')}`);
    }
    return rows;
  });
  console.log(`--- cell ${cw}px: ${res.length} glyphs with label contacts`);
  for (const r of res) console.log('  ' + r);
}
await b.close();
