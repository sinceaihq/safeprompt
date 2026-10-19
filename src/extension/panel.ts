// Side panel: the SafePrompt workspace plus status and settings.

import { DEFAULT_SETTINGS, withDefaults, type Settings } from "../ui/model";
import { h } from "../ui/review";
import { settingsForm } from "../ui/settings";
import { toast, Workspace } from "../ui/workspace";
import type { Message, TabStatus } from "./messages";
import { SITES } from "./sites";

let settings: Settings = DEFAULT_SETTINGS;
const statusBox = h("div", { class: "notice", role: "status" });
const readDraft = h("button", { type: "button" }, "Check my draft in the chat");
const insert = h("button", { type: "button" }, "Insert into chat");
const draftRow = h("div", { class: "row" }, readDraft);
let activeTabId: number | null = null;

const workspace = new Workspace({ getSettings: () => settings, actions: [insert] });

async function save(next: Settings): Promise<void> {
  settings = next;
  await chrome.storage.local.set({ settings });
  workspace.review.setStyle(settings.style);
  workspace.refresh();
}

async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

async function updateStatus(): Promise<void> {
  const tab = await activeTab();
  activeTabId = tab?.id ?? null;
  const status =
    activeTabId === null
      ? null
      : ((await chrome.runtime.sendMessage({
          type: "status:get",
          tabId: activeTabId,
        } satisfies Message)) as TabStatus | null);
  const connected = Boolean(status?.composer);
  draftRow.hidden = !connected;
  insert.hidden = !connected;
  statusBox.className = "notice";
  if (status && status.enabled && status.composer) {
    statusBox.classList.add("ok");
    const checks = [settings.pasteCheck && "pasted text", settings.sendCheck && "messages before sending"]
      .filter(Boolean)
      .join(" and ");
    statusBox.replaceChildren(
      h("strong", {}, `Protecting ${status.siteName}. `),
      `SafePrompt checks ${checks || "nothing (both checks are off)"} on this page.`,
      ...(status.verified
        ? []
        : [
            h("br"),
            h(
              "small",
              {},
              "Tested with a replica of this site, not the live site. Check that the review appears when you paste.",
            ),
          ]),
    );
  } else if (status && status.enabled) {
    statusBox.classList.add("warn");
    statusBox.replaceChildren(
      h("strong", {}, `Not protected on ${status.siteName}. `),
      "SafePrompt cannot find the message box on this page (the site may have changed). Paste your text below instead.",
    );
  } else if (status) {
    statusBox.replaceChildren(`${status.siteName} protection is switched off in the settings below.`);
  } else {
    statusBox.replaceChildren(...(await unsupportedStatus(tab)));
  }
}

async function unsupportedStatus(tab: chrome.tabs.Tab | undefined): Promise<(Node | string)[]> {
  const nodes: (Node | string)[] = [
    h("strong", {}, "This page is not checked automatically. "),
    "Paste text below to check it, then copy the sanitized version.",
  ];
  let origin: string | null = null;
  try {
    const url = new URL(tab?.url ?? "");
    if (url.protocol === "https:") origin = `${url.origin}/*`;
  } catch {
    origin = null;
  }
  if (origin) {
    const add = h("button", { type: "button" }, `Protect ${new URL(tab!.url!).host}`);
    add.addEventListener("click", async () => {
      const granted = await chrome.permissions.request({ origins: [origin] });
      if (!granted) return;
      await chrome.runtime.sendMessage({ type: "site:add", origin } satisfies Message);
      toast("Added. Reload the page to start checking it.");
    });
    nodes.push(
      h(
        "div",
        { class: "row", style: "margin-top:8px" },
        add,
        h("small", { class: "muted" }, "Asks for access to this site only."),
      ),
    );
  }
  return nodes;
}

readDraft.addEventListener("click", async () => {
  if (activeTabId === null) return;
  const r = (await chrome.tabs.sendMessage(activeTabId, { type: "read-composer" } satisfies Message)) as {
    text: string | null;
  };
  if (r?.text) workspace.setText(r.text);
  else toast("The message box is empty.");
});

insert.addEventListener("click", async () => {
  if (activeTabId === null) return;
  const text = workspace.sanitized();
  const r = (await chrome.tabs.sendMessage(activeTabId, { type: "insert", text } satisfies Message)) as { ok: boolean };
  toast(r?.ok ? "Inserted. Review it in the chat, then send it yourself." : "Could not find the message box.");
});

async function main(): Promise<void> {
  settings = withDefaults((await chrome.storage.local.get("settings")).settings);
  workspace.review.setStyle(settings.style);
  workspace.refresh();
  const sites = SITES.map((s) => ({ id: s.id, name: s.name, testing: s.testing }));
  document.getElementById("app")!.replaceChildren(
    h(
      "header",
      { class: "brand" },
      h("img", { src: "icons/icon-32.png", alt: "", width: "28", height: "28" }),
      h(
        "div",
        {},
        h("h1", {}, "SafePrompt"),
        h("p", { class: "muted" }, "Check prompts for personal data and secrets before you send them."),
      ),
    ),
    statusBox,
    draftRow,
    workspace.root,
    h(
      "details",
      { class: "settings-box" },
      h("summary", {}, "Settings"),
      settingsForm(settings, (s) => void save(s), sites),
    ),
    h(
      "footer",
      { class: "privacy" },
      h("strong", {}, "Private by design. "),
      "Everything is checked on this device. SafePrompt has no server, no account and no analytics, and it never sends a message for you. ",
      "It can miss things (names and free-text details especially), so always read what you send. ",
      h(
        "a",
        { href: "https://github.com/sinceaihq/safeprompt#privacy", target: "_blank", rel: "noopener" },
        "How it works",
      ),
    ),
  );
  await updateStatus();
  workspace.input.focus();
}

chrome.tabs.onActivated.addListener(() => void updateStatus());
chrome.tabs.onUpdated.addListener((_id, info) => {
  if (info.status === "complete") void updateStatus();
});
window.setInterval(() => void updateStatus(), 3000);

void main();
