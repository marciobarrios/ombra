import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { photos } from "../apps/docs/app/spike/photos";

const root = join(import.meta.dirname, "..");
const origin = "https://www.useombra.dev";

const afterInstall =
  "After installing, read the files under the installed `ombra` directory before writing code.";

// SAFETY: registry.json is validated against shadcn's schema by `pnpm registry:validate` in CI;
// these fields are a subset of that schema.
const registry = JSON.parse(readFileSync(join(root, "registry.json"), "utf8")) as {
  items: { name: string; title: string; description: string; docs: string }[];
};

const goals = {
  ombra: "Add an Ombra lightbox to my React app.",
  "ombra-morph": "Use Ombra's morph helpers in my React app.",
  "ombra-zoom": "Add Ombra pinch and double-tap zoom to my React app.",
} as const;

function exampleSource(name: string): string {
  return readFileSync(join(root, "apps/docs/examples", `${name}.tsx`), "utf8").trim();
}

function goalFor(name: string): string {
  switch (name) {
    case "ombra":
    case "ombra-morph":
    case "ombra-zoom":
      return goals[name];
    default:
      throw new Error(`No prompt goal for ${name}`);
  }
}

async function promptText(page: Page): Promise<string> {
  return page.locator("[data-agent-prompt]").evaluate((node) => node.textContent ?? "");
}

test.describe("agent docs", () => {
  test("the home page links to the docs", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Read the docs" })).toHaveAttribute(
      "href",
      "/docs",
    );
  });

  test("llms.txt lists every docs page", async ({ request }) => {
    const response = await request.get("/llms.txt");

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/plain");

    const body = await response.text();

    expect(body).toContain(`${origin}/docs.md`);
    expect(body).toContain(afterInstall);

    for (const item of registry.items) {
      expect(body).toContain(`${origin}/docs/${item.name}.md`);
      expect(body).toContain(item.description);
      expect(body).toContain(item.docs);
    }
  });

  test("the docs index has a markdown version", async ({ page, request }) => {
    await page.goto("/docs");

    const list = page.getByRole("list");

    for (const item of registry.items) {
      await expect(list.getByRole("link", { name: item.title, exact: true })).toHaveAttribute(
        "href",
        `/docs/${item.name}`,
      );
    }

    const response = await request.get("/docs.md");

    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("text/markdown");

    const body = await response.text();

    expect(body.startsWith("# Ombra docs")).toBe(true);
    expect(body).not.toContain("<button");
    expect(body).not.toContain("<nav");

    for (const item of registry.items) {
      expect(body).toContain(item.title);
      expect(body).toContain(item.description);
    }
  });

  for (const item of registry.items) {
    test(`${item.name} copies a prompt generated from the registry and the example`, async ({
      page,
      browserName,
    }) => {
      const example = exampleSource(item.name);

      await page.goto(`/docs/${item.name}`);
      await expect(page.getByRole("heading", { level: 1, name: item.title })).toBeVisible();

      const prompt = await promptText(page);

      expect(prompt).toContain(goalFor(item.name));
      expect(prompt).toContain(`npx shadcn add ${origin}/r/${item.name}.json`);
      expect(prompt).toContain(afterInstall);
      expect(prompt).toContain(example);
      expect(prompt).toContain(item.docs);
      expect(prompt).toContain(`Docs: ${origin}/docs/${item.name}`);
      expect(prompt).toContain("Props:");

      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );

      expect(overflows).toBe(false);

      const markdown = await page.request.get(`/docs/${item.name}.md`);

      expect(markdown.ok()).toBe(true);
      expect(markdown.headers()["content-type"]).toContain("text/markdown");

      const body = await markdown.text();

      expect(body.startsWith(`# ${item.title}`)).toBe(true);
      expect(body).toContain(item.description);
      expect(body).toContain(example);
      expect(body).toContain(item.docs);
      expect(body).toContain(prompt);
      expect(body).not.toContain("Copy prompt");

      if (browserName !== "chromium") return;

      await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.getByRole("button", { name: "Copy prompt" }).click();
      await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();

      const copied = await page.evaluate(() => navigator.clipboard.readText());

      expect(copied).toBe(prompt);
    });
  }

  test("the gallery docs page opens a lightbox", async ({ page }) => {
    const first = photos[0];

    if (!first) throw new Error("The docs demo needs a photo.");

    await page.goto("/docs/ombra");
    await expect
      .poll(() =>
        page.evaluate(() => {
          const trigger = document.querySelector("[data-slot=ombra-trigger]");

          return trigger
            ? Object.keys(trigger).some((key) => key.startsWith("__reactProps"))
            : false;
        }),
      )
      .toBe(true);

    await page.locator("[data-slot=ombra-trigger]").first().click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open", {
      timeout: 10_000,
    });
    await expect(page.getByRole("dialog", { name: first.alt })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveCount(0);
  });
});
