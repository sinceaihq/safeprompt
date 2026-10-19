// Span-level metrics for the SafePrompt engine on annotated JSONL.
//
// Offsets in the data are Unicode code points (Python); they are converted to
// UTF-16 before comparing with the engine's findings.

import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { gunzipSync } from "node:zlib";
import { scan, type Finding } from "../../src/engine";

export interface Span {
  start: number;
  end: number;
  label: string;
  kind?: string;
}
export interface Row {
  id: string;
  format?: string;
  text: string;
  spans: Span[];
}
export const DEFAULT_LABELS = [
  "EMAIL",
  "PHONE",
  "IBAN",
  "PAYMENT_CARD",
  "IP_ADDRESS",
  "VAT_ID",
  "NATIONAL_ID",
  "SECRET",
];

export function loadJsonl(path: string): Row[] {
  const raw = readFileSync(path);
  const text = path.endsWith(".gz") ? gunzipSync(raw).toString("utf-8") : raw.toString("utf-8");
  return text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Row);
}

function toUtf16(text: string): (cp: number) => number {
  const map: number[] = [];
  let i = 0;
  for (const ch of text) {
    map.push(i);
    i += ch.length;
  }
  map.push(i);
  return (cp) => map[cp];
}

export const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  a.start < b.end && b.start < a.end;

/** Findings of another system, with code-point offsets like the data. */
export type Predictions = Map<string, { entity: string; start: number; end: number }[]>;

export function loadPredictions(path: string): Predictions {
  const out: Predictions = new Map();
  for (const line of readFileSync(path, "utf-8").split("\n").filter(Boolean)) {
    const row = JSON.parse(line) as { id: string; findings: { entity: string; start: number; end: number }[] };
    out.set(row.id, row.findings);
  }
  return out;
}

export function evaluate(
  rows: Row[],
  options: {
    threshold?: number;
    countries?: string[];
    labels?: string[];
    errors?: number;
    predictions?: Predictions;
  } = {},
) {
  const LABELS = options.labels ?? DEFAULT_LABELS;
  type Counts = { tp: number; fp: number; fn: number; exact: number; hidden: number; gold: number };
  const zero = (): Counts => ({ tp: 0, fp: 0, fn: 0, exact: 0, hidden: 0, gold: 0 });
  const per = new Map<string, Counts>(LABELS.map((l) => [l, zero()]));
  const perFormat = new Map<string, Counts>();
  const errors: string[] = [];
  let chars = 0;
  let fpTotal = 0;
  let negDocs = 0;
  let negDocsFlagged = 0;
  let ms = 0;

  for (const row of rows) {
    const conv = toUtf16(row.text);
    const gold = row.spans
      .filter((s) => LABELS.includes(s.label))
      .map((s) => ({ ...s, start: conv(s.start), end: conv(s.end) }));
    const t0 = performance.now();
    const external = options.predictions?.get(row.id);
    const found: Finding[] = (
      external
        ? external.map((f) => ({
            ...f,
            start: conv(f.start),
            end: conv(f.end),
            text: row.text.slice(conv(f.start), conv(f.end)),
            score: 1,
            detector: "external",
            country: null,
            validated: false,
            context: false,
          }))
        : scan(row.text, { threshold: options.threshold ?? 0.5, countries: options.countries ?? [] })
    ).filter((f) => LABELS.includes(f.entity));
    ms += performance.now() - t0;
    chars += row.text.length;
    const fmt = row.format ?? "all";
    if (!perFormat.has(fmt)) perFormat.set(fmt, zero());
    const pf = perFormat.get(fmt)!;

    const allGold = row.spans.map((s) => ({ ...s, start: conv(s.start), end: conv(s.end) }));
    if (allGold.length === 0) {
      negDocs++;
      if (found.length) negDocsFlagged++;
    }
    for (const g of gold) {
      const c = per.get(g.label)!;
      c.gold++;
      pf.gold++;
      const same = found.filter((f) => f.entity === g.label && overlaps(f, g));
      if (same.length) {
        c.tp++;
        pf.tp++;
        if (same.some((f) => f.start === g.start && f.end === g.end)) c.exact++;
      } else {
        c.fn++;
        pf.fn++;
        if (errors.length < (options.errors ?? 0)) {
          errors.push(
            `FN ${g.label}/${g.kind ?? ""} [${row.text.slice(g.start, g.end)}] in ${row.id}: …${row.text.slice(Math.max(0, g.start - 40), g.end + 20).replace(/\n/g, "⏎")}…`,
          );
        }
      }
      // Redaction view: is every character of the value covered by some finding?
      const covered = found.filter((f) => overlaps(f, g));
      let pos = g.start;
      for (const f of covered.sort((a, b) => a.start - b.start)) if (f.start <= pos) pos = Math.max(pos, f.end);
      if (pos >= g.end) c.hidden++;
    }
    for (const f of found) {
      // A finding is correct if it overlaps a gold span of the same label; a
      // finding on a non-scored gold span (e.g. a name) is neither.
      if (gold.some((g) => g.label === f.entity && overlaps(f, g))) continue;
      if (allGold.some((g) => !LABELS.includes(g.label) && overlaps(f, g))) continue;
      per.get(f.entity)!.fp++;
      pf.fp++;
      fpTotal++;
      if (errors.length < (options.errors ?? 0)) {
        errors.push(
          `FP ${f.entity}/${f.detector} [${f.text}] in ${row.id} (${fmt}): …${row.text.slice(Math.max(0, f.start - 40), f.end + 20).replace(/\n/g, "⏎")}…`,
        );
      }
    }
  }

  const pct = (x: number) => Math.round(1000 * x) / 10;
  const prf = (c: Counts) => {
    const p = c.tp + c.fp ? c.tp / (c.tp + c.fp) : 1;
    const r = c.gold ? c.tp / c.gold : 1;
    return { precision: pct(p), recall: pct(r), f1: pct(p + r ? (2 * p * r) / (p + r) : 0) };
  };
  const total = [...per.values()].reduce((a, c) => ({
  tp: a.tp + c.tp, fp: a.fp + c.fp, fn: a.fn + c.fn, exact: a.exact + c.exact, hidden: a.hidden + c.hidden, gold: a.gold + c.gold,
})); // prettier-ignore

  const result = {
  documents: rows.length,
  threshold: options.threshold ?? 0.5,
  countries: options.countries?.join(",") || null,
  overall: { ...prf(total), exact_span: pct(total.exact / total.gold), values_fully_hidden: pct(total.hidden / total.gold), gold: total.gold, tp: total.tp, fp: total.fp, fn: total.fn },
  per_label: Object.fromEntries([...per].map(([l, c]) => [l, { ...prf(c), exact_span: pct(c.exact / (c.gold || 1)), values_fully_hidden: pct(c.hidden / (c.gold || 1)), gold: c.gold, fp: c.fp, fn: c.fn }])),
  per_format: Object.fromEntries([...perFormat].sort().map(([f, c]) => [f, { ...prf(c), gold: c.gold, fp: c.fp, fn: c.fn }])),
  negative_documents: negDocs,
  negative_documents_flagged: negDocsFlagged,
  false_positives_per_10k_chars: Math.round((fpTotal / chars) * 1e4 * 100) / 100,
  ms_per_document: Math.round((ms / rows.length) * 100) / 100,
  ms_per_10k_chars: Math.round((ms / chars) * 1e4 * 100) / 100,
}; // prettier-ignore

  return { result, errors };
}
