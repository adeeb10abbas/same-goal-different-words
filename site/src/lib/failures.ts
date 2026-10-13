/**
 * Section 04 (Failures): build-time props, counts and the small layout helpers its figures share.
 *
 * Every number shown in the section is derived here or in the components from episodes.json, study.json and the
 * episode timelines. failuresProps() runs in the page frontmatter and throws if the data no longer match the totals
 * the paper reports in Appendix C, so a changed export cannot silently change the story.
 */
import type { Episode } from './media';
import { inRuns, type Runs, type Timeline } from './timeline';
import { FORM_ORDER, MODELS, sceneById, study, type FormId, type ModelId } from './study';

/** Appendix D.1: Nano, cube behind the bowl, start 1. */
export const WRONG_OBJECT = { tf: 'RWS-N3-S1-C01-B-S', rf: 'RWS-N3-S1-C01-B-I' } as const;
/** Appendix D.2: Edge, mustard bottle right of the raisin box, start 2 (the pair the hero plays). */
export const MUSTARD = { tf: 'RWS-E3-S4-C02-R-S', rf: 'RWS-E3-S4-C02-R-I' } as const;
/** Chosen for this website by LOST_RULE (checked at build time against episodes.json, in the browser against timelines). */
export const LOST = 'RWS-E3-S4-C06-R-D';

/** Pool for the placed-then-lost example: Nano and Edge in the mustard scene, placed at some point, failed the end
 *  check, goal not already true at reset. The pick is the pool member whose goal is not met at the final frame and whose
 *  last goal-holding interval is longest. */
export const LOST_RULE = { models: ['N3', 'E3'] as ModelId[], scene: 'S4' };
export const inLostPool = (e: Pick<Episode, 'm' | 's' | 'se' | 'sf' | 'init'>) =>
  LOST_RULE.models.includes(e.m) && e.s === LOST_RULE.scene && e.se === 1 && e.sf === 0 && e.init === 0;

export const MODEL_IDS: ModelId[] = MODELS.map((m) => m.id);

export const STAGES = ['no_mover_contact', 'contact_no_lift', 'lift_no_goal', 'goal_unstable', 'stable'] as const;
export type Stage = (typeof STAGES)[number];
export type StageCounts = Record<Stage, number>;

/** Raw counts for one model, wording and goal type. */
export interface Cell {
  n: number;
  /** Stable placement at any time. */
  se: number;
  /** Placement conditions met throughout the final second. */
  sf: number;
  stages: StageCounts;
}

/** `maintain`: goals already satisfied at reset; `achieve`: the other nine goals. */
export type Split = { achieve: Cell; maintain: Cell };
export type Agg = Record<ModelId, Record<FormId, Split>>;

export interface FailuresProps {
  pair: { tf: Episode; rf: Episode };
  mustard: { tf: Episode; rf: Episode };
  lost: Episode;
  /** Ids of the placed-then-lost selection pool, for the in-page audit of the pick. */
  pool: string[];
  agg: Agg;
}

const emptyStages = (): StageCounts => ({ no_mover_contact: 0, contact_no_lift: 0, lift_no_goal: 0, goal_unstable: 0, stable: 0 });
const emptyCell = (): Cell => ({ n: 0, se: 0, sf: 0, stages: emptyStages() });

export function addCells(a: Cell, b: Cell): Cell {
  const stages = emptyStages();
  for (const s of STAGES) stages[s] = a.stages[s] + b.stages[s];
  return { n: a.n + b.n, se: a.se + b.se, sf: a.sf + b.sf, stages };
}

function check(ok: boolean, what: string) {
  if (!ok) throw new Error(`Failures section: ${what}`);
}

/** Frames per second of a scene's recordings (ticks include frame 0). */
export function sceneFps(sceneId: string) {
  const sc = sceneById(sceneId);
  return (sc.ticks - 1) / sc.seconds;
}

/** Build-time props: the five episode records the section plays, the selection pool and compact counts. */
export function failuresProps(episodes: Episode[]): FailuresProps {
  const byId = new Map(episodes.map((e) => [e.id, e]));
  const ep = (id: string) => {
    const e = byId.get(id);
    if (!e) throw new Error(`Failures section: missing episode ${id}`);
    return e;
  };

  const pair = { tf: ep(WRONG_OBJECT.tf), rf: ep(WRONG_OBJECT.rf) };
  const mustard = { tf: ep(MUSTARD.tf), rf: ep(MUSTARD.rf) };
  const lost = ep(LOST);

  for (const p of [pair, mustard]) {
    check(p.tf.f === 'S' && p.rf.f === 'I', 'pairs must be target-first then reference-first');
    check(p.tf.m === p.rf.m && p.tf.s === p.rf.s && p.tf.c === p.rf.c && p.tf.g === p.rf.g, 'pair rollouts must share model, scene, start and goal');
  }
  for (const e of [pair.tf, pair.rf, mustard.tf, mustard.rf, lost])
    check(Number.isInteger(sceneFps(e.s)) && e.n === sceneById(e.s).ticks, `unexpected frame count for ${e.id}`);
  // Appendix D.1 as written: RF reaches a stable placement (the 25.4 s snapshot) that fails the end check while its
  // reference moved; TF never passes the check.
  check(pair.rf.se === 1 && pair.rf.sf === 0 && pair.rf.refMoved === 1 && pair.rf.tStableDone != null, 'D.1 reference-first outcome changed');
  check(pair.tf.se === 0 && pair.tf.sf === 0, 'D.1 target-first outcome changed');
  check(Math.abs((pair.rf.tStableDone ?? 0) - 25.4) < 0.05, 'D.1 snapshot is no longer at 25.4 s');

  const pool = episodes.filter(inLostPool).map((e) => e.id).sort();
  check(pool.includes(LOST), 'the placed-then-lost example is no longer in its selection pool');

  const agg = {} as Agg;
  for (const m of MODEL_IDS) {
    agg[m] = {} as Record<FormId, Split>;
    for (const f of FORM_ORDER) agg[m][f] = { achieve: emptyCell(), maintain: emptyCell() };
  }
  for (const e of episodes) {
    const c = agg[e.m]?.[e.f]?.[e.init ? 'maintain' : 'achieve'];
    check(!!c, `unexpected model or wording in ${e.id}`);
    check(!(e.sf && !e.se), `${e.id} passes the end check without an any-time placement`);
    check((STAGES as readonly string[]).includes(e.stage), `${e.id} has unknown stage ${e.stage}`);
    c.n++;
    c.se += e.se;
    c.sf += e.sf;
    c.stages[e.stage as Stage]++;
  }

  // Appendix C totals, and the per-cell counts study.json exports.
  const F = study.flow;
  const tot = (pick: (s: Split) => Cell) => {
    let acc = emptyCell();
    for (const m of MODEL_IDS) for (const f of FORM_ORDER) acc = addCells(acc, pick(agg[m][f]));
    return acc;
  };
  const a = tot((s) => s.achieve);
  const mt = tot((s) => s.maintain);
  const all = addCells(a, mt);
  check(all.n === F.total && all.se === F.anytime && all.sf === F.end, 'overall counts differ from study.flow');
  check(a.n === F.achievement.n && a.se === F.achievement.anytime && a.sf === F.achievement.end, 'achievement counts differ');
  check(mt.n === F.maintenance.n && mt.se === F.maintenance.anytime && mt.sf === F.maintenance.end, 'maintenance counts differ');
  for (const s of STAGES) check(all.stages[s] === (F.stages[s] ?? 0), `stage ${s} differs from study.flow`);
  for (const m of MODEL_IDS)
    for (const f of FORM_ORDER) {
      const c = addCells(agg[m][f].achieve, agg[m][f].maintain);
      const ref = F.byModel[m][f];
      check(c.n === ref.n && c.se === ref.anytime && c.sf === ref.end, `${m}/${f} counts differ`);
      for (const s of STAGES) check(c.stages[s] === (ref.stages[s] ?? 0), `${m}/${f} stage ${s} differs`);
    }

  // Scene-balanced rates: the overall values are the mean of the nine model × wording cells.
  for (const excl of [false, true]) {
    const r = balanced('all', 'all', excl);
    const ref = excl ? study.rates.excl : study.rates;
    check(Math.abs(r.anytime - ref.anytime) < 1e-9 && Math.abs(r.end - ref.end) < 1e-9, 'scene-balanced overall rates differ');
  }

  return { pair, mustard, lost, pool, agg };
}

// ---------------------------------------------------------------- selections

export type ModelSel = ModelId | 'all';
export type FormSel = FormId | 'all';

export const cellsOf = (m: ModelSel, f: FormSel) =>
  (m === 'all' ? MODEL_IDS : [m]).flatMap((mm) => (f === 'all' ? FORM_ORDER : [f]).map((ff) => [mm, ff] as [ModelId, FormId]));

export function sumSplit(agg: Agg, m: ModelSel, f: FormSel): Split {
  let achieve = emptyCell();
  let maintain = emptyCell();
  for (const [mm, ff] of cellsOf(m, f)) {
    achieve = addCells(achieve, agg[mm][ff].achieve);
    maintain = addCells(maintain, agg[mm][ff].maintain);
  }
  return { achieve, maintain };
}

/** Scene-balanced rates for a selection: the mean over its model × wording cells (as the paper's figure averages). */
export function balanced(m: ModelSel, f: FormSel, excl: boolean) {
  const src = excl ? study.rates.byModelFormExcl : study.rates.byModelForm;
  const cells = cellsOf(m, f);
  let anytime = 0;
  let end = 0;
  for (const [mm, ff] of cells) {
    anytime += src[mm][ff].anytime;
    end += src[mm][ff].end;
  }
  return { anytime: anytime / cells.length, end: end / cells.length };
}

// ---------------------------------------------------------------- the any-time / end flow

/** Paths through the flow: goal type at reset (m = already true, a = to achieve) × outcome (k = still placed at the
 *  end, l = placed then lost, n = never placed). */
export type PathKey = 'mk' | 'ml' | 'mn' | 'ak' | 'al' | 'an';
export type NodeKey = 'all' | 'maintain' | 'achieve' | 'placed' | 'never' | 'kept' | 'lost';
export type PathValues = Record<PathKey, number>;

export const PATHS: { key: PathKey; init: 'maintain' | 'achieve'; end: 'kept' | 'lost' | 'never' }[] = [
  { key: 'mk', init: 'maintain', end: 'kept' },
  { key: 'ml', init: 'maintain', end: 'lost' },
  { key: 'mn', init: 'maintain', end: 'never' },
  { key: 'ak', init: 'achieve', end: 'kept' },
  { key: 'al', init: 'achieve', end: 'lost' },
  { key: 'an', init: 'achieve', end: 'never' },
];

export function pathValues(s: Split): PathValues {
  return {
    mk: s.maintain.sf,
    ml: s.maintain.se - s.maintain.sf,
    mn: s.maintain.n - s.maintain.se,
    ak: s.achieve.sf,
    al: s.achieve.se - s.achieve.sf,
    an: s.achieve.n - s.achieve.se,
  };
}

const COLUMNS: NodeKey[][] = [['all'], ['maintain', 'achieve'], ['placed', 'never'], ['kept', 'lost']];
/** Order of the path slots inside each node, top to bottom. Placements are grouped by their end outcome so the last
 *  split into kept and lost does not cross. */
const SLOTS: Record<NodeKey, PathKey[]> = {
  all: ['mk', 'ml', 'mn', 'ak', 'al', 'an'],
  maintain: ['mk', 'ml', 'mn'],
  achieve: ['ak', 'al', 'an'],
  placed: ['mk', 'ak', 'ml', 'al'],
  never: ['mn', 'an'],
  kept: ['mk', 'ak'],
  lost: ['ml', 'al'],
};
const ROUTE: Record<PathKey, NodeKey[]> = {
  mk: ['all', 'maintain', 'placed', 'kept'],
  ml: ['all', 'maintain', 'placed', 'lost'],
  mn: ['all', 'maintain', 'never'],
  ak: ['all', 'achieve', 'placed', 'kept'],
  al: ['all', 'achieve', 'placed', 'lost'],
  an: ['all', 'achieve', 'never'],
};
const COL_OF: Record<NodeKey, number> = { all: 0, maintain: 1, achieve: 1, placed: 2, never: 2, kept: 3, lost: 3 };

export const nodeValue = (v: PathValues, n: NodeKey) => SLOTS[n].reduce((s, p) => s + v[p], 0);

export interface FlowNode {
  key: NodeKey;
  col: number;
  x: number;
  y: number;
  h: number;
  value: number;
}
export interface FlowLink {
  key: PathKey;
  d: string;
  width: number;
  value: number;
}

/**
 * Column layout. `xs[c]` is the left edge of column c, or null to leave the column out. Every shown column stacks its
 * nodes from `top` with `gap` between them, on one scale for the whole drawing; single-node columns are centred.
 * Links are centre lines through every node of a path, stroked at their thickness (as d3-shape's linkHorizontal
 * draws Sankey links), so one stroke can be drawn on from left to right.
 */
export function flowLayout(v: PathValues, xs: (number | null)[], nodeW: number, top: number, height: number, gap: number) {
  const total = nodeValue(v, 'all');
  const k = total > 0 ? (height - gap) / total : 0;
  const nodes = new Map<NodeKey, FlowNode>();
  COLUMNS.forEach((col, c) => {
    const x = xs[c];
    if (x == null) return;
    let y = col.length === 1 ? top + (height - nodeValue(v, col[0]) * k) / 2 : top;
    for (const key of col) {
      const value = nodeValue(v, key);
      nodes.set(key, { key, col: c, x, y, h: value * k, value });
      y += value * k + gap;
    }
  });
  const slotY = (n: NodeKey, p: PathKey) => {
    let y = nodes.get(n)!.y;
    for (const q of SLOTS[n]) {
      if (q === p) return y + (v[p] * k) / 2;
      y += v[q] * k;
    }
    return y;
  };
  const links: FlowLink[] = [];
  for (const p of PATHS) {
    const route = ROUTE[p.key].filter((n) => nodes.has(n));
    if (v[p.key] <= 0 || route.length < 2) continue;
    let d = '';
    let prev: { x: number; y: number } | null = null;
    for (const n of route) {
      const node = nodes.get(n)!;
      const y = slotY(n, p.key);
      if (!prev) d += `M${r2(node.x)},${r2(y)}`;
      else {
        const xm = (prev.x + node.x) / 2;
        d += `C${r2(xm)},${r2(prev.y)} ${r2(xm)},${r2(y)} ${r2(node.x)},${r2(y)}`;
      }
      d += `H${r2(node.x + nodeW)}`;
      prev = { x: node.x + nodeW, y };
    }
    links.push({ key: p.key, d, width: v[p.key] * k, value: v[p.key] });
  }
  return { nodes: [...nodes.values()], links, k };
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export const NODE_COL = COL_OF;

/**
 * Vertical label placement within one column: keep each label as close as possible to its target centre without
 * overlapping its neighbours, inside [lo, hi].
 */
export function relax(items: { c: number; h: number }[], lo: number, hi: number, pad = 4): number[] {
  const order = items.map((_, i) => i).sort((a, b) => items[a].c - items[b].c);
  const top = new Array<number>(items.length);
  let floor = lo;
  for (const i of order) {
    top[i] = Math.max(floor, items[i].c - items[i].h / 2);
    floor = top[i] + items[i].h + pad;
  }
  let ceil = hi;
  for (const i of [...order].reverse()) {
    top[i] = Math.min(top[i], ceil - items[i].h);
    ceil = top[i] - pad;
  }
  for (const i of order) top[i] = Math.max(lo, top[i]);
  return top;
}

// ---------------------------------------------------------------- timelines

export type Predicate = 'relation' | 'support' | 'detached';
export const PREDICATES: Predicate[] = ['relation', 'support', 'detached'];

export const tickAt = (t: number, fps: number, n: number) => Math.max(0, Math.min(n - 1, Math.round(t * fps)));
/** A clock time that shows frame `tick` and rounds back to it. */
export const timeOfTick = (tick: number, fps: number) => (tick + 0.3) / fps;

export const runAt = (runs: Runs, i: number) => runs.find(([a, b]) => i >= a && i <= b) ?? null;

/** Stable-placement hold at tick i: seconds the target has been still with the goal met, and whether it has lasted the
 *  required interval. */
export function holdAt(tl: Timeline, i: number) {
  const run = runAt(tl.flags.stable, i);
  const need = study.settings.scoring.holdS;
  if (!run) return { held: 0, done: false, need };
  const held = (i - run[0]) / tl.fps;
  return { held: Math.min(held, need), done: held >= need - 1e-9, need };
}

export function predicatesAt(tl: Timeline, i: number) {
  const f = tl.flags;
  return {
    relation: inRuns(f.relation, i),
    support: inRuns(f.support, i),
    detached: inRuns(f.detached, i),
    goal: inRuns(f.goal, i),
  };
}

/** What the gripper is touching at tick i (not part of the score). */
export function gripAt(tl: Timeline, i: number): 'mover' | 'reference' | 'other' | null {
  const f = tl.flags;
  if (inRuns(f.grip_mover, i)) return 'mover';
  if (inRuns(f.grip_reference, i)) return 'reference';
  for (const runs of Object.values(f.grip_other ?? {})) if (inRuns(runs, i)) return 'other';
  return null;
}

/** The placement is lost for good when the goal stops holding after its last interval and never returns. */
export function lossOf(tl: Timeline) {
  const last = tl.flags.goal.at(-1);
  if (!last || last[1] >= tl.n - 1) return null;
  const tick = last[1] + 1;
  const p = predicatesAt(tl, tick);
  return { tick, t: tick / tl.fps, held: [last[0], last[1]] as [number, number], failed: PREDICATES.filter((k) => !p[k]) };
}

// ---------------------------------------------------------------- formatting

export const sec = (t: number) => `${t.toFixed(1)}\u00a0s`;
export const cm = (m: number) => `${(100 * m).toFixed(1)}\u00a0cm`;
export const share = (a: number, b: number, d = 1) => (b > 0 ? `${((100 * a) / b).toFixed(d)}%` : '–');
export const signed = (x: number) => (x > 0 ? `+${x}` : x < 0 ? `\u2212${-x}` : '0');
