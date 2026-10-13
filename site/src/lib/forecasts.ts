/**
 * Section 06 (Forecasts): label vocabularies, typed access to `study.forecast`, and a compact per-episode code so the
 * forecast picker can address all 864 forecasts without shipping episodes.json to the client.
 */
import { study, MODELS, GOALS, SCENES, FORM_ORDER, outcomeOf, type FormId, type ModelId, type Outcome } from './study';
import { epId, type Episode } from './media';

export type FieldKey =
  | 'fc_direction'
  | 'fc_visible_final_relation'
  | 'fc_moving_object_role'
  | 'fc_possible_release'
  | 'fc_hallucinated_object'
  | 'fc_missing_object';
export type Counts = Record<string, number>;

export interface ForecastStudy {
  labels: Record<FieldKey, Counts>;
  labelsByModel: Record<ModelId, Record<FieldKey, Counts>>;
  events: {
    model: ModelId;
    scene: string;
    valid: number;
    event_scorable: number;
    event_positive: number;
    wrong_object: number;
    contradictory_release: number;
  }[];
  /** Detected errors (either kind) and forecasts, by the moving object the labels named. */
  roleEvents: { reference: [number, number]; mover: [number, number] };
  /** [field, % agreement, Cohen's kappa] between the two annotators on the 864 selected forecasts. */
  agreement: [string, number, number][];
  utility: {
    rows: { model: 'All' | ModelId; events: number; n: number; baseline: number; video: number; delta: number }[];
    ci: [number, number];
  };
  reported: {
    allFieldsAgree: number;
    startForecasts: number;
    startKappaMax: number;
    controls: { missingIndicators: number; noMotion: number };
    permutation: { seeds: number; mean: number; p025: number; p975: number };
    selection: { gripperCm: number; fallbacks: number; actions: number; hz: number; frames: number };
    events: { contactS: number; displacementCm: number; supportedS: number };
    classifier: { C: number; folds: number };
    annotators: [string, string];
  };
}

export const FC = study.forecast as ForecastStudy;
export const SEL = FC.reported.selection;
/** Initial-state slots per scene, and forecasts in the study (one per episode). */
export const STARTS = study.settings.stats.starts / SCENES.length;
export const N_ALL = MODELS.length * GOALS.length * FORM_ORDER.length * STARTS;

if (N_ALL !== 864 || STARTS !== 8) throw new Error(`forecasts: unexpected design size ${N_ALL} / ${STARTS}`);
if (SEL.actions !== study.settings.actionsPerRequest || SEL.hz !== study.settings.hz)
  throw new Error('forecasts: selection constants disagree with the policy settings');

/** Label vocabularies, in display order. Codes are the annotation values; names are the page's wording. */
export const VOCAB = {
  dir: [
    ['up_only', 'Up only'],
    ['goal_direction', 'Goal direction'],
    ['lateral', 'Lateral'],
    ['other_direction', 'Other direction'],
    ['none', 'None'],
    ['unknown', 'Unknown'],
  ],
  rel: [
    ['goal', 'Requested relation'],
    ['alternative_goal', 'Another registered relation'],
    ['not_goal', 'Neither'],
    ['unknown', 'Unknown'],
  ],
  role: [
    ['mover', 'Target'],
    ['reference', 'Reference'],
    ['none', 'None'],
    ['other', 'Other object'],
    ['multiple', 'Several objects'],
    ['unknown', 'Unknown'],
  ],
  yn: [
    ['no', 'No'],
    ['yes', 'Yes'],
    ['unknown', 'Unknown'],
  ],
} as const satisfies Record<string, readonly (readonly [string, string])[]>;

export type VocabKey = keyof typeof VOCAB;

const REL_SHORT: Record<string, string> = {
  L: 'left',
  R: 'right',
  F: 'in front',
  B: 'behind',
  TOP: 'on top',
  LR: 'left onto right',
  RL: 'right onto left',
};
/** Compact goal name for chips, e.g. "Mustard right" for "Mustard bottle right of raisin box". */
export function goalShort(key: string) {
  const g = GOALS.find((x) => x.key === key);
  const rel = REL_SHORT[key.split('-')[1]];
  if (!g || !rel) throw new Error(`forecasts: no short name for goal ${key}`);
  return `${g.scene.short} ${rel}`;
}
export const nameOf = (v: VocabKey, code: string) => VOCAB[v].find(([c]) => c === code)?.[1] ?? code;

/** The label fields, their vocabulary and the episode-record key that carries them. */
export const FIELDS: { key: FieldKey; v: VocabKey; ep: 'dir' | 'rel' | 'role' | 'release' | 'hall' | null; name: string }[] = [
  { key: 'fc_visible_final_relation', v: 'rel', ep: 'rel', name: 'Final relation' },
  { key: 'fc_direction', v: 'dir', ep: 'dir', name: 'Motion direction' },
  { key: 'fc_moving_object_role', v: 'role', ep: 'role', name: 'Moving object' },
  { key: 'fc_possible_release', v: 'yn', ep: 'release', name: 'Possible release' },
  { key: 'fc_hallucinated_object', v: 'yn', ep: 'hall', name: 'Hallucinated object' },
  { key: 'fc_missing_object', v: 'yn', ep: null, name: 'Missing object' },
];

/** Episodes with a whole-episode [generated | executed] video (dream.mp4). */
export const DREAMS = [
  'RWS-E3-S1-C01-B-D',
  'RWS-E3-S4-C02-R-D',
  'RWS-E3-S4-C02-R-I',
  'RWS-E3-S4-C02-R-S',
  'RWS-F3-S1-C01-B-D',
  'RWS-F3-S1-C02-L-I',
  'RWS-F3-S1-C02-L-S',
  'RWS-F3-S4-C04-R-I',
  'RWS-F3-S4-C04-R-S',
  'RWS-F3-S5-C02-LR-I',
  'RWS-F3-S5-C02-LR-S',
  'RWS-N3-S1-C01-B-I',
  'RWS-N3-S1-C01-B-S',
  'RWS-N3-S4-C02-L-I',
  'RWS-N3-S4-C02-L-S',
  'RWS-N3-S4-C02-R-I',
  'RWS-N3-S4-C02-R-S',
];

// ------------------------------------------------------------------ compact per-episode code
// One fixed-width record per episode, in the order model × goal × wording × start (MODELS, GOALS, FORM_ORDER, 1-8):
// [primary request index, base 36][direction][relation][moving object][release][hallucination][event 0|w|r]
// [fallback 0|1][outcome k|l|n]. Label characters are indices into VOCAB.
const W = 9;
const EV = { '0': '', w: 'wrong', r: 'release' } as const;
const OUT: Record<string, Outcome> = { k: 'kept', l: 'lost', n: 'never' };

export interface FcRec {
  i: number;
  id: string;
  m: ModelId;
  /** Goal key, e.g. 'S1-B'. */
  g: string;
  f: FormId;
  c: number;
  pr: number;
  dir: string;
  rel: string;
  role: string;
  release: string;
  hall: string;
  ev: '' | 'wrong' | 'release';
  fallback: boolean;
  out: Outcome;
}

export const recIndex = (m: string, goalKey: string, f: FormId, c: number) =>
  ((MODELS.findIndex((x) => x.id === m) * GOALS.length + GOALS.findIndex((g) => g.key === goalKey)) * FORM_ORDER.length +
    FORM_ORDER.indexOf(f)) *
    STARTS +
  (c - 1);

function code(v: VocabKey, value: string, id: string) {
  const k = VOCAB[v].findIndex(([c]) => c === value);
  if (k < 0) throw new Error(`forecasts: unknown ${v} label "${value}" in ${id}`);
  return String(k);
}

const eq = (what: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(want))
    throw new Error(`forecasts: ${what} is ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
};

/** Build time: encode every episode's forecast fields and check them against the study's forecast summary. */
export function encodeForecasts(episodes: Episode[]): string {
  const byId = new Map(episodes.map((e) => [e.id, e]));
  eq('episode count', byId.size, N_ALL);
  let out = '';
  const recs: Episode[] = [];
  for (const m of MODELS)
    for (const g of GOALS)
      for (const f of FORM_ORDER)
        for (let c = 1; c <= STARTS; c++) {
          const id = epId(m.id, g.scene.id, c, g.id, f);
          const e = byId.get(id);
          if (!e || !e.fc) throw new Error(`forecasts: missing episode or labels for ${id}`);
          if (e.pre !== e.pr * SEL.actions || e.nx !== SEL.actions || e.pr >= 36)
            throw new Error(`forecasts: unexpected window in ${id}`);
          if (e.ev !== e.evWrong + e.evRelease || e.ev > 1) throw new Error(`forecasts: inconsistent events in ${id}`);
          if (e.fallback && e.pr !== 0) throw new Error(`forecasts: fallback ${id} is not the first prediction`);
          out +=
            e.pr.toString(36) +
            code('dir', e.fc.dir, id) +
            code('rel', e.fc.rel, id) +
            code('role', e.fc.role, id) +
            code('yn', e.fc.release, id) +
            code('yn', e.fc.hall, id) +
            (e.evWrong ? 'w' : e.evRelease ? 'r' : '0') +
            (e.fallback ? '1' : '0') +
            outcomeOf(e)[0];
          recs.push(e);
        }
  eq('code length', out.length, N_ALL * W);

  // Label counts, overall and per model, must reproduce the study's tables.
  const count = (es: Episode[], k: 'dir' | 'rel' | 'role' | 'release' | 'hall') => {
    const c: Counts = {};
    for (const e of es) c[e.fc![k]] = (c[e.fc![k]] ?? 0) + 1;
    return c;
  };
  const sorted = (c: Counts) => Object.fromEntries(Object.entries(c).sort(([a], [b]) => a.localeCompare(b)));
  for (const fl of FIELDS) {
    if (!fl.ep) continue;
    eq(`${fl.key} counts`, sorted(count(recs, fl.ep)), sorted(FC.labels[fl.key]));
    for (const m of MODELS)
      eq(`${fl.key} counts for ${m.id}`, sorted(count(recs.filter((e) => e.m === m.id), fl.ep)), sorted(FC.labelsByModel[m.id][fl.key]));
  }

  // Detected errors by model and scene, the role comparison, and the selection fallbacks.
  for (const row of FC.events) {
    const es = recs.filter((e) => e.m === row.model && e.s === row.scene);
    eq(`events ${row.model} ${row.scene}`, [es.length, es.filter((e) => e.evWrong).length, es.filter((e) => e.evRelease).length], [
      row.event_scorable,
      row.wrong_object,
      row.contradictory_release,
    ]);
    eq(`positives ${row.model} ${row.scene}`, row.event_positive, row.wrong_object + row.contradictory_release);
  }
  for (const role of ['reference', 'mover'] as const) {
    const es = recs.filter((e) => e.fc!.role === role);
    eq(`role events ${role}`, [es.filter((e) => e.ev).length, es.length], FC.roleEvents[role]);
  }
  const fb = recs.filter((e) => e.fallback);
  eq('fallbacks', [fb.length, fb.every((e) => e.m === 'N3')], [SEL.fallbacks, true]);
  eq('episode-start forecasts', FC.reported.startForecasts, N_ALL - SEL.fallbacks);
  for (const r of FC.utility.rows) {
    const es = r.model === 'All' ? recs : recs.filter((e) => e.m === r.model);
    eq(`utility events ${r.model}`, [es.filter((e) => e.ev).length, es.length], [r.events, r.n]);
  }
  return out;
}

/** Client: decode the compact code into one record per episode, in canonical order. */
export function decodeForecasts(codes: string): FcRec[] {
  if (codes.length !== N_ALL * W) throw new Error(`forecasts: code length ${codes.length}`);
  const recs: FcRec[] = [];
  let i = 0;
  for (const m of MODELS)
    for (const g of GOALS)
      for (const f of FORM_ORDER)
        for (let c = 1; c <= STARTS; c++) {
          const s = codes.slice(i * W, (i + 1) * W);
          const lab = (v: VocabKey, k: number) => {
            const x = VOCAB[v][Number(s[k])];
            if (!x) throw new Error(`forecasts: bad code ${s}`);
            return x[0];
          };
          const ev = EV[s[6] as keyof typeof EV];
          const out = OUT[s[8]];
          if (ev === undefined || !out) throw new Error(`forecasts: bad code ${s}`);
          recs.push({
            i,
            id: epId(m.id, g.scene.id, c, g.id, f),
            m: m.id,
            g: g.key,
            f,
            c,
            pr: parseInt(s[0], 36),
            dir: lab('dir', 1),
            rel: lab('rel', 2),
            role: lab('role', 3),
            release: lab('yn', 4),
            hall: lab('yn', 5),
            ev,
            fallback: s[7] === '1',
            out,
          });
          i++;
        }
  return recs;
}

// ------------------------------------------------------------------ formatting
const MINUS = '\u2212';
/** Signed decimal with a true minus, e.g. −0.00073 or +0.00106. */
export const sgn = (x: number, d = 5) => `${x < 0 ? MINUS : x > 0 ? '+' : '±'}${Math.abs(x).toFixed(d)}`;
/** Percentage of n, one decimal, e.g. 9.3. */
export const share = (k: number, n: number, d = 1) => ((100 * k) / n).toFixed(d);
/** Seconds with at most two decimals and no trailing zeros, e.g. 2.13, 0.2. */
export const secs = (x: number) => x.toFixed(2);
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
