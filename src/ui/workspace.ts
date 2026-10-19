// The SafePrompt workspace: type or paste text, review what was found, copy
// the sanitized version, and later restore the original values in an AI answer.

import { restore, type RedactionStyle } from "../engine";
import { analyze, type Manual, type Settings } from "./model";
import { h, ReviewView } from "./review";

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for contexts without the async clipboard API.
    const area = h("textarea", { "aria-hidden": "true", style: "position:fixed;opacity:0;top:0;left:0" });
    area.value = text;
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

let toastEl: HTMLElement | null = null;
export function toast(message: string): void {
  if (!toastEl) {
    toastEl = h("div", { class: "toast", role: "status", "aria-live": "polite" });
    document.body.append(toastEl);
  }
  toastEl.textContent = message;
  toastEl.classList.add("show");
  window.setTimeout(() => toastEl?.classList.remove("show"), 2200);
}

export interface WorkspaceOptions {
  getSettings: () => Settings;
  /** Extra buttons placed next to "Copy sanitized". */
  actions?: HTMLElement[];
  placeholder?: string;
}

export class Workspace {
  readonly root: HTMLElement;
  readonly input = h("textarea", { id: "input", spellcheck: "false", "aria-label": "Text to check" });
  readonly review: ReviewView;
  private manual: Manual[] = [];
  private mapping = new Map<string, string>();
  private timer: number | undefined;
  private readonly copyButton = h("button", { type: "button", class: "primary" }, "Copy sanitized");
  private readonly styleSelect = h(
    "select",
    { "aria-label": "Replace with" },
    h("option", { value: "numbered" }, "Numbered placeholders <EMAIL_1>"),
    h("option", { value: "placeholder" }, "Placeholders <EMAIL>"),
    h("option", { value: "mask" }, "Mask ****"),
  );
  private readonly restoreInput = h("textarea", {
    "aria-label": "AI answer with placeholders",
    placeholder:
      "Paste the AI's answer here. Placeholders like <EMAIL_1> are replaced with your original values, on this device.",
  });
  private readonly restoreOutput = h("div", { class: "preview", "aria-live": "polite" });

  constructor(private readonly options: WorkspaceOptions) {
    this.input.placeholder =
      options.placeholder ?? "Paste or type the text you want to send to an AI. It is checked here, on your device.";
    this.review = new ReviewView({
      style: options.getSettings().style,
      onMark: (range) => {
        // A selection in the highlighted text, else one in the input box.
        const { selectionStart: s, selectionEnd: e } = this.input;
        const r = range ?? (e > s ? ([s, e] as [number, number]) : null);
        if (!r) return toast("Select some text first.");
        this.manual.push({ start: r[0], end: r[1] });
        this.refresh();
      },
    });
    this.styleSelect.value = options.getSettings().style;
    this.styleSelect.addEventListener("change", () => {
      this.review.setStyle(this.styleSelect.value as RedactionStyle);
    });
    this.input.addEventListener("input", () => {
      this.manual = [];
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.refresh(), 120);
    });

    const clear = h("button", { type: "button" }, "Clear");
    clear.addEventListener("click", () => {
      this.setText("");
      this.input.focus();
    });

    this.copyButton.addEventListener("click", () => void this.copy());
    const restoreButton = h("button", { type: "button" }, "Copy restored answer");
    this.restoreInput.addEventListener("input", () => {
      this.restoreOutput.textContent = restore(this.restoreInput.value, this.mapping);
    });
    restoreButton.addEventListener("click", async () => {
      if (await copyText(this.restoreOutput.textContent ?? "")) toast("Restored answer copied");
    });

    this.root = h(
      "div",
      { class: "workspace" },
      this.input,
      h("div", { class: "row" }, clear),
      this.review.root,
      h(
        "div",
        { class: "row actions" },
        this.copyButton,
        ...(options.actions ?? []),
        h("span", { class: "spacer" }),
        this.styleSelect,
      ),
      h(
        "details",
        { class: "restore" },
        h("summary", {}, "Restore an AI answer"),
        h(
          "p",
          { class: "muted" },
          "If the AI answers using the numbered placeholders, paste its answer here to put your original values back. ",
          "The values are kept only while this panel is open.",
        ),
        this.restoreInput,
        this.restoreOutput,
        restoreButton,
      ),
    );
    this.refresh();
  }

  setText(text: string): void {
    this.input.value = text;
    this.manual = [];
    this.refresh();
  }

  refresh(): void {
    const text = this.input.value;
    this.review.update(text, analyze(text, this.options.getSettings(), this.manual));
    this.copyButton.disabled = text.trim() === "";
  }

  /** Sanitized text; remembers the placeholder mapping for "Restore". */
  sanitized(): string {
    const result = this.review.result();
    for (const [k, v] of result.mapping) this.mapping.set(k, v);
    return result.text;
  }

  private async copy(): Promise<void> {
    if (await copyText(this.sanitized())) toast("Sanitized text copied");
    else toast("Copy failed. Select the Sanitized tab and copy manually.");
  }
}
