import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

import { listApiParts } from "../apps/docs/lib/item-surface.ts";

type RegistryFile = { path: string; target?: string };

type RegistryItem = {
  name: string;
  title?: string;
  description?: string;
  docs?: string;
  dependencies?: string[];
  css?: object;
  files: RegistryFile[];
};

const constraints = [
  "The trigger image needs a laid-out size and object-fit so the morph has a box.",
  "Do not clip the trigger or put it inside a transformed ancestor.",
  "flip is the default engine, and reduced motion forces fade.",
  "Dependencies are React, @base-ui/react, and cn. Do not add an animation library.",
];

const root = join(import.meta.dirname, "..");

// SAFETY: registry.json is validated against shadcn's schema by `pnpm registry:validate` in CI;
// these fields are a subset of that schema.
const registry = JSON.parse(readFileSync(join(root, "registry.json"), "utf8")) as {
  items: RegistryItem[];
};

const core = registry.items.find((item) => item.name === "ombra");

// shadcn places files by type (components/, lib/, hooks/) unless they have a target, and the
// registry files import each other relatively. These checks keep `shadcn add` compiling.
test.describe("registry items", () => {
  test("every file installs into one folder", () => {
    for (const item of registry.items) {
      for (const file of item.files) {
        expect(file.target, `${item.name}: ${file.path}`).toBe(
          `components/ombra/${basename(file.path)}`,
        );
      }
    }
  });

  test("every relative import is in the same item", () => {
    for (const item of registry.items) {
      const shipped = new Set(item.files.map((file) => file.path));

      for (const file of item.files) {
        const source = readFileSync(join(root, file.path), "utf8");

        for (const [, specifier] of source.matchAll(/from "(\.[^"]+)"/g)) {
          const resolved = join(dirname(file.path), specifier!);
          const found = [".ts", ".tsx"].some((ext) => shipped.has(resolved + ext));
          expect(found, `${item.name}: ${file.path} imports ${specifier}`).toBe(true);
        }
      }
    }
  });

  test("npm dependencies stay Base UI and cn", () => {
    for (const item of registry.items) {
      for (const dependency of item.dependencies ?? []) {
        expect(["@base-ui/react", "cn"]).toContain(dependency);
      }
    }
  });

  test("every item has a title, description and docs", () => {
    for (const item of registry.items) {
      expect(item.title, item.name).toBeTruthy();
      expect(item.description, item.name).toBeTruthy();
      expect(item.docs, item.name).toBeTruthy();

      for (const sentence of constraints) {
        expect(item.docs, `${item.name}: ${sentence}`).toContain(sentence);
      }
    }
  });

  test("the core item ships the docs app's pull styles", () => {
    const globals = readFileSync(join(root, "apps/docs/app/globals.css"), "utf8").replace(
      /\s+/g,
      " ",
    );

    // Every "property": "value" pair at any depth of the css object is one declaration.
    const declarations = [
      ...JSON.stringify(core?.css ?? {}).matchAll(/"([^"]+)":("(?:[^"\\]|\\.)*")/g),
    ].map(([, property, value]) => `${property}: ${JSON.parse(value!)};`);

    expect(declarations.length).toBeGreaterThan(0);

    for (const declaration of declarations) {
      expect(globals, declaration).toContain(declaration);
    }
  });

  // `pnpm typecheck` checks the tables against the types; these names are plain strings.
  test("the API reference names what the registry source exports and sets", () => {
    const sources = registry.items
      .flatMap((item) => item.files.map((file) => readFileSync(join(root, file.path), "utf8")))
      .join("\n");

    for (const part of listApiParts()) {
      const item = registry.items.find((entry) => entry.name === part.item);
      const path = `registry/ombra/${part.file}`;

      expect(
        item?.files.map((file) => file.path),
        part.name,
      ).toContain(path);
      expect(readFileSync(join(root, path), "utf8"), part.name).toMatch(
        new RegExp(`export function ${part.name}\\b`),
      );

      if (part.slot) expect(sources, `${part.name}: ${part.slot}`).toContain(`"${part.slot}"`);

      for (const hook of [...(part.dataAttributes ?? []), ...(part.cssVariables ?? [])]) {
        expect(sources, `${part.name}: ${hook.name}`).toContain(hook.name);
      }

      // `pnpm typecheck` only checks that a default fits the type, so find the value itself.
      for (const table of part.tables) {
        for (const entry of table.entries) {
          if (entry.default === undefined) continue;

          expect(sources, `${part.name}: ${entry.name} = ${entry.default}`).toContain(
            `${entry.name} = ${entry.default},`,
          );
        }
      }
    }
  });
});
