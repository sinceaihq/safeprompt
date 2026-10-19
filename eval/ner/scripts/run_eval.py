"""Run one model over every prepared set and store raw predictions.

Usage: python -I scripts/run_eval.py MODEL_NAME [--threads 6] [--splits dev,test] [--sets a,b]
Writes eval/cache/preds/<model>/<split>/<set>.jsonl  ({"id", "preds": [[s,e,type,score,raw],...]})
and eval/ner/results/runs/<model>.json (revision, sizes, wall time).
Predictions are stored without a threshold (argmax decoding for token
classifiers, 0.3 floor for GLiNER) so score.py can sweep thresholds offline.
"""

from __future__ import annotations

import argparse
import json
import os
import resource
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import models  # noqa: E402

NER = HERE.parent
CACHE = NER.parent / "cache"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("model")
    ap.add_argument("--threads", type=int, default=6)
    ap.add_argument("--splits", default="dev,test")
    ap.add_argument("--sets", default="")
    a = ap.parse_args()
    t0 = time.time()
    m = models.load(a.model, threads=a.threads)
    load_s = time.time() - t0
    run = {"model": a.model, "repo": m.spec.repo, "onnx": m.spec.onnx, "kind": m.spec.kind, "licence": m.spec.licence,
           "notes": m.spec.notes, "revision": m.fetched["revision"], "onnx_bytes": m.fetched["onnx_bytes"],
           "download_bytes": m.fetched["download_bytes"], "files": m.fetched["files"], "load_seconds": load_s,
           "threads": a.threads, "sets": {}}
    want = set(filter(None, a.sets.split(",")))
    for split in a.splits.split(","):
        d = CACHE / "prepared" / split
        out = CACHE / "preds" / a.model / split
        out.mkdir(parents=True, exist_ok=True)
        for f in sorted(d.glob("*.jsonl")):
            name = f.stem
            if want and name not in want:
                continue
            recs = [json.loads(l) for l in open(f, encoding="utf-8")]
            t = time.time()
            preds = m.predict([r["text"] for r in recs])
            dt = time.time() - t
            with open(out / f"{name}.jsonl", "w", encoding="utf-8") as fo:
                for r, p in zip(recs, preds):
                    fo.write(json.dumps({"id": r["id"], "preds": [list(x) for x in p]}, ensure_ascii=False) + "\n")
            run["sets"][f"{split}/{name}"] = {"n": len(recs), "seconds": round(dt, 2)}
            print(f"{a.model} {split}/{name}: {len(recs)} in {dt:.1f}s", flush=True)
    run["total_seconds"] = round(time.time() - t0, 1)
    run["peak_rss_mb_process"] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
    (NER / "results" / "runs").mkdir(parents=True, exist_ok=True)
    p = NER / "results" / "runs" / f"{a.model}.json"
    if p.exists() and want:
        old = json.load(open(p))
        old["sets"].update(run["sets"])
        run["sets"] = old["sets"]
    json.dump(run, open(p, "w"), indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
