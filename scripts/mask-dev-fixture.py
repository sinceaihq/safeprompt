"""Write tests/fixtures/safeprompt-bench-dev-masked.jsonl.gz: the dev split with secret values masked.

The repository does not contain token-shaped strings (GitHub push protection
blocks even fake ones); the full data is on Hugging Face and can be
regenerated with eval/bench/generate.py.
"""

import gzip
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
rows = [json.loads(line) for line in (ROOT / "eval/bench/data/dev.jsonl").read_text(encoding="utf-8").splitlines()]
out = []
for r in rows:
    chars = list(r["text"])
    for s in r["spans"]:
        if s["label"] == "SECRET":
            chars[s["start"] : s["end"]] = "x" * (s["end"] - s["start"])
    r = dict(r, text="".join(chars), spans=[s for s in r["spans"] if s["label"] != "SECRET"])
    out.append(json.dumps(r, ensure_ascii=False))
with gzip.open(ROOT / "tests/fixtures/safeprompt-bench-dev-masked.jsonl.gz", "wt", encoding="utf-8") as fh:
    fh.write("\n".join(out) + "\n")
