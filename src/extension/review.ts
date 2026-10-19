// Review dialog shown over a chat site when a paste or a message needs a look.

import { analyze, type Manual, type Settings } from "../ui/model";
import { h, ReviewView } from "../ui/review";
import type { Message, ReviewAction, ReviewSession } from "./messages";

const id = location.hash.slice(1);
const app = document.getElementById("app")!;

const TITLES = {
  paste: ["You are pasting something sensitive", "Choose what to replace before it goes into the message box."],
  send: ["Your message contains something sensitive", "Replace it, or send unchanged if you are sure."],
  selection: ["Check selection", ""],
} as const;

async function done(action: ReviewAction, text?: string): Promise<void> {
  await chrome.runtime.sendMessage({ type: "review:done", id, action, text } satisfies Message);
}

async function main(): Promise<void> {
  const { session, settings } = (await chrome.runtime.sendMessage({ type: "review:get", id } satisfies Message)) as {
    session: ReviewSession | null;
    settings: Settings;
  };
  if (!session) {
    app.replaceChildren(h("p", {}, "This review has expired. Close it and try again."));
    await done("cancel");
    return;
  }
  const [title, lede] = TITLES[session.mode];
  const manual: Manual[] = [];
  const view: ReviewView = new ReviewView({
    style: settings.style,
    onMark: (range) => {
      if (!range) return;
      manual.push({ start: range[0], end: range[1] });
      view.update(session.text, analyze(session.text, settings, manual));
    },
  });
  view.update(session.text, analyze(session.text, settings));

  const primary = h(
    "button",
    { type: "button", class: "primary" },
    session.mode === "paste" ? "Paste sanitized" : "Replace in message",
  );
  const original = h("button", { type: "button" }, session.mode === "paste" ? "Paste original" : "Send unchanged");
  const cancel = h("button", { type: "button" }, "Cancel");
  primary.addEventListener("click", () => void done("sanitized", view.result().text));
  original.addEventListener("click", () => void done("original"));
  cancel.addEventListener("click", () => void done("cancel"));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") void done("cancel");
  });

  app.replaceChildren(
    h(
      "header",
      { class: "dialog-head" },
      h("img", { src: "icons/icon-32.png", alt: "", width: "24", height: "24" }),
      h("div", {}, h("h1", { id: "title" }, title), h("p", { class: "muted" }, lede)),
    ),
    view.root,
    h(
      "footer",
      { class: "row" },
      h("small", { class: "muted" }, "Checked on this device. Nothing was sent anywhere."),
      h("span", { class: "spacer" }),
      cancel,
      original,
      primary,
    ),
  );
  document.body.setAttribute("aria-labelledby", "title");
  primary.focus();
}

void main();
