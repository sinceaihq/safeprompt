"""Print / save qualitative error examples for one model at its chosen thresholds.

Usage: python -I scripts/examples.py MODEL [--n 8]
Writes eval/ner/results/examples/<model>.json (false negatives and false positives
per set, deterministic order: first N in file order). Real-corpus texts are
shortened to a 120-char window around the error.
"""

import argparse
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
NER = HERE.parent
CACHE = NER.parent / "cache"
SETS = ["chat_prompts", "negatives", "europii", "turku_fi", "kpwr_pl", "uner_en_ewt", "germeval14_de", "lc_uner_en_ewt", "wnut17_en"]


def ov(a, b):
    return a[0] < b[1] and b[0] < a[1]


def window(text, s, e, w=60):
    a, b = max(0, s - w), min(len(text), e + w)
    return ("…" if a else "") + text[a:s] + "⟦" + text[s:e] + "⟧" + text[e:b] + ("…" if b < len(text) else "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("model")
    ap.add_argument("--n", type=int, default=8)
    a = ap.parse_args()
    op = json.load(open(NER / "results" / "scores" / f"{a.model}.json"))["operating_point"]
    thr = {t: op[t]["threshold"] for t in ("PER", "LOC", "ORG")}
    out = {"model": a.model, "thresholds": thr, "sets": {}}
    for name in SETS:
        gp = CACHE / "prepared" / "test" / f"{name}.jsonl"
        pp = CACHE / "preds" / a.model / "test" / f"{name}.jsonl"
        if not pp.exists():
            continue
        gold = [json.loads(l) for l in open(gp, encoding="utf-8")]
        preds = {json.loads(l)["id"]: json.loads(l)["preds"] for l in open(pp, encoding="utf-8")}
        fn, fp = [], []
        for g in gold:
            P = [(s, e, t, sc) for s, e, t, sc, raw in preds.get(g["id"], []) if t in thr and sc >= thr[t]]
            G = [(x["start"], x["end"], x["label"]) for x in g["spans"]]
            ign = [(x["start"], x["end"]) for x in g.get("ignore", [])] + [(x["start"], x["end"]) for x in g.get("other_pii", [])]
            for s, e, t in G:
                if t in ("PER", "LOC") and not any(ov((s, e), p) and p[2] == t for p in P):
                    got = [f"{g['text'][p[0]:p[1]]}:{p[2]}" for p in P if ov((s, e), p)]
                    fn.append({"type": t, "text": window(g["text"], s, e), "predicted_instead": got})
            for s, e, t, sc in P:
                if t in ("PER", "LOC") and not any(ov((s, e), x) and x[2] == t for x in G) and not any(ov((s, e), x) for x in ign):
                    fp.append({"type": t, "score": round(sc, 2), "text": window(g["text"], s, e)})
        out["sets"][name] = {"false_negatives": fn[: a.n], "false_positives": fp[: a.n], "n_fn": len(fn), "n_fp": len(fp)}
    d = NER / "results" / "examples"
    d.mkdir(exist_ok=True)
    json.dump(out, open(d / f"{a.model}.json", "w"), indent=1, ensure_ascii=False)
    for name, v in out["sets"].items():
        print(f"## {name}: FN={v['n_fn']} FP={v['n_fp']}")
        for x in v["false_negatives"][:5]:
            print("  FN", x["type"], x["text"].replace("\n", " ")[:160], x["predicted_instead"])
        for x in v["false_positives"][:5]:
            print("  FP", x["type"], x["score"], x["text"].replace("\n", " ")[:160])


if __name__ == "__main__":
    main()
