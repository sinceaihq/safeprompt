import { expect, test } from "./harness";

const TEXT =
  "Hi, please draft a reply to Matti (matti.meikalainen@example.com, puh. 040 123 4567). " +
  "His Steuer-ID is 86 095 742 719 and our key is sk-proj-FAKE0123456789abcdefFAKE0123456789abcd.";

test("workspace: findings, copy sanitized and restore the answer", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/panel.html`);
  await page.getByLabel("Text to check").fill(TEXT);
  await expect(page.locator(".summary")).toHaveText("Found 4 items; 4 will be replaced.");
  await expect(page.locator(".group-head")).toHaveText([
    "E-mail address (1)",
    "Phone number (1)",
    "National ID (1)",
    "Password, key or token (1)",
  ]);

  // Keep the phone number: untick it in the list.
  await page.locator(".group li", { hasText: "040 123 4567" }).getByRole("checkbox").uncheck();
  await expect(page.locator(".summary")).toHaveText("Found 4 items; 3 will be replaced.");

  await page.getByRole("button", { name: "Copy sanitized" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(
    "Hi, please draft a reply to Matti (<EMAIL_1>, puh. 040 123 4567). " +
      "His Steuer-ID is <NATIONAL_ID_1> and our key is <SECRET_1>.",
  );

  await page.getByRole("tab", { name: "Changes" }).click();
  await expect(page.locator(".preview del")).toHaveCount(3);

  await page.getByText("Restore an AI answer").click();
  await page.getByLabel("AI answer with placeholders").fill("Dear Matti, I have noted <EMAIL_1> and <NATIONAL_ID_1>.");
  await expect(page.locator(".restore .preview")).toHaveText(
    "Dear Matti, I have noted matti.meikalainen@example.com and 86 095 742 719.",
  );
});

test("highlighted values can be toggled with the keyboard", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/panel.html`);
  await page.getByLabel("Text to check").fill("IBAN FI21 1234 5600 0007 85");
  const mark = page.locator("mark");
  await mark.focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("checkbox", { name: /FI21/ }).first()).toHaveAttribute("aria-checked", "false");
  await expect(page.locator(".summary")).toHaveText("Found 1 item; 0 will be replaced.");
});

test("settings persist and custom terms are flagged", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/panel.html`);
  await page.getByText("Settings").click();
  await page.getByLabel("Always flag").fill("Project Falcon");
  await page.getByLabel("Always flag").blur();
  await page.getByLabel("Text to check").fill("Status of project falcon for Q3?");
  await expect(page.locator(".group-head")).toHaveText(["Your custom term (1)"]);
  await page.reload();
  const stored = (await page.evaluate(() => chrome.storage.local.get("settings"))) as {
    settings: { customTerms: string[] };
  };
  expect(stored.settings.customTerms).toEqual(["Project Falcon"]);
});

test("nothing is stored except settings", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/panel.html`);
  await page.getByLabel("Text to check").fill(TEXT);
  await page.getByRole("button", { name: "Copy sanitized" }).click();
  const local = await page.evaluate(() => chrome.storage.local.get(null));
  const session = await page.evaluate(() => chrome.storage.session.get(null));
  expect(JSON.stringify(local)).not.toContain("matti");
  expect(session).toEqual({});
});
