import { epFile } from './media';

export type Runs = [number, number][];

export interface TObject {
  name: string;
  role: 'mover' | 'reference' | 'other';
  /** local bbox min xyz, max xyz (mm) */
  lb: number[];
  /** Asset origin per tick (m, robot frame). */
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  /** Orientation per tick, interleaved (w, x, y, z). */
  q: Float32Array;
}

export interface Timeline {
  id: string;
  n: number;
  fps: number;
  goal: string;
  mover: string;
  reference: string;
  objects: TObject[];
  tcp: { x: Float32Array; y: Float32Array; z: Float32Array };
  grip: Float32Array;
  flags: {
    goal: Runs;
    relation: Runs;
    support: Runs;
    detached: Runs;
    stable: Runs;
    lift: Runs;
    grip_mover: Runs;
    grip_reference: Runs;
    mover_reference: Runs;
    grip_other: Record<string, Runs>;
    grip_table: Runs;
  };
  requests: [number, number][];
}

function cum(d: number[], scale = 1): Float32Array {
  const out = new Float32Array(d.length);
  let s = 0;
  for (let i = 0; i < d.length; i++) {
    s += d[i];
    out[i] = s * scale;
  }
  return out;
}

const cache = new Map<string, Promise<Timeline>>();

export function loadTimeline(id: string): Promise<Timeline> {
  let p = cache.get(id);
  if (!p) {
    p = fetch(epFile(id, 'timeline.json'))
      .then((r) => {
        if (!r.ok) throw new Error(`timeline ${id}: HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => decode(id, j));
    cache.set(id, p);
  }
  return p;
}

export function decode(id: string, j: any): Timeline {
  const objects: TObject[] = Object.entries(j.objects).map(([name, o]: [string, any]) => {
    return { name, role: o.role, lb: o.lb, x: cum(o.x, 1e-3), y: cum(o.y, 1e-3), z: cum(o.z, 1e-3), q: cum(o.q, 1e-4) };
  });
  // Draw context objects first, then reference, then the target on top.
  const rank = { other: 0, reference: 1, mover: 2 } as const;
  objects.sort((a, b) => rank[a.role] - rank[b.role]);
  return {
    id,
    n: j.n,
    fps: j.fps,
    goal: j.goal,
    mover: j.mover,
    reference: j.reference,
    objects,
    tcp: { x: cum(j.tcp.x, 1e-3), y: cum(j.tcp.y, 1e-3), z: cum(j.tcp.z, 1e-3) },
    grip: cum(j.grip, 1e-2),
    flags: j.flags,
    requests: j.requests,
  };
}

export const inRuns = (runs: Runs, i: number) => runs.some(([a, b]) => i >= a && i <= b);
