// Screenshots of the running software for the README (not part of the test suite).
//   npx playwright test --config scripts/screenshots.config.ts
import { join } from "node:path";
import { expect, reviewFrame, test } from "../tests/e2e/harness";

const OUT = join(import.meta.dirname, "../docs/screenshots");
const TEXT =
  "Hei! Asiakkaamme Matti Meikäläinen (henkilötunnus 131052-308T) ei pääse kirjautumaan. " +
  "Puh. 040 123 4567, matti.meikalainen@example.com. Tili FI21 1234 5600 0007 85.\n\n" +
  "Lokissa: OPENAI_API_KEY=sk-proj-FAKE0123456789abcdefFAKE0123456789abcd";

for (const scheme of ["light", "dark"] as const) {
  test(`side panel ${scheme}`, async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 420, height: 980 });
    await page.goto(`chrome-extension://${extensionId}/panel.html`);
    await page.getByLabel("Text to check").fill(TEXT);
    await expect(page.locator(".summary")).toContainText("Found 5");
    await page.screenshot({ path: join(OUT, `panel-${scheme}.png`) });
    await page.getByRole("tab", { name: "Changes" }).click();
    await page.locator(".review .preview").screenshot({ path: join(OUT, `changes-${scheme}.png`) });
  });

  test(`review dialog ${scheme}`, async ({ openReplica }) => {
    const page = await openReplica("gemini-quill");
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 1100, height: 760 });
    await page.click(".ql-editor");
    await page.evaluate((t) => navigator.clipboard.writeText(t), TEXT);
    await page.keyboard.press("ControlOrMeta+V");
    await reviewFrame(page);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, `dialog-${scheme}.png`) });
  });
}
