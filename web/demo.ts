// Web demo: the SafePrompt workspace in a plain page. Runs entirely in the
// browser; settings live in memory only.

import { DEFAULT_SETTINGS, type Settings } from "../src/ui/model";
import { h } from "../src/ui/review";
import { settingsForm } from "../src/ui/settings";
import { Workspace } from "../src/ui/workspace";

// All examples are synthetic: documented sample identifiers, test card
// numbers, reserved example.com addresses and the countries' "John Doe" names.
const EXAMPLES: [string, string][] = [
  [
    "Customer support (Finnish)",
    "Hei! Asiakkaamme Matti Meikäläinen (henkilötunnus 131052-308T) ei pääse kirjautumaan. " +
      "Puh. 040 123 4567, matti.meikalainen@example.com. Hänen tilinsä on FI21 1234 5600 0007 85. " +
      "Kirjoitatko hänelle kohteliaan vastauksen?",
  ],
  [
    "HR note (German)",
    "Bitte fasse das zusammen: Neue Mitarbeiterin Erika Mustermann, Steuer-ID 86 095 742 719, " +
      "IBAN DE89 3704 0044 0532 0130 00, erreichbar unter +49 30 12345678.",
  ],
  [
    "Debugging (developer)",
    "Why does my app crash on start?\n\nDATABASE_URL=postgres://app:s3cr3t-Pa55@db.internal:5432/app\n" +
      "OPENAI_API_KEY=sk-proj-FAKE0123456789abcdefFAKE0123456789abcd\n" +
      "Error: connection refused from 10.20.30.40",
  ],
  [
    "Invoice (Italian)",
    "Controlla questa fattura: cliente Mario Rossi, codice fiscale RSSMRA85T10A562S, " +
      "pagamento con carta 4111 1111 1111 1111, e-mail mario.rossi@example.it.",
  ],
  [
    "Business numbers (nothing to hide)",
    "Order 4000123456 shipped on 2026-03-05. Invoice 2026-0042 totals 3 041,84 € incl. VAT. " +
      "EAN 4006381333931, version 1.2.3.4, revenue EUR 12 345 678.",
  ],
];

let settings: Settings = { ...DEFAULT_SETTINGS };
const workspace = new Workspace({ getSettings: () => settings });

const chips = h("div", { class: "row examples", role: "group", "aria-label": "Examples" });
for (const [label, text] of EXAMPLES) {
  const b = h("button", { type: "button" }, label);
  b.addEventListener("click", () => {
    workspace.setText(text);
    workspace.review.show("original");
  });
  chips.append(b);
}

document.getElementById("workspace")!.replaceChildren(
  h("p", { class: "muted" }, "Try an example (all synthetic) or paste your own text. Nothing leaves this page."),
  chips,
  workspace.root,
  h(
    "details",
    { class: "settings-box" },
    h("summary", {}, "Settings"),
    settingsForm(settings, (s) => {
      settings = s;
      workspace.review.setStyle(s.style);
      workspace.refresh();
    }),
  ),
);
workspace.setText(EXAMPLES[0][1]);
