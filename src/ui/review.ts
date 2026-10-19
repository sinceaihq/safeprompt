// Review component: highlighted text, findings list, sanitized text and the
// changes between them. User text is only ever inserted with textContent.

import type { RedactionStyle } from "../engine";
import { CATEGORY_LABELS, sanitize, type Item } from "./model";

export const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) el.append(c);
  return el;
};

const categoryClass = (entity: string): string => `cat-${entity.toLowerCase().replace(/_/g, "-")}`;

export type View = "original" | "sanitized" | "changes";

export interface ReviewOptions {
  style: RedactionStyle;
  onToggle?: (items: Item[]) => void;
  /** "Mark selected text": the selected range in the text, or null if none. */
  onMark?: (range: [number, number] | null) => void;
}

export class ReviewView {
  readonly root: HTMLElement;
  private text = "";
  private items: Item[] = [];
  private view: View = "original";
  private readonly summary = h("p", { class: "summary", role: "status", "aria-live": "polite" });
  private readonly tabs: Record<View, HTMLButtonElement>;
  private readonly preview = h("div", { class: "preview", tabindex: "-1" });
  private readonly hint = h(
    "p",
    { class: "hint muted" },
    "Names, addresses and other details written in words are not detected. Select them in the text above and press “Mark selected text”.",
  );
  private readonly markButton = h("button", { type: "button", class: "mark-button" }, "Mark selected text");
  private readonly list = h("div", { class: "findings" });

  constructor(private options: ReviewOptions) {
    const tab = (view: View, label: string) => {
      const b = h("button", { type: "button", role: "tab", class: "tab", "data-view": view }, label);
      b.addEventListener("click", () => this.show(view));
      return b;
    };
    this.tabs = {
      original: tab("original", "Found"),
      sanitized: tab("sanitized", "Sanitized"),
      changes: tab("changes", "Changes"),
    };
    const tablist = h("div", { class: "tabs", role: "tablist", "aria-label": "Preview" }, ...Object.values(this.tabs));
    tablist.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const order: View[] = ["original", "sanitized", "changes"];
      const next = order[(order.indexOf(this.view) + (e.key === "ArrowRight" ? 1 : 2)) % 3];
      this.show(next);
      this.tabs[next].focus();
    });
    this.markButton.addEventListener("mousedown", (e) => e.preventDefault()); // keep the selection
    this.markButton.addEventListener("click", () => this.options.onMark?.(this.selectedRange()));
    this.root = h(
      "section",
      { class: "review" },
      this.summary,
      tablist,
      this.preview,
      h("div", { class: "row" }, this.markButton, this.hint),
      this.list,
    );
  }

  setStyle(style: RedactionStyle): void {
    this.options = { ...this.options, style };
    this.render();
  }

  update(text: string, items: Item[]): void {
    // Keep the user's "do not replace" choices when the same text is re-analysed.
    const key = (i: Item) => `${i.entity}:${i.start}:${i.end}`;
    const kept = text === this.text ? new Set(this.items.filter((i) => !i.selected).map(key)) : new Set<string>();
    this.text = text;
    this.items = items.map((i) => (kept.has(key(i)) ? { ...i, selected: false } : i));
    this.render();
  }

  getItems(): Item[] {
    return this.items;
  }

  result() {
    return sanitize(this.text, this.items, this.options.style);
  }

  /** Offsets of the text selected in the "Found" preview. */
  selectedRange(): [number, number] | null {
    const sel = window.getSelection();
    if (this.view !== "original" || !sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    if (!this.preview.contains(range.startContainer) || !this.preview.contains(range.endContainer)) return null;
    const offset = (node: Node, at: number): number => {
      const r = document.createRange();
      r.setStart(this.preview, 0);
      r.setEnd(node, at);
      return r.toString().length;
    };
    const start = offset(range.startContainer, range.startOffset);
    const end = offset(range.endContainer, range.endOffset);
    return end > start ? [start, end] : null;
  }

  show(view: View): void {
    this.view = view;
    this.render();
  }

  private toggle(ids: number[], selected: boolean): void {
    const set = new Set(ids);
    this.items = this.items.map((i) => (set.has(i.id) ? { ...i, selected } : i));
    this.render();
    this.options.onToggle?.(this.items);
  }

  private render(): void {
    const chosen = this.items.filter((i) => i.selected).length;
    this.summary.textContent =
      this.items.length === 0
        ? this.text.trim()
          ? "Nothing sensitive found by SafePrompt's detectors. Read the text once more: names and free-text details may not be detected."
          : ""
        : `Found ${this.items.length} item${this.items.length === 1 ? "" : "s"}; ${chosen} will be replaced.`;
    this.hint.hidden = this.text.trim() === "" || this.items.some((i) => i.entity === "PERSON");
    this.markButton.hidden = !this.options.onMark || this.view !== "original" || this.text.trim() === "";
    for (const [view, b] of Object.entries(this.tabs) as [View, HTMLButtonElement][]) {
      b.setAttribute("aria-selected", String(view === this.view));
      b.tabIndex = view === this.view ? 0 : -1;
    }
    this.preview.replaceChildren(...this.renderPreview());
    this.preview.setAttribute("role", "tabpanel");
    this.list.replaceChildren(...this.renderList());
  }

  private renderPreview(): (Node | string)[] {
    if (this.view === "sanitized") return [this.result().text];
    const nodes: (Node | string)[] = [];
    let pos = 0;
    const tokens = this.view === "changes" ? this.tokens() : null;
    for (const item of this.items) {
      nodes.push(this.text.slice(pos, item.start));
      const value = this.text.slice(item.start, item.end);
      if (tokens) {
        if (item.selected) {
          nodes.push(h("del", { class: categoryClass(item.entity) }, value), h("ins", {}, tokens.get(item.id) ?? ""));
        } else nodes.push(value);
      } else {
        const mark = h(
          "mark",
          {
            class: `${categoryClass(item.entity)}${item.selected ? "" : " off"}`,
            role: "checkbox",
            tabindex: "0",
            "aria-checked": String(item.selected),
            title: `${CATEGORY_LABELS[item.entity] ?? item.entity} — ${item.selected ? "will be replaced" : "kept"} (click to change)`,
          },
          value,
        );
        const flip = () => this.toggle([item.id], !item.selected);
        mark.addEventListener("click", flip);
        mark.addEventListener("keydown", (e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            flip();
          }
        });
        nodes.push(mark);
      }
      pos = item.end;
    }
    nodes.push(this.text.slice(pos));
    return nodes;
  }

  /** Placeholder of each selected item, as it appears in the sanitized text. */
  private tokens(): Map<number, string> {
    const out = new Map<number, string>();
    const style = this.options.style;
    const byValue = new Map<string, string>();
    const counters = new Map<string, number>();
    for (const item of this.items.filter((i) => i.selected)) {
      if (style === "mask") out.set(item.id, "*".repeat(item.end - item.start));
      else if (style === "placeholder") out.set(item.id, `<${item.entity}>`);
      else {
        const key = `${item.entity}\u0000${item.text}`;
        let t = byValue.get(key);
        if (!t) {
          const n = (counters.get(item.entity) ?? 0) + 1;
          counters.set(item.entity, n);
          t = `<${item.entity}_${n}>`;
          byValue.set(key, t);
        }
        out.set(item.id, t);
      }
    }
    return out;
  }

  private renderList(): Node[] {
    if (this.items.length === 0) return [];
    const groups = new Map<string, Item[]>();
    for (const i of this.items) groups.set(i.entity, [...(groups.get(i.entity) ?? []), i]);
    return [...groups.entries()].map(([entity, items]) => {
      const all = items.every((i) => i.selected);
      const groupBox = h("input", {
        type: "checkbox",
        "aria-label": `Replace all: ${CATEGORY_LABELS[entity] ?? entity}`,
      });
      groupBox.checked = all;
      groupBox.indeterminate = !all && items.some((i) => i.selected);
      groupBox.addEventListener("change", () =>
        this.toggle(
          items.map((i) => i.id),
          groupBox.checked,
        ),
      );
      const rows = items.map((item) => {
        const box = h("input", { type: "checkbox", id: `item-${item.id}` });
        box.checked = item.selected;
        box.addEventListener("change", () => this.toggle([item.id], box.checked));
        const why = [
          item.validated ? "checksum valid" : null,
          item.context ? "label nearby" : null,
          item.country ? item.country : null,
          `confidence ${Math.round(item.score * 100)} %`,
        ].filter(Boolean);
        return h(
          "li",
          {},
          box,
          h("label", { for: `item-${item.id}` }, h("code", {}, item.text), h("small", {}, why.join(" · "))),
        );
      });
      return h(
        "div",
        { class: `group ${categoryClass(entity)}`, role: "group" },
        h(
          "label",
          { class: "group-head" },
          groupBox,
          h("span", { class: "swatch", "aria-hidden": "true" }),
          `${CATEGORY_LABELS[entity] ?? entity} (${items.length})`,
        ),
        h("ul", {}, ...rows),
      );
    });
  }
}
