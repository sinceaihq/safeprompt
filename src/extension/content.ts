// Content script for supported AI chat sites (and sites the user added).
//
// Checks text when it is pasted into the message box and when the user tries
// to send a message. If something sensitive is found, the event is stopped
// and SafePrompt's review dialog opens. The dialog is an extension page in an
// iframe: the site's own scripts cannot read what it shows. SafePrompt never
// submits a message; the user always presses send themselves.

import { analyze, withDefaults, type Settings } from "../ui/model";
import type { Message, ReviewAction, ReviewMode } from "./messages";
import { editableFor, findComposer, getText, isSendButton, siteForHost, type Editable } from "./sites";

const site = siteForHost(location.hostname);
let settings: Settings = withDefaults(undefined);
let bypass = false; // set while SafePrompt itself inserts text
let reviewOpen = false;
const approved = new Set<string>(); // texts the user chose to send unchanged

const enabled = (): boolean => settings.sites[site.id] ?? true;

void chrome.storage.local.get("settings").then((r) => {
  settings = withDefaults(r.settings);
  reportStatus();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) {
    settings = withDefaults(changes.settings.newValue);
    reportStatus();
  }
});

// Status -------------------------------------------------------------------
let lastComposer: boolean | null = null;
function reportStatus(force = true): void {
  const composer = findComposer(site) !== null;
  if (!force && composer === lastComposer) return;
  lastComposer = composer;
  const msg: Message = { type: "status", site: site.id, siteName: site.name, verified: site.verified, composer };
  chrome.runtime.sendMessage(msg).catch(() => undefined);
}
let statusTimer: number | undefined;
// The script runs at document_start (so its listeners run before the page's);
// the message box appears later, so watch the page for it.
new MutationObserver(() => {
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => reportStatus(false), 800);
}).observe(document.documentElement, { childList: true, subtree: true });

// Detection ------------------------------------------------------------------
const needsReview = (text: string): boolean =>
  text.trim() !== "" && !approved.has(text.trim()) && analyze(text, settings).length > 0;

function block(e: Event): void {
  e.preventDefault();
  e.stopImmediatePropagation();
}

interface Target {
  el: Editable;
  range: Range | null;
  selection: [number, number] | null;
}

function remember(el: Editable): Target {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return { el, range: null, selection: [el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length] };
  }
  const sel = window.getSelection();
  const range = sel && sel.rangeCount && el.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
  return { el, range, selection: null };
}

window.addEventListener(
  "paste",
  (e) => {
    // Only real pastes: a page cannot open SafePrompt's dialog with synthetic events.
    if (!e.isTrusted || bypass || reviewOpen || !enabled() || !settings.pasteCheck) return;
    const el = editableFor(e.target);
    const text = e.clipboardData?.getData("text/plain") ?? "";
    if (!el || !needsReview(text)) return;
    block(e);
    void review("paste", text, remember(el));
  },
  true,
);

function checkBeforeSend(e: Event, el: Editable | null): void {
  if (bypass || !enabled() || !settings.sendCheck || !el) return;
  if (reviewOpen) {
    block(e);
    return;
  }
  const text = getText(el);
  if (!needsReview(text)) return;
  block(e);
  void review("send", text, remember(el));
}

window.addEventListener(
  "keydown",
  (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.isComposing || e.altKey) return;
    const el = editableFor(e.target);
    if (!el) return;
    const composer = findComposer(site);
    // On known sites only the message box sends with Enter.
    if (composer && composer !== el && !composer.contains(el)) return;
    checkBeforeSend(e, el);
  },
  true,
);

for (const type of ["pointerdown", "mousedown", "click"] as const) {
  window.addEventListener(
    type,
    (e) => {
      if (!isSendButton(site, e.target)) return;
      // Some sites submit on pointerdown; check on the first event of a press.
      checkBeforeSend(e, findComposer(site));
    },
    true,
  );
}

window.addEventListener(
  "submit",
  (e) => {
    const form = e.target instanceof HTMLFormElement ? e.target : null;
    const composer = findComposer(site);
    if (form && composer && form.contains(composer)) checkBeforeSend(e, composer);
  },
  true,
);

// Review dialog --------------------------------------------------------------
const pending = new Map<string, (r: { action: ReviewAction; text?: string }) => void>();

chrome.runtime.onMessage.addListener((msg: Message, _sender, reply) => {
  if (msg.type === "review:result") {
    pending.get(msg.id)?.({ action: msg.action, text: msg.text });
    pending.delete(msg.id);
  } else if (msg.type === "insert") {
    const composer = findComposer(site);
    if (composer) void insertText({ el: composer, range: null, selection: null }, msg.text, "append");
    reply({ ok: composer !== null });
  } else if (msg.type === "read-composer") {
    const composer = findComposer(site);
    reply({ text: composer ? getText(composer) : null });
  }
});

async function review(mode: ReviewMode, text: string, target: Target): Promise<void> {
  reviewOpen = true;
  let overlay: HTMLElement | null = null;
  try {
    const { id } = (await chrome.runtime.sendMessage({
      type: "review:open",
      mode,
      text,
      site: site.id,
    } satisfies Message)) as {
      id: string;
    };
    const result = new Promise<{ action: ReviewAction; text?: string }>((resolve) => pending.set(id, resolve));
    overlay = mountOverlay(id);
    // If the page removes the dialog, treat it as "cancel" so checks keep working.
    const host = overlay;
    const removed = new Promise<{ action: ReviewAction }>((resolve) => {
      const timer = window.setInterval(() => {
        if (!host.isConnected) {
          window.clearInterval(timer);
          resolve({ action: "cancel" });
        }
      }, 500);
      void result.finally(() => window.clearInterval(timer));
    });
    const { action, text: chosen } = (await Promise.race([result, removed])) as { action: ReviewAction; text?: string };
    overlay.remove();
    overlay = null;
    if (action === "cancel") {
      target.el.focus();
      return;
    }
    const output = action === "sanitized" && chosen !== undefined ? chosen : text;
    if (mode === "send") {
      if (action === "sanitized") await insertText(target, output, "replace");
      else approved.add(text.trim());
      toast(
        action === "sanitized"
          ? "Message updated. Check it, then press send."
          : "OK. Press send again to send it unchanged.",
      );
    } else {
      await insertText(target, output, "insert");
    }
  } finally {
    overlay?.remove();
    reviewOpen = false;
  }
}

function mountOverlay(id: string): HTMLElement {
  const host = document.createElement("div");
  host.setAttribute("data-safeprompt", "");
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .backdrop { position: fixed; inset: 0; z-index: 2147483647; background: rgba(10, 12, 18, .45);
      display: grid; place-items: center; }
    iframe { width: min(760px, 96vw); height: min(680px, 92vh); border: 0; border-radius: 14px;
      box-shadow: 0 20px 60px rgba(0,0,0,.35); background: Canvas; color-scheme: light dark; }`;
  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";
  const frame = document.createElement("iframe");
  frame.src = `${chrome.runtime.getURL("review.html")}#${id}`;
  frame.title = "SafePrompt review";
  frame.setAttribute("allow", "clipboard-write");
  backdrop.append(frame);
  shadow.append(style, backdrop);
  document.documentElement.append(host);
  frame.addEventListener("load", () => frame.focus());
  return host;
}

function toast(message: string): void {
  const host = document.createElement("div");
  const shadow = host.attachShadow({ mode: "closed" });
  const box = document.createElement("div");
  box.setAttribute("role", "status");
  box.textContent = `SafePrompt: ${message}`;
  box.style.cssText =
    "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;background:#16181d;" +
    "color:#fff;font:14px/1.4 system-ui,sans-serif;padding:10px 14px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.3)";
  shadow.append(box);
  document.documentElement.append(host);
  window.setTimeout(() => host.remove(), 4000);
}

// Writing into the message box ---------------------------------------------
const nativeValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;

async function insertText(target: Target, text: string, how: "insert" | "replace" | "append"): Promise<void> {
  const { el } = target;
  el.focus();
  bypass = true;
  try {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      if (how === "replace") el.select();
      else if (how === "append") el.setSelectionRange(el.value.length, el.value.length);
      else if (target.selection) el.setSelectionRange(...target.selection);
      if (!document.execCommand("insertText", false, text)) {
        const [s, e] = how === "replace" ? [0, el.value.length] : [el.selectionStart ?? 0, el.selectionEnd ?? 0];
        const value = el.value.slice(0, s) + text + el.value.slice(e);
        if (nativeValue && el instanceof HTMLTextAreaElement) nativeValue.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return;
    }
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      if (how === "replace" || how === "append") {
        range.selectNodeContents(el);
        if (how === "append") range.collapse(false);
      }
      sel.removeAllRanges();
      sel.addRange(how === "insert" && target.range ? target.range : range);
      // Editors such as ProseMirror pick up DOM selection changes on the
      // asynchronous selectionchange event; let them see it first.
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    }
    // Rich editors (ProseMirror, Quill, Lexical) handle a paste event with the
    // text; plain contenteditable elements need execCommand.
    const data = new DataTransfer();
    data.setData("text/plain", text);
    const event = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    if (!event.defaultPrevented) document.execCommand("insertText", false, text);
  } finally {
    bypass = false;
  }
}
