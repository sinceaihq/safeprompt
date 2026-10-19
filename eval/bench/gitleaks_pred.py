"""Run gitleaks (https://github.com/gitleaks/gitleaks) on SafePrompt-Bench documents.

    python eval/bench/gitleaks_pred.py --gitleaks ./gitleaks --data eval/bench/data/test.jsonl --out eval/bench/results/pred/gitleaks.jsonl

Each document is written to its own file; reported secrets are mapped back
to character offsets by locating the secret string in the document.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
import time
from pathlib import Path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gitleaks", required=True)
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    rows = [json.loads(line) for line in Path(args.data).read_text(encoding="utf-8").splitlines() if line]
    with tempfile.TemporaryDirectory() as tmp:
        for row in rows:
            (Path(tmp) / f"{row['id']}.txt").write_text(row["text"], encoding="utf-8")
        report = Path(tmp) / "report.json"
        t0 = time.perf_counter()
        subprocess.run([args.gitleaks, "dir", tmp, "--no-banner", "--report-format", "json", "--report-path", str(report),
                        "--exit-code", "0", "--log-level", "error"], check=True)  # fmt: skip
        elapsed = time.perf_counter() - t0
        findings: dict[str, list[dict[str, object]]] = {row["id"]: [] for row in rows}
        texts = {row["id"]: row["text"] for row in rows}
        for f in json.loads(report.read_text() or "[]"):
            doc = Path(f["File"]).stem
            if doc not in texts:
                continue
            start = texts[doc].find(f["Secret"])
            if start >= 0 and f["Secret"]:
                findings[doc].append({"entity": "SECRET", "start": start, "end": start + len(f["Secret"]), "rule": f["RuleID"]})
    with Path(args.out).open("w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps({"id": row["id"], "findings": findings[row["id"]]}) + "\n")
    print(f"gitleaks {len(rows)} docs in {elapsed:.1f}s")


if __name__ == "__main__":
    main()
