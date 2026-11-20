import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

type RegistryFile = { path: string; target?: string };

type RegistryItem = {
  name: string;
  dependencies?: string[];
  css?: object;
  files: RegistryFile[];
};

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
});
