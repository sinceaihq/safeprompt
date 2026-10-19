// User settings, kept in chrome.storage.local (never synced).

import { DEFAULT_THRESHOLD } from "../engine/core";
import type { RedactionStyle } from "../engine";

export interface Settings {
  /** Minimum confidence; lower finds more and raises more false alarms. */
  threshold: number;
  /** Countries whose identifiers are expected (ISO codes). */
  countries: string[];
  style: RedactionStyle;
  /** Entity types the user switched off. */
  disabledEntities: string[];
  /** Words or phrases that should always be flagged (client names, code names). */
  customTerms: string[];
  /** Values that should never be flagged (e.g. a public support address). */
  allowList: string[];
  /** In-page protection on supported AI sites. */
  pasteCheck: boolean;
  sendCheck: boolean;
  sites: Record<string, boolean>;
}

export const DEFAULT_SETTINGS: Settings = {
  threshold: DEFAULT_THRESHOLD,
  countries: [],
  style: "numbered",
  disabledEntities: [],
  customTerms: [],
  allowList: [],
  pasteCheck: true,
  sendCheck: true,
  // Claude could not be tested against the live site, so it is opt-in.
  sites: { chatgpt: true, gemini: true, claude: false },
};

/** Settings read from storage, with defaults for anything missing or malformed. */
export function withDefaults(stored: unknown): Settings {
  const s = stored && typeof stored === "object" ? (stored as Partial<Settings>) : {};
  return { ...DEFAULT_SETTINGS, ...s, sites: { ...DEFAULT_SETTINGS.sites, ...(s.sites ?? {}) } };
}
