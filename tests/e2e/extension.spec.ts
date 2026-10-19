import { composerSelector, expect, reviewFrame, test, type Replica } from "./harness";

const SENSITIVE = "Asiakas Matti Meikäläinen, henkilötunnus 131052-308T, IBAN FI21 1234 5600 0007 85.";
const CLEAN = "Summarise the attached meeting notes in three bullet points.";

async function paste(page: import("@playwright/test").Page, selector: string, text: string): Promise<void> {
  await page.click(selector);
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
  await page.keyboard.press("ControlOrMeta+V");
}

const composerText = (page: import("@playwright/test").Page) => page.evaluate(() => window.__composerText());
const sent = (page: import("@playwright/test").Page) => page.evaluate(() => window.__sent);

const REPLICAS: Replica[] = ["chatgpt-textarea", "chatgpt-prosemirror", "gemini-quill"];

for (const replica of REPLICAS) {
  test.describe(replica, () => {
    test("paste with personal data opens the review and pastes the sanitized text", async ({ openReplica }) => {
      const page = await openReplica(replica);
      await paste(page, composerSelector(replica), SENSITIVE);
      const frame = await reviewFrame(page);
      await expect(frame.locator(".summary")).toContainText("Found 2 items");
      await frame.getByRole("button", { name: "Paste sanitized" }).click();
      await expect.poll(() => composerText(page)).toContain("<NATIONAL_ID_1>");
      const text = await composerText(page);
      expect(text).toContain("<IBAN_1>");
      expect(text).not.toContain("131052-308T");
      expect(await sent(page)).toEqual([]);
    });

    test("paste original keeps the text unchanged", async ({ openReplica }) => {
      const page = await openReplica(replica);
      await paste(page, composerSelector(replica), SENSITIVE);
      const frame = await reviewFrame(page);
      await frame.getByRole("button", { name: "Paste original" }).click();
      await expect.poll(() => composerText(page)).toContain("131052-308T");
    });

    test("clean paste is not interrupted", async ({ openReplica }) => {
      const page = await openReplica(replica);
      await paste(page, composerSelector(replica), CLEAN);
      await expect.poll(() => composerText(page)).toContain("three bullet points");
      expect(page.frames().some((f) => f.url().includes("review.html"))).toBe(false);
    });

    test("Enter with personal data is stopped; replacing then sending sends the sanitized text", async ({
      openReplica,
    }) => {
      const page = await openReplica(replica);
      await page.click(composerSelector(replica));
      await page.keyboard.type("Mail me at anna.virtanen@example.com or call +358 40 123 4567");
      await page.keyboard.press("Enter");
      const frame = await reviewFrame(page);
      expect(await sent(page)).toEqual([]);
      await frame.getByRole("button", { name: "Replace in message" }).click();
      await expect.poll(() => composerText(page)).toContain("<EMAIL_1>");
      expect(await sent(page)).toEqual([]); // SafePrompt never sends by itself
      await page.click(composerSelector(replica));
      await page.keyboard.press("Enter");
      await expect.poll(() => sent(page)).toEqual(["Mail me at <EMAIL_1> or call <PHONE_1>"]);
    });

    test("send button is stopped; 'send unchanged' lets the next send through", async ({ openReplica }) => {
      const page = await openReplica(replica);
      await page.click(composerSelector(replica));
      await page.keyboard.type("Card 4111 1111 1111 1111");
      await page.click("[data-send]");
      const frame = await reviewFrame(page);
      await frame.getByRole("button", { name: "Send unchanged" }).click();
      expect(await sent(page)).toEqual([]);
      await page.click("[data-send]");
      await expect.poll(() => sent(page)).toEqual(["Card 4111 1111 1111 1111"]);
    });

    test("clean message is sent without interruption", async ({ openReplica }) => {
      const page = await openReplica(replica);
      await page.click(composerSelector(replica));
      await page.keyboard.type(CLEAN);
      await page.keyboard.press("Enter");
      await expect.poll(() => sent(page)).toEqual([CLEAN]);
    });
  });
}

test("Escape cancels the review and leaves the message box untouched", async ({ openReplica }) => {
  const page = await openReplica("chatgpt-textarea");
  await page.click("textarea");
  await page.keyboard.type("IBAN DE89 3704 0044 0532 0130 00");
  await page.keyboard.press("Enter");
  const frame = await reviewFrame(page);
  await frame.locator("body").press("Escape");
  await expect.poll(() => page.frames().some((f) => f.url().includes("review.html"))).toBe(false);
  expect(await composerText(page)).toBe("IBAN DE89 3704 0044 0532 0130 00");
  expect(await sent(page)).toEqual([]);
});

test("the site's scripts cannot read the review dialog", async ({ openReplica }) => {
  const page = await openReplica("chatgpt-textarea");
  await paste(page, "textarea", SENSITIVE);
  await reviewFrame(page);
  const access = await page.evaluate(() => {
    const host = document.querySelector("[data-safeprompt]");
    const iframes = [...document.querySelectorAll("iframe")].length;
    return {
      host: host !== null,
      shadow: host?.shadowRoot ?? null,
      iframesInLightDom: iframes,
      html: document.documentElement.outerHTML,
    };
  });
  expect(access.host).toBe(true);
  expect(access.shadow).toBeNull(); // closed shadow root
  expect(access.iframesInLightDom).toBe(0);
  expect(access.html).not.toContain("131052-308T");
});

test("Claude support is off by default", async ({ openReplica }) => {
  const page = await openReplica("claude-prosemirror");
  await paste(page, ".ProseMirror", SENSITIVE);
  await expect.poll(() => composerText(page)).toContain("131052-308T");
  expect(page.frames().some((f) => f.url().includes("review.html"))).toBe(false);
});

test("Claude support works when switched on", async ({ openReplica, context, extensionId }) => {
  const settingsPage = await context.newPage();
  await settingsPage.goto(`chrome-extension://${extensionId}/panel.html`);
  await settingsPage.evaluate(() =>
    chrome.storage.local.set({ settings: { sites: { chatgpt: true, gemini: true, claude: true } } }),
  );
  const page = await openReplica("claude-prosemirror");
  await paste(page, ".ProseMirror", SENSITIVE);
  const frame = await reviewFrame(page);
  await frame.getByRole("button", { name: "Paste sanitized" }).click();
  await expect.poll(() => composerText(page)).toContain("<NATIONAL_ID_1>");
});

test("other sites are not touched without permission", async ({ openReplica }) => {
  const page = await openReplica("plain");
  await page.click("textarea");
  await page.keyboard.type("IBAN DE89 3704 0044 0532 0130 00");
  await page.keyboard.press("Enter");
  expect(page.frames().some((f) => f.url().includes("review.html"))).toBe(false);
});

test.describe("security properties", () => {
  test("the page's own paste listener never sees a blocked paste", async ({ openReplica }) => {
    const page = await openReplica("chatgpt-textarea");
    await paste(page, "textarea", SENSITIVE);
    const frame = await reviewFrame(page);
    await frame.getByRole("button", { name: "Paste sanitized" }).click();
    await expect.poll(() => composerText(page)).toContain("<IBAN_1>");
    const seen = await page.evaluate(() => window.__pasteSeen.join("\n"));
    expect(seen).not.toContain("131052-308T");
    expect(seen).not.toContain("FI21 1234");
  });

  test("synthetic paste events from the page do not open the dialog", async ({ openReplica }) => {
    const page = await openReplica("chatgpt-textarea");
    await page.evaluate((t) => {
      const data = new DataTransfer();
      data.setData("text/plain", t);
      document
        .querySelector("textarea")!
        .dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }));
    }, SENSITIVE);
    await page.waitForTimeout(500);
    expect(page.frames().some((f) => f.url().includes("review.html"))).toBe(false);
  });

  test("if the page removes the dialog, checks keep working", async ({ openReplica }) => {
    const page = await openReplica("chatgpt-textarea");
    await paste(page, "textarea", SENSITIVE);
    await reviewFrame(page);
    await page.evaluate(() => document.querySelector("[data-safeprompt]")!.remove());
    await page.waitForTimeout(800);
    await paste(page, "textarea", SENSITIVE);
    const frame = await reviewFrame(page);
    await expect(frame.locator(".summary")).toContainText("Found 2 items");
  });
});
