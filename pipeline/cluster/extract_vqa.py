#!/usr/bin/env python3
"""Extract the backbone-VQA material the website shows, from the frozen r2-final release.

Writes OUT/vqa_prompts.json and OUT/img/<start>-<view>.webp:
  templates   exact B2 prompt segments per condition (T, H, I, IH) with {objects} and {instruction}
              placeholders, verified to rebuild every B2 query of that condition byte for byte
  c2          the C2 current-state prompt per option order, with {instruction}, verified the same way
  schemas     the constrained-decoding JSON schema per scene
  prompts     per original prompt id: instruction, object vocabulary and gold tuple
  placement   the 16 placement-only control instructions with gold tuples
  images      per physical start: the three initial camera views exactly as the models received them
"""
from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path

from PIL import Image

VIEW_SHORT = {'wrist_cam': 'wrist', 'over_shoulder_left_camera': 'left', 'over_shoulder_right_camera': 'right'}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default='/data/users/ali/rqa-20261006')
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    root, out = Path(a.root), Path(a.out)
    (out / 'img').mkdir(parents=True, exist_ok=True)
    rows = [json.loads(l) for l in open(root / 'release/r2-final/query_manifest.jsonl')]

    def objects_line(r: dict) -> str:
        schema = json.loads(r['output_constraint']['schema_json'])
        return ', '.join(schema['properties']['target']['enum'])

    # Text segments hold the instruction at most once; image segments become {"image": view}.
    def template_safe(r: dict, with_objects: bool) -> list:
        segs = []
        for s in r['segments']:
            if s['type'] == 'text':
                t = s['text']
                if r['instruction_utf8'] in t:
                    assert t.count(r['instruction_utf8']) == 1, r['query_id']
                    t = t.replace(r['instruction_utf8'], '{instruction}')
                if with_objects:
                    line = f"Object vocabulary: {objects_line(r)}\n"
                    if line in t:
                        t = t.replace(line, 'Object vocabulary: {objects}\n')
                segs.append({'t': t})
            elif s['type'] == 'image':
                segs.append({'image': VIEW_SHORT[s['view']]})
            else:
                segs.append({'kind': s['type'], **{k: v for k, v in s.items() if k != 'type'}})
        return segs

    def rebuild(segs: list, r: dict, with_objects: bool) -> str:
        parts = []
        for s in segs:
            if 't' in s:
                t = s['t'].replace('{instruction}', r['instruction_utf8'])
                if with_objects:
                    t = t.replace('{objects}', objects_line(r))
                parts.append(t)
        return ''.join(parts)

    def text_of(r: dict) -> str:
        return ''.join(s['text'] for s in r['segments'] if s['type'] == 'text')

    templates: dict[str, list] = {}
    checked = defaultdict(int)
    for r in rows:
        if r['kind'] != 'B2':
            continue
        segs = template_safe(r, True)
        key = r['condition']
        if key not in templates:
            templates[key] = segs
        assert templates[key] == segs, ('template differs', r['query_id'])
        assert rebuild(segs, r, True) == text_of(r), ('rebuild', r['query_id'])
        assert hashlib.sha256(r['instruction_utf8'].encode()).hexdigest() == r['instruction_utf8_sha256']
        checked['b2'] += 1

    c2: dict[str, dict] = {}
    for r in rows:
        if r['kind'] != 'C2' or r['condition'] != 'R1-presentation':
            continue
        segs = template_safe(r, False)
        key = f"{r['bank']}|{r['option_order']}"
        if key not in c2:
            c2[key] = {'segments': segs, 'mapping': r['option_mapping']}
        assert c2[key]['segments'] == segs and c2[key]['mapping'] == r['option_mapping'], ('c2 template', r['query_id'])
        assert rebuild(segs, r, False) == text_of(r), ('c2 rebuild', r['query_id'])
        checked['c2'] += 1
    c2_noimg = next(r for r in rows if r['kind'] == 'C2' and r['condition'] != 'R1-presentation')
    c2['noImage'] = {'segments': template_safe(c2_noimg, False), 'mapping': c2_noimg['option_mapping']}

    schemas, prompts, placement = {}, {}, {}
    for r in rows:
        if r['kind'] != 'B2':
            continue
        sc = json.loads(r['output_constraint']['schema_json'])
        schemas.setdefault(r['scene_id'], sc)
        assert schemas[r['scene_id']] == sc
        entry = {'instruction': r['instruction_utf8'], 'objects': objects_line(r), 'gold': r['gold_answer'], 'scene': r['scene_id'], 'goal': r['goal_id']}
        if r['family'] == 'original':
            pid = r['original_prompt_id']
            assert prompts.setdefault(pid, entry) == entry, pid
        else:
            pid = r['original_prompt_id']
            assert placement.setdefault(pid, {**entry, 'form': r.get('display_form')}) == {**entry, 'form': r.get('display_form')}, pid

    # Initial views of every physical start, as delivered with the B2 image prompts.
    img_root = None
    for cand in ['release/r2-final', 'release/r1', 'release']:
        if (root / cand / 'images').is_dir():
            img_root = root / cand
            break
    assert img_root, 'no images dir'
    images: dict[str, dict] = {}
    for r in rows:
        if r['kind'] != 'B2' or r['condition'] != 'IH' or r['family'] != 'original':
            continue
        start = r['physical_start_id']
        views = {VIEW_SHORT[v['view']]: v for v in r['view_paths_and_sha256']}
        if start in images:
            assert {k: v['png_sha256'] for k, v in views.items()} == images[start]['sha'], start
            continue
        images[start] = {'sha': {k: v['png_sha256'] for k, v in views.items()}, 'size': {}}
        for short, v in views.items():
            p = img_root / v['path']
            if not p.exists():
                p = root / 'release/r1' / v['path']
            assert hashlib.sha256(p.read_bytes()).hexdigest() == v['png_sha256'], p
            im = Image.open(p).convert('RGB')
            images[start]['size'][short] = list(im.size)
            if im.width > 640:
                im = im.resize((640, round(im.height * 640 / im.width)), Image.LANCZOS)
            im.save(out / 'img' / f'{start}-{short}.webp', 'WEBP', quality=84, method=6)

    res = sorted((root / 'runs').glob('r2-final-*/*/responses.jsonl'))
    sample = json.loads(open(res[0]).readline()) if res else {}

    json.dump(
        {
            'templates': templates,
            'c2': c2,
            'schemas': schemas,
            'prompts': prompts,
            'placement': placement,
            'images': images,
            'checked': checked,
            'responseKeys': sorted(sample.keys()),
            'responseSample': {k: (v if len(json.dumps(v)) < 600 else str(v)[:600]) for k, v in sample.items()},
        },
        open(out / 'vqa_prompts.json', 'w'),
        indent=1,
    )
    print('ok', dict(checked), len(prompts), len(placement), len(images), sorted(templates), sorted(c2))


if __name__ == '__main__':
    main()
