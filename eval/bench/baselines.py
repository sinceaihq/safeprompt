"""Predictions of other systems on SafePrompt-Bench, for evaluate.ts --pred.

    pip install "europii-guard[presidio] @ git+https://github.com/sinceaihq/europii-guard@v0.1.2"
    python -m spacy download en_core_web_lg
    python eval/bench/baselines.py --data eval/bench/data/test.jsonl --out eval/bench/results/pred

Writes one JSONL per system: {"id": ..., "findings": [{"entity", "start", "end"}]}
with code-point offsets. Presidio entity names are mapped to SafePrompt's.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

PRESIDIO_MAP = {
    "EMAIL_ADDRESS": "EMAIL", "PHONE_NUMBER": "PHONE", "IBAN_CODE": "IBAN", "CREDIT_CARD": "PAYMENT_CARD",
    "IP_ADDRESS": "IP_ADDRESS", "PERSON": "PERSON", "EU_VAT_ID": "VAT_ID", "EU_NATIONAL_ID": "NATIONAL_ID",
    "US_SSN": "NATIONAL_ID", "UK_NHS": "NATIONAL_ID", "UK_NINO": "NATIONAL_ID", "IT_FISCAL_CODE": "NATIONAL_ID",
    "ES_NIF": "NATIONAL_ID", "ES_NIE": "NATIONAL_ID", "PL_PESEL": "NATIONAL_ID", "FI_PERSONAL_IDENTITY_CODE": "NATIONAL_ID",
    "SE_PERSONNUMMER": "NATIONAL_ID", "DE_TAX_ID": "NATIONAL_ID", "IT_VAT_CODE": "VAT_ID", "DE_VAT_ID": "VAT_ID",
}  # fmt: skip


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    rows = [json.loads(line) for line in Path(args.data).read_text(encoding="utf-8").splitlines() if line]
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    import europii
    from presidio_analyzer import AnalyzerEngine
    from europii.presidio import EuroPIIRecognizer

    systems = {}
    systems["europii-guard"] = lambda t: [(f.entity, f.start, f.end) for f in europii.scan(t)]
    presidio = AnalyzerEngine()
    systems["presidio"] = lambda t: [(PRESIDIO_MAP.get(r.entity_type, r.entity_type), r.start, r.end) for r in presidio.analyze(t, language="en")]
    combined = AnalyzerEngine()
    combined.registry.add_recognizer(EuroPIIRecognizer(supported_language="en"))
    systems["presidio+europii"] = lambda t: [(PRESIDIO_MAP.get(r.entity_type, r.entity_type), r.start, r.end) for r in combined.analyze(t, language="en")]

    timing = {}
    for name, run in systems.items():
        t0 = time.perf_counter()
        with (out / f"{name}.jsonl").open("w", encoding="utf-8") as fh:
            for row in rows:
                found = [{"entity": e, "start": s, "end": en} for e, s, en in run(row["text"])]
                fh.write(json.dumps({"id": row["id"], "findings": found}) + "\n")
        timing[name] = round((time.perf_counter() - t0) / len(rows) * 1000, 2)
        print(name, "ms/doc", timing[name], "europii", europii.__version__)
    (out / "timing.json").write_text(json.dumps(timing, indent=2) + "\n")


if __name__ == "__main__":
    main()
