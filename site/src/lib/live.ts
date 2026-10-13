import { inRuns, type Timeline } from './timeline';

export type Live = { text: string; cls: 'idle' | 'mover' | 'ref' | 'lift' | 'goal' | 'stable' | 'other' };

/** What the scorer sees at tick i, highest-priority flag first. */
export function liveState(tl: Timeline | null, i: number): Live {
  if (!tl) return { text: 'Loading', cls: 'idle' };
  const f = tl.flags;
  if (inRuns(f.stable, i)) return { text: 'Stable placement', cls: 'stable' };
  if (inRuns(f.goal, i)) return { text: 'Goal met', cls: 'goal' };
  if (inRuns(f.lift, i)) return inRuns(f.relation, i) ? { text: 'Carrying, relation holds', cls: 'lift' } : { text: 'Target lifted', cls: 'lift' };
  if (inRuns(f.grip_mover, i)) return { text: 'Gripper on target', cls: 'mover' };
  if (inRuns(f.grip_reference, i)) return { text: 'Gripper on reference', cls: 'ref' };
  for (const runs of Object.values(f.grip_other ?? {})) if (inRuns(runs, i)) return { text: 'Gripper on another object', cls: 'other' };
  if (inRuns(f.relation, i)) return { text: 'Relation holds', cls: 'goal' };
  return { text: i < 3 ? 'Start' : 'No contact', cls: 'idle' };
}
