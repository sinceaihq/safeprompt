// Settings form shared by the extension side panel and the web demo.

import { CATEGORY_LABELS, COUNTRY_NAMES, type Settings } from "./model";
import { h } from "./review";

export interface SiteInfo {
  id: string;
  name: string;
  testing: string;
}

const SENSITIVITY: [string, number, string][] = [
  ["Fewer alerts", 0.7, "Only values with strong evidence (checksums, prefixes, labels)."],
  ["Balanced", 0.5, "Recommended."],
  ["Catch more", 0.25, "Also unlabelled digit strings that pass a checksum. More false alarms."],
];

const TOGGLE_CATEGORIES = ["NATIONAL_ID", "VAT_ID", "IBAN", "PAYMENT_CARD", "EMAIL", "PHONE", "IP_ADDRESS", "SECRET"];

let uid = 0;
const checkbox = (label: string, checked: boolean, onChange: (v: boolean) => void, hint?: string): HTMLElement => {
  const id = `opt-${++uid}`;
  const box = h("input", { type: "checkbox", id });
  box.checked = checked;
  box.addEventListener("change", () => onChange(box.checked));
  return h("div", { class: "check" }, box, h("label", { for: id }, label, ...(hint ? [h("small", {}, hint)] : [])));
};

const lines = (s: string): string[] =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

export function settingsForm(current: Settings, onChange: (s: Settings) => void, sites: SiteInfo[] = []): HTMLElement {
  let s = current;
  const set = (patch: Partial<Settings>): void => {
    s = { ...s, ...patch };
    onChange(s);
  };

  const sensitivity = h("fieldset", {}, h("legend", {}, "Sensitivity"));
  for (const [label, value, hint] of SENSITIVITY) {
    const id = `opt-${++uid}`;
    const radio = h("input", { type: "radio", name: "sensitivity", id, value: String(value) });
    radio.checked = Math.abs(s.threshold - value) < 1e-6;
    radio.addEventListener("change", () => set({ threshold: value }));
    sensitivity.append(h("div", { class: "check" }, radio, h("label", { for: id }, label, h("small", {}, hint))));
  }

  const countries = h(
    "fieldset",
    { class: "countries" },
    h("legend", {}, "Countries you deal with"),
    h("p", { class: "muted" }, "Identifiers of these countries are found even without a label next to them."),
  );
  const grid = h("div", { class: "grid" });
  for (const [code, name] of Object.entries(COUNTRY_NAMES).sort((a, b) => a[1].localeCompare(b[1]))) {
    grid.append(
      checkbox(`${name}`, s.countries.includes(code), (on) =>
        set({ countries: on ? [...s.countries, code] : s.countries.filter((c) => c !== code) }),
      ),
    );
  }
  countries.append(grid);

  const categories = h("fieldset", {}, h("legend", {}, "What to look for"));
  for (const cat of TOGGLE_CATEGORIES) {
    categories.append(
      checkbox(CATEGORY_LABELS[cat], !s.disabledEntities.includes(cat), (on) =>
        set({
          disabledEntities: on ? s.disabledEntities.filter((c) => c !== cat) : [...s.disabledEntities, cat],
        }),
      ),
    );
  }

  const custom = h("textarea", {
    id: "custom-terms",
    rows: "3",
    placeholder: "One per line, e.g. a client name or project code name",
  });
  custom.value = s.customTerms.join("\n");
  custom.addEventListener("change", () => set({ customTerms: lines(custom.value) }));
  const allow = h("textarea", {
    id: "allow-list",
    rows: "2",
    placeholder: "One per line, e.g. support@yourcompany.example",
  });
  allow.value = s.allowList.join("\n");
  allow.addEventListener("change", () => set({ allowList: lines(allow.value) }));

  const form = h(
    "div",
    { class: "settings" },
    sensitivity,
    countries,
    categories,
    h(
      "fieldset",
      {},
      h("legend", {}, "Your own words"),
      h("label", { for: "custom-terms" }, "Always flag"),
      custom,
      h("label", { for: "allow-list" }, "Never flag"),
      allow,
    ),
  );

  if (sites.length) {
    const guard = h(
      "fieldset",
      {},
      h("legend", {}, "Protection on AI sites"),
      checkbox("Check text pasted into the message box", s.pasteCheck, (v) => set({ pasteCheck: v })),
      checkbox("Check messages before they are sent", s.sendCheck, (v) => set({ sendCheck: v })),
    );
    for (const site of sites) {
      guard.append(
        checkbox(
          site.name,
          s.sites[site.id] ?? true,
          (v) => set({ sites: { ...s.sites, [site.id]: v } }),
          site.testing,
        ),
      );
    }
    form.prepend(guard);
  }
  return form;
}
