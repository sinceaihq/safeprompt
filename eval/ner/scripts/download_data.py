"""Download the raw evaluation corpora into eval/cache/raw (gitignored).

Every source is pinned to a public URL / HF dataset repo. Nothing here is
redistributed; prepare_data.py turns the raw files into seeded samples that
also stay in the (gitignored) cache.

Usage:  python -I scripts/download_data.py
Env:    HF_HOME should point at eval/cache/hf.
"""

from __future__ import annotations

import os
import sys
import tarfile
import urllib.request
from pathlib import Path

from huggingface_hub import hf_hub_download

HERE = Path(__file__).resolve().parent
RAW = HERE.parent.parent / "cache" / "raw"

# (dest subdir, kind, source, files)
HF_DATASETS = [
    ("europii", "sinceaihq/europii-bench", ["data/dev.jsonl", "data/test.jsonl", "README.md"]),
    (
        "uner",
        "BramVanroy/universal_ner",
        [
            f"{c}/{s}-00000-of-00001.parquet"
            for c, splits in {
                "en_ewt": ["test", "validation"],
                "da_ddt": ["test", "validation"],
                "pt_bosque": ["test", "validation"],
                "sv_talbanken": ["test", "validation"],
                "sk_snk": ["test", "validation"],
                "hr_set": ["test", "validation"],
                "de_pud": ["test"],
                "sv_pud": ["test"],
            }.items()
            for s in splits
        ],
    ),
    ("kpwr", "clarin-pl/kpwr-ner", ["data/kpwr-ner-n82-test.iob", "data/kpwr-ner-n82-train-tune.iob", "README.md"]),
    (
        "multiconer2",
        "MultiCoNER/multiconer_v2",
        [f"{d}/{l}_{s}.conll" for d, l in [("DE-German", "de"), ("EN-English", "en"), ("ES-Spanish", "es"),
                                            ("FR-French", "fr"), ("IT-Italian", "it"), ("PT-Portuguese", "pt"),
                                            ("SV-Swedish", "sv")] for s in ("test", "dev")],
    ),
    (
        "wikiann",
        "unimelb-nlp/wikiann",
        [f"{l}/{s}-00000-of-00001.parquet" for l in
         ["en", "de", "fr", "es", "it", "nl", "pl", "pt", "sv", "fi", "da", "cs", "et", "hu", "ro"]
         for s in ("test", "validation")],
    ),
]

URLS = [
    ("conll2002", "https://raw.githubusercontent.com/teropa/nlp/master/resources/corpora/conll2002/esp.testb"),
    ("conll2002", "https://raw.githubusercontent.com/teropa/nlp/master/resources/corpora/conll2002/esp.testa"),
    ("conll2002", "https://raw.githubusercontent.com/teropa/nlp/master/resources/corpora/conll2002/ned.testb"),
    ("conll2002", "https://raw.githubusercontent.com/teropa/nlp/master/resources/corpora/conll2002/ned.testa"),
    ("wnut17", "https://raw.githubusercontent.com/leondz/emerging_entities_17/master/emerging.test.annotated"),
    ("wnut17", "https://raw.githubusercontent.com/leondz/emerging_entities_17/master/emerging.dev.conll"),
    ("turku", "https://github.com/TurkuNLP/turku-ner-corpus/archive/v1.0.tar.gz"),
    ("germeval14", "https://drive.google.com/uc?export=download&id=1u9mb7kNJHWQCWyweMDRMuTFoOHOfeBTH"),
    ("germeval14", "https://drive.google.com/uc?export=download&id=1ZfRcQThdtAR5PPRjIDtrVP7BtXSCUBbm"),
]
GERMEVAL_NAMES = {"1u9mb7kNJHWQCWyweMDRMuTFoOHOfeBTH": "NER-de-test.tsv",
                  "1ZfRcQThdtAR5PPRjIDtrVP7BtXSCUBbm": "NER-de-dev.tsv"}


def main() -> int:
    for sub, repo, files in HF_DATASETS:
        dest = RAW / sub
        dest.mkdir(parents=True, exist_ok=True)
        for f in files:
            p = hf_hub_download(repo, f, repo_type="dataset", local_dir=dest)
            print("ok", p)
    for sub, url in URLS:
        dest = RAW / sub
        dest.mkdir(parents=True, exist_ok=True)
        name = url.rsplit("/", 1)[-1]
        if "drive.google.com" in url:
            name = GERMEVAL_NAMES[url.rsplit("id=", 1)[-1]]
        out = dest / name
        if not out.exists():
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=120) as r:
                out.write_bytes(r.read())
        print("ok", out, out.stat().st_size)
        if name.endswith(".tar.gz"):
            with tarfile.open(out) as t:
                members = [m for m in t.getmembers() if m.isfile() and not m.issym() and ".." not in m.name]
                t.extractall(dest, members=members)
    return 0


if __name__ == "__main__":
    sys.exit(main())
