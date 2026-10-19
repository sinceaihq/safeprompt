// Where the message composer and the send button are on supported sites.
//
// Sites change their markup often, so every adapter lists several selectors
// and falls back to generic rules. The content script reports whether a
// composer was actually found; the interface only claims protection then.

export interface SiteAdapter {
  id: string;
  name: string;
  hosts: string[];
  /** Paste and send checks were tested against the live site (see docs/TESTING.md). */
  verified: boolean;
  /** How the integration was tested, shown in the settings. */
  testing: string;
  composers: string[];
  sendButtons: string[];
}

export const SITES: SiteAdapter[] = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    hosts: ["chatgpt.com", "chat.openai.com"],
    verified: false,
    testing: "Tested with a replica of the current page; the live site blocks automated test browsers.",
    composers: [
      "#prompt-textarea",
      "textarea[aria-label*='ChatGPT' i]",
      "#mobile-composer-prompt",
      "form div.ProseMirror[contenteditable='true']",
    ],
    sendButtons: ["button[data-testid='send-button']", "#composer-submit-button", "button[aria-label='Send message']", "button[aria-label='Send prompt']"],
  },
  {
    id: "gemini",
    name: "Gemini",
    hosts: ["gemini.google.com"],
    verified: true,
    testing: "Tested on the live site (signed out).",
    composers: ["rich-textarea .ql-editor[contenteditable='true']", ".ql-editor[contenteditable='true']:not(.ql-clipboard)"],
    sendButtons: ["button.send-button", "button[aria-label='Send message']", "button[aria-label*='Send' i]"],
  },
  {
    id: "claude",
    name: "Claude",
    hosts: ["claude.ai"],
    verified: false,
    testing: "Experimental: tested only with a replica; the live site needs a sign-in. Off by default.",
    composers: ["div.ProseMirror[contenteditable='true']", "[data-testid='chat-input'] [contenteditable='true']", "fieldset [contenteditable='true']"],
    sendButtons: ["button[aria-label='Send message']", "button[aria-label='Send Message']", "button[data-testid='send-button']"],
  },
]; // prettier-ignore

/** Adapter for sites the user added themselves: generic rules only. */
export const GENERIC: SiteAdapter = {
  id: "custom",
  name: "This site",
  hosts: [],
  verified: false,
  testing: "Generic support for a site you added.",
  composers: ["textarea", "[contenteditable='true']", "[contenteditable='plaintext-only']"],
  sendButtons: ["button[type='submit']", "button[aria-label*='send' i]", "button[data-testid*='send' i]"],
};

export function siteForHost(host: string): SiteAdapter {
  return SITES.find((s) => s.hosts.some((h) => host === h || host.endsWith(`.${h}`))) ?? GENERIC;
}

export type Editable = HTMLTextAreaElement | HTMLInputElement | HTMLElement;

export function isEditable(el: Element | null): el is Editable {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) return el.type === "text" || el.type === "search";
  return el instanceof HTMLElement && el.isContentEditable;
}

/** The editable that receives typing for an event target (contenteditable root). */
export function editableFor(target: EventTarget | null): Editable | null {
  let el = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  if (!el || !isEditable(el)) return null;
  // climb to the root of a contenteditable region
  while (el.parentElement && el.parentElement.isContentEditable) el = el.parentElement;
  return el as Editable;
}

const visible = (el: Element): boolean => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

export function findComposer(site: SiteAdapter, root: ParentNode = document): Editable | null {
  for (const selector of site.composers) {
    for (const el of root.querySelectorAll(selector)) {
      if (isEditable(el) && visible(el)) return editableFor(el) ?? el;
    }
  }
  return null;
}

export function isSendButton(site: SiteAdapter, target: EventTarget | null): boolean {
  const button = target instanceof Element ? target.closest("button, [role='button']") : null;
  if (!button) return false;
  if (site.sendButtons.some((s) => button.matches(s))) return true;
  const label = `${button.getAttribute("aria-label") ?? ""} ${button.getAttribute("data-testid") ?? ""}`;
  return /\b(send|submit)\b/i.test(label);
}

export function getText(el: Editable): string {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el.value;
  return el.innerText.replace(/\u00a0/g, " ");
}
