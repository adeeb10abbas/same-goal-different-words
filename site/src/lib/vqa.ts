import { dataFile, href } from './media';
import { GOALS, type FormId, type ModelId, type VqaCond, type VqaErr, type VqaForm } from './study';

/** Paper Section 4 / Appendix F: the backbone instruction-understanding test, served from public/data/vqa.json. */

export type View = 'wrist' | 'left' | 'right';
export type Segment = { t: string } | { image: View };
export interface Answer {
  target: string;
  reference: string;
  relation: string;
}
export interface VqaPrompt {
  instruction: string;
  objects: string;
  gold: Answer;
  scene: string;
  goal: string;
  form?: string;
}
export interface VqaLane {
  processor: string;
  tokenizer: string;
  seqs: string[][];
  multiSplit: number;
  /** query id -> [prompt tokens, output token sequence, error class] */
  b2: Record<string, [number, number, string]>;
  c2: Record<string, [number, number]>;
}
export type PairAnswers = { match: [string, string]; nonmatch: [string, string]; both: number };
export interface VqaPair {
  scene: string;
  goal: string;
  start: string;
  match: string;
  nonmatch: string;
  lanes: Record<ModelId, Record<VqaForm, PairAnswers>>;
}
export interface VqaPublic {
  templates: Record<VqaCond, Segment[]>;
  c2: Record<string, { segments: Segment[]; mapping: Record<string, string> }>;
  schemas: Record<string, { properties: Record<'target' | 'reference' | 'relation', { enum: string[] }> }>;
  prompts: Record<string, VqaPrompt>;
  placement: Record<string, VqaPrompt>;
  images: Record<string, Record<View, [number, number]>>;
  frames: Record<string, { episode: string; t: number; size: Record<View, [number, number]> }>;
  c2Items: Record<string, { gold: string; answerable: boolean; excluded: string | null; t: number }>;
  decoding: { greedy: boolean; temperature: number; maxTokens: number; thinking: boolean; backend: string };
  lanes: Record<ModelId, VqaLane>;
  pairs: VqaPair[];
}

let cache: Promise<VqaPublic> | undefined;
export function loadVqa(): Promise<VqaPublic> {
  cache ??= fetch(dataFile('vqa.json')).then((r) => {
    if (!r.ok) throw new Error(`vqa.json: HTTP ${r.status}`);
    return r.json() as Promise<VqaPublic>;
  });
  return cache;
}

export const COND_ORDER: VqaCond[] = ['T', 'H', 'I', 'IH'];
export const COND_LABEL: Record<VqaCond, string> = {
  T: 'Text only',
  H: 'Text + camera descriptions',
  I: 'Images',
  IH: 'Images + camera descriptions',
};
export const VIEWS: View[] = ['wrist', 'left', 'right'];
export const VIEW_LABEL: Record<View, string> = { wrist: 'Wrist camera', left: 'Left exterior', right: 'Right exterior' };
export const VQA_FORM: Record<FormId, VqaForm> = { D: 'DIR', S: 'TF', I: 'RF' };
export const STARTS = 8;
export const hasImages = (c: VqaCond) => c === 'I' || c === 'IH';
export const condOf = (images: boolean, camera: boolean): VqaCond =>
  images ? (camera ? 'IH' : 'I') : camera ? 'H' : 'T';

/** The ten cube, butter and mustard goals (bowl stacking is excluded from this test). */
export const VQA_GOALS = GOALS.filter((g) => g.scene.id !== 'S5');
export const pidOf = (goalKey: string, f: FormId) => `${goalKey}-${f}`;
export const startId = (scene: string, slot: number) => `${scene}-C${String(slot).padStart(2, '0')}`;
export const qidOf = (cond: VqaCond, pid: string, slot?: number) =>
  hasImages(cond) ? `B2.${cond}.${startId(pid.split('-')[0], slot ?? 1)}-initial.${pid}` : `B2.${cond}.${pid}`;

/** Item error class -> displayed class (as in pipeline/build_vqa.py ERROR_GROUPS). */
export const ERR_OF: Record<string, VqaErr> = {
  correct: 'correct',
  converse_relation: 'reversed',
  'target_reference_swapped+converse_relation': 'swappedReversed',
  target_reference_swapped: 'swapped',
  'target_reference_swapped+other_relation': 'other',
  other_relation: 'other',
  support_label_swap: 'support',
  'object_error+support_label_swap': 'other',
};
export const ERR_ORDER: VqaErr[] = ['correct', 'reversed', 'swappedReversed', 'swapped', 'support', 'other'];
export const ERR_CODE: Record<VqaErr, string> = {
  correct: 'c',
  reversed: 'r',
  swappedReversed: 'x',
  swapped: 's',
  support: 'p',
  other: 'o',
};
export const ERR_BY_CODE = Object.fromEntries(Object.entries(ERR_CODE).map(([k, v]) => [v, k])) as Record<string, VqaErr>;
export const ERR_LABEL: Record<VqaErr, string> = {
  correct: 'Correct',
  reversed: 'Relation reversed',
  swappedReversed: 'Roles swapped, relation flipped',
  swapped: 'Roles swapped',
  support: 'Support/stacking label swap',
  other: 'Other wrong relation',
};
export const ERR_HINT: Record<VqaErr, string> = {
  correct: 'Object to move, reference and relation all match the instruction.',
  reversed: 'Right objects, opposite relation (left for right, front for behind).',
  swappedReversed: 'Names the reference as the object to move and flips the relation.',
  swapped: 'Names the reference as the object to move.',
  support: 'Substitutes a stacking label for the requested support relation, or the reverse.',
  other: 'A different relation, or another object error.',
};
/** Class colours on light surfaces and on the dark console. */
export const ERR_COLOR: Record<VqaErr, string> = {
  correct: 'var(--vq-ok)',
  reversed: 'var(--vq-rev)',
  swappedReversed: 'var(--vq-swrev)',
  swapped: 'var(--vq-swap)',
  support: 'var(--vq-sup)',
  other: 'var(--vq-oth)',
};
export const ERR_COLOR_DARK: Record<VqaErr, string> = {
  correct: 'var(--vq-ok-2)',
  reversed: 'var(--vq-rev-2)',
  swappedReversed: 'var(--vq-swrev-2)',
  swapped: 'var(--vq-swap-2)',
  support: 'var(--vq-sup-2)',
  other: 'var(--vq-oth-2)',
};

export const OBJ_SHORT: Record<string, string> = {
  rubiks_cube: 'cube',
  bowl: 'bowl',
  banana: 'banana',
  butter: 'butter',
  raisin_box: 'raisin box',
  mustard_bottle: 'mustard',
};
export const REL_WORD: Record<string, string> = {
  left_of: 'left of',
  right_of: 'right of',
  in_front_of: 'in front of',
  behind: 'behind',
  on_top_supported: 'on top of',
  stacked_on: 'stacked on',
  unknown: 'unknown',
};
export const GOAL_WORD: Record<string, string> = { L: 'left', R: 'right', F: 'front', B: 'behind', TOP: 'on top' };
export const SCENE_NOUN: Record<string, string> = { S1: 'Cube', S3: 'Butter', S4: 'Mustard' };

export const imageUrl = (frame: string, view: View) => href(`vqa/${frame.replace(/-initial$/, '')}-${view}.webp`);

/** The decoded text of an output token sequence, without the end-of-turn token. */
export const outputText = (seq: string[]) => seq.join('').replace('<|im_end|>', '');

/** Fill the {objects} and {instruction} slots of a template text segment (the JSON example is left alone). */
export const fill = (t: string, p: Pick<VqaPrompt, 'objects' | 'instruction'>) =>
  t.replace('{objects}', p.objects).replace('{instruction}', p.instruction);

/** Character spans of the three answer values inside the decoded JSON. */
export function valueSpans(text: string): { key: keyof Answer; from: number; to: number }[] {
  const out: { key: keyof Answer; from: number; to: number }[] = [];
  for (const key of ['target', 'reference', 'relation'] as const) {
    const m = new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`).exec(text);
    if (m) {
      const from = m.index + m[0].length - 1 - m[1].length;
      out.push({ key, from, to: from + m[1].length });
    }
  }
  return out;
}

/** Answer classes for every item, compact enough to pass as island props:
 *  codes[model][condition][i] for VQA_PIDS[i] holds one ERR_CODE letter per start (images) or one letter (text). */
export type GridCodes = Record<ModelId, Record<VqaCond, string[]>>;
export const VQA_PIDS = VQA_GOALS.flatMap((g) => (['D', 'S', 'I'] as FormId[]).map((f) => pidOf(g.key, f)));
export const PLACEMENT_KEYS = VQA_GOALS.filter((g) => g.id !== 'TOP').flatMap((g) =>
  (['reference_early', 'reference_late'] as const).map((p) => `${g.key}-${p}`),
);

export function gridCodes(v: VqaPublic): { codes: GridCodes; placement: Record<ModelId, string> } {
  const codes = {} as GridCodes;
  const placement = {} as Record<ModelId, string>;
  for (const m of Object.keys(v.lanes) as ModelId[]) {
    const lane = v.lanes[m];
    const code = (q: string) => {
      const it = lane.b2[q];
      if (!it) throw new Error(`vqa: missing ${m} ${q}`);
      const e = ERR_OF[it[2]];
      if (!e) throw new Error(`vqa: unknown error class ${it[2]}`);
      return ERR_CODE[e];
    };
    codes[m] = {} as Record<VqaCond, string[]>;
    for (const c of COND_ORDER)
      codes[m][c] = VQA_PIDS.map((pid) =>
        hasImages(c)
          ? Array.from({ length: STARTS }, (_, i) => code(qidOf(c, pid, i + 1))).join('')
          : code(qidOf(c, pid)),
      );
    placement[m] = PLACEMENT_KEYS.map((k) => code(`PB2.T.${k}`)).join('');
  }
  return { codes, placement };
}

/** Decoded answer of one item (frontmatter only: needs the full lanes). */
export function answerOf(v: VqaPublic, m: ModelId, qid: string): Answer {
  const it = v.lanes[m].b2[qid];
  if (!it) throw new Error(`vqa: missing ${m} ${qid}`);
  return JSON.parse(outputText(v.lanes[m].seqs[it[1]])) as Answer;
}

/** The sixteen reference-clause placement controls (Appendix F), with any wrong text-only answer. */
export interface PlacementCard {
  key: string;
  goal: string;
  early: boolean;
  instruction: string;
  wrong: Partial<Record<ModelId, Answer>>;
}
export function placementCards(v: VqaPublic): PlacementCard[] {
  return PLACEMENT_KEYS.map((key) => {
    const p = v.placement[key];
    const wrong: Partial<Record<ModelId, Answer>> = {};
    for (const m of Object.keys(v.lanes) as ModelId[])
      if (v.lanes[m].b2[`PB2.T.${key}`][2] !== 'correct') wrong[m] = answerOf(v, m, `PB2.T.${key}`);
    return { key, goal: `${p.scene}-${p.goal}`, early: key.endsWith('early'), instruction: p.instruction, wrong };
  });
}

/** Arrangement-judgement pairs (Appendix F): one start and goal, one frame that shows the requested relation and one
 *  that does not. answers[model][form] holds four letters (m/n/u): the frame that matches under code orders o0 and o1,
 *  then the frame that does not. */
export interface PairCard {
  scene: string;
  goal: string;
  start: string;
  frames: Record<'match' | 'nonmatch', { key: string; episode: string | null; t: number }>;
  answers: Record<ModelId, Record<VqaForm, string>>;
  both: Record<ModelId, Record<VqaForm, number>>;
}
export function pairCards(v: VqaPublic): PairCard[] {
  const frame = (key: string) => {
    const f = v.frames[key];
    if (!f && !key.endsWith('-initial')) throw new Error(`vqa: missing frame ${key}`);
    return { key, episode: f?.episode ?? null, t: f?.t ?? 0 };
  };
  return v.pairs.map((p) => {
    const answers = {} as PairCard['answers'];
    const both = {} as PairCard['both'];
    for (const m of Object.keys(p.lanes) as ModelId[]) {
      answers[m] = {} as Record<VqaForm, string>;
      both[m] = {} as Record<VqaForm, number>;
      for (const f of ['DIR', 'TF', 'RF'] as VqaForm[]) {
        const a = p.lanes[m][f];
        const code = (s: string) => (s === 'match' ? 'm' : s === 'nonmatch' ? 'n' : 'u');
        answers[m][f] = [...a.match, ...a.nonmatch].map(code).join('');
        both[m][f] = a.both;
      }
    }
    return {
      scene: p.scene,
      goal: p.goal,
      start: p.start,
      frames: { match: frame(p.match), nonmatch: frame(p.nonmatch) },
      answers,
      both,
    };
  });
}

/** Static console inputs, rendered on the server: the 30 prompts, both image templates, each scene's answer
 *  vocabulary, and the opening item so the first answer is in the page before vqa.json arrives. */
export type Vocab = Record<keyof Answer, string[]>;
export interface ConsoleSeed {
  prompts: Record<string, VqaPrompt>;
  templates: Record<'I' | 'IH', Segment[]>;
  schemas: Record<string, Vocab>;
  init: { model: ModelId; qid: string; tokens: number; seq: string[] };
}
export type VqaSel = { model?: ModelId; images?: boolean; camera?: boolean; pid?: string; slot?: number };
export const CONSOLE_START = { model: 'F3' as ModelId, pid: 'S4-R-I' };
export function consoleSeed(v: VqaPublic): ConsoleSeed {
  const schemas: Record<string, Vocab> = {};
  for (const [s, sc] of Object.entries(v.schemas))
    schemas[s] = {
      target: sc.properties.target.enum,
      reference: sc.properties.reference.enum,
      relation: sc.properties.relation.enum,
    };
  const qid = qidOf('T', CONSOLE_START.pid);
  const it = v.lanes[CONSOLE_START.model].b2[qid];
  return {
    prompts: Object.fromEntries(VQA_PIDS.map((p) => [p, v.prompts[p]])),
    templates: { I: v.templates.I, IH: v.templates.IH },
    schemas,
    init: { model: CONSOLE_START.model, qid, tokens: it[0], seq: v.lanes[CONSOLE_START.model].seqs[it[1]] },
  };
}
