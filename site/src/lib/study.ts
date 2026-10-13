import raw from '../data/study.json';

export type FormId = 'D' | 'S' | 'I';
export type ModelId = 'N3' | 'E3' | 'F3';
export type Outcome = 'kept' | 'lost' | 'never';

export interface Goal {
  id: string;
  key: string;
  short: string;
  label: string;
  mover: string;
  reference: string;
  moverName: string;
  referenceName: string;
  relation: string;
  native: boolean;
  initiallyTrue: boolean;
  prompts: Record<FormId, string>;
}

export interface Scene {
  id: string;
  short: string;
  title: string;
  seconds: number;
  ticks: number;
  goals: Goal[];
}

export interface Interval {
  est: number;
  ci: [number, number];
  starts?: { scene: string; slot: number; d: number }[];
}

/** Paper Section 4 / Appendix F. Forms are keyed by their paper names; conditions are T (text), H (text + camera
 *  descriptions), I (images), IH (images + camera descriptions). Percentages are already in points. */
export type VqaForm = 'DIR' | 'TF' | 'RF';
export type VqaCond = 'T' | 'H' | 'I' | 'IH';
export type VqaErr = 'correct' | 'reversed' | 'swapped' | 'swappedReversed' | 'other' | 'support';
export interface VqaBank {
  balanced_accuracy: Interval;
  recall_match: Interval;
  recall_nonmatch: Interval;
  answers: Record<'match' | 'nonmatch' | 'unknown', number>;
  /** Answers to answerable items only, both code orders. */
  answersAnswerable: Record<'match' | 'nonmatch' | 'unknown', number>;
  items: number;
  answerable: number;
  /** Answerable items whose views truly show the requested relation. */
  goldMatch: number;
}
export interface VqaStudy {
  /** [DIR, TF, RF]: correct out of 10 for text/camera, scene-balanced % for images/imagesCamera. */
  summary: Record<'text' | 'camera' | 'images' | 'imagesCamera', Record<ModelId, [number, number, number]>>;
  contrasts: Record<ModelId, Record<'image_I_minus_T' | 'image_IH_minus_H' | 'header_IH_minus_I', Record<VqaForm, Interval>>>;
  placement: Record<
    ModelId,
    { textEarly: number; textLate: number; images: number; imagesEarly: number; imagesLate: number; gap: Interval }
  >;
  errors: Record<ModelId, Record<VqaCond, Record<VqaForm, Partial<Record<VqaErr, number>>>>>;
  c2: Record<ModelId, { initial: VqaBank; secondary: VqaBank; noImage: Record<'match' | 'nonmatch' | 'unknown', number> }>;
  tokens: Record<ModelId, Record<string, { prompt: number; min: number; max: number } | number>>;
}

export const study = raw as unknown as {
  title: string;
  venue: string;
  models: { id: ModelId; short: string; name: string; lm: string; vqa: string }[];
  forms: { id: FormId; short: string; name: string }[];
  scenes: Scene[];
  objects: Record<string, string>;
  flow: any;
  rates: any;
  contrasts: Record<'TF_RF' | 'DIR_TF' | 'DIR_RF', any>;
  relation: { key: string; est: number; ci: [number, number]; tf: number; rf: number; dir: number; byModel: Record<ModelId, [number, number, number]> }[];
  cells: Record<string, [number, number, number]>;
  forecast: any;
  vqa: VqaStudy;
  /** Appendix B: policy settings (rows are [setting, Nano, Edge, FLUX]) and the scorer's constants. */
  settings: {
    rows: [string, string, string, string][];
    seed: number;
    actionsPerRequest: number;
    hz: number;
    notes: string[];
    scoring: { coneDeg: number; footprintCm: number; speedCmS: number; holdS: number; referenceMovedCm: number };
    stats: { bootstrapDraws: number; signFlipDraws: number; starts: number; holmFamily: string[] };
  };
  source: { paperRepo: string; commit: string };
  checks: number;
};

export const MODELS = study.models;
export const FORMS = study.forms;
export const SCENES = study.scenes;
export const FORM_ORDER: FormId[] = ['D', 'S', 'I'];
export const FORM_SHORT: Record<FormId, string> = { D: 'DIR', S: 'TF', I: 'RF' };
export const FORM_NAME: Record<FormId, string> = { D: 'Direct', S: 'Target-first', I: 'Reference-first' };
export const FORM_COLOR: Record<FormId, string> = { D: 'var(--dir)', S: 'var(--tf)', I: 'var(--rf)' };
export const MODEL_SHORT: Record<string, string> = Object.fromEntries(MODELS.map((m) => [m.id, m.short]));
export const MODEL_NAME: Record<string, string> = Object.fromEntries(MODELS.map((m) => [m.id, m.name]));

export const GOALS: (Goal & { scene: Scene })[] = SCENES.flatMap((s) => s.goals.map((g) => ({ ...g, scene: s })));
export const goalByKey = (key: string) => GOALS.find((g) => g.key === key)!;
export const sceneById = (id: string) => SCENES.find((s) => s.id === id)!;

const NAME: Record<string, string> = {
  rubiks_cube: "rubik[’']?s cube",
  bowl: 'bowl',
  banana: 'banana',
  butter: 'butter box',
  raisin_box: 'raisin box',
  mustard_bottle: 'mustard(?: bottle)?',
  bowl_1: 'right bowl',
  bowl_2: 'left bowl',
};
const REL =
  'to the (?:left|right) of|in front of|behind|on top of and supported by|underneath and supporting|on top of|stacked on|on(?= the (?:raisin box|right bowl|left bowl))';

export type Token = { text: string; kind: 'mover' | 'ref' | 'rel' | 'plain' };

/** Split an instruction into plain text, target (mover), reference and relation spans. */
export function tokenize(prompt: string, goal: Pick<Goal, 'mover' | 'reference'>): Token[] {
  const re = new RegExp(`(?<mover>${NAME[goal.mover]})|(?<ref>${NAME[goal.reference]})|(?<rel>${REL})`, 'gi');
  const out: Token[] = [];
  let last = 0;
  for (const m of prompt.trim().matchAll(re)) {
    const kind = m.groups!.mover ? 'mover' : m.groups!.ref ? 'ref' : 'rel';
    if (m.index! > last) out.push({ text: prompt.slice(last, m.index), kind: 'plain' });
    out.push({ text: m[0], kind });
    last = m.index! + m[0].length;
  }
  if (last < prompt.trim().length) out.push({ text: prompt.trim().slice(last), kind: 'plain' });
  return out;
}

export const outcomeOf = (e: { se: number; sf: number }): Outcome => (e.sf ? 'kept' : e.se ? 'lost' : 'never');

export const OUTCOME_LABEL: Record<Outcome, string> = {
  kept: 'Placed and kept',
  lost: 'Placed, then lost',
  never: 'Never placed',
};

export const STAGE_LABEL: Record<string, string> = {
  no_mover_contact: 'Never touched the target',
  contact_no_lift: 'Touched, never lifted',
  lift_no_goal: 'Lifted, never reached the goal',
  goal_unstable: 'Reached the goal, never stable',
  stable: 'Stable placement',
};

export const pp = (x: number, d = 1) => (100 * x).toFixed(d);
export const spp = (x: number, d = 1) => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(100 * x).toFixed(d)}`;
export const pct = (x: number, d = 1) => `${(100 * x).toFixed(d)}%`;
