import { defineConfig, devices } from "@playwright/test";

const port = 3000;

// Specs that test plain functions and files. They need no browser, so they run once.
const unitSpecs =
  /(gallery-layout|gallery-state|gesture-arbitration|load-window|media-status|registry-items|scroll-range|spring|wheel-momentum|zoom-limit)\.spec\.ts$/;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // The suite is expected to pass on the first attempt. A retry would hide a flake.
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm --filter docs start",
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: "unit", testMatch: unitSpecs },
    { name: "chromium", testIgnore: unitSpecs, use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", testIgnore: unitSpecs, use: { ...devices["Desktop Safari"] } },
    { name: "chromium-mobile", testIgnore: unitSpecs, use: { ...devices["Pixel 7"] } },
    { name: "webkit-mobile", testIgnore: unitSpecs, use: { ...devices["iPhone 13"] } },
    // The frame sample runs after every other project, so no test competes with it for the CPU.
    {
      name: "frame-budget",
      testMatch: /frame-budget\.spec\.ts$/,
      grep: /Chromium flags a long frame/,
      dependencies: ["unit", "chromium", "webkit", "chromium-mobile", "webkit-mobile"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
