/**
 * Rollout explorer: facets, faceted counts, paired rows, sorting and the URL contract for /explore/.
 *
 * Query string (all keys optional, multi-values comma-separated, values in option order):
 *   m=N3,E3,F3  s=S1,S3,S4,S5  g=S4-R,…  f=D,S,I  o=kept,lost,never  st=<stage>,…  init=0|1
 *   ev=wrong,release,none  ref=0|1  x=diff,same  view=pairs|grid  sort=id|time|ref
 * Hash: #<episode id> opens the player; #compare=<id without the form suffix> opens the three-up comparison.
 */
import { study, MODELS, SCENES, GOALS, FORM_ORDER, FORM_SHORT, FORM_NAME, MODEL_SHORT, outcomeOf, OUTCOME_LABEL, STAGE_LABEL } from './study';
import type { FormId, Goal, Scene, Outcome } from './study';
import type { Episode } from './media';

export const TOTAL: number = study.flow.total;
export const HZ: number = study.settings.hz;
export const REF_CM: number = study.settings.scoring.referenceMovedCm;

export type G = Goal & { scene: Scene };
export type FacetKey = 'm' | 'f' | 's' | 'g' | 'o' | 'st' | 'x' | 'init' | 'ev' | 'ref';
export type View = 'pairs' | 'grid';
export type SortKey = 'id' | 'time' | 'ref';
export type Sel = Partial<Record<FacetKey, string[]>>;

export interface Opt {
  v: string;
  label: string;
  /** Accessible and tooltip name when the visible label is abbreviated. */
  name?: string;
  /** Sub-heading the option sits under (goals by scene). */
  group?: string;
}

export interface Facet {
  key: FacetKey;
  title: string;
  /** Short name used in the active-filter chips. */
  chip: string;
  aria: string;
  layout: 'chips' | 'list' | 'forms' | 'goals' | 'outcomes';
  opts: Opt[];
}

// ------------------------------------------------------------------------------------------------ goal labels
const REL_WORDS: Record<string, string> = { L: 'left of', R: 'right of', F: 'in front of', B: 'behind', supported_on: 'on', stacked_in: 'onto' };
const REL_SHORT: Record<string, string> = { L: 'left of', R: 'right of', F: 'in front of', B: 'behind', supported_on: 'on top' };

export interface GoalParts {
  mover: string;
  rel: string;
  ref: string;
}

/** "Mustard bottle right of raisin box" → mover / relation / reference, so the label can carry the object colours. */
function splitLabel(g: G): GoalParts {
  const rel = REL_WORDS[g.relation];
  const k = rel ? g.label.indexOf(` ${rel} `) : -1;
  if (k < 1) throw new Error(`explore: cannot split goal label "${g.label}"`);
  return { mover: g.label.slice(0, k), rel, ref: g.label.slice(k + rel.length + 2) };
}

/** Relation as a chip under its scene heading: "right of", "on top", "left onto right". */
function relShort(g: G, p: GoalParts) {
  if (g.relation === 'stacked_in') return `${p.mover.split(' ')[0].toLowerCase()} onto ${p.ref.split(' ')[0].toLowerCase()}`;
  const r = REL_SHORT[g.relation];
  if (!r) throw new Error(`explore: no short relation for ${g.key}`);
  return r;
}

export interface GoalInfo {
  goal: G;
  parts: GoalParts;
  /** Relation only, e.g. "right of". */
  rel: string;
  /** Scene word and relation, e.g. "mustard · right of". */
  compact: string;
}

export const GOAL_INFO: Record<string, GoalInfo> = Object.fromEntries(
  GOALS.map((g) => {
    const parts = splitLabel(g);
    const rel = relShort(g, parts);
    return [g.key, { goal: g, parts, rel, compact: `${g.scene.short.toLowerCase()} · ${rel}` }];
  }),
);

// ------------------------------------------------------------------------------------------------ facets
export const STAGES = Object.keys(STAGE_LABEL);
export const OUTCOMES: Outcome[] = ['kept', 'lost', 'never'];
export const EVENT_LABEL: Record<string, string> = { wrong: 'Wrong object', release: 'Contradictory release', none: 'None' };
export const REF_TITLE = `Reference moved ≥\u00a0${REF_CM}\u00a0cm`;

export const FACETS: Facet[] = [
  { key: 'm', title: 'Model', chip: 'Model', aria: 'Filter by model', layout: 'chips', opts: MODELS.map((m) => ({ v: m.id, label: m.short, name: m.name })) },
  {
    key: 'f',
    title: 'Wording',
    chip: 'Wording',
    aria: 'Filter by wording',
    layout: 'forms',
    opts: FORM_ORDER.map((f) => ({ v: f, label: FORM_SHORT[f], name: FORM_NAME[f] })),
  },
  { key: 's', title: 'Scene', chip: 'Scene', aria: 'Filter by scene', layout: 'chips', opts: SCENES.map((s) => ({ v: s.id, label: s.short, name: s.title })) },
  {
    key: 'g',
    title: 'Goal',
    chip: 'Goal',
    aria: 'Filter by goal',
    layout: 'goals',
    opts: GOALS.map((g) => ({ v: g.key, label: GOAL_INFO[g.key].rel, name: g.label, group: g.scene.id })),
  },
  { key: 'o', title: 'Outcome', chip: 'Outcome', aria: 'Filter by outcome', layout: 'outcomes', opts: OUTCOMES.map((o) => ({ v: o, label: OUTCOME_LABEL[o] })) },
  { key: 'st', title: 'Furthest stage', chip: 'Stage', aria: 'Filter by furthest stage', layout: 'list', opts: STAGES.map((s) => ({ v: s, label: STAGE_LABEL[s] })) },
  {
    key: 'x',
    title: 'Across the three wordings',
    chip: 'Across wordings',
    aria: 'Filter by agreement across wordings',
    layout: 'list',
    opts: [
      { v: 'diff', label: 'Outcome differs' },
      { v: 'same', label: 'Same outcome' },
    ],
  },
  {
    key: 'init',
    title: 'Goal true at the start',
    chip: 'Goal true at start',
    aria: 'Filter by goal true at the start',
    layout: 'chips',
    opts: [
      { v: '1', label: 'Yes' },
      { v: '0', label: 'No' },
    ],
  },
  {
    key: 'ev',
    title: 'Detected error in the forecast window',
    chip: 'Forecast-window error',
    aria: 'Filter by detected error in the forecast window',
    layout: 'list',
    opts: ['wrong', 'release', 'none'].map((v) => ({ v, label: EVENT_LABEL[v] })),
  },
  {
    key: 'ref',
    title: REF_TITLE,
    chip: 'Reference moved',
    aria: 'Filter by reference movement',
    layout: 'chips',
    opts: [
      { v: '1', label: 'Yes' },
      { v: '0', label: 'No' },
    ],
  },
];
export const FACET: Record<FacetKey, Facet> = Object.fromEntries(FACETS.map((f) => [f.key, f])) as Record<FacetKey, Facet>;

// ------------------------------------------------------------------------------------------------ records and rows
export interface Rec {
  e: Episode;
  /** Position in the canonical order: model, scene, start, goal, wording. */
  i: number;
  o: Outcome;
  goal: G;
  /** Paired-set key: the id without the wording suffix, e.g. RWS-E3-S4-C02-R. */
  row: string;
  v: Record<FacetKey, string>;
}

export interface PairRow {
  key: string;
  i: number;
  goal: G;
  /** Direct, target-first and reference-first, in that order. */
  cells: [Rec, Rec, Rec];
  diff: boolean;
}

export interface Data {
  recs: Rec[];
  rows: PairRow[];
  byId: Map<string, Rec>;
  byRow: Map<string, PairRow>;
  starts: number;
}

export const rowKey = (id: string) => id.replace(/-[DSI]$/, '');

export function build(eps: Episode[]): Data {
  if (eps.length !== TOTAL) throw new Error(`explore: expected ${TOTAL} episodes, got ${eps.length}`);
  const mi = Object.fromEntries(MODELS.map((m, k) => [m.id, k]));
  const si = Object.fromEntries(SCENES.map((s, k) => [s.id, k]));
  const gi = Object.fromEntries(GOALS.map((g, k) => [g.key, k]));
  const fi: Record<string, number> = { D: 0, S: 1, I: 2 };
  const sorted = [...eps].sort(
    (a, b) => mi[a.m] - mi[b.m] || si[a.s] - si[b.s] || a.c - b.c || gi[`${a.s}-${a.g}`] - gi[`${b.s}-${b.g}`] || fi[a.f] - fi[b.f],
  );
  const recs: Rec[] = sorted.map((e, i) => {
    if (e.evWrong && e.evRelease) throw new Error(`explore: ${e.id} has both forecast events`);
    if (!!e.ev !== !!(e.evWrong || e.evRelease)) throw new Error(`explore: ${e.id} event flags disagree`);
    if (!(e.stage in STAGE_LABEL)) throw new Error(`explore: ${e.id} has unknown stage ${e.stage}`);
    const goal = GOALS.find((g) => g.key === `${e.s}-${e.g}`);
    if (!goal) throw new Error(`explore: ${e.id} has unknown goal`);
    const o = outcomeOf(e);
    return {
      e,
      i,
      o,
      goal,
      row: rowKey(e.id),
      v: {
        m: e.m,
        f: e.f,
        s: e.s,
        g: goal.key,
        o,
        st: e.stage,
        x: '',
        init: e.init ? '1' : '0',
        ev: e.evWrong ? 'wrong' : e.evRelease ? 'release' : 'none',
        ref: e.refMoved ? '1' : '0',
      },
    };
  });
  const rows: PairRow[] = [];
  const byRow = new Map<string, PairRow>();
  for (let k = 0; k < recs.length; k += 3) {
    const cells = recs.slice(k, k + 3) as [Rec, Rec, Rec];
    const key = cells[0].row;
    if (cells.some((c, j) => c.row !== key || c.e.f !== FORM_ORDER[j])) throw new Error(`explore: incomplete paired set at ${key}`);
    const diff = new Set(cells.map((c) => c.o)).size > 1;
    for (const c of cells) c.v.x = diff ? 'diff' : 'same';
    const row: PairRow = { key, i: rows.length, goal: cells[0].goal, cells, diff };
    rows.push(row);
    byRow.set(key, row);
  }
  if (rows.length * 3 !== TOTAL) throw new Error(`explore: expected ${TOTAL / 3} paired sets, got ${rows.length}`);
  return { recs, rows, byId: new Map(recs.map((r) => [r.e.id, r])), byRow, starts: Math.max(...eps.map((e) => e.c)) };
}

// ------------------------------------------------------------------------------------------------ filtering
type SetSel = [FacetKey, Set<string>][];
const active = (sel: Sel): SetSel => FACETS.filter((f) => sel[f.key]?.length).map((f) => [f.key, new Set(sel[f.key])]);

export function matcher(sel: Sel) {
  const A = active(sel);
  return (r: Rec) => A.every(([k, s]) => s.has(r.v[k]));
}

/** For every facet option: how many rollouts would match if that facet alone were replaced by this option. */
export function facetCounts(recs: Rec[], sel: Sel) {
  const A = active(sel);
  const counts = Object.fromEntries(FACETS.map((f) => [f.key, Object.fromEntries(f.opts.map((o) => [o.v, 0]))])) as Record<
    FacetKey,
    Record<string, number>
  >;
  let total = 0;
  for (const r of recs) {
    let miss: FacetKey | null = null;
    let n = 0;
    for (const [k, s] of A)
      if (!s.has(r.v[k])) {
        miss = k;
        if (++n > 1) break;
      }
    if (n === 0) {
      total++;
      for (const f of FACETS) counts[f.key][r.v[f.key]]++;
    } else if (n === 1) counts[miss!][r.v[miss!]]++;
  }
  return { counts, total };
}

export const nActive = (sel: Sel) => FACETS.filter((f) => sel[f.key]?.length).length;

// ------------------------------------------------------------------------------------------------ sorting
export const SORTS: { v: SortKey; label: string }[] = [
  { v: 'id', label: 'Model, scene, start' },
  { v: 'time', label: 'First stable placement' },
  { v: 'ref', label: 'Reference displacement' },
];

const tKey = (t: number | null) => (t == null ? Infinity : t);

/** Primary sort key of one rollout (ties fall back to the canonical index). Never-placed rollouts sort last by time. */
export const recSortKey = (r: Rec, sort: SortKey) => (sort === 'time' ? tKey(r.e.tStable) : sort === 'ref' ? -r.e.refMax : 0);

/** Primary sort key of a paired set, from its matching cells: earliest placement or largest reference displacement. */
export function rowSortKey(row: PairRow, on: readonly boolean[], sort: SortKey) {
  if (sort === 'id') return 0;
  const ks = row.cells.filter((_, j) => on[j]).map((c) => recSortKey(c, sort));
  return Math.min(...ks);
}

/** Lexicographic order of [key, canonical index, …] tuples; equal infinite keys fall through to the next field. */
export const cmpPos = (a: number[], b: number[]) => {
  for (let k = 0; k < a.length; k++) {
    const d = a[k] - b[k];
    if (d) return d;
  }
  return 0;
};

export function sortRecs(list: Rec[], sort: SortKey) {
  if (sort === 'id') return list;
  return list
    .map((r) => ({ r, k: recSortKey(r, sort) }))
    .sort((a, b) => cmpPos([a.k, a.r.i], [b.k, b.r.i]))
    .map((a) => a.r);
}

/** A paired set as shown in the Pairs view: which of its three cells match the filters. */
export interface PairItem {
  row: PairRow;
  on: [boolean, boolean, boolean];
}

/** Rows ordered by their matching cells: earliest placement or largest reference displacement among them. */
export function sortRows(list: PairItem[], sort: SortKey) {
  if (sort === 'id') return list;
  return list
    .map((x) => ({ x, k: rowSortKey(x.row, x.on, sort) }))
    .sort((a, b) => cmpPos([a.k, a.x.row.i], [b.k, b.x.row.i]))
    .map((a) => a.x);
}

// ------------------------------------------------------------------------------------------------ URL
export interface UrlState {
  sel: Sel;
  view: View;
  sort: SortKey;
}

export function parseQuery(search: string): UrlState {
  const q = new URLSearchParams(search);
  const sel: Sel = {};
  for (const f of FACETS) {
    const raw = q.get(f.key);
    if (!raw) continue;
    const want = new Set(raw.split(',').map((x) => x.trim()));
    const vals = f.opts.map((o) => o.v).filter((v) => want.has(v));
    if (vals.length) sel[f.key] = vals;
  }
  const view: View = q.get('view') === 'grid' ? 'grid' : 'pairs';
  const s = q.get('sort');
  const sort: SortKey = s === 'time' || s === 'ref' ? s : 'id';
  return { sel, view, sort };
}

export function toQuery({ sel, view, sort }: UrlState) {
  const parts: string[] = [];
  for (const f of FACETS) {
    const vals = sel[f.key];
    if (vals?.length) parts.push(`${f.key}=${f.opts.map((o) => o.v).filter((v) => vals.includes(v)).join(',')}`);
  }
  if (view !== 'pairs') parts.push(`view=${view}`);
  if (sort !== 'id') parts.push(`sort=${sort}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export type HashState = { kind: 'ep'; id: string } | { kind: 'compare'; row: string } | null;

export function parseHash(hash: string): HashState {
  const h = decodeURIComponent(hash.replace(/^#/, ''));
  if (h.startsWith('compare=')) {
    const row = h.slice(8);
    return /^RWS-[A-Z0-9]+-S\d-C\d\d-[A-Z]+$/.test(row) ? { kind: 'compare', row } : null;
  }
  return /^RWS-[A-Z0-9]+-S\d-C\d\d-[A-Z]+-[DSI]$/.test(h) ? { kind: 'ep', id: h } : null;
}

// ------------------------------------------------------------------------------------------------ labels
export const sec = (t: number | null | undefined) => (t == null ? '—' : `${t.toFixed(1)}\u00a0s`);
export const cm = (m: number) => `${(m * 100).toFixed(1)}\u00a0cm`;

export const OUTCOME_SHORT: Record<Outcome, string> = { kept: 'Kept', lost: 'Lost', never: 'Never' };

/** The requested relation already held, stably, when the episode began (its stable window opens on the first ticks). */
export const heldAtStart = (e: Episode) => !!e.init && e.tStable != null && e.tStable < 0.2;

/** Status chip text: outcome and, when placed, the time of the first stable placement. */
export function statusText(e: Episode, o: Outcome, short = false) {
  if (o === 'never') return short ? 'Never' : 'Never placed';
  return short ? OUTCOME_SHORT[o] : `${OUTCOME_SHORT[o]} · ${heldAtStart(e) ? 'at start' : sec(e.tStable)}`;
}

export function verdict(e: Episode) {
  const o = outcomeOf(e);
  const placed = heldAtStart(e) ? 'Held from the start' : `Placed at ${sec(e.tStable)}`;
  if (o === 'kept') return { cls: o, text: `${placed}, kept to the end` };
  if (o === 'lost') return { cls: o, text: `${placed}, then lost` };
  return { cls: o, text: STAGE_LABEL[e.stage] ?? OUTCOME_LABEL.never };
}

export const modelShort = (m: string) => MODEL_SHORT[m];

/** The forecast's VLM labels (paper App. E), in display order. */
export const FC_FIELDS: { key: 'role' | 'dir' | 'rel' | 'release' | 'hall'; label: string; values: Record<string, string> }[] = [
  {
    key: 'role',
    label: 'Moving object',
    values: { mover: 'The target', reference: 'The reference', other: 'Another object', multiple: 'Several objects', none: 'None', unknown: 'Unknown' },
  },
  {
    key: 'dir',
    label: 'Motion direction',
    values: {
      up_only: 'Upward only',
      goal_direction: 'Toward the goal',
      lateral: 'Sideways',
      other_direction: 'Another direction',
      none: 'No motion',
      unknown: 'Unknown',
    },
  },
  {
    key: 'rel',
    label: 'Final relation, against the task',
    values: { goal: 'Requested relation', alternative_goal: 'Another registered relation', not_goal: 'Neither', unknown: 'Unknown' },
  },
  { key: 'release', label: 'Possible release', values: { yes: 'Yes', no: 'No', unknown: 'Unknown' } },
  { key: 'hall', label: 'Hallucinated object', values: { yes: 'Yes', no: 'No', unknown: 'Unknown' } },
];

/** Curated episodes whose whole-episode forecast track (dream.mp4) was encoded. */
export const DREAM = new Set(
  [
    'E3-S1-C01-B-D',
    'E3-S4-C02-R-D',
    'E3-S4-C02-R-I',
    'E3-S4-C02-R-S',
    'F3-S1-C01-B-D',
    'F3-S1-C02-L-I',
    'F3-S1-C02-L-S',
    'F3-S4-C04-R-I',
    'F3-S4-C04-R-S',
    'F3-S5-C02-LR-I',
    'F3-S5-C02-LR-S',
    'N3-S1-C01-B-I',
    'N3-S1-C01-B-S',
    'N3-S4-C02-L-I',
    'N3-S4-C02-L-S',
    'N3-S4-C02-R-I',
    'N3-S4-C02-R-S',
  ].map((x) => `RWS-${x}`),
);

export { FORM_ORDER, FORM_SHORT, FORM_NAME, OUTCOME_LABEL, STAGE_LABEL };
export type { FormId, Outcome };
