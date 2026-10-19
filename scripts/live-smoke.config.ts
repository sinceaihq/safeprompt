import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["live-smoke.spec.ts", "zz-*.spec.ts"],
  timeout: 90_000,
  workers: 1,
  reporter: "list",
});
