import type { Episode } from './media';
import { study, MODELS, GOALS, SCENES, FORM_ORDER, FORM_NAME, FORM_SHORT, type FormId, type ModelId } from './study';

export type ContrastId = 'TF_RF' | 'DIR_TF' | 'DIR_RF';
export type OutcomeId = 'anytime' | 'end';
export type RowId = 'All' | ModelId;

/** Each contrast is a − b; positive values favour wording a. */
export const CONTRASTS: { id: ContrastId; a: FormId; b: FormId }[] = [
  { id: 'TF_RF', a: 'S', b: 'I' },
  { id: 'DIR_TF', a: 'D', b: 'S' },
  { id: 'DIR_RF', a: 'D', b: 'I' },
];
export const contrastOf = (id: ContrastId) => CONTRASTS.find((c) => c.id === id)!;
export const contrastLabel = (id: ContrastId) => {
  const c = contrastOf(id);
  return `${FORM_SHORT[c.a]}\u2009−\u2009${FORM_SHORT[c.b]}`;
};
export const ROWS: RowId[] = ['All', ...MODELS.map((m) => m.id)];
export const OUT_LABEL: Record<OutcomeId, string> = { anytime: 'at any time', end: 'at episode end' };
export const STARTS = 8;

/** Muted scene colours that stay clear of the wording, object and outcome hues; each is at least 3:1 on white. */
export const SCENE_COLOR: Record<string, string> = {
  S1: '#7650b8',
  S3: '#3f6e3a',
  S4: '#b07400',
  S5: '#857a70',
};

/** Position a fixed tooltip above an anchor, else below it, else clamped; always inside the viewport and below the header. */
export function placeTip(a: { cx: number; top: number; bottom: number }, el: HTMLElement) {
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const gap = 12;
  const m = 8;
  const vw = document.documentElement.clientWidth;
  const nav = Math.max(0, document.querySelector('[data-nav]')?.getBoundingClientRect().bottom ?? 0);
  const lo = nav + m;
  const hi = innerHeight - h - m;
  const x = Math.max(m, Math.min(vw - w - m, a.cx - w / 2));
  const above = a.top - gap - h;
  if (above >= lo) return { x, y: above };
  if (a.bottom + gap <= hi) return { x, y: a.bottom + gap };
  return { x, y: Math.max(lo, Math.min(hi, above)) };
}

/**
 * Stable-placement outcomes per model, wording and outcome: one character per goal (in GOALS order) and start, so
 * index = goalIndex * 8 + (start - 1). '1' means placed.
 */
export type Bits = Record<ModelId, Record<FormId, Record<OutcomeId, string>>>;

/** Build-time: compress the 864 episode outcomes into 18 short strings for the client. */
export function placementBits(episodes: Episode[]): Bits {
  if (episodes.length !== MODELS.length * GOALS.length * FORM_ORDER.length * STARTS)
    throw new Error(`results: expected ${MODELS.length * GOALS.length * 3 * STARTS} episodes, got ${episodes.length}`);
  const by = new Map(episodes.map((e) => [`${e.m}|${e.s}|${e.c}|${e.g}|${e.f}`, e]));
  const bits = {} as Bits;
  for (const m of MODELS) {
    bits[m.id] = {} as Bits[ModelId];
    for (const f of FORM_ORDER) {
      let a = '';
      let e = '';
      for (const g of GOALS)
        for (let s = 1; s <= STARTS; s++) {
          const ep = by.get(`${m.id}|${g.scene.id}|${s}|${g.id}|${f}`);
          if (!ep) throw new Error(`results: missing episode ${m.id} ${g.key} start ${s} ${f}`);
          if (ep.sf && !ep.se) throw new Error(`results: ${ep.id} passes at the end but never at any time`);
          a += ep.se ? '1' : '0';
          e += ep.sf ? '1' : '0';
        }
      bits[m.id][f] = { anytime: a, end: e };
    }
  }
  checkResults(bits);
  return bits;
}

export const goalIndex = (key: string) => GOALS.findIndex((g) => g.key === key);
export const sceneOf = (key: string) => GOALS[goalIndex(key)].scene.id;
export const placed = (bits: Bits, m: ModelId, f: FormId, o: OutcomeId, gi: number, start: number) =>
  bits[m][f][o][gi * STARTS + start - 1] === '1';

export const countOf = (bits: Bits, m: ModelId, f: FormId, o: OutcomeId, gi: number) => {
  let n = 0;
  for (let s = 1; s <= STARTS; s++) if (placed(bits, m, f, o, gi, s)) n++;
  return n;
};

/** Paired runs (same model, start and goal) in which only a placed, only b placed, and the number of pairs. */
export function discordant(bits: Bits, id: ContrastId, o: OutcomeId): Record<RowId, { a: number; b: number; n: number }> {
  const { a, b } = contrastOf(id);
  const out = {} as Record<RowId, { a: number; b: number; n: number }>;
  const all = { a: 0, b: 0, n: 0 };
  for (const m of MODELS) {
    const r = { a: 0, b: 0, n: 0 };
    GOALS.forEach((_, gi) => {
      for (let s = 1; s <= STARTS; s++) {
        const pa = placed(bits, m.id, a, o, gi, s);
        const pb = placed(bits, m.id, b, o, gi, s);
        r.n++;
        if (pa && !pb) r.a++;
        else if (pb && !pa) r.b++;
      }
    });
    out[m.id] = r;
    all.a += r.a;
    all.b += r.b;
    all.n += r.n;
  }
  out.All = all;
  return out;
}

/** Per-start detail behind one dot: for each goal of the scene and each model in the row, which wording placed. */
export function startDetail(bits: Bits, id: ContrastId, o: OutcomeId, row: RowId, scene: string, start: number) {
  const { a, b } = contrastOf(id);
  const models = row === 'All' ? MODELS.map((m) => m.id) : [row];
  const goals = GOALS.filter((g) => g.scene.id === scene);
  let net = 0;
  const grid = goals.map((g) => {
    const gi = goalIndex(g.key);
    return {
      goal: g,
      cells: models.map((m) => {
        const pa = placed(bits, m, a, o, gi, start);
        const pb = placed(bits, m, b, o, gi, start);
        net += +pa - +pb;
        return pa && pb ? 'both' : pa ? 'a' : pb ? 'b' : 'none';
      }),
    };
  });
  return { models, grid, net, pairs: goals.length * models.length };
}

/** Percentage points with a true minus sign; values that round to zero print as 0.0. */
export function num(x: number, d = 1) {
  const s = (100 * x).toFixed(d);
  return Number(s) === 0 ? (0).toFixed(d) : s.replace('-', '−');
}

export function signed(x: number, d = 1) {
  const s = num(x, d);
  return Number((100 * x).toFixed(d)) === 0 ? `±${s}` : x > 0 ? `+${s}` : s;
}

export const fmtCI = (ci: [number, number], d = 1) => `[${num(ci[0], d)}, ${num(ci[1], d)}]`;

/** Signed integer with a true minus sign. */
export const sgn = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
/** Small counts as words for running prose; larger ones stay numerals. */
export const spell = (n: number) => WORDS[n] ?? `${n}`;

/** Holm-adjusted p as reported in the paper: three decimals, or "< 0.001". */
export const fmtP = (p: number) => (p < 0.001 ? '<\u00a00.001' : `=\u00a0${p.toFixed(3)}`);

/** The original Holm family: pooled any-time TF−RF and DIR−TF only. Everything else is descriptive. */
export const isTested = (id: ContrastId, o: OutcomeId, row: RowId) =>
  row === 'All' && o === 'anytime' && study.settings.stats.holmFamily.includes(id);

/**
 * Capped beeswarm. Dots keep their exact x and stack vertically; a full stack (cap levels either side) spills one dot
 * width sideways. Returns [dx, dy] offsets in px for each input, in input order.
 */
export function swarm(xs: number[], step: number, cap: number, maxSpill = 6): [number, number][] {
  const order = xs.map((_, i) => i).sort((p, q) => xs[p] - xs[q] || p - q);
  const cands: [number, number][] = [];
  for (let m = 0; m <= maxSpill; m++)
    for (let l = 0; l <= cap; l++) for (const sx of m ? [m, -m] : [0]) for (const ly of l ? [-l, l] : [0]) cands.push([sx, ly]);
  const placedAt: [number, number][] = [];
  const out: [number, number][] = new Array(xs.length);
  const min2 = step * step - 0.01;
  for (const i of order) {
    let pos: [number, number] = [0, 0];
    for (const [sx, ly] of cands) {
      const x = xs[i] + sx * step;
      const y = ly * step;
      if (placedAt.every(([px, py]) => (px - x) ** 2 + (py - y) ** 2 >= min2)) {
        pos = [sx * step, y];
        break;
      }
    }
    placedAt.push([xs[i] + pos[0], pos[1]]);
    out[i] = pos;
  }
  return out;
}

/** Spread label centres at least `gap` apart inside [lo, hi], keeping them as close to their targets as possible. */
export function dodge(ys: number[], gap: number, lo: number, hi: number) {
  const idx = ys.map((_, i) => i).sort((a, b) => ys[a] - ys[b]);
  const out = ys.slice();
  for (let pass = 0; pass < 60; pass++) {
    let moved = false;
    for (let k = 1; k < idx.length; k++) {
      const p = idx[k - 1];
      const q = idx[k];
      const over = gap - (out[q] - out[p]);
      if (over > 0.01) {
        out[p] -= over / 2;
        out[q] += over / 2;
        moved = true;
      }
    }
    for (const i of idx) out[i] = Math.max(lo, Math.min(hi, out[i]));
    if (!moved) break;
  }
  return out;
}

/** Relation phrase used for compact goal labels (matches the finding section's goal chips). */
export const REL_TEXT: Record<string, string> = {
  L: 'left of',
  R: 'right of',
  F: 'in front of',
  B: 'behind',
  TOP: 'on top of',
  LR: 'left onto right',
  RL: 'right onto left',
};

/** Short names for each scene's objects, mover first. */
export const SCENE_PAIR: Record<string, [string, string]> = {
  S1: ['Cube', 'bowl'],
  S3: ['Butter box', 'raisin box'],
  S4: ['Mustard', 'raisin box'],
  S5: ['Bowl', 'bowl'],
};

export const cell = (m: ModelId, key: string, f: FormId) => {
  const c = study.cells[`${m}|${key}|${f}`];
  if (!c) throw new Error(`results: no cell ${m}|${key}|${f}`);
  return c;
};

export function countsCsv() {
  const rows = [['model', 'model_name', 'scene', 'goal', 'goal_label', 'initially_true', 'wording', 'wording_name', 'any_time', 'end', 'n']];
  for (const m of MODELS)
    for (const g of GOALS)
      for (const f of FORM_ORDER) {
        const [a, e, n] = cell(m.id, g.key, f);
        rows.push([m.id, m.name, g.scene.title, g.key, g.label, g.initiallyTrue ? '1' : '0', FORM_SHORT[f], FORM_NAME[f], `${a}`, `${e}`, `${n}`]);
      }
  if (rows.length !== 1 + MODELS.length * GOALS.length * 3) throw new Error('results: csv rows');
  return rows.map((r) => r.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',')).join('\n') + '\n';
}

const close = (x: number, y: number, tol: number) => Math.abs(x - y) <= tol;

/** Every number the section shows is checked against the published study data at build time. */
export function checkResults(bits: Bits) {
  const fail = (msg: string): never => {
    throw new Error(`results: ${msg}`);
  };
  // Counts per model, goal and wording.
  let anyTotal = 0;
  let endTotal = 0;
  for (const m of MODELS)
    for (const f of FORM_ORDER)
      GOALS.forEach((g, gi) => {
        const [a, e, n] = cell(m.id, g.key, f);
        if (n !== STARTS) fail(`cell ${m.id} ${g.key} ${f} has n=${n}`);
        if (countOf(bits, m.id, f, 'anytime', gi) !== a || countOf(bits, m.id, f, 'end', gi) !== e) fail(`cell ${m.id} ${g.key} ${f}`);
        if (g.initiallyTrue && a !== STARTS) fail(`${g.key} is initially true but ${m.id} ${f} has ${a}/8`);
        anyTotal += a;
        endTotal += e;
      });
  if (anyTotal !== study.flow.anytime || endTotal !== study.flow.end) fail('flow totals');

  // Per-relation pooled counts.
  if (study.relation.length !== GOALS.length) fail('relation length');
  for (const r of study.relation) {
    const g = GOALS.find((x) => x.key === r.key) ?? fail(`unknown goal ${r.key}`);
    const sum = (k: 0 | 1 | 2) => MODELS.reduce((s, m) => s + r.byModel[m.id][k], 0);
    for (const m of MODELS) {
      const want = FORM_ORDER.map((f) => cell(m.id, r.key, f)[0]);
      if (want.some((v, k) => v !== r.byModel[m.id][k])) fail(`relation byModel ${r.key} ${m.id}`);
    }
    if (sum(0) !== r.dir || sum(1) !== r.tf || sum(2) !== r.rf) fail(`relation totals ${r.key}`);
    if (!close(r.est, (r.tf - r.rf) / (MODELS.length * STARTS), 1e-9)) fail(`relation est ${r.key}`);
    if (g.initiallyTrue && r.est !== 0) fail(`relation ${r.key} is initially true but nonzero`);
  }
  // A scene's TF−RF average over its goals equals the average of its eight start-level differences.
  for (const sc of SCENES) {
    const goals = study.relation.filter((r) => sceneOf(r.key) === sc.id);
    const starts = study.contrasts.TF_RF.anytime.All.starts.filter((st: { scene: string }) => st.scene === sc.id);
    const a = goals.reduce((t, r) => t + r.est, 0) / goals.length;
    const b = starts.reduce((t: number, st: { d: number }) => t + st.d, 0) / starts.length;
    if (!close(a, b, 1e-4)) fail(`scene ${sc.id} average ${a} vs ${b}`);
  }

  // Start-level paired differences, discordant pairs and estimates.
  for (const c of CONTRASTS)
    for (const o of ['anytime', 'end'] as OutcomeId[])
      for (const row of ROWS) {
        const iv = study.contrasts[c.id][o][row];
        if (iv.starts.length !== SCENES.length * STARTS) fail(`${c.id} ${o} ${row} starts`);
        let i = 0;
        for (const sc of SCENES)
          for (let s = 1; s <= STARTS; s++, i++) {
            const st = iv.starts[i];
            if (st.scene !== sc.id || st.slot !== s) fail(`${c.id} ${o} ${row} start order`);
            const det = startDetail(bits, c.id, o, row, sc.id, s);
            if (!close(det.net / det.pairs, st.d, 6e-5)) fail(`${c.id} ${o} ${row} ${sc.id}/${s}: ${det.net}/${det.pairs} vs ${st.d}`);
          }
        const mean = iv.starts.reduce((t: number, st: { d: number }) => t + st.d, 0) / iv.starts.length;
        if (!close(mean, iv.est, 1e-4)) fail(`${c.id} ${o} ${row} est`);
        if (!(iv.ci[0] <= iv.est && iv.est <= iv.ci[1])) fail(`${c.id} ${o} ${row} ci`);
      }
  for (const c of CONTRASTS) {
    const d = discordant(bits, c.id, 'anytime').All;
    const want = study.contrasts[c.id].discordant;
    if (d.a !== want.aOnly || d.b !== want.bOnly) fail(`${c.id} discordant ${d.a}/${d.b} vs ${want.aOnly}/${want.bOnly}`);
    if (d.n !== MODELS.length * GOALS.length * STARTS) fail(`${c.id} pairs`);
  }

  // Scene-balanced rates: the grand mean of the per-model, per-wording rates is the overall rate.
  for (const [k, total] of [
    ['byModelForm', study.rates],
    ['byModelFormExcl', study.rates.excl],
  ] as const)
    for (const o of ['anytime', 'end'] as OutcomeId[]) {
      const vals = MODELS.flatMap((m) => FORM_ORDER.map((f) => study.rates[k][m.id][f][o] as number));
      if (!close(vals.reduce((s, v) => s + v, 0) / vals.length, total[o], 1e-9)) fail(`rates ${k} ${o}`);
    }

  // Raw any-time and end counts by goal type (Appendix C.3).
  const fl = study.flow;
  if (fl.achievement.n + fl.maintenance.n !== fl.total) fail('flow split');
  if (fl.achievement.anytime + fl.maintenance.anytime !== fl.anytime || fl.achievement.end + fl.maintenance.end !== fl.end) fail('flow split counts');
  if (fl.maintenance.anytime !== fl.maintenance.n) fail('initially-true goals must all pass at any time');
}
