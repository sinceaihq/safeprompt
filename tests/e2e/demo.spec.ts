import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { expect, test } from "./harness";

const WEB = join(import.meta.dirname, "../../dist/web");
const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
};

test("web demo: examples, findings and copy, no third-party requests", async ({ context }) => {
  const page = await context.newPage();
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.route("https://demo.test/**", (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/$/, "/index.html");
    return route.fulfill({ body: readFileSync(join(WEB, path)), contentType: TYPES[extname(path)] });
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("https://demo.test/");
  await expect(page.locator(".summary")).toContainText("Found 4 items"); // Finnish example
  await page.getByRole("button", { name: "Debugging (developer)" }).click();
  await expect(page.locator(".group-head")).toContainText(["Password, key or token (2)", "IP address (1)"]);
  await page.getByRole("button", { name: "Business numbers (nothing to hide)" }).click();
  await expect(page.locator(".summary")).toContainText("Nothing sensitive found");
  await page.getByLabel("Text to check").fill("Mail anna@example.com");
  await page.getByRole("button", { name: "Copy sanitized" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Mail <EMAIL_1>");
  expect(errors).toEqual([]);
  expect(requests.every((u) => u.startsWith("https://demo.test/"))).toBe(true);
});
