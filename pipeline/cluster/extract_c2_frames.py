#!/usr/bin/env python3
"""Extract the C2 camera views of the named frames, exactly as the models received them.

Usage: extract_c2_frames.py --out DIR FRAME [FRAME ...]   (e.g. S1-C04-secondary-50)
Writes DIR/<frame>-<view>.webp (640 px wide) and DIR/frames.json with source sha256, size,
source rollout episode and observation time.
Every PNG is verified against the manifest sha256 before conversion.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image

VIEW_SHORT = {'wrist_cam': 'wrist', 'over_shoulder_left_camera': 'left', 'over_shoulder_right_camera': 'right'}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default='/data/users/ali/rqa-20261006')
    ap.add_argument('--out', required=True)
    ap.add_argument('frames', nargs='+')
    a = ap.parse_args()
    root, out = Path(a.root), Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    want = set(a.frames)
    done: dict[str, dict] = {}
    for line in open(root / 'release/r2-final/query_manifest.jsonl'):
        r = json.loads(line)
        if r['kind'] != 'C2' or r['condition'] != 'R1-presentation':
            continue
        frame = r['frame_id']
        if frame not in want:
            continue
        views = {VIEW_SHORT[v['view']]: v for v in r['view_paths_and_sha256']}
        sha = {k: v['png_sha256'] for k, v in views.items()}
        if frame in done:
            assert done[frame]['sha'] == sha, frame
            continue
        done[frame] = {
            'sha': sha,
            'size': {},
            'episode': r.get('source_episode_id'),
            'observed_s': r.get('observed_time_s'),
            'requested_s': r.get('requested_time_s'),
        }
        for short, v in views.items():
            p = root / 'release/r2-final' / v['path']
            if not p.exists():
                p = root / 'release/r1' / v['path']
            assert hashlib.sha256(p.read_bytes()).hexdigest() == v['png_sha256'], p
            im = Image.open(p).convert('RGB')
            done[frame]['size'][short] = list(im.size)
            if im.width > 640:
                im = im.resize((640, round(im.height * 640 / im.width)), Image.LANCZOS)
            im.save(out / f'{frame}-{short}.webp', 'WEBP', quality=84, method=6)
    missing = want - set(done)
    assert not missing, missing
    json.dump(done, open(out / 'frames.json', 'w'), indent=1)
    print('ok', len(done), sorted(done))


if __name__ == '__main__':
    main()
