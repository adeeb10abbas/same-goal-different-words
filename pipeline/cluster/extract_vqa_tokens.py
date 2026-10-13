"""Decode the exact output tokens of every delivered VQA response.

Runs on the cluster pod next to the raw responses. For each lane it records:
  seqs[i]         = distinct decoded token sequences (incremental decode, so
                    byte-level merges are exact), ending with the stop token;
  items[query_id] = [prompt_tokens, output_tokens, kind, i].
Constrained decoding can emit the same JSON string with different token splits,
so sequences are stored per item rather than per answer string.
The script asserts that the concatenated pieces reproduce raw_response_with_special_tokens.
"""
import collections
import json
import sys

from tokenizers import Tokenizer

BASE = '/data/users/ali/rqa-20261006'
RUN = BASE + '/runs/r2-final-20261007'
QWEN = BASE + '/checkpoints/Qwen3-VL-8B-Instruct-0c351dd/tokenizer.json'
LANES = {
    'N3-policy': QWEN,
    'E3-policy': BASE + '/views/E3-policy-reasoner-a7c7288/tokenizer.json',
    'F3-qwen3vl4b': QWEN,
}


def pieces_of(tk, ids):
    out, prev = [], ''
    for i in range(len(ids)):
        cur = tk.decode(ids[: i + 1], skip_special_tokens=False)
        out.append(cur[len(prev):])
        prev = cur
    return out


def main(dest):
    result = {}
    for lane, path in LANES.items():
        tk = Tokenizer.from_file(path)
        seqs, index, items = [], {}, {}
        kinds, procs, split = collections.Counter(), collections.Counter(), collections.defaultdict(set)
        seen = collections.Counter()
        for line in open(f'{RUN}/{lane}/responses.jsonl'):
            r = json.loads(line)
            kinds[(r.get('kind'), r.get('phase'), r.get('status'))] += 1
            if r.get('status') != 'delivered' or r.get('phase') != 'evaluation':
                continue
            procs[r.get('processor_id_and_revision')] += 1
            qid = r['query_id']
            seen[qid] += 1
            ids = r['output_token_ids']
            ps = pieces_of(tk, ids)
            full = ''.join(ps)
            want = r.get('raw_response_with_special_tokens') or r['raw_response']
            assert full == want, (lane, qid, full, want)
            assert len(ids) == r['output_tokens'], (lane, qid)
            key = tuple(ps)
            if key not in index:
                index[key] = len(seqs)
                seqs.append(ps)
            split[r['raw_response']].add(index[key])
            items[qid] = [r['prompt_tokens'], r['output_tokens'], r['kind'], index[key]]
        dup = sum(1 for v in seen.values() if v > 1)
        result[lane] = {
            'tokenizer': path.split('/rqa-20261006/')[1],
            'processors': dict(procs),
            'kinds': {'|'.join(map(str, k)): v for k, v in kinds.items()},
            'duplicates': dup,
            'seqs': seqs,
            'multiSplit': sum(1 for v in split.values() if len(v) > 1),
            'items': items,
        }
        print(lane, dict(kinds), 'distinct raw', len(split), 'seqs', len(seqs), 'multi-split raw', sum(1 for v in split.values() if len(v) > 1), 'items', len(items), 'dup', dup, dict(procs), file=sys.stderr)
    json.dump(result, open(dest, 'w'), separators=(',', ':'))


if __name__ == '__main__':
    main(sys.argv[1])
