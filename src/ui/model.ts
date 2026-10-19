// Review state shared by the side panel, the in-page review dialog and the
// web demo: what was found, what the user chose to replace, and the result.

import { redact, resolveOverlaps, scan, type Finding, type RedactionStyle } from "../engine";
import type { Settings } from "./config";

export { DEFAULT_SETTINGS, withDefaults, type Settings } from "./config";

export interface Item extends Finding {
  id: number;
  /** Replace this value in the sanitized text. */
  selected: boolean;
}

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function customFindings(text: string, terms: readonly string[]): Finding[] {
  const out: Finding[] = [];
  for (const raw of terms) {
    const term = raw.trim();
    if (term.length < 2) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegex(term)}(?![\\p{L}\\p{N}_])`, "giu");
    for (const m of text.matchAll(re)) {
      out.push({
        entity: "CUSTOM",
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
        score: 0.99,
        detector: "custom_term",
        country: null,
        validated: false,
        context: false,
      });
    }
  }
  return out;
}

export interface Manual {
  start: number;
  end: number;
}

/** Run the engine with the user's settings, custom terms, allow list and manual marks. */
export function analyze(text: string, settings: Settings, manual: readonly Manual[] = []): Item[] {
  const allowed = new Set(settings.allowList.map((v) => v.trim().toLowerCase()).filter(Boolean));
  const disabled = new Set(settings.disabledEntities);
  const engine = scan(text, { threshold: settings.threshold, countries: settings.countries }).filter(
    (f) => !disabled.has(f.entity) && !allowed.has(f.text.trim().toLowerCase()),
  );
  const marked: Finding[] = manual
    .filter((m) => m.end > m.start && m.end <= text.length)
    .map((m) => ({
      entity: "MANUAL",
      start: m.start,
      end: m.end,
      text: text.slice(m.start, m.end),
      score: 1,
      detector: "manual",
      country: null,
      validated: false,
      context: false,
    }));
  const all = resolveOverlaps([...marked, ...customFindings(text, settings.customTerms), ...engine]);
  return all.map((f, i) => ({ ...f, id: i, selected: true }));
}

export function sanitize(text: string, items: readonly Item[], style: RedactionStyle) {
  return redact(
    text,
    items.filter((i) => i.selected),
    style,
  );
}

export const CATEGORY_LABELS: Record<string, string> = {
  NATIONAL_ID: "National ID",
  VAT_ID: "VAT number",
  IBAN: "Bank account (IBAN)",
  PAYMENT_CARD: "Payment card",
  EMAIL: "E-mail address",
  PHONE: "Phone number",
  IP_ADDRESS: "IP address",
  SECRET: "Password, key or token",
  PERSON: "Name",
  LOCATION: "Place or address",
  ORGANIZATION: "Organisation",
  CUSTOM: "Your custom term",
  MANUAL: "Marked by you",
};

export const COUNTRY_NAMES: Record<string, string> = {
  AT: "Austria", BE: "Belgium", BG: "Bulgaria", HR: "Croatia", CZ: "Czechia", DK: "Denmark",
  EE: "Estonia", FI: "Finland", FR: "France", DE: "Germany", IE: "Ireland", IT: "Italy",
  LV: "Latvia", LT: "Lithuania", NL: "Netherlands", NO: "Norway", PL: "Poland", PT: "Portugal",
  RO: "Romania", SK: "Slovakia", SI: "Slovenia", ES: "Spain", SE: "Sweden",
}; // prettier-ignore
