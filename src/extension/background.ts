// Background service worker.
//
// Holds review sessions (the text a user pasted or tried to send) only in
// chrome.storage.session, which lives in memory and is never written to
// disk, and deletes each session as soon as the user decides. It makes no
// network requests.

import { withDefaults } from "../ui/config";
import type { Message, ReviewSession, TabStatus } from "./messages";

const CUSTOM_SCRIPT_ID = "safeprompt-custom-sites";

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  await syncCustomSites();
});
chrome.runtime.onStartup.addListener(() => void syncCustomSites());

const statuses = new Map<number, TabStatus>();

function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Is the sender one of our own extension pages? (Content scripts share our
 * extension id but report the web page's URL.) getURL() cannot be compared
 * directly: with use_dynamic_url it returns a per-session origin.
 */
function isExtensionPage(sender: chrome.runtime.MessageSender, page: string): boolean {
  if (sender.id !== chrome.runtime.id || !sender.url) return false;
  const url = new URL(sender.url);
  return url.protocol === "chrome-extension:" && url.pathname === `/${page}`;
}

async function setBadge(tabId: number, status: TabStatus | undefined): Promise<void> {
  const on = status?.enabled && status.composer;
  await chrome.action.setBadgeText({ tabId, text: on ? "✓" : status?.enabled ? "!" : "" });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: on ? "#17734a" : "#9a5b00" });
  await chrome.action.setTitle({
    tabId,
    title: on
      ? `SafePrompt: checking pastes and messages on ${status.siteName}`
      : status?.enabled
        ? `SafePrompt: message box not found on ${status.siteName} — not protected`
        : "SafePrompt",
  });
}

// Sessions normally end when the user decides; drop any left behind by a
// closed tab or an abandoned dialog.
const SESSION_TTL_MS = 10 * 60 * 1000;

async function purgeSessions(tabId?: number): Promise<void> {
  const all = await chrome.storage.session.get(null);
  const stale = Object.entries(all)
    .filter(([key]) => key.startsWith("review:"))
    .filter(
      ([, s]) => (s as ReviewSession).tabId === tabId || Date.now() - (s as ReviewSession).created > SESSION_TTL_MS,
    )
    .map(([key]) => key);
  if (stale.length) await chrome.storage.session.remove(stale);
}

chrome.tabs.onRemoved.addListener((tabId) => {
  statuses.delete(tabId);
  void purgeSessions(tabId);
});

chrome.runtime.onMessage.addListener((msg: Message, sender, reply) => {
  void handle(msg, sender).then(reply, (err: unknown) => reply({ error: String(err) }));
  return true; // async reply
});

async function handle(msg: Message, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (msg.type) {
    case "review:open": {
      // Only content scripts (which run in a tab) open sessions.
      if (sender.id !== chrome.runtime.id || sender.tab?.id === undefined) throw new Error("not allowed");
      await purgeSessions();
      const session: ReviewSession = {
        id: newId(),
        created: Date.now(),
        mode: msg.mode,
        text: msg.text,
        site: msg.site,
        tabId: sender.tab.id,
        frameId: sender.frameId ?? 0,
      };
      await chrome.storage.session.set({ [`review:${session.id}`]: session });
      return { id: session.id };
    }
    case "review:get": {
      if (!isExtensionPage(sender, "review.html")) throw new Error("not allowed");
      const key = `review:${msg.id}`;
      const session = (await chrome.storage.session.get(key))[key] as ReviewSession | undefined;
      const settings = withDefaults((await chrome.storage.local.get("settings")).settings);
      return session ? { session, settings } : { session: null, settings };
    }
    case "review:done": {
      if (!isExtensionPage(sender, "review.html")) throw new Error("not allowed");
      const key = `review:${msg.id}`;
      const session = (await chrome.storage.session.get(key))[key] as ReviewSession | undefined;
      await chrome.storage.session.remove(key);
      if (!session) return { ok: false };
      await chrome.tabs.sendMessage(
        session.tabId,
        { type: "review:result", id: msg.id, action: msg.action, text: msg.text } satisfies Message,
        { frameId: session.frameId },
      );
      return { ok: true };
    }
    case "status": {
      if (sender.tab?.id === undefined) return null;
      const settings = withDefaults((await chrome.storage.local.get("settings")).settings);
      const enabled = (settings.sites[msg.site] ?? true) && (settings.pasteCheck || settings.sendCheck);
      const status: TabStatus = {
        site: msg.site,
        siteName: msg.siteName,
        verified: msg.verified,
        composer: msg.composer,
        enabled,
      };
      statuses.set(sender.tab.id, status);
      await setBadge(sender.tab.id, status);
      return null;
    }
    case "status:get":
      return statuses.get(msg.tabId) ?? null;
    case "site:add":
    case "site:remove":
      await syncCustomSites();
      return { ok: true };
    default:
      return null;
  }
}

/** Register the content script for every site the user granted access to. */
async function syncCustomSites(): Promise<void> {
  const manifest = chrome.runtime.getManifest();
  const builtIn = new Set(manifest.content_scripts?.flatMap((c) => c.matches ?? []) ?? []);
  const granted = (await chrome.permissions.getAll()).origins ?? [];
  const custom = granted.filter((o) => !builtIn.has(o));
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [CUSTOM_SCRIPT_ID] });
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [CUSTOM_SCRIPT_ID] });
  if (custom.length) {
    await chrome.scripting.registerContentScripts([
      { id: CUSTOM_SCRIPT_ID, matches: custom, js: ["content.js"], runAt: "document_start", allFrames: false },
    ]);
  }
}

chrome.permissions.onRemoved.addListener(() => void syncCustomSites());
chrome.permissions.onAdded.addListener(() => void syncCustomSites());
