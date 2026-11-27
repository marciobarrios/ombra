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

/** The composition examples: each page renders its file live and lists its source. */
const compositions = [
  {
    path: "/docs/examples/minimal",
    title: "Minimal lightbox",
    file: "minimal-lightbox",
    next: "keyboard",
  },
  {
    path: "/docs/examples/full-gallery",
    title: "Full gallery",
    file: "full-gallery",
    next: "button",
  },
  { path: "/docs/examples/album", title: "Album", file: "album", next: "button" },
  {
    path: "/docs/examples/jsx-changes",
    title: "Changes in JSX",
    file: "jsx-changes",
    next: "button",
  },
  {
    path: "/docs/examples/controlled",
    title: "Controlled state",
    file: "controlled",
    next: "button",
    // The parent opens the viewer on the second photo from a button outside the lightbox.
    opener: "Open ridge",
  },
] as const satisfies readonly {
  path: string;
  title: string;
  file: string;
  next: "keyboard" | "button";
  opener?: string;
}[];

const guidePaths = [
  "/docs/anatomy",
  "/docs/recipes",
  ...compositions.map((example) => example.path),
];

/** Waits until React has hydrated the first trigger, so a click opens the viewer. */
async function waitForHydratedTrigger(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const trigger = document.querySelector("[data-slot=ombra-trigger]");

        return trigger ? Object.keys(trigger).some((key) => key.startsWith("__reactProps")) : false;
      }),
    )
    .toBe(true);
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

    for (const path of guidePaths) expect(body).toContain(`${origin}${path}.md`);
  });

  test("the docs index has a markdown version", async ({ page, request }) => {
    await page.goto("/docs");

    const list = page.getByRole("region", { name: "Registry items" });
    const guides = page.getByRole("region", { name: "Composition" });

    for (const path of guidePaths) {
      await expect(guides.locator(`a[href="${path}"]`)).toHaveCount(1);
    }

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

    for (const path of guidePaths) expect(body).toContain(`${origin}${path}`);
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

  test("the install tabs copy the selected package manager's command", async ({
    page,
    browserName,
  }) => {
    await page.goto("/docs/ombra");

    const install = page.getByRole("region", { name: "Installation" });
    const command = `bunx --bun shadcn add ${origin}/r/ombra.json`;

    // Base UI keeps the outgoing panel mounted while it exits, so name the panel.
    await expect(install.getByRole("tabpanel", { name: "pnpm" })).toHaveText(
      `pnpm dlx shadcn add ${origin}/r/ombra.json`,
    );
    await install.getByRole("tab", { name: "bun" }).click();
    await expect(install.getByRole("tab", { name: "bun" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(install.getByRole("tabpanel", { name: "bun" })).toHaveText(command);

    if (browserName !== "chromium") return;

    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await install.getByRole("button", { name: "Copy code" }).click();
    await expect(install.getByRole("button", { name: "Copied" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(command);
  });

  test("the props list shows each prop's type and default", async ({ page }) => {
    await page.goto("/docs/ombra");

    const morph = page
      .getByRole("region", { name: "Props" })
      .getByRole("listitem")
      .filter({
        has: page.getByText("morph", { exact: true }),
      });

    await expect(morph).toContainText('"flip" | "vt" | "fade"');
    await expect(morph).toContainText('Default"flip"');
  });

  test("the gallery docs page opens a lightbox", async ({ page }) => {
    const first = photos[0];

    if (!first) throw new Error("The docs demo needs a photo.");

    await page.goto("/docs/ombra");
    await waitForHydratedTrigger(page);

    await page.locator("[data-slot=ombra-trigger]").first().click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open", {
      timeout: 10_000,
    });
    await expect(page.getByRole("dialog", { name: first.alt })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveCount(0);
  });

  for (const example of compositions) {
    test(`the ${example.file} example opens, navigates and closes`, async ({ page }) => {
      const source = exampleSource(example.file);

      await page.goto(example.path);
      await expect(page.getByRole("heading", { level: 1, name: example.title })).toBeVisible();
      await expect(page.locator("pre").filter({ hasText: "export function" })).toHaveText(source);
      await waitForHydratedTrigger(page);

      if ("opener" in example) await page.getByRole("button", { name: example.opener }).click();
      else await page.locator("[data-slot=ombra-trigger]").first().click();

      const content = page.locator("[data-slot=ombra-content]");
      const slides = content.locator("[data-slot=ombra-slide]");

      await expect(content).toHaveAttribute("data-phase", "open", { timeout: 10_000 });
      // An outside opener names the second photo, so it starts one slide later.
      const start = "opener" in example ? 1 : 0;

      await expect(slides.nth(start)).toHaveAttribute("data-active", "true");

      if (example.next === "button") await page.getByRole("button", { name: "Next photo" }).click();
      else await page.keyboard.press("ArrowRight");

      await expect(slides.nth(start + 1)).toHaveAttribute("data-active", "true");
      await page.keyboard.press("Escape");
      await expect(content).toHaveCount(0);

      const markdown = await page.request.get(`${example.path}.md`);

      expect(markdown.ok()).toBe(true);
      expect(markdown.headers()["content-type"]).toContain("text/markdown");

      const body = await markdown.text();

      expect(body.startsWith(`# ${example.title}`)).toBe(true);
      expect(body).toContain(source);
    });
  }
});
