// Playwright harness: Chromium with the built extension loaded, and replica
// chat sites served at the real origins (requests never reach the network).

import { test as base, chromium, type BrowserContext, type Frame, type Page } from "@playwright/test";
import { buildSync } from "esbuild";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EXTENSION = join(import.meta.dirname, "../../dist/extension");

const editorsJs = buildSync({
  entryPoints: [join(import.meta.dirname, "replicas/editors.ts")],
  bundle: true,
  write: false,
  format: "iife",
  logLevel: "silent",
}).outputFiles[0].text;

export type Replica = "chatgpt-textarea" | "chatgpt-prosemirror" | "gemini-quill" | "claude-prosemirror" | "plain";

const PAGES: Record<Replica, { origin: string; body: string; editor: string }> = {
  "chatgpt-textarea": {
    origin: "https://chatgpt.com",
    editor: "textarea",
    body: `<form><textarea id="prompt-textarea" aria-label="Chat with ChatGPT" rows="4"></textarea>
      <button type="button" data-send data-testid="send-button" aria-label="Send prompt">Send</button></form>`,
  },
  "chatgpt-prosemirror": {
    origin: "https://chatgpt.com",
    editor: "prosemirror",
    body: `<form><div data-mount data-id="prompt-textarea"></div>
      <button type="button" data-send data-testid="send-button" aria-label="Send prompt">Send</button></form>`,
  },
  "gemini-quill": {
    origin: "https://gemini.google.com",
    editor: "quill",
    body: `<rich-textarea class="text-input-field_textarea"><div data-mount></div></rich-textarea>
      <button type="button" data-send class="send-button" aria-label="Send message">Send</button>`,
  },
  "claude-prosemirror": {
    origin: "https://claude.ai",
    editor: "prosemirror",
    body: `<fieldset><div data-mount></div>
      <button type="button" data-send aria-label="Send message">Send</button></fieldset>`,
  },
  plain: {
    origin: "https://example.com",
    editor: "textarea",
    body: `<textarea></textarea><button data-send>Send</button>`,
  },
};

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  openReplica: (r: Replica) => Promise<Page>;
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "safeprompt-")), {
      channel: "chromium",
      headless: true,
      args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
      permissions: ["clipboard-read", "clipboard-write"],
    });
    // Block any real network access from tests.
    await context.route(/^https?:\/\//, (route) => route.abort());
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    await use(new URL(worker.url()).host);
  },
  openReplica: async ({ context }, use) => {
    await use(async (replica) => {
      const { origin, body, editor } = PAGES[replica];
      const page = await context.newPage();
      await page.route(`${origin}/**`, (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === "/__replica/editors.js") {
          return route.fulfill({ contentType: "text/javascript", body: editorsJs });
        }
        return route.fulfill({
          contentType: "text/html",
          body: `<!doctype html><html><head><meta charset="utf-8"><title>${replica}</title></head>
            <body data-editor="${editor}">${body}<script src="/__replica/editors.js"></script></body></html>`,
        });
      });
      await page.goto(`${origin}/`);
      await page.waitForFunction(() => typeof window.__composerText === "function");
      return page;
    });
  },
});

export const expect = test.expect;

/** The SafePrompt review dialog frame, once it has rendered. */
export async function reviewFrame(page: Page): Promise<Frame> {
  await expect.poll(() => page.frames().some((f) => f.url().includes("/review.html")), { timeout: 10_000 }).toBe(true);
  const frame = page.frames().find((f) => f.url().includes("/review.html"))!;
  await frame.waitForSelector(".review");
  return frame;
}

export const composerSelector = (replica: Replica): string =>
  replica === "chatgpt-textarea" || replica === "plain"
    ? "textarea"
    : replica === "gemini-quill"
      ? ".ql-editor"
      : ".ProseMirror";
