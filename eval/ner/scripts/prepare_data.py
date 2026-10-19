"""Turn the raw corpora into seeded, normalised samples.

Output (gitignored, licences of some corpora forbid redistribution):
    eval/cache/prepared/{test,dev}/<set>.jsonl
Each line: {"id", "set", "lang", "text", "spans": [{start,end,label}],
            "ignore": [{start,end,label}]}
labels are PER / LOC / ORG; "ignore" holds gold entities of other classes
(MISC, products, events, facilities...). Predictions that overlap only an
ignore region are neither rewarded nor penalised.

A manifest with sample sizes, seed, label mapping, licence and a hash of the
selected sentence ids is written to eval/ner/results/data_manifest.json.
"""

from __future__ import annotations

import glob
import hashlib
import json
import random
import re
import sys
from pathlib import Path

import pyarrow.parquet as pq

HERE = Path(__file__).resolve().parent
NER = HERE.parent
CACHE = NER.parent / "cache"
RAW = CACHE / "raw"
OUT = CACHE / "prepared"
SEED = 20261019
N_TEST = 500
N_DEV = 300

NO_SPACE_BEFORE = {",", ".", ";", ":", "!", "?", ")", "]", "}", "%", "'s", "»", "”", "...", "n't"}
NO_SPACE_AFTER = {"(", "[", "{", "«", "„", "“", "¿", "¡"}


def detok(tokens: list[str]) -> tuple[str, list[tuple[int, int]]]:
    """Join tokens with light detokenisation; return text and char offsets."""
    out, offs = "", []
    for i, t in enumerate(tokens):
        if i > 0 and t not in NO_SPACE_BEFORE and tokens[i - 1] not in NO_SPACE_AFTER:
            out += " "
        offs.append((len(out), len(out) + len(t)))
        out += t
    return out, offs


def bio_to_spans(tags: list[str]) -> list[tuple[int, int, str]]:
    """IOB1/IOB2 tags (raw type names) -> token spans [s, e) with raw type."""
    spans, cur = [], None
    for i, tag in enumerate(tags + ["O"]):
        if tag == "O" or tag == "" or tag is None:
            if cur:
                spans.append(tuple(cur))
            cur = None
            continue
        pre, typ = (tag.split("-", 1) + [""])[:2] if "-" in tag else ("I", tag)
        if pre == "B" or cur is None or cur[2] != typ:
            if cur:
                spans.append(tuple(cur))
            cur = [i, i + 1, typ]
        else:
            cur[1] = i + 1
    return spans


def make_record(set_name, lang, sid, tokens, tags, mapper):
    text, offs = detok(tokens)
    spans, ignore = [], []
    for s, e, raw in bio_to_spans(tags):
        lab = mapper(raw)
        rec = {"start": offs[s][0], "end": offs[e - 1][1], "label": lab or raw}
        (spans if lab in ("PER", "LOC", "ORG") else ignore).append(rec)
    return {"id": f"{set_name}:{sid}", "set": set_name, "lang": lang, "text": text, "spans": spans, "ignore": ignore}


# ---------------------------------------------------------------- mappers
def m_std(raw):  # PER/LOC/ORG/MISC style
    raw = raw.upper()
    return {"PER": "PER", "PERSON": "PER", "LOC": "LOC", "LOCATION": "LOC", "ORG": "ORG"}.get(raw)


MC_PER = {"Artist", "Athlete", "Politician", "Scientist", "Cleric", "SportsManager", "OtherPER"}
MC_LOC = {"Facility", "HumanSettlement", "Station", "OtherLOC"}
MC_ORG = {"MusicalGRP", "PublicCorp", "PrivateCorp", "AerospaceManufacturer", "SportsGRP", "CarManufacturer", "ORG"}


def m_multiconer(raw):
    return "PER" if raw in MC_PER else "LOC" if raw in MC_LOC else "ORG" if raw in MC_ORG else None


def m_kpwr(raw):
    if raw == "nam_liv_person":
        return "PER"
    if raw.startswith("nam_loc") or raw in ("nam_fac_road", "nam_fac_square"):
        return "LOC"
    if raw.startswith("nam_org"):
        return "ORG"
    return None


def m_wnut(raw):
    return {"person": "PER", "location": "LOC", "corporation": "ORG", "group": "ORG"}.get(raw)


def m_germeval(raw):  # outer level only; *deriv / *part are ignored
    return {"PER": "PER", "LOC": "LOC", "ORG": "ORG"}.get(raw)


# ---------------------------------------------------------------- readers
def read_conll(path, tok_col=0, tag_col=-1, sep=None, comment=(), docstart="-DOCSTART"):
    sents, toks, tags = [], [], []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if line.startswith(docstart) or any(line.startswith(c) for c in comment):
                continue
            if not line.strip():
                if toks:
                    sents.append((toks, tags))
                toks, tags = [], []
                continue
            cols = line.split(sep) if sep else line.split()
            toks.append(cols[tok_col])
            tags.append(cols[tag_col])
    if toks:
        sents.append((toks, tags))
    return sents


def read_germeval(path):
    sents, toks, tags = [], [], []
    for line in open(path, encoding="utf-8"):
        line = line.rstrip("\n")
        if line.startswith("#"):
            continue
        if not line.strip():
            if toks:
                sents.append((toks, tags))
            toks, tags = [], []
            continue
        cols = line.split("\t")
        toks.append(cols[1])
        tags.append(cols[2])
    if toks:
        sents.append((toks, tags))
    return sents


def read_parquet_tokens(path, id2label):
    t = pq.read_table(path).to_pylist()
    out = []
    for r in t:
        tags = [id2label[x] if isinstance(x, int) else x for x in r["ner_tags"]]
        out.append((r["tokens"], tags))
    return out


WIKIANN_LABELS = ["O", "B-PER", "I-PER", "B-ORG", "I-ORG", "B-LOC", "I-LOC"]
UNER_LABELS = ["O", "B-PER", "I-PER", "B-ORG", "I-ORG", "B-LOC", "I-LOC"]

LICENCES = {
    "uner": "CC BY-SA 4.0 (Universal NER v1, Mayhew et al. 2024; gold, on UD treebanks)",
    "turku": "CC BY-SA 4.0 (LICENSE file in TurkuNLP/turku-ner-corpus v1.0; HF mirror card says CC BY-NC-SA 4.0)",
    "conll2002": "No explicit licence; distributed freely for research by the CoNLL-2002 shared task (EFE / De Morgen newswire)",
    "germeval14": "CC BY 4.0",
    "kpwr": "CC BY 3.0 (clarin-pl/kpwr-ner, n82 tagset)",
    "multiconer2": "CC BY 4.0 (MultiCoNER II, SemEval-2023 Task 2; lower-cased, short, complex entities)",
    "wikiann": "Unclear/unknown (WikiANN / PAN-X; silver labels derived from Wikipedia links)",
    "wnut17": "CC BY 4.0 (WNUT-17 emerging entities; social-media English)",
}


def build_sets():
    """Return {split: {set_name: (lang, family, sentences, mapper)}}."""
    sets = {"test": {}, "dev": {}}
    # Universal NER (gold, CC BY-SA)
    for code, lang in [("en_ewt", "en"), ("da_ddt", "da"), ("pt_bosque", "pt"), ("sv_talbanken", "sv"),
                       ("sk_snk", "sk"), ("hr_set", "hr"), ("de_pud", "de"), ("sv_pud", "sv")]:
        sets["test"][f"uner_{code}"] = (lang, "uner", read_parquet_tokens(RAW / "uner" / code / "test-00000-of-00001.parquet", UNER_LABELS), m_std)
        v = RAW / "uner" / code / "validation-00000-of-00001.parquet"
        if v.exists():
            sets["dev"][f"uner_{code}"] = (lang, "uner", read_parquet_tokens(v, UNER_LABELS), m_std)
    tk = RAW / "turku" / "turku-ner-corpus-1.0" / "data" / "conll"
    sets["test"]["turku_fi"] = ("fi", "turku", read_conll(tk / "test.tsv", sep="\t", comment=()), m_std)
    sets["dev"]["turku_fi"] = ("fi", "turku", read_conll(tk / "dev.tsv", sep="\t", comment=()), m_std)
    for lang, pre in [("es", "esp"), ("nl", "ned")]:
        sets["test"][f"conll2002_{lang}"] = (lang, "conll2002", read_conll(RAW / "conll2002" / f"{pre}.testb", comment=()), m_std)
        sets["dev"][f"conll2002_{lang}"] = (lang, "conll2002", read_conll(RAW / "conll2002" / f"{pre}.testa", comment=()), m_std)
    sets["test"]["germeval14_de"] = ("de", "germeval14", read_germeval(RAW / "germeval14" / "NER-de-test.tsv"), m_germeval)
    sets["dev"]["germeval14_de"] = ("de", "germeval14", read_germeval(RAW / "germeval14" / "NER-de-dev.tsv"), m_germeval)
    kp = RAW / "kpwr" / "data"
    sets["test"]["kpwr_pl"] = ("pl", "kpwr", read_conll(kp / "kpwr-ner-n82-test.iob", sep="\t", comment=()), m_kpwr)
    sets["dev"]["kpwr_pl"] = ("pl", "kpwr", read_conll(kp / "kpwr-ner-n82-train-tune.iob", sep="\t", comment=()), m_kpwr)
    sets["test"]["wnut17_en"] = ("en", "wnut17", read_conll(RAW / "wnut17" / "emerging.test.annotated", sep="\t", comment=()), m_wnut)
    sets["dev"]["wnut17_en"] = ("en", "wnut17", read_conll(RAW / "wnut17" / "emerging.dev.conll", sep="\t", comment=()), m_wnut)
    for d, l in [("DE-German", "de"), ("EN-English", "en"), ("ES-Spanish", "es"), ("FR-French", "fr"),
                 ("IT-Italian", "it"), ("PT-Portuguese", "pt"), ("SV-Swedish", "sv")]:
        for split, f in (("test", "test"), ("dev", "dev")):
            sets[split][f"multiconer2_{l}"] = (l, "multiconer2", read_conll(RAW / "multiconer2" / d / f"{l}_{f}.conll", tok_col=0, comment=("# id ",)), m_multiconer)
    for l in ["en", "de", "fr", "es", "it", "nl", "pl", "pt", "sv", "fi", "da", "cs", "et", "hu", "ro"]:
        sets["test"][f"wikiann_{l}"] = (l, "wikiann", read_parquet_tokens(RAW / "wikiann" / l / "test-00000-of-00001.parquet", WIKIANN_LABELS), m_std)
        sets["dev"][f"wikiann_{l}"] = (l, "wikiann", read_parquet_tokens(RAW / "wikiann" / l / "validation-00000-of-00001.parquet", WIKIANN_LABELS), m_std)
    return sets


def europii(split):
    rows = [json.loads(l) for l in open(RAW / "europii" / "data" / f"{split}.jsonl", encoding="utf-8")]
    out = []
    for r in rows:
        spans = [{"start": s["start"], "end": s["end"], "label": "PER"} for s in r["spans"] if s["label"] == "PERSON"]
        other = [{"start": s["start"], "end": s["end"], "label": s["label"]} for s in r["spans"] if s["label"] != "PERSON"]
        out.append({"id": f"europii:{r['id']}", "set": "europii", "lang": r["language"], "text": r["text"],
                    "spans": spans, "ignore": [], "other_pii": other, "template": r["template"]})
    return out


MARK = re.compile(r"\[\[(PER|LOC):(.+?)\]\]")


def handwritten():
    sys.path.insert(0, str(HERE))
    import handwritten as hw

    chat, neg = [], []
    for i, (lang, marked) in enumerate(hw.CHAT_PROMPTS):
        text, spans, pos = "", [], 0
        for m in MARK.finditer(marked):
            text += marked[pos:m.start()]
            spans.append({"start": len(text), "end": len(text) + len(m.group(2)), "label": m.group(1)})
            text += m.group(2)
            pos = m.end()
        text += marked[pos:]
        chat.append({"id": f"chat_prompts:{i}", "set": "chat_prompts", "lang": lang, "text": text, "spans": spans, "ignore": []})
    for i, (kind, text) in enumerate(hw.NEGATIVES):
        neg.append({"id": f"negatives:{i}", "set": "negatives", "lang": kind if len(kind) == 2 else "xx", "kind": kind,
                    "text": text, "spans": [], "ignore": []})
    return chat, neg


STDLIB_MODULES = ["json/decoder.py", "csv.py", "argparse.py", "pathlib/_local.py", "http/client.py", "email/message.py",
                  "logging/handlers.py", "shutil.py", "tarfile.py", "zipfile/__init__.py", "subprocess.py", "configparser.py",
                  "datetime.py" if False else "_pydatetime.py", "decimal.py" if False else "_pydecimal.py", "statistics.py",
                  "textwrap.py", "urllib/parse.py", "uuid.py", "sqlite3/dump.py", "asyncio/tasks.py", "concurrent/futures/_base.py",
                  "dataclasses.py", "enum.py", "functools.py", "heapq.py", "ipaddress.py", "smtplib.py", "socketserver.py",
                  "tempfile.py", "unittest/case.py"]


def code_chunks(n=300, lines=6):
    """Code-only chunks (comments + docstrings removed via ast.unparse) from the
    CPython standard library of the running interpreter: a larger negative set
    for code pasted into chat. Assumed to contain no person / place names."""
    import ast
    import sysconfig

    stdlib = Path(sysconfig.get_paths()["stdlib"])
    pool = []
    for mod in STDLIB_MODULES:
        f = stdlib / mod
        if not f.exists():
            continue
        tree = ast.parse(f.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            body = getattr(node, "body", None)
            if isinstance(body, list) and body and isinstance(body[0], ast.Expr) and isinstance(getattr(body[0], "value", None), ast.Constant) and isinstance(body[0].value.value, str):
                node.body = body[1:] or [ast.Pass()]
        src = [l for l in ast.unparse(tree).splitlines() if l.strip()]
        for i in range(0, len(src) - lines, lines):
            pool.append((mod, "\n".join(src[i:i + lines])))
    rng = random.Random(f"{SEED}:code")
    pick = sorted(rng.sample(range(len(pool)), min(n, len(pool))))
    return [{"id": f"code_stdlib:{i}", "set": "code_stdlib", "lang": "xx", "kind": pool[i][0], "text": pool[i][1],
             "spans": [], "ignore": []} for i in pick]


LOWERCASE_PROBES = ["germeval14_de", "turku_fi", "conll2002_es", "uner_en_ewt", "kpwr_pl"]


def main() -> int:
    rng_master = random.Random(SEED)
    manifest = {"seed": SEED, "n_test": N_TEST, "n_dev": N_DEV, "sets": {}, "licences": LICENCES}
    sets = build_sets()
    for split, n in (("test", N_TEST), ("dev", N_DEV)):
        (OUT / split).mkdir(parents=True, exist_ok=True)
        for name, (lang, fam, sents, mapper) in sorted(sets[split].items()):
            sents = [s for s in sents if s[0]]
            idx = list(range(len(sents)))
            rng = random.Random(f"{SEED}:{split}:{name}")
            pick = sorted(rng.sample(idx, min(n, len(idx))))
            recs = [make_record(name, lang, i, *sents[i], mapper) for i in pick]
            with open(OUT / split / f"{name}.jsonl", "w", encoding="utf-8") as f:
                for r in recs:
                    f.write(json.dumps(r, ensure_ascii=False) + "\n")
            cnt = {}
            for r in recs:
                for s in r["spans"]:
                    cnt[s["label"]] = cnt.get(s["label"], 0) + 1
            manifest["sets"][f"{split}/{name}"] = {
                "lang": lang, "family": fam, "pool": len(sents), "sampled": len(recs), "entities": cnt,
                "ignored_entities": sum(len(r["ignore"]) for r in recs),
                "ids_sha256": hashlib.sha256(",".join(map(str, pick)).encode()).hexdigest()[:16],
            }
            print(split, name, len(sents), len(recs), cnt)
    for split in ("test", "dev"):
        recs = europii(split)
        with open(OUT / split / "europii.jsonl", "w", encoding="utf-8") as f:
            for r in recs:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        manifest["sets"][f"{split}/europii"] = {"lang": "multi", "family": "europii", "pool": len(recs), "sampled": len(recs),
                                                "entities": {"PER": sum(len(r["spans"]) for r in recs)}}
    chat, neg = handwritten()
    code = code_chunks()
    for name, recs in (("chat_prompts", chat), ("negatives", neg), ("code_stdlib", code)):
        with open(OUT / "test" / f"{name}.jsonl", "w", encoding="utf-8") as f:
            for r in recs:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        manifest["sets"][f"test/{name}"] = {"lang": "multi", "family": "handwritten", "sampled": len(recs),
                                             "entities": {l: sum(1 for r in recs for s in r["spans"] if s["label"] == l) for l in ("PER", "LOC")}}
    for name in LOWERCASE_PROBES:  # robustness probe: same sentences, lower-cased
        recs = [json.loads(l) for l in open(OUT / "test" / f"{name}.jsonl", encoding="utf-8")]
        with open(OUT / "test" / f"lc_{name}.jsonl", "w", encoding="utf-8") as f:
            for r in recs:
                r = dict(r, id="lc_" + r["id"], set="lc_" + name, text=r["text"].lower())
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        manifest["sets"][f"test/lc_{name}"] = dict(manifest["sets"][f"test/{name}"], family="lowercase_probe")
    manifest["licences"]["code_stdlib"] = "Python Software Foundation License (CPython standard library source, code only)"
    manifest["licences"]["handwritten"] = "Written for this study (Apache-2.0 with the repository)"
    manifest["licences"]["europii"] = "CC BY 4.0 (sinceaihq/europii-bench; synthetic, template-based)"
    (NER / "results").mkdir(exist_ok=True)
    json.dump(manifest, open(NER / "results" / "data_manifest.json", "w"), indent=1, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
