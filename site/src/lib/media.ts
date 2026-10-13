const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;

/** Root for rollout media; set PUBLIC_MEDIA_BASE to serve it from another host. */
export const MEDIA_BASE = ((import.meta.env.PUBLIC_MEDIA_BASE as string | undefined) || `${base}media`).replace(/\/$/, '');

/** Media encode revision, appended to every media URL so browser and CDN caches never mix encodes. */
export const MEDIA_REV = '2';

export const href = (path = '') => `${base}${path.replace(/^\//, '')}`;
export const epFile = (id: string, file: string) => `${MEDIA_BASE}/ep/${id}/${file}?v=${MEDIA_REV}`;
export const dataFile = (file: string) => `${base}data/${file}`;

export interface Episode {
  id: string;
  m: 'N3' | 'E3' | 'F3';
  s: string;
  c: number;
  g: string;
  f: 'D' | 'S' | 'I';
  se: number;
  sf: number;
  stage: string;
  init: number;
  n: number;
  tHit: number | null;
  tStable: number | null;
  tStableDone: number | null;
  tFinal: number | null;
  tLift: number | null;
  disp: number;
  refMax: number;
  refMoved: number;
  pr: number;
  pre: number;
  nx: number;
  fallback: number;
  ev: number;
  evWrong: number;
  evRelease: number;
  fc: { dir: string; rel: string; role: string; release: string; hall: string } | null;
}

let episodes: Promise<Episode[]> | null = null;
export function loadEpisodes(): Promise<Episode[]> {
  episodes ??= fetch(dataFile('episodes.json')).then((r) => {
    if (!r.ok) throw new Error(`episodes.json: HTTP ${r.status}`);
    return r.json();
  });
  return episodes;
}

export const epId = (m: string, s: string, c: number, g: string, f: string) =>
  `RWS-${m}-${s}-C${String(c).padStart(2, '0')}-${g}-${f}`;

export type Crop = [x: number, y: number, w: number, h: number, sourceW: number, sourceH: number];

/**
 * Exterior-camera video frame: the paper's fixed crop of the 1280×720 camera, rotated 90° for readability (as in the
 * paper's close views). The camera faces the robot, so the robot is at the top and image left is the robot's right.
 */
export const TOP_W = 536;
export const TOP_H = 540;
export const TOP_ASPECT = `${TOP_W} / ${TOP_H}`;
/** Robot base and the whole table, for small thumbnails. */
export const TABLE_CROP: Crop = [0, 150, 536, 390, TOP_W, TOP_H];
export const cropAspect = (c: Crop) => `${c[2]} / ${c[3]}`;

/** CSS background that shows `crop` of a TOP_W×TOP_H still. */
export function cropBackground(url: string, [x, y, w, h, W, H]: Crop) {
  const pos = (o: number, size: number, full: number) => (full === size ? 50 : (o / (full - size)) * 100).toFixed(3);
  return `background-image:url(${url});background-size:${((W / w) * 100).toFixed(3)}% auto;background-position:${pos(x, w, W)}% ${pos(
    y,
    h,
    H,
  )}%`;
}
