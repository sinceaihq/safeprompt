"""Latency / memory / size benchmark for one model in a fresh process.

Usage: python -I scripts/bench.py MODEL --threads 1
Measures end-to-end predict() (tokenise + ONNX Runtime + decode) on a single
chunk of ~128 sub-word tokens (multilingual paragraph, cut at word boundary),
5 warm-up + 40 timed runs. Peak RSS is ru_maxrss of this process (model load
+ inference); 'rss_delta' subtracts the RSS measured after imports.
Writes eval/ner/results/bench/<model>__t<threads>.json
"""

from __future__ import annotations

import argparse
import json
import os
import resource
import statistics
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import numpy as np  # noqa: E402
import psutil  # noqa: E402

import models  # noqa: E402

PARAGRAPH = (
    "Hei Matti, kiitos viestistä. Lähetän sopimuksen Aino Virtaselle huomenna ja palaveri pidetään Tampereella torstaina. "
    "Guten Tag Frau Schneider, die Rechnung für die Wohnung in der Schillerstraße in München ist noch offen, bitte melden Sie sich. "
    "Bonjour Pierre, Camille Dubois prendra le relais pour le chantier de Nantes la semaine prochaine. "
    "Hola Lucía, la reunión con el señor Delgado en Sevilla se ha movido al jueves por la tarde. "
    "Hi Sarah, could you forward the signed contract to Priya Natarajan before Friday? Thanks a lot, Tom. "
    "Dzień dobry, proszę przesłać fakturę do pani Magdaleny Wiśniewskiej w Gdańsku do końca miesiąca. "
    "Hej Elsa, mötet i Göteborg flyttas till nästa vecka, hälsa Oskar Nyström."
)


def make_text(count_tokens, target=128):
    words = PARAGRAPH.split()
    text = ""
    for w in words:
        cand = (text + " " + w).strip()
        if count_tokens(cand) > target:
            break
        text = cand
    return text, count_tokens(text)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("model")
    ap.add_argument("--threads", type=int, default=1)
    ap.add_argument("--runs", type=int, default=40)
    a = ap.parse_args()
    proc = psutil.Process()
    base_rss = proc.memory_info().rss
    t0 = time.time()
    m = models.load(a.model, threads=a.threads)
    load_s = time.time() - t0
    if m.spec.kind == "tc":
        count = lambda s: len(m.tok.encode(s).ids)  # noqa: E731  (includes special tokens)
    else:
        tk = m.model.data_processor.transformer_tokenizer
        count = lambda s: len(tk(s.split(), is_split_into_words=True)["input_ids"])  # noqa: E731
    text, ntok = make_text(count)
    for _ in range(5):
        m.predict([text])
    ts = []
    for _ in range(a.runs):
        t = time.perf_counter()
        m.predict([text])
        ts.append((time.perf_counter() - t) * 1000)
    ts.sort()
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024
    res = {
        "model": a.model, "threads": a.threads, "tokens_in_chunk": ntok, "chunk_chars": len(text),
        "latency_ms_median": statistics.median(ts), "latency_ms_p90": ts[int(0.9 * len(ts)) - 1],
        "latency_ms_min": ts[0], "runs": a.runs, "load_seconds": load_s,
        "peak_rss_mb": peak / 2**20, "rss_after_imports_mb": base_rss / 2**20, "rss_delta_mb": (peak - base_rss) / 2**20,
        "onnx_mb": (m.fetched["onnx_bytes"] or 0) / 1e6, "tokenizer_mb": (m.fetched["tokenizer_bytes"] or 0) / 1e6,
        "download_mb": m.fetched["download_bytes"] / 1e6, "files": m.fetched["files"], "revision": m.fetched["revision"],
        "loadavg_1m_at_end": os.getloadavg()[0],
        "cpu": next((l.split(":", 1)[1].strip() for l in open("/proc/cpuinfo") if l.startswith("model name")), ""),
    }
    out = HERE.parent / "results" / "bench"
    out.mkdir(parents=True, exist_ok=True)
    json.dump(res, open(out / f"{a.model}__t{a.threads}.json", "w"), indent=1)
    print(json.dumps({k: (round(v, 1) if isinstance(v, float) else v) for k, v in res.items() if k not in ("files",)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
