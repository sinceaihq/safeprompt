// Findings, detectors and the scanner that runs them.
//
// Port of EuroPII Guard's core (github.com/sinceaihq/europii-guard). Offsets
// are UTF-16 code-unit indices, the unit used by JavaScript strings and the
// DOM; EuroPII Guard (Python) reports code-point indices.

// Confidence before context. A *strong* match has structure that random text
// almost never has (a check character, a country prefix, a fixed layout); a
// *weak* one is a plain digit string whose checksum passes by chance often
// enough that it should only be reported next to a context word. A *medium*
// match is reported without a label only if the caller expects that country.
// An undivided digit run that is merely a valid phone number is the weakest
// evidence, so a checksum-validated identifier wins a tie against it.
export const STRONG = 0.9;
export const PHONE_GROUPED = 0.55;
export const MEDIUM = 0.45;
export const WEAK = 0.3;
export const PHONE_PLAIN = 0.28;
const CONTEXT_BONUS = new Map([
  [STRONG, 0.09],
  [PHONE_GROUPED, 0.4],
  [MEDIUM, 0.45],
  [WEAK, 0.55],
  [PHONE_PLAIN, 0.57],
]);
const COUNTRY_BONUS = 0.1;
export const DEFAULT_THRESHOLD = 0.5;
// Labels precede values in all supported languages ("tel. 040...", "PESEL: ...").
const CONTEXT_BEFORE = 60;

export interface Finding {
  entity: string;
  start: number;
  end: number;
  text: string;
  score: number;
  detector: string;
  country: string | null;
  validated: boolean;
  context: boolean;
}

export type Span = readonly [number, number];
export type Finder = (text: string, countries: ReadonlySet<string>) => Iterable<Span>;

export interface Detector {
  name: string;
  entity: string;
  /** Global regex proposing candidates (ignored when `finder` is set). */
  pattern?: RegExp;
  finder?: Finder;
  strength: number;
  /** Receives the candidate with `strip` characters removed, upper-cased. */
  validate?: (compact: string) => boolean;
  context?: readonly string[];
  country?: string;
  strip?: string;
  description: string;
}

export function* candidates(det: Detector, text: string, countries: ReadonlySet<string>): Iterable<Span> {
  if (det.finder) {
    yield* det.finder(text, countries);
    return;
  }
  if (!det.pattern) return;
  det.pattern.lastIndex = 0;
  for (const m of text.matchAll(det.pattern)) yield [m.index, m.index + m[0].length];
}

export function check(det: Detector, value: string): boolean {
  if (!det.validate) return true;
  const strip = det.strip ?? " .-/";
  let compact = "";
  for (const ch of value) if (!strip.includes(ch)) compact += ch;
  try {
    return det.validate(compact.toUpperCase());
  } catch {
    return false;
  }
}

/** NFKC + case folding (Python's casefold for the letters that differ). */
export function fold(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/ß/g, "ss").replace(/ς/g, "σ");
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const contextCache = new Map<string, RegExp>();

function contextRegex(words: readonly string[]): RegExp {
  const key = words.join("\u0000");
  let re = contextCache.get(key);
  if (!re) {
    const alternatives = words.map((w) => escape(w)).join("|");
    re = new RegExp(`(?<!\\p{L})(?:${alternatives})(?!\\p{L})`, "u");
    contextCache.set(key, re);
  }
  return re;
}

/**
 * Is one of `words` the label of the value at `start`? Uses the column
 * header inside tables, otherwise the context window before the value.
 */
export function hasContext(text: string, start: number, words: readonly string[] | undefined): boolean {
  if (!words || words.length === 0) return false;
  const header = tableHeaderAt(text, start);
  const fragment = header !== undefined ? header : text.slice(Math.max(0, start - CONTEXT_BEFORE), start);
  return contextRegex(words.map(labelForm)).test(labelForm(fragment));
}

// Label resolution ------------------------------------------------------------
//
// The label that describes a value is the one closest to it: in
// "Telefon: ...\nSteuer-ID: 12 345 678 901" the number belongs to "Steuer-ID",
// not to "Telefon" on the line above. In a table, it is the column header.
// A detector gets the context bonus only when the nearest label is one of its
// own; when the nearest label belongs to a different kind of data, the
// candidate is penalised (an invalid tax ID after "Steuer-ID:" is not a phone).

const OTHER_LABEL_PENALTY = 0.3;
const BUSINESS_LABEL_PENALTY = 0.45;

/**
 * Label matching form: case-folded, without diacritics, "_" and "-" as spaces,
 * so that column names and keys ("rodne_cislo", "steuer_id") match labels
 * ("rodné číslo", "Steuer-ID").
 */
export function labelForm(text: string): string {
  return fold(text).normalize("NFD").replace(/\p{M}/gu, "").replace(/[_-]+/g, " ");
}

interface LabelIndex {
  regex: RegExp;
  /** folded label word -> detector names and entity types that use it */
  owners: Map<string, { detectors: Set<string>; entities: Set<string> }>;
}
const labelIndexCache = new WeakMap<readonly Detector[], LabelIndex>();

/**
 * Labels of numbers that are not personal data. When one of them directly
 * precedes a value, every personal-data reading of the value is penalised.
 */
export const BUSINESS_LABELS = [
  "order", "order no", "order number", "invoice", "invoice no", "invoice number", "ean", "gtin", "isbn", "sku",
  "tracking", "tracking number", "ticket", "item", "article", "serial", "serial number", "part number", "build",
  "tilaus", "tilausnumero", "lasku", "laskun numero", "bestellung", "bestellnummer", "rechnung", "rechnungsnummer",
  "artikelnummer", "commande", "numéro de commande", "facture", "ordernummer", "factuur", "factuurnummer", "pedido",
  "factura", "ordine", "fattura", "zamówienie", "faktura", "beställning", "ordrenummer", "objednávka",
]; // prettier-ignore

function labelIndex(detectors: readonly Detector[]): LabelIndex {
  let index = labelIndexCache.get(detectors);
  if (index) return index;
  const owners = new Map<string, { detectors: Set<string>; entities: Set<string> }>();
  for (const word of BUSINESS_LABELS)
    owners.set(labelForm(word), { detectors: new Set(), entities: new Set(["NONE"]) });
  for (const det of detectors) {
    for (const word of det.context ?? []) {
      const w = labelForm(word);
      const o = owners.get(w) ?? { detectors: new Set(), entities: new Set() };
      o.detectors.add(det.name);
      o.entities.add(det.entity);
      owners.set(w, o);
    }
  }
  // Longest first, so "vat number" wins over "vat".
  const words = [...owners.keys()].sort((a, b) => b.length - a.length).map(escape);
  index = { regex: new RegExp(`(?<!\\p{L})(?:${words.join("|")})(?!\\p{L})`, "gu"), owners };
  labelIndexCache.set(detectors, index);
  return index;
}

interface Label {
  word: string;
  /** Directly describes the value: same clause, at most a few words before it. */
  adjacent: boolean;
}

/** The last (closest) label word in `fragment`, or null. */
function lastLabel(index: LabelIndex, fragment: string): Label | null {
  const form = labelForm(fragment);
  let last: RegExpExecArray | null = null;
  for (const m of form.matchAll(index.regex)) last = m;
  if (!last) return null;
  const between = form.slice(last.index + last[0].length);
  return { word: last[0], adjacent: between.length <= 30 && !/[.!?;]\s/.test(between) };
}

/**
 * Text that may hold the value's label. If the value's own line is a field
 * ("rrn": "...", Name = ...), only that line counts: a label on the line
 * above belongs to the field above.
 */
function windowBefore(text: string, start: number): string {
  const window = text.slice(Math.max(0, start - CONTEXT_BEFORE), start);
  const lineStart = window.lastIndexOf("\n") + 1;
  const ownLine = window.slice(lineStart);
  return lineStart > 0 && /[:=]/.test(ownLine) ? ownLine : window;
}

const DELIMITERS = ["\t", ";", "|", ","];

/**
 * Column header of the table cell at `pos`: CSV/TSV blocks whose first line
 * looks like a header, and SQL "INSERT ... (columns) VALUES (...)".
 * Returns undefined when `pos` is not in a table cell.
 */
export function tableHeaderAt(text: string, pos: number): string | undefined {
  const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
  const nextBreak = text.indexOf("\n", pos);
  const lineEnd = nextBreak < 0 ? text.length : nextBreak;
  const line = text.slice(lineStart, lineEnd);
  const sql = sqlHeaderAt(text, pos);
  if (sql !== undefined) return sql;
  for (const d of DELIMITERS) {
    const count = line.split(d).length - 1;
    if (count < 2) continue;
    // Walk up while the lines have the same number of delimiters.
    let headerStart = lineStart;
    while (headerStart > 0) {
      const prevStart = text.lastIndexOf("\n", headerStart - 2) + 1;
      const prev = text.slice(prevStart, headerStart - 1);
      if (prev.split(d).length - 1 !== count) break;
      headerStart = prevStart;
    }
    if (headerStart === lineStart) continue; // no header above this line
    const headerEnd = text.indexOf("\n", headerStart);
    const header = text.slice(headerStart, headerEnd).split(d);
    // A header has (mostly) no digits in its cells.
    if (header.filter((c) => /\d/.test(c)).length > header.length / 3) continue;
    const column = text.slice(lineStart, pos).split(d).length - 1;
    return header[column]?.trim().replace(/^["']|["']$/g, "") ?? "";
  }
  return undefined;
}

const SQL_INSERT_RE = /insert\s+into\s+[\w."`[\]]+\s*\(([^)]*)\)\s*values\s*/gi;

function sqlHeaderAt(text: string, pos: number): string | undefined {
  let header: string[] | null = null;
  let valuesStart = -1;
  for (const m of text.matchAll(SQL_INSERT_RE)) {
    if (m.index > pos) break;
    header = m[1].split(",").map((c) => c.trim().replace(/^["'`[]|["'`\]]$/g, ""));
    valuesStart = m.index + m[0].length;
  }
  if (!header || valuesStart > pos) return undefined;
  // Find the column of `pos` inside the current "( ... )" tuple, skipping quoted strings.
  let column = -1;
  let quote: string | null = null;
  for (let i = valuesStart; i < pos; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') quote = ch;
    else if (ch === "(") column = 0;
    else if (ch === ")") column = -1;
    else if (ch === "," && column >= 0) column++;
    else if (ch === ";") return undefined;
  }
  return column >= 0 ? (header[column] ?? "") : undefined;
}

const HEX_TOKEN_RE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{12,})$/i;

/** Is [start, end) a strict part of a UUID or hexadecimal hash? */
function insideHexToken(text: string, start: number, end: number): boolean {
  let s = start;
  let e = end;
  while (s > 0 && /[0-9A-Za-z-]/.test(text[s - 1])) s--;
  while (e < text.length && /[0-9A-Za-z-]/.test(text[e])) e++;
  return (s < start || e > end) && HEX_TOKEN_RE.test(text.slice(s, e));
}

export interface ScanOptions {
  threshold?: number;
  countries?: Iterable<string>;
  entities?: Iterable<string>;
}

export function scanWith(detectors: readonly Detector[], text: string, options: ScanOptions = {}): Finding[] {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const countries = new Set([...(options.countries ?? [])].map((c) => c.toUpperCase()));
  const wanted = options.entities ? new Set(options.entities) : null;
  const index = labelIndex(detectors);
  const labels = new Map<number, Label | null>();
  const labelAt = (start: number): Label | null => {
    let label = labels.get(start);
    if (label === undefined) {
      const header = tableHeaderAt(text, start);
      if (header === undefined) label = lastLabel(index, windowBefore(text, start));
      else {
        const word = lastLabel(index, header)?.word;
        label = word ? { word, adjacent: true } : null;
      }
      labels.set(start, label);
    }
    return label;
  };
  const found: Finding[] = [];
  for (const det of detectors) {
    if (wanted && !wanted.has(det.entity)) continue;
    for (const [start, end] of candidates(det, text, countries)) {
      const value = text.slice(start, end);
      if (!check(det, value)) continue;
      if (det.entity !== "SECRET" && insideHexToken(text, start, end)) continue;
      const label = det.context?.length ? labelAt(start) : null;
      const owners = label ? index.owners.get(label.word) : undefined;
      const ctx = owners?.detectors.has(det.name) ?? false;
      let score = det.strength + (ctx ? (CONTEXT_BONUS.get(det.strength) ?? 0) : 0);
      // Short labels exist in several languages (Spanish "NIE", Polish "nie"),
      // so only a label right before the value counts against other types.
      if (owners && label?.adjacent && !owners.entities.has(det.entity)) {
        // A plain digit string right after "EAN", "order no." etc. is that number.
        const business = owners.entities.has("NONE") && /^[\d\s.\-/()+]+$/.test(value);
        score -= business ? BUSINESS_LABEL_PENALTY : OTHER_LABEL_PENALTY;
      }
      if (det.country && countries.has(det.country)) score += COUNTRY_BONUS;
      found.push({
        entity: det.entity,
        start,
        end,
        text: value,
        score: Math.round(Math.min(score, 0.99) * 1000) / 1000,
        detector: det.name,
        country: det.country ?? null,
        validated: det.validate !== undefined,
        context: ctx,
      });
    }
  }
  return resolveOverlaps(found).filter((f) => f.score >= threshold);
}

/** Keep the best finding among overlapping ones: higher score, then longer span. */
export function resolveOverlaps(findings: Iterable<Finding>): Finding[] {
  const ranked = [...findings].sort(
    (a, b) => b.score - a.score || b.end - b.start - (a.end - a.start) || a.start - b.start,
  );
  const kept: Finding[] = [];
  for (const f of ranked) {
    if (kept.every((k) => f.end <= k.start || f.start >= k.end)) kept.push(f);
  }
  return kept.sort((a, b) => a.start - b.start);
}
