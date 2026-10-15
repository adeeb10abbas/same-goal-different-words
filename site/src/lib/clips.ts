import data from '../data/clips.json';
import { epFile } from './media';

type Clip = { rest: number; end: number; full: number };

/**
 * The home page's cut of a featured rollout: it ends 2.5 s of rollout after its objects come to rest (`data.rule`,
 * made by pipeline/cluster/rerender/trim_rest.py). `end` is the cut's length in seconds; the explorer plays the full rollout.
 */
export function homeClip(id: string) {
  const c = (data.clips as Record<string, Clip>)[id];
  if (!c) throw new Error(`no home-page cut for ${id}: run pipeline/cluster/rerender/trim_rest.py`);
  return { src: epFile(id, data.file), end: c.end };
}

/** Explorer link to the side-by-side comparison of every wording of the episode's start. */
export const compareHash = (id: string) => `explore/#compare=${id.replace(/-[DSI]$/, '')}`;
