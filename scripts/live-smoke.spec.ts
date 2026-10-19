// Manual smoke test against the live, logged-out ChatGPT and Gemini pages.
// It only pastes synthetic data and cancels the review: it never presses
// Enter or a send button, so nothing can be submitted to the service.
//
//   npm run build && npx playwright test --config scripts/live-smoke.config.ts
import { chromium, expect, test } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EXTENSION = join(import.meta.dirname, "../dist/extension");
const SYNTHETIC = "Test only: henkilötunnus 131052-308T, IBAN FI21 1234 5600 0007 85";
const SITES = [
  { name: "ChatGPT", url: "https://chatgpt.com/", composer: "#prompt-textarea, textarea[aria-label*='ChatGPT' i]" },
  { name: "Gemini", url: "https://gemini.google.com/app", composer: "rich-textarea .ql-editor" },
];

for (const site of SITES) {
  test(`${site.name}: composer found and paste reviewed`, async () => {
    const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "sp-live-")), {
      channel: "chromium",
      headless: true,
      args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
      permissions: ["clipboard-read", "clipboard-write"],
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await page.goto(site.url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    // Automated browsers get a bot check on some sites; we do not try to get around it.
    test.skip((await page.title()).includes("Just a moment"), `${site.name} shows a bot check to automated browsers`);
    const reject = page.getByRole("button", { name: "Reject all" });
    if (await reject.count()) await reject.first().click();
    const composer = page.locator(site.composer).first();
    await composer.waitFor({ timeout: 30_000 });
    await composer.click();
    await page.evaluate((t) => navigator.clipboard.writeText(t), SYNTHETIC);
    await page.keyboard.press("ControlOrMeta+V");
    await expect.poll(() => page.frames().some((f) => f.url().includes("review.html")), { timeout: 15_000 }).toBe(true);
    const frame = page.frames().find((f) => f.url().includes("review.html"))!;
    await expect(frame.locator(".summary")).toContainText("Found 2 items");
    await page.screenshot({ path: join(import.meta.dirname, `../test-results/live-${site.name}.png`) });
    await frame.getByRole("button", { name: "Cancel" }).click();
    await expect.poll(() => page.frames().some((f) => f.url().includes("review.html"))).toBe(false);
    const text = await composer.evaluate((el) =>
      el instanceof HTMLTextAreaElement ? el.value : (el as HTMLElement).innerText,
    );
    expect(text).not.toContain("131052-308T"); // cancelled paste inserted nothing
    await context.close();
  });
}
