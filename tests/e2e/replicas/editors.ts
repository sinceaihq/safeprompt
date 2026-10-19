// Minimal replicas of AI chat composers, built with the editor libraries the
// real sites use. "Sending" records the message in window.__sent and clears
// the box, so tests can check whether a message would have left the page.

import { baseKeymap } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import { schema } from "prosemirror-schema-basic";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import Quill from "quill";

declare global {
  interface Window {
    __sent: string[];
    __composerText: () => string;
    __pasteSeen: string[];
  }
}

window.__sent = [];
// Like a site's analytics: record every paste the page itself can see.
window.__pasteSeen = [];
window.addEventListener("paste", (e) => window.__pasteSeen.push(e.clipboardData?.getData("text/plain") ?? ""), true);
const kind = document.body.dataset.editor;
const sendButton = document.querySelector<HTMLButtonElement>("[data-send]")!;

function setup(read: () => string, clear: () => void, enterTarget: HTMLElement): void {
  window.__composerText = read;
  const send = () => {
    const text = read().trim();
    if (!text) return;
    window.__sent.push(text);
    clear();
  };
  sendButton.addEventListener("click", send);
  enterTarget.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
}

if (kind === "textarea") {
  const area = document.querySelector<HTMLTextAreaElement>("textarea")!;
  setup(
    () => area.value,
    () => (area.value = ""),
    area,
  );
} else if (kind === "prosemirror") {
  const mount = document.querySelector<HTMLElement>("[data-mount]")!;
  const view = new EditorView(mount, {
    state: EditorState.create({ schema, plugins: [keymap(baseKeymap)] }),
    attributes: mount.dataset.id ? { id: mount.dataset.id } : {},
  });
  setup(
    () => view.dom.innerText,
    () => view.dispatch(view.state.tr.delete(0, view.state.doc.content.size)),
    view.dom,
  );
} else if (kind === "quill") {
  const quill = new Quill("[data-mount]", { theme: undefined });
  setup(
    () => quill.getText(),
    () => quill.setText(""),
    quill.root,
  );
}
