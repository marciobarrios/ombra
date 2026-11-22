import { build } from "esbuild";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { CORE_GZIP_LIMIT_BYTES } from "./limits.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const registryDir = path.join(root, "registry/ombra");

/**
 * The two recipes are the public entry of the `ombra` item. Bundling them pulls in the
 * viewer, the morph, pull, and zoom. Packages stay external, so React, Base UI, and `cn`
 * are not part of the number.
 */
const ENTRY = `import { OmbraGallery } from "./ombra-gallery.tsx";
import { OmbraAlbum } from "./ombra-album.tsx";
export { OmbraGallery, OmbraAlbum };
`;

export type CoreMeasurement = {
  gzipBytes: number;
  minifiedBytes: number;
  limitBytes: number;
  banned: readonly string[];
};

/** Specifiers that would put an animation library in the core. */
export function isBannedSpecifier(specifier: string): boolean {
  if (specifier === "motion" || specifier.startsWith("motion/")) return true;

  if (specifier === "framer-motion" || specifier.startsWith("framer-motion/")) return true;

  if (specifier === "gsap" || specifier.startsWith("gsap/")) return true;

  if (specifier === "animejs" || specifier.startsWith("animejs/")) return true;

  if (specifier === "popmotion" || specifier.startsWith("popmotion/")) return true;

  return specifier.startsWith("@react-spring/");
}

const IMPORT_SPECIFIER = /(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g;

function specifiersIn(source: string): string[] {
  const found: string[] = [];

  for (const match of source.matchAll(IMPORT_SPECIFIER)) {
    const specifier = match[1];

    if (specifier) found.push(specifier);
  }

  return found;
}

function bannedInRegistry(): string[] {
  const banned: string[] = [];
  const files = readdirSync(registryDir);

  for (const file of files) {
    if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;

    for (const specifier of specifiersIn(readFileSync(path.join(registryDir, file), "utf8"))) {
      if (isBannedSpecifier(specifier)) banned.push(specifier);
    }
  }

  for (const specifier of dependencySpecifiers(
    readFileSync(path.join(root, "registry.json"), "utf8"),
  )) {
    if (isBannedSpecifier(specifier)) banned.push(specifier);
  }

  return [...new Set(banned)];
}

/** String entries of every `"dependencies"` array. Registry dependencies are package names, not objects. */
function dependencySpecifiers(source: string): string[] {
  const found: string[] = [];

  for (const match of source.matchAll(/"dependencies"\s*:\s*\[([\s\S]*?)\]/g)) {
    const body = match[1] ?? "";

    for (const item of body.matchAll(/"([^"]+)"/g)) {
      const specifier = item[1];

      if (specifier) found.push(specifier);
    }
  }

  return found;
}

export async function measureCore(): Promise<CoreMeasurement> {
  const result = await build({
    stdin: {
      contents: ENTRY,
      resolveDir: registryDir,
      sourcefile: "core-entry.ts",
      loader: "ts",
    },
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    packages: "external",
    write: false,
    jsx: "automatic",
    legalComments: "none",
    metafile: true,
  });

  const output = result.outputFiles?.[0];

  if (!output || !result.metafile) throw new Error("esbuild produced no core bundle");

  const inputs = Object.keys(result.metafile.inputs);

  if (!inputs.some((file) => file.endsWith("use-zoom.ts"))) {
    throw new Error("The core bundle did not include zoom, so the size would under-count.");
  }

  if (!inputs.some((file) => file.endsWith("ombra-viewer.tsx"))) {
    throw new Error("The core bundle did not include the viewer, so the size would under-count.");
  }

  const banned = bannedInRegistry();

  for (const file of Object.values(result.metafile.outputs)) {
    for (const imported of file.imports) {
      if (imported.external && isBannedSpecifier(imported.path)) banned.push(imported.path);
    }
  }

  return {
    gzipBytes: gzipSync(output.contents, { level: 9 }).length,
    minifiedBytes: output.contents.length,
    limitBytes: CORE_GZIP_LIMIT_BYTES,
    banned: [...new Set(banned)],
  };
}

export function assertWithinBudget(measurement: CoreMeasurement): void {
  if (measurement.banned.length > 0) {
    throw new Error(
      `The core imports an animation library (${measurement.banned.join(", ")}). The core stays on WAAPI and CSS.`,
    );
  }

  if (measurement.gzipBytes > measurement.limitBytes) {
    throw new Error(
      `Core JavaScript is ${formatBytes(measurement.gzipBytes)} bytes gzipped, over the ${formatBytes(measurement.limitBytes)} byte (${formatKb(measurement.limitBytes)}) budget.`,
    );
  }
}

export function formatReport(measurement: CoreMeasurement): string {
  const status = measurement.gzipBytes > measurement.limitBytes ? "over budget" : "within budget";

  return [
    "Ombra core JavaScript",
    "  entry     OmbraGallery + OmbraAlbum",
    "  minify    esbuild, packages external (react, react-dom, @base-ui/react, cn)",
    `  minified  ${formatBytes(measurement.minifiedBytes)} bytes`,
    `  gzip      ${formatBytes(measurement.gzipBytes)} bytes (level 9)`,
    `  limit     ${formatBytes(measurement.limitBytes)} bytes (${formatKb(measurement.limitBytes)})`,
    `  libraries ${measurement.banned.length === 0 ? "none" : measurement.banned.join(", ")}`,
    `  status    ${status}`,
  ].join("\n");
}

function formatBytes(bytes: number): string {
  return bytes.toLocaleString("en-US");
}

function formatKb(bytes: number): string {
  return `${bytes / 1024} KB`;
}

const ranDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (ranDirectly) {
  const measurement = await measureCore();

  console.log(formatReport(measurement));

  try {
    assertWithinBudget(measurement);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
