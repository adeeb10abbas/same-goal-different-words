import layoutRaw from '../data/layout.json';
import { epFile, epId, type Episode } from './media';
import { study, MODELS, GOALS, SCENES, FORM_ORDER, type FormId, type Goal, type ModelId, type Token } from './study';

/** Section 02 (Setup): the factorial design, outcome codes and the paper's resampling scheme. */

function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(`setup: ${msg}`);
}

const LAYOUT = layoutRaw as unknown as Record<string, { rep: number; starts: Record<string, unknown>[] }>;

/** Starts per scene: the 32 resampling units split evenly over the scenes, and each scene logs that many starts. */
export const STARTS = study.settings.stats.starts / SCENES.length;
assert(Number.isInteger(STARTS), 'starts do not divide evenly over scenes');
for (const s of SCENES) assert(LAYOUT[s.id]?.starts.length === STARTS, `scene ${s.id} does not log ${STARTS} starts`);

export const N = { models: MODELS.length, goals: GOALS.length, forms: FORM_ORDER.length, starts: STARTS, scenes: SCENES.length };
export const TOTAL = N.models * N.goals * N.forms * N.starts;
assert(TOTAL === study.flow.total, `factorial ${TOTAL} does not match flow.total ${study.flow.total}`);
assert(TOTAL === 864, `factorial ${TOTAL} is not 864`);

export const INIT_GOALS = GOALS.filter((g) => g.initiallyTrue);
export const NATIVE_GOALS = GOALS.filter((g) => g.native);
/** Episodes whose goal already holds at the start (every model, wording and start). */
export const INIT_EPISODES = INIT_GOALS.length * N.models * N.forms * N.starts;
assert(INIT_EPISODES === study.flow.maintenance.n, 'initially-true episode count does not match flow.maintenance.n');
assert(TOTAL - INIT_EPISODES === study.flow.achievement.n, 'remaining episode count does not match flow.achievement.n');
/** Pairs per wording contrast: one per model, goal and start. */
export const PAIRS = N.models * N.goals * N.starts;

/** Episode index: model-major, then goal (scene order), wording (DIR, TF, RF) and start. `c` is 0-based. */
export const idx = (m: number, g: number, f: number, c: number) => ((m * N.goals + g) * N.forms + f) * N.starts + c;
export function cellOf(i: number) {
  const c = i % N.starts;
  const f = Math.floor(i / N.starts) % N.forms;
  const g = Math.floor(i / (N.starts * N.forms)) % N.goals;
  const m = Math.floor(i / (N.starts * N.forms * N.goals));
  return { m, g, f, c };
}

/** One character per episode: K placed and kept, L placed then lost, otherwise the stage the run stopped at. */
export const STAGE_CODE: Record<string, string> = {
  goal_unstable: 'u',
  lift_no_goal: 'f',
  contact_no_lift: 'c',
  no_mover_contact: 'm',
};
export const CODE_STAGE: Record<string, string> = {
  K: 'stable',
  L: 'stable',
  ...Object.fromEntries(Object.entries(STAGE_CODE).map(([k, v]) => [v, k])),
};
export const isAny = (ch: string) => ch === 'K' || ch === 'L';
export const isEnd = (ch: string) => ch === 'K';
export const outcomeCode = (ch: string) => (ch === 'K' ? 'kept' : ch === 'L' ? 'lost' : 'never') as 'kept' | 'lost' | 'never';

/** Build-time: encode every episode, throwing on any inconsistency. */
export function buildCodes(ep: (id: string) => Episode): string {
  let out = '';
  for (const m of MODELS)
    for (const g of GOALS)
      for (const f of FORM_ORDER)
        for (let c = 1; c <= N.starts; c++) {
          const e = ep(epId(m.id, g.scene.id, c, g.id, f));
          if (!!e.se !== (e.stage === 'stable') || (e.sf && !e.se)) throw new Error(`setup: inconsistent outcome ${e.id}`);
          if (!!e.init !== g.initiallyTrue) throw new Error(`setup: initial state of ${e.id} disagrees with goal ${g.key}`);
          if (g.initiallyTrue && !e.se) throw new Error(`setup: initially-true episode ${e.id} never placed`);
          const code = e.se ? (e.sf ? 'K' : 'L') : STAGE_CODE[e.stage];
          if (!code) throw new Error(`setup: unknown stage ${e.stage} in ${e.id}`);
          out += code;
        }
  checkCodes(out);
  return out;
}

export const CONTRAST_FORMS = { TF_RF: ['S', 'I'], DIR_TF: ['D', 'S'], DIR_RF: ['D', 'I'] } as const;
export type ContrastKey = keyof typeof CONTRAST_FORMS;
export type StartDiff = { scene: string; slot: number; d: number };

/**
 * Paper App. B: per start, the paired difference (+1, 0, −1) of one wording minus another, averaged over goals within
 * the scene and then over models (or for one model). Returns the 32 start-level values in scene order.
 */
export function startDiffs(codes: string, key: ContrastKey, outcome: 'anytime' | 'end', model?: ModelId): StartDiff[] {
  const [a, b] = CONTRAST_FORMS[key];
  const fa = FORM_ORDER.indexOf(a as FormId);
  const fb = FORM_ORDER.indexOf(b as FormId);
  const hit = outcome === 'anytime' ? isAny : isEnd;
  const ms = model ? [MODELS.findIndex((x) => x.id === model)] : MODELS.map((_, i) => i);
  const out: StartDiff[] = [];
  for (const s of SCENES) {
    const gs = GOALS.flatMap((g, i) => (g.scene.id === s.id ? [i] : []));
    for (let c = 0; c < N.starts; c++) {
      let sum = 0;
      for (const m of ms) for (const g of gs) sum += +hit(codes[idx(m, g, fa, c)]) - +hit(codes[idx(m, g, fb, c)]);
      out.push({ scene: s.id, slot: c + 1, d: sum / (ms.length * gs.length) });
    }
  }
  return out;
}

const mean = (xs: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i];
  return s / xs.length;
};

/** Check the codes against every published total and contrast. Throws on the first mismatch. */
export function checkCodes(codes: string) {
  assert(codes.length === TOTAL, `expected ${TOTAL} codes, got ${codes.length}`);
  assert(/^[KLufcm]+$/.test(codes), 'unexpected outcome code');
  const flow = study.flow;
  let any = 0;
  let end = 0;
  const stages: Record<string, number> = {};
  for (const ch of codes) {
    any += +isAny(ch);
    end += +isEnd(ch);
    stages[CODE_STAGE[ch]] = (stages[CODE_STAGE[ch]] ?? 0) + 1;
  }
  assert(any === flow.anytime && end === flow.end, 'any-time or end totals differ from flow');
  for (const [k, v] of Object.entries(flow.stages)) assert(stages[k] === v, `stage ${k}: ${stages[k]} vs ${v}`);
  MODELS.forEach((m, mi) =>
    FORM_ORDER.forEach((f, fi) => {
      let a = 0;
      let e = 0;
      for (let g = 0; g < N.goals; g++)
        for (let c = 0; c < N.starts; c++) {
          const ch = codes[idx(mi, g, fi, c)];
          a += +isAny(ch);
          e += +isEnd(ch);
        }
      const ref = flow.byModel[m.id][f];
      assert(a === ref.anytime && e === ref.end, `${m.id}/${f} totals differ from flow.byModel`);
    }),
  );
  let initAny = 0;
  let initEnd = 0;
  for (let i = 0; i < TOTAL; i++) {
    if (!GOALS[cellOf(i).g].initiallyTrue) continue;
    initAny += +isAny(codes[i]);
    initEnd += +isEnd(codes[i]);
  }
  assert(initAny === flow.maintenance.anytime && initEnd === flow.maintenance.end, 'initially-true totals differ from flow');
  assert(any - initAny === flow.achievement.anytime && end - initEnd === flow.achievement.end, 'other totals differ from flow');
  for (const key of Object.keys(CONTRAST_FORMS) as ContrastKey[]) {
    const ref = study.contrasts[key];
    for (const outcome of ['anytime', 'end'] as const)
      for (const who of ['All', ...MODELS.map((m) => m.id)] as const) {
        const pub = ref[outcome]?.[who];
        if (!pub) continue;
        const mine = startDiffs(codes, key, outcome, who === 'All' ? undefined : (who as ModelId));
        assert(Math.abs(mean(mine.map((x) => x.d)) - pub.est) < 1e-9, `${key} ${outcome} ${who}: estimate differs`);
        if (!pub.starts) continue;
        assert(pub.starts.length === mine.length, `${key} ${outcome} ${who}: start count differs`);
        for (const p of pub.starts as StartDiff[]) {
          const x = mine.find((s) => s.scene === p.scene && s.slot === p.slot);
          assert(x && Math.abs(x.d - p.d) <= 6e-5, `${key} ${outcome} ${who} ${p.scene}/${p.slot}: start difference differs`);
        }
      }
    const [a, b] = CONTRAST_FORMS[key].map((f) => FORM_ORDER.indexOf(f as FormId));
    let aOnly = 0;
    let bOnly = 0;
    for (let m = 0; m < N.models; m++)
      for (let g = 0; g < N.goals; g++)
        for (let c = 0; c < N.starts; c++) {
          const x = isAny(codes[idx(m, g, a, c)]);
          const y = isAny(codes[idx(m, g, b, c)]);
          aOnly += +(x && !y);
          bOnly += +(y && !x);
        }
    assert(aOnly === ref.discordant.aOnly && bOnly === ref.discordant.bOnly, `${key}: discordant pairs differ`);
  }
}

/** Small, fast, seedable PRNG (mulberry32). */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One sign-flip draw: every start-level difference keeps or flips its sign with probability 1/2. */
export function flipDraw(d: ArrayLike<number>, rng: () => number, signs?: Int8Array) {
  let s = 0;
  for (let i = 0; i < d.length; i++) {
    const k = rng() < 0.5 ? -1 : 1;
    if (signs) signs[i] = k;
    s += k * d[i];
  }
  return s / d.length;
}

/** One bootstrap draw, stratified by scene: each scene's starts are resampled with replacement, within that scene. */
export function bootDraw(groups: number[][], rng: () => number, counts?: Int8Array[]) {
  let s = 0;
  let n = 0;
  groups.forEach((g, gi) => {
    counts?.[gi].fill(0);
    for (let k = 0; k < g.length; k++) {
      const j = Math.floor(rng() * g.length);
      if (counts) counts[gi][j]++;
      s += g[j];
      n++;
    }
  });
  return s / n;
}

/** Percentile with linear interpolation (numpy's default), on a sorted array. */
export function quantile(sorted: ArrayLike<number>, q: number) {
  const p = q * (sorted.length - 1);
  const lo = Math.floor(p);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
}

/** The phrase that ends the prefix TF and RF share. */
export const SHARED_CUE = ' so that';

/** Length of the prefix (through "so that") that a goal's TF and RF prompts share. */
export function sharedPrefix(goal: Pick<Goal, 'key' | 'prompts'>) {
  const s = goal.prompts.S.trim();
  const k = s.indexOf(SHARED_CUE);
  assert(k > 0, `${goal.key}: TF prompt has no "${SHARED_CUE.trim()}"`);
  const end = k + SHARED_CUE.length;
  assert(goal.prompts.I.trim().slice(0, end) === s.slice(0, end), `${goal.key}: TF and RF do not share a prefix`);
  return end;
}

export type MarkedToken = Token & { shared: boolean };
/** Mark the tokens (of a trimmed prompt) that fall inside the first `end` characters. */
export function markShared(tokens: Token[], end: number): MarkedToken[] {
  const out: MarkedToken[] = [];
  let pos = 0;
  for (const t of tokens) {
    const a = pos;
    pos += t.text.length;
    if (pos <= end) out.push({ ...t, shared: true });
    else if (a >= end) out.push({ ...t, shared: false });
    else out.push({ text: t.text.slice(0, end - a), kind: t.kind, shared: true }, { text: t.text.slice(end - a), kind: t.kind, shared: false });
  }
  return out;
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const word = (n: number) => WORDS[n] ?? String(n);
export const Word = (n: number) => {
  const w = word(n);
  return w[0].toUpperCase() + w.slice(1);
};
/** 1234 → "1,234". */
export const int = (n: number) => n.toLocaleString('en-US');

/** Points with a true minus sign and no plus sign (for interval bounds). */
export const pts = (x: number, d = 1) => `${x < 0 ? '−' : ''}${Math.abs(100 * x).toFixed(d)}`;
export const ci = ([a, b]: [number, number], d = 1) => `[${pts(a, d)}, ${pts(b, d)}]`;
/** Adjusted p as the paper prints it. */
export const pText = (p: number) => (p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`);

const REL_SHORT: Record<string, string> = { L: 'left of', R: 'right of', F: 'in front of', B: 'behind', supported_on: 'on top of' };
const first = (name: string) => name.split(' ')[0];
/** Row label for a goal within its scene, e.g. "right of" or "left on right" (bowls). */
export const relShort = (g: Goal) => REL_SHORT[g.relation] ?? `${first(g.moverName)} on ${first(g.referenceName)}`;
const REL_TINY: Record<string, string> = { L: 'left', R: 'right', F: 'front', B: 'behind', supported_on: 'on top' };
/** Narrow row label: "left", "on top", "L→R". */
export const relTiny = (g: Goal) =>
  REL_TINY[g.relation] ?? `${first(g.moverName)[0].toUpperCase()}→${first(g.referenceName)[0].toUpperCase()}`;

const REL_LONG: Record<string, string> = {
  L: 'to the left of',
  R: 'to the right of',
  F: 'in front of',
  B: 'behind',
  supported_on: 'on top of',
  stacked_in: 'stacked in',
};
/** "the mustard bottle to the right of the raisin box" (directions in the robot's frame). */
export const goalPhrase = (g: Goal) => `the ${g.moverName} ${REL_LONG[g.relation]} the ${g.referenceName}`;

/** Tick-0 still of a start. Every goal, wording and model in a scene restores the same state, so one episode serves. */
export const startImage = (sceneId: string, c: number) => {
  const g = GOALS.find((x) => x.scene.id === sceneId);
  assert(g, `no goal in scene ${sceneId}`);
  return epFile(epId(MODELS[0].id, sceneId, c, g.id, FORM_ORDER[0]), 'first.webp');
};

/** Objects in a scene, in the logged order, with their display names. */
export const sceneObjects = (sceneId: string) =>
  Object.keys(LAYOUT[sceneId].starts[0]).map((k) => ({ key: k, name: study.objects[k] ?? k }));
