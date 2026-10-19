"""Score stored predictions against gold, sweep thresholds, pick operating points on dev.

Usage: python -I scripts/score.py [MODEL ...]      (default: every model with predictions)
Writes eval/ner/results/scores/<model>.json and prints a one-line summary.

Metrics per set x type (PER/LOC/ORG) x threshold:
  exact      P/R/F1 on exact (start, end, type) matches
  overlap    R = gold spans with >=1 character covered by a same-type prediction
             P = predictions overlapping a same-type gold span
  any_cov    gold spans with >=1 character covered by a prediction of ANY type
             (incl. OTHER, e.g. a name tagged as an e-mail or organisation)
  char_cov   fraction of gold characters covered by same-type predictions
  fp         predictions overlapping no same-type gold span; split into
             'confused' (overlaps a gold span of another type) and 'spurious'
Predictions that overlap only an "ignore" region (gold MISC / product / event
etc.) are dropped before scoring. Rates "per 1k tokens" use whitespace tokens.
"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
NER = HERE.parent
CACHE = NER.parent / "cache"
TYPES = ("PER", "LOC", "ORG")
THRESHOLDS = [round(0.3 + 0.05 * i, 2) for i in range(14)]  # 0.30 .. 0.95

# One cased, gold-annotated real-text set per language = the primary table.
PRIMARY_TEST = ["uner_en_ewt", "germeval14_de", "conll2002_es", "conll2002_nl", "turku_fi", "kpwr_pl",
                "uner_sv_pud", "uner_pt_bosque", "uner_da_ddt", "uner_sk_snk", "uner_hr_set"]
PRIMARY_DEV = ["uner_en_ewt", "germeval14_de", "conll2002_es", "conll2002_nl", "turku_fi", "kpwr_pl",
               "uner_pt_bosque", "uner_da_ddt", "uner_sk_snk", "uner_hr_set"]
GROUPS = {
    "primary_gold": PRIMARY_TEST,
    "wikiann": [f"wikiann_{l}" for l in ["en", "de", "fr", "es", "it", "nl", "pl", "pt", "sv", "fi", "da", "cs", "et", "hu", "ro"]],
    "multiconer2_lowercase": [f"multiconer2_{l}" for l in ["de", "en", "es", "fr", "it", "pt", "sv"]],
    "lowercase_probe": ["lc_germeval14_de", "lc_turku_fi", "lc_conll2002_es", "lc_uner_en_ewt", "lc_kpwr_pl"],
    "lowercase_probe_cased_twin": ["germeval14_de", "turku_fi", "conll2002_es", "uner_en_ewt", "kpwr_pl"],
}


def overlaps(a, b):
    return a[0] < b[1] and b[0] < a[1]


def ntokens(text):
    return len(text.split())


def sentence_counts(gold, preds, thr):
    """Per-sentence counts for every type; returns dict type -> dict of ints."""
    spans = [(s["start"], s["end"], s["label"]) for s in gold["spans"]]
    ign = [(s["start"], s["end"]) for s in gold.get("ignore", [])]
    other_pii = [(s["start"], s["end"]) for s in gold.get("other_pii", [])]
    P = []
    for s, e, t, sc, raw in preds:
        if sc < thr:
            continue
        if ign and any(overlaps((s, e), g) for g in ign) and not any(overlaps((s, e), g) for g in spans):
            continue
        P.append((s, e, t))
    out = {}
    for t in TYPES:
        g = [x for x in spans if x[2] == t]
        p = [x for x in P if x[2] == t]
        c = {"gold": len(g), "pred": len(p)}
        c["exact_tp"] = len(set(g) & set(p))
        c["ov_gold"] = sum(1 for x in g if any(overlaps(x, y) for y in p))
        c["ov_pred"] = sum(1 for y in p if any(overlaps(x, y) for x in g))
        c["any_cov"] = sum(1 for x in g if any(overlaps(x, y) for y in P))
        gold_chars = set()
        for x in g:
            gold_chars.update(range(x[0], x[1]))
        cov = set()
        for y in p:
            cov.update(range(y[0], y[1]))
        c["gold_chars"] = len(gold_chars)
        c["cov_chars"] = len(gold_chars & cov)
        fps = [y for y in p if not any(overlaps(x, y) for x in g)]
        c["fp_confused"] = sum(1 for y in fps if any(overlaps(x, y) for x in spans))
        c["fp_other_pii"] = sum(1 for y in fps if not any(overlaps(x, y) for x in spans) and any(overlaps(y, o) for o in other_pii))
        c["fp_spurious"] = len(fps) - c["fp_confused"] - c["fp_other_pii"]
        out[t] = c
    return out


def finalize(c):
    def div(a, b):
        return a / b if b else None

    def f1(p, r):
        return 2 * p * r / (p + r) if p is not None and r is not None and (p + r) > 0 else (0.0 if p is not None and r is not None else None)

    m = dict(c)
    m["exact_p"] = div(c["exact_tp"], c["pred"])
    m["exact_r"] = div(c["exact_tp"], c["gold"])
    m["exact_f1"] = f1(m["exact_p"], m["exact_r"])
    m["ov_p"] = div(c["ov_pred"], c["pred"])
    m["ov_r"] = div(c["ov_gold"], c["gold"])
    m["ov_f1"] = f1(m["ov_p"], m["ov_r"])
    m["any_cov_r"] = div(c["any_cov"], c["gold"])
    m["char_cov"] = div(c["cov_chars"], c["gold_chars"])
    m["fp"] = c["fp_confused"] + c["fp_spurious"] + c["fp_other_pii"]
    m["fp_per_1k_tok"] = 1000 * m["fp"] / c["tokens"] if c["tokens"] else None
    m["spurious_per_1k_tok"] = 1000 * c["fp_spurious"] / c["tokens"] if c["tokens"] else None
    m["pred_per_1k_tok"] = 1000 * c["pred"] / c["tokens"] if c["tokens"] else None
    return m


def add(a, b):
    for k, v in b.items():
        a[k] = a.get(k, 0) + v


def load_set(model, split, name):
    gold = [json.loads(l) for l in open(CACHE / "prepared" / split / f"{name}.jsonl", encoding="utf-8")]
    pf = CACHE / "preds" / model / split / f"{name}.jsonl"
    if not pf.exists():
        return None
    preds = {json.loads(l)["id"]: json.loads(l)["preds"] for l in open(pf, encoding="utf-8")}
    missing = [g["id"] for g in gold if g["id"] not in preds]
    if missing:
        print(f"WARNING {model} {split}/{name}: {len(missing)} gold ids without predictions", file=sys.stderr)
    return gold, preds


def score_set(gold, preds, thr, subset=None):
    tot = {t: {"tokens": 0} for t in TYPES}
    per_sent = []
    for g in gold:
        if subset is not None and not subset(g):
            continue
        sc = sentence_counts(g, preds.get(g["id"], []), thr)
        nt = ntokens(g["text"])
        for t in TYPES:
            sc[t]["tokens"] = nt
            add(tot[t], sc[t])
        per_sent.append(sc)
    return {t: finalize(tot[t]) for t in TYPES}, per_sent


def bootstrap_f1(per_sent, t, key_r="ov_gold", key_p="ov_pred", n=1000, seed=7):
    """95% CI of overlap F1 / recall by resampling sentences."""
    rng = random.Random(seed)
    N = len(per_sent)
    if N == 0:
        return None
    rs, fs = [], []
    for _ in range(n):
        g = p = og = op = 0
        for _ in range(N):
            c = per_sent[rng.randrange(N)][t]
            g += c["gold"]; p += c["pred"]; og += c[key_r]; op += c[key_p]
        r = og / g if g else 0.0
        pr = op / p if p else 0.0
        rs.append(r)
        fs.append(2 * r * pr / (r + pr) if r + pr else 0.0)
    rs.sort(); fs.sort()
    return {"r_lo": rs[int(0.025 * n)], "r_hi": rs[int(0.975 * n)], "f1_lo": fs[int(0.025 * n)], "f1_hi": fs[int(0.975 * n)]}


def macro(vals):
    vals = [v for v in vals if v is not None]
    return sum(vals) / len(vals) if vals else None


def pick_threshold(dev, t):
    """Maximise macro overlap-F1 of type t over the real-text dev sets + EuroPII dev (PER only)."""
    best = None
    curve = {}
    for thr in THRESHOLDS:
        vals = [dev[name][str(thr)][t]["ov_f1"] for name in PRIMARY_DEV if name in dev]
        if t == "PER" and "europii" in dev:
            vals.append(dev["europii"][str(thr)]["PER"]["ov_f1"])
        m = macro(vals)
        curve[str(thr)] = m
        if m is not None and (best is None or m > best[1] + 1e-9):
            best = (thr, m)
    return best, curve


def score_model(model):
    res = {"model": model, "thresholds": THRESHOLDS, "dev": {}, "test": {}}
    for split in ("dev", "test"):
        for f in sorted((CACHE / "prepared" / split).glob("*.jsonl")):
            ls = load_set(model, split, f.stem)
            if ls is None:
                continue
            gold, preds = ls
            res[split][f.stem] = {}
            for thr in THRESHOLDS:
                res[split][f.stem][str(thr)], _ = score_set(gold, preds, thr)
            if f.stem == "europii":  # extra views: messages without any PERSON (template 3)
                for thr in THRESHOLDS:
                    res[split][f.stem][str(thr)]["no_person_msgs"], _ = score_set(gold, preds, thr, subset=lambda g: not g["spans"])
    if not res["dev"]:
        return res
    op = {}
    for t in ("PER", "LOC", "ORG"):
        best, curve = pick_threshold(res["dev"], t)
        op[t] = {"threshold": best[0] if best else None, "dev_macro_ov_f1": best[1] if best else None, "dev_curve": curve}
    res["operating_point"] = op
    # test summaries at the chosen thresholds and at a fixed 0.5 for comparability
    summ = {}
    for label, thr_of in (("chosen", lambda t: op[t]["threshold"]), ("fixed_0.5", lambda t: 0.5)):
        s = {}
        for gname, sets in GROUPS.items():
            s[gname] = {}
            for t in TYPES:
                rows = [res["test"][n][str(thr_of(t))][t] for n in sets if n in res["test"]]
                s[gname][t] = {k: macro([r[k] for r in rows]) for k in ("ov_r", "ov_p", "ov_f1", "exact_f1", "exact_p", "exact_r", "any_cov_r", "char_cov", "spurious_per_1k_tok", "fp_per_1k_tok")}
                s[gname][t]["n_sets"] = len(rows)
        for name in ("europii", "chat_prompts", "negatives", "code_stdlib", "wnut17_en"):
            if name in res["test"]:
                s[name] = {t: res["test"][name][str(thr_of(t))][t] for t in TYPES}
                if name == "europii":
                    s[name]["no_person_msgs"] = {t: res["test"][name][str(thr_of(t))]["no_person_msgs"][t] for t in TYPES}
        summ[label] = s
    res["summary"] = summ
    # bootstrap CIs for PER on primary sets + chat/europii at chosen threshold
    ci = {}
    for n in PRIMARY_TEST + ["europii", "chat_prompts"]:
        ls = load_set(model, "test", n)
        if ls is None:
            continue
        for t in ("PER", "LOC"):
            thr = op[t]["threshold"]
            _, per_sent = score_set(ls[0], ls[1], thr)
            ci[f"{n}/{t}"] = bootstrap_f1(per_sent, t, n=500)
    res["bootstrap_ci_chosen"] = ci
    return res


def main(argv):
    models = argv or sorted(p.name for p in (CACHE / "preds").iterdir())
    out = NER / "results" / "scores"
    out.mkdir(parents=True, exist_ok=True)
    for m in models:
        r = score_model(m)
        json.dump(r, open(out / f"{m}.json", "w"), indent=1)
        if "summary" in r:
            s = r["summary"]["chosen"]
            op = r["operating_point"]
            pg = s["primary_gold"]["PER"]
            print(f"{m:32s} thrPER={op['PER']['threshold']} PER ovR={pg['ov_r']:.3f} ovP={pg['ov_p']:.3f} ovF1={pg['ov_f1']:.3f} "
                  f"exF1={pg['exact_f1']:.3f} | LOC thr={op['LOC']['threshold']} ovF1={s['primary_gold']['LOC']['ov_f1']:.3f}"
                  + (f" | europii PER R={s['europii']['PER']['ov_r']:.3f} P={s['europii']['PER']['ov_p']:.3f}" if "europii" in s else ""))
        else:
            print(m, "no dev predictions; scored test only")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
