// Messages between the content script, the background worker and extension pages.

export type ReviewMode = "paste" | "send" | "selection";
export type ReviewAction = "sanitized" | "original" | "cancel";

export interface ReviewSession {
  id: string;
  created: number;
  mode: ReviewMode;
  text: string;
  site: string;
  tabId: number;
  frameId: number;
}

export type Message =
  | { type: "review:open"; mode: ReviewMode; text: string; site: string }
  | { type: "review:get"; id: string }
  | { type: "review:done"; id: string; action: ReviewAction; text?: string }
  | { type: "review:result"; id: string; action: ReviewAction; text?: string }
  | { type: "status"; site: string; siteName: string; verified: boolean; composer: boolean }
  | { type: "status:get"; tabId: number }
  | { type: "insert"; text: string }
  | { type: "read-composer" }
  | { type: "site:add"; origin: string }
  | { type: "site:remove"; origin: string };

export interface TabStatus {
  site: string;
  siteName: string;
  verified: boolean;
  composer: boolean;
  /** Paste and send checks are switched on for this site in the settings. */
  enabled: boolean;
}
