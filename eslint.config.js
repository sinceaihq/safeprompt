import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "test-results/", "playwright-report/", "eval/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { window: "readonly", document: "readonly", chrome: "readonly", console: "readonly" } },
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-restricted-properties": [
        "error",
        { property: "innerHTML", message: "Build DOM with textContent / h() — never parse user text as HTML." },
        { property: "outerHTML", message: "Do not assign HTML strings." },
        { property: "insertAdjacentHTML", message: "Do not insert HTML strings." },
      ],
      "no-restricted-globals": ["error", { name: "fetch", message: "SafePrompt makes no network requests." }],
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: { Buffer: "readonly", process: "readonly" } },
  },
  {
    files: ["tests/**", "scripts/**"],
    rules: { "no-restricted-properties": "off", "no-restricted-globals": "off" },
  },
);
