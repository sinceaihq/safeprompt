"""Build Markdown tables + results/summary.json from scores/ and bench/.

Usage: python -I scripts/make_report.py [--focus MODEL]
Writes eval/ner/results/summary.json and eval/ner/results/tables.md
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
NER = HERE.parent
RES = NER / "results"
sys.path.insert(0, str(HERE))
from score import GROUPS, PRIMARY_TEST, THRESHOLDS  # noqa: E402

ORDER = ["davlan-distilmbert-hrl-int8", "bardsai-mini-int8", "nym-small-edge-int8", "nym-small-int8", "gliner-x-small-int8",
         "davlan-mbert-hrl-int8", "bardsai-v1-int8", "bardsai-v2-int8", "davlan-xlmr-hrl-int8", "gliner-multi-pii-int8",
         "gliner-multi-pii-fp32", "bardsai-v1-fp32", "bardsai-mini-fp32", "nym-small-fp32", "davlan-distilmbert-hrl-fp32",
         "gliner-x-small-fp32", "bardsai-v2-fp32"]


def f(x, pct=True, nd=1):
    if x is None:
        return "–"
    return f"{100 * x:.{nd}f}" if pct else f"{x:.{nd}f}"


def load_scores():
    out = {}
    for p in sorted((RES / "scores").glob("*.json")):
        out[p.stem] = json.load(open(p))
    return out


def load_bench():
    b = {}
    for p in sorted((RES / "bench").glob("*.json")) if (RES / "bench").exists() else []:
        r = json.load(open(p))
        b.setdefault(r["model"], {})[r["threads"]] = r
    return b


def lang_of(name):
    return name.rsplit("_", 1)[-1] if not name.startswith("uner_") else name.split("_")[1]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--focus", default="")
    a = ap.parse_args()
    S = load_scores()
    B = load_bench()
    runs = {p.stem: json.load(open(p)) for p in (RES / "runs").glob("*.json")}
    models = [m for m in ORDER if m in S and "summary" in S[m]] + [m for m in S if m not in ORDER and "summary" in S[m]]
    md = []
    summary = {"models": {}}

    # ---------- overview
    md.append("### Models\n")
    md.append("| model | repo / file | ONNX MB | licence | PER thr | LOC thr | 1-thread ms / 128 tok | 4-thread ms | peak RSS MB |")
    md.append("|---|---|---:|---|---:|---:|---:|---:|---:|")
    for m in models:
        r = runs.get(m, {})
        op = S[m]["operating_point"]
        b1 = B.get(m, {}).get(1, {})
        b4 = B.get(m, {}).get(4, {})
        md.append(f"| {m} | `{r.get('repo','')}` `{r.get('onnx','')}` | {((r.get('onnx_bytes') or 0) / 1e6):.0f} | {r.get('licence','')} | "
                  f"{op['PER']['threshold']} | {op['LOC']['threshold']} | {f(b1.get('latency_ms_median'), False, 0)} | "
                  f"{f(b4.get('latency_ms_median'), False, 0)} | {f(b1.get('peak_rss_mb'), False, 0)} |")
    md.append("")

    # ---------- headline
    md.append("### Headline (test, each model at its own dev-selected thresholds)\n")
    md.append("Overlap metrics (a gold span counts as found if any character is covered by a same-type prediction). "
              "Primary = macro over 11 cased gold real-text sets (en de es nl fi pl sv pt da sk hr).\n")
    md.append("| model | PER ov-R | PER ov-P | PER ov-F1 | PER exact-F1 | PER any-type cov | LOC ov-F1 | ORG ov-F1 | EuroPII PER R | EuroPII PER P | chat PER R | chat PER P | chat LOC R | neg PER+LOC FP /1k tok |")
    md.append("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
    for m in models:
        s = S[m]["summary"]["chosen"]
        pg = s["primary_gold"]
        eu = s.get("europii", {})
        ch = s.get("chat_prompts", {})
        ng = s.get("negatives", {})
        neg_fp = None
        if ng:
            neg_fp = (ng["PER"]["fp"] + ng["LOC"]["fp"]) * 1000 / ng["PER"]["tokens"]
        row = {
            "per_ov_r": pg["PER"]["ov_r"], "per_ov_p": pg["PER"]["ov_p"], "per_ov_f1": pg["PER"]["ov_f1"],
            "per_exact_f1": pg["PER"]["exact_f1"], "per_any_cov": pg["PER"]["any_cov_r"],
            "loc_ov_f1": pg["LOC"]["ov_f1"], "org_ov_f1": pg["ORG"]["ov_f1"],
            "europii_per_r": eu.get("PER", {}).get("ov_r"), "europii_per_p": eu.get("PER", {}).get("ov_p"),
            "chat_per_r": ch.get("PER", {}).get("ov_r"), "chat_per_p": ch.get("PER", {}).get("ov_p"),
            "chat_loc_r": ch.get("LOC", {}).get("ov_r"), "neg_perloc_fp_per_1k": neg_fp / 1000 if neg_fp is not None else None,
        }
        summary["models"][m] = {"operating_point": {t: S[m]["operating_point"][t]["threshold"] for t in ("PER", "LOC", "ORG")},
                                "test_chosen": row, "run": {k: runs.get(m, {}).get(k) for k in ("repo", "onnx", "revision", "onnx_bytes", "download_bytes", "licence")},
                                "bench": {str(k): {kk: v for kk, v in vv.items() if kk != "files"} for k, vv in B.get(m, {}).items()}}
        md.append(f"| {m} | {f(row['per_ov_r'])} | {f(row['per_ov_p'])} | {f(row['per_ov_f1'])} | {f(row['per_exact_f1'])} | {f(row['per_any_cov'])} | "
                  f"{f(row['loc_ov_f1'])} | {f(row['org_ov_f1'])} | {f(row['europii_per_r'])} | {f(row['europii_per_p'])} | "
                  f"{f(row['chat_per_r'])} | {f(row['chat_per_p'])} | {f(row['chat_loc_r'])} | {f(neg_fp, False)} |")
    md.append("")

    # ---------- per-language PER (ov-F1 and ov-R) at chosen thr
    md.append("### PER per language (test, primary gold sets): overlap F1 / overlap recall\n")
    md.append("| model | " + " | ".join(f"{n}" for n in PRIMARY_TEST) + " |")
    md.append("|---|" + "---:|" * len(PRIMARY_TEST))
    for m in models:
        thr = str(S[m]["operating_point"]["PER"]["threshold"])
        cells = []
        for n in PRIMARY_TEST:
            x = S[m]["test"].get(n, {}).get(thr, {}).get("PER")
            cells.append(f"{f(x['ov_f1'], nd=0)} / {f(x['ov_r'], nd=0)}" if x else "–")
        md.append(f"| {m} | " + " | ".join(cells) + " |")
    md.append("")
    md.append("### LOC per language (test, primary gold sets): overlap F1 / overlap recall\n")
    md.append("| model | " + " | ".join(PRIMARY_TEST) + " |")
    md.append("|---|" + "---:|" * len(PRIMARY_TEST))
    for m in models:
        thr = str(S[m]["operating_point"]["LOC"]["threshold"])
        cells = []
        for n in PRIMARY_TEST:
            x = S[m]["test"].get(n, {}).get(thr, {}).get("LOC")
            cells.append(f"{f(x['ov_f1'], nd=0)} / {f(x['ov_r'], nd=0)}" if x else "–")
        md.append(f"| {m} | " + " | ".join(cells) + " |")
    md.append("")

    # ---------- other groups
    md.append("### Other test groups (macro PER overlap F1 / recall at chosen thresholds)\n")
    md.append("| model | WikiANN 15 langs (silver) | MultiCoNER II 7 langs (lower-cased) | lower-cased probe (5 sets) | same 5 sets cased | WNUT-17 en (social media) |")
    md.append("|---|---:|---:|---:|---:|---:|")
    for m in models:
        s = S[m]["summary"]["chosen"]
        w = s.get("wnut17_en", {}).get("PER", {})
        cells = [f"{f(s[g]['PER']['ov_f1'])} / {f(s[g]['PER']['ov_r'])}" for g in ("wikiann", "multiconer2_lowercase", "lowercase_probe", "lowercase_probe_cased_twin")]
        md.append(f"| {m} | " + " | ".join(cells) + f" | {f(w.get('ov_f1'))} / {f(w.get('ov_r'))} |")
    md.append("")

    # ---------- false positives
    md.append("### False positives (test, chosen thresholds)\n")
    md.append("Negatives = 28 code/log snippets + 40 business-chat messages (10 languages) written for this study, containing no person or place. "
              "EuroPII: 'spurious' = PER predictions overlapping neither a gold PERSON nor another gold PII span.\n")
    md.append("Code (stdlib) = 300 six-line chunks of CPython standard-library code with comments/docstrings removed (6.7k tokens). "
              "Real text = PER predictions on the primary gold sets that overlap no gold entity at all (includes annotation gaps).\n")
    md.append("| model | neg: PER /1k tok | neg: LOC /1k tok | neg: ORG /1k tok | neg: msgs with any PER/LOC | code: PER /1k | code: LOC /1k | real text: spurious PER /1k | real text: spurious LOC /1k | EuroPII spurious PER /1k tok | EuroPII PER on other PII /1k | EuroPII no-person msgs: PER /1k | EuroPII LOC preds /1k (unannotated) |")
    md.append("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
    for m in models:
        s = S[m]["summary"]["chosen"]
        ng = s.get("negatives")
        eu = s.get("europii")
        if not ng or not eu:
            continue
        tok = ng["PER"]["tokens"]
        neg_msgs = count_neg_msgs(m, S[m]["operating_point"])
        cd = s.get("code_stdlib")
        ctok = cd["PER"]["tokens"] if cd else None
        cper = 1000 * cd["PER"]["pred"] / ctok if cd else None
        cloc = 1000 * cd["LOC"]["pred"] / ctok if cd else None
        rsp = s["primary_gold"]["PER"]["spurious_per_1k_tok"]
        rsl = s["primary_gold"]["LOC"]["spurious_per_1k_tok"]
        md.append(f"| {m} | {1000 * ng['PER']['pred'] / tok:.1f} | {1000 * ng['LOC']['pred'] / tok:.1f} | {1000 * ng['ORG']['pred'] / tok:.1f} | {neg_msgs} | "
                  f"{f(cper, False, 2)} | {f(cloc, False, 2)} | {f(rsp, False, 2)} | {f(rsl, False, 2)} | "
                  f"{1000 * eu['PER']['fp_spurious'] / eu['PER']['tokens']:.2f} | {1000 * eu['PER']['fp_other_pii'] / eu['PER']['tokens']:.2f} | "
                  f"{1000 * eu['no_person_msgs']['PER']['pred'] / eu['no_person_msgs']['PER']['tokens']:.2f} | {1000 * eu['LOC']['pred'] / eu['LOC']['tokens']:.2f} |")
        summary["models"][m]["fp"] = {"neg_per_per_1k": 1000 * ng["PER"]["pred"] / tok, "neg_loc_per_1k": 1000 * ng["LOC"]["pred"] / tok,
                                      "neg_org_per_1k": 1000 * ng["ORG"]["pred"] / tok, "neg_msgs_with_perloc": neg_msgs,
                                      "europii_spurious_per_per_1k": 1000 * eu["PER"]["fp_spurious"] / eu["PER"]["tokens"],
                                      "europii_loc_preds_per_1k": 1000 * eu["LOC"]["pred"] / eu["LOC"]["tokens"],
                                      "code_per_per_1k": cper, "code_loc_per_1k": cloc,
                                      "real_text_spurious_per_per_1k": rsp, "real_text_spurious_loc_per_1k": rsl}
    md.append("")

    # ---------- threshold sweep for focus
    for m in [x for x in a.focus.split(",") if x in S]:
        md.append(f"### Threshold sweep: {m} (PER, macro over primary gold sets; EuroPII; negatives)\n")
        md.append("| thr | dev macro ov-F1 (sel. objective) | test ov-R | test ov-P | test ov-F1 | test exact-F1 | EuroPII R | EuroPII P | chat R | chat P | neg PER /1k tok | EuroPII spurious /1k |")
        md.append("|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
        T = S[m]["test"]
        for thr in THRESHOLDS:
            k = str(thr)
            rows = [T[n][k]["PER"] for n in PRIMARY_TEST if n in T]
            mac = lambda key: sum(r[key] for r in rows if r[key] is not None) / len([r for r in rows if r[key] is not None])  # noqa: E731
            eu, ch, ng = T["europii"][k]["PER"], T["chat_prompts"][k]["PER"], T["negatives"][k]["PER"]
            md.append(f"| {thr} | {f(S[m]['operating_point']['PER']['dev_curve'][k])} | {f(mac('ov_r'))} | {f(mac('ov_p'))} | {f(mac('ov_f1'))} | {f(mac('exact_f1'))} | "
                      f"{f(eu['ov_r'])} | {f(eu['ov_p'])} | {f(ch['ov_r'])} | {f(ch['ov_p'])} | {1000 * ng['pred'] / ng['tokens']:.1f} | {1000 * eu['fp_spurious'] / eu['tokens']:.2f} |")
        md.append("")
        md.append(f"### Bootstrap 95% CIs ({m}, chosen thresholds, 500 resamples of sentences)\n")
        md.append("| set/type | ov-R CI | ov-F1 CI |")
        md.append("|---|---|---|")
        for k, v in S[m].get("bootstrap_ci_chosen", {}).items():
            if v:
                md.append(f"| {k} | {f(v['r_lo'])}–{f(v['r_hi'])} | {f(v['f1_lo'])}–{f(v['f1_hi'])} |")
        md.append("")

    # ---------- fp32 vs int8
    pairs = [(m, m.replace("-int8", "-fp32")) for m in models if m.endswith("-int8") and m.replace("-int8", "-fp32") in S]
    if pairs:
        md.append("### int8 vs fp32 (same thresholds = the int8 model's chosen ones)\n")
        md.append("| model | variant | primary PER ov-F1 | primary PER ov-R | primary LOC ov-F1 | EuroPII PER R | chat PER R | neg PER /1k |")
        md.append("|---|---|---:|---:|---:|---:|---:|---:|")
        for i8, f32 in pairs:
            op = S[i8]["operating_point"]
            for name, mm in (("int8", i8), ("fp32", f32)):
                T = S[mm]["test"]
                kp, kl = str(op["PER"]["threshold"]), str(op["LOC"]["threshold"])
                rp = [T[n][kp]["PER"] for n in PRIMARY_TEST if n in T]
                rl = [T[n][kl]["LOC"] for n in PRIMARY_TEST if n in T]
                mac = lambda rows, key: sum(r[key] for r in rows) / len(rows)  # noqa: E731
                ng = T["negatives"][kp]["PER"]
                md.append(f"| {i8.replace('-int8', '')} | {name} | {f(mac(rp, 'ov_f1'))} | {f(mac(rp, 'ov_r'))} | {f(mac(rl, 'ov_f1'))} | "
                          f"{f(T['europii'][kp]['PER']['ov_r'])} | {f(T['chat_prompts'][kp]['PER']['ov_r'])} | {1000 * ng['pred'] / ng['tokens']:.1f} |")
        md.append("")

    (RES / "tables.md").write_text("\n".join(md), encoding="utf-8")
    json.dump(summary, open(RES / "summary.json", "w"), indent=1)
    print("\n".join(md))
    return 0


def count_neg_msgs(m, op):
    cache = NER.parent / "cache"
    pf = cache / "preds" / m / "test" / "negatives.jsonl"
    n = 0
    for l in open(pf, encoding="utf-8"):
        r = json.loads(l)
        if any((t == "PER" and sc >= op["PER"]["threshold"]) or (t == "LOC" and sc >= op["LOC"]["threshold"]) for s, e, t, sc, raw in r["preds"]):
            n += 1
    return n


if __name__ == "__main__":
    sys.exit(main())
