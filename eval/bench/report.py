"""Render the result tables of docs/BENCHMARK.md from eval/bench/results/*.json.

    python eval/bench/report.py   # rewrites the <!-- tables:start --> ... <!-- tables:end --> block
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RES = ROOT / "eval/bench/results"
LABELS = {"EMAIL": "e-mail", "PHONE": "phone", "IBAN": "IBAN", "PAYMENT_CARD": "payment card", "IP_ADDRESS": "IP address",
          "VAT_ID": "VAT number", "NATIONAL_ID": "national ID", "SECRET": "secret"}  # fmt: skip


def load(name: str) -> dict:
    return json.loads((RES / f"{name}.json").read_text())


def row(name: str, r: dict) -> str:
    o = r["overall"]
    return (f"| {name} | {o['precision']} | {o['recall']} | {o['f1']} | {o['values_fully_hidden']} | "
            f"{r['negative_documents_flagged']} of {r['negative_documents']} | {r['false_positives_per_10k_chars']} |")  # fmt: skip


def main() -> None:
    head = "| system | precision | recall | F1 | values fully hidden | clean documents flagged | false alarms per 10k characters |\n|---|---|---|---|---|---|---|"
    out = ["### Personal data (secrets excluded)", "", head]
    for name, f in [("**SafePrompt 0.1.0**", "safeprompt-structured"), ("EuroPII Guard 0.1.2", "europii-guard"),
                    ("Presidio + EuroPII Guard", "presidio+europii"), ("Presidio (default)", "presidio")]:  # fmt: skip
        out.append(row(name, load(f)))
    out += ["", "### SafePrompt sensitivity settings (all labels, incl. secrets)", "", head]
    for name, f in [("Fewer alerts (0.7)", "safeprompt-t0.7"), ("**Balanced (0.5, default)**", "safeprompt-t0.5"),
                    ("Catch more (0.25)", "safeprompt-t0.25")]:  # fmt: skip
        out.append(row(name, load(f)))
    r = load("safeprompt-t0.5")
    out += ["", "### SafePrompt per type (default setting)", "", "| type | values | precision | recall | exact span | false alarms | misses |", "|---|---|---|---|---|---|---|"]
    for k, v in r["per_label"].items():
        out.append(f"| {LABELS[k]} | {v['gold']} | {v['precision']} | {v['recall']} | {v['exact_span']} | {v['fp']} | {v['fn']} |")
    out += ["", "### SafePrompt per document format (default setting)", "", "| format | values | precision | recall | false alarms | misses |", "|---|---|---|---|---|---|"]
    for k, v in r["per_format"].items():
        out.append(f"| {k} | {v['gold']} | {v['precision'] if v['gold'] else '—'} | {v['recall'] if v['gold'] else '—'} | {v['fp']} | {v['fn']} |")
    s, g = load("safeprompt-secrets"), load("gitleaks-secrets")
    out += ["", "### Secrets (not a meaningful comparison, see below)", "", "| system | precision | recall |", "|---|---|---|",
            f"| SafePrompt 0.1.0 | {s['overall']['precision']} | {s['overall']['recall']} |",
            f"| gitleaks 8.30.1 (default rules) | {g['overall']['precision']} | {g['overall']['recall']} |"]  # fmt: skip
    e = load("safeprompt-on-europii-bench")
    out += ["", f"On the EuroPII benchmark test split (2,075 messages, independent of SafePrompt-Bench): precision "
            f"{e['overall']['precision']}, recall {e['overall']['recall']} (EuroPII Guard 0.1.2: 96.9 / 96.8)."]  # fmt: skip
    timing = json.loads((RES / "pred/timing.json").read_text())
    out += ["", f"Speed on the test split (one CPU core, shared server): SafePrompt {r['ms_per_document']} ms per document in "
            f"Node.js; EuroPII Guard {timing['europii-guard']} ms, Presidio {timing['presidio']} ms in Python."]  # fmt: skip
    doc = ROOT / "docs/BENCHMARK.md"
    text = doc.read_text()
    text = re.sub(r"<!-- tables:start -->.*<!-- tables:end -->", "<!-- tables:start -->\n" + "\n".join(out) + "\n<!-- tables:end -->", text, flags=re.S)
    doc.write_text(text)
    print("updated", doc)


if __name__ == "__main__":
    main()
