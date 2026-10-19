// SafePrompt detection engine: runs entirely in the browser, no network.

import { DEFAULT_THRESHOLD, resolveOverlaps, scanWith, type Detector, type Finding, type ScanOptions } from "./core";
import { PII_DETECTORS } from "./detectors";
import { SECRET_DETECTORS } from "./secrets";

export { DEFAULT_THRESHOLD, resolveOverlaps, type Detector, type Finding, type ScanOptions };
export { PII_DETECTORS, NATIONAL_DETECTORS, COUNTRY_CODES_EU } from "./detectors";
export { SECRET_DETECTORS } from "./secrets";

export const ALL_DETECTORS: readonly Detector[] = [...PII_DETECTORS, ...SECRET_DETECTORS];

/** Find personal data and secrets in `text`. Offsets are UTF-16 indices. */
export function scan(text: string, options: ScanOptions = {}): Finding[] {
  return scanWith(ALL_DETECTORS, text, options);
}

/** Human-readable names of entity types, used by the interface. */
export const ENTITY_LABELS: Record<string, string> = {
  NATIONAL_ID: "National ID",
  VAT_ID: "VAT number",
  IBAN: "IBAN",
  PAYMENT_CARD: "Payment card",
  EMAIL: "E-mail",
  PHONE: "Phone",
  IP_ADDRESS: "IP address",
  SECRET: "Secret / token",
  PERSON: "Name",
  LOCATION: "Location",
  ORGANIZATION: "Organisation",
};

export type RedactionStyle = "numbered" | "placeholder" | "mask";

export interface Redaction {
  text: string;
  /** Placeholder -> original value (numbered style only). */
  mapping: Map<string, string>;
}

/**
 * Replace findings in `text`. The "numbered" style gives each distinct value
 * its own placeholder (<EMAIL_1>, <EMAIL_2>, ...) so an AI answer that uses
 * the placeholders can be restored locally with `restore`.
 */
export function redact(text: string, findings: readonly Finding[], style: RedactionStyle = "numbered"): Redaction {
  const mapping = new Map<string, string>();
  const byValue = new Map<string, string>();
  const counters = new Map<string, number>();
  let out = "";
  let pos = 0;
  for (const f of [...findings].sort((a, b) => a.start - b.start)) {
    if (f.start < pos) continue; // overlapping findings: keep the first
    out += text.slice(pos, f.start);
    if (style === "mask") out += "*".repeat(f.end - f.start);
    else if (style === "placeholder") out += `<${f.entity}>`;
    else {
      const key = `${f.entity}\u0000${f.text}`;
      let token = byValue.get(key);
      if (!token) {
        const n = (counters.get(f.entity) ?? 0) + 1;
        counters.set(f.entity, n);
        token = `<${f.entity}_${n}>`;
        byValue.set(key, token);
        mapping.set(token, f.text);
      }
      out += token;
    }
    pos = f.end;
  }
  out += text.slice(pos);
  return { text: out, mapping };
}

/** Put original values back into a text that contains numbered placeholders. */
export function restore(text: string, mapping: ReadonlyMap<string, string>): string {
  if (mapping.size === 0) return text;
  const tokens = [...mapping.keys()].map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return text.replace(new RegExp(tokens.join("|"), "g"), (t) => mapping.get(t) ?? t);
}
