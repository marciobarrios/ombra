/**
 * Runs each registry item's install snippet in a fresh consumer project, then typechecks the
 * installed files and the item's docs example with TypeScript 5, 6 and 7.
 *
 * The snippet is `shadcn add <origin>/r/<item>.json`. Here the origin is a local server for a
 * fresh `shadcn build`, and the consumer mirrors create-vite's React template: no `@types/node`,
 * since registry code must compile without it. shadcn fetches the `utils` dependency from its own
 * registry and installs packages with npm, so this needs the network.
 */
import { spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const shadcn = path.join(root, "node_modules/.bin/shadcn");
const examples = path.join(root, "apps/docs/examples");

/** The compilers a consumer may have: create-vite ships 7, and older projects are on 5 or 6. */
const compilers = { ts5: "5.9.3", ts6: "6.0.3", ts7: "7.0.2" } as const;

/** Extra docs examples to typecheck per item, besides `examples/<item>.tsx`. */
const extraExamples = new Map([
  // The quick start's lightbox, built from the parts.
  ["ombra", ["minimal-lightbox.tsx", "photos.ts"]],
]);

type RegistryItem = { name: string; files: { path: string; target: string }[] };

/** What the consumer's config files hold. */
type JsonValue = string | number | boolean | readonly JsonValue[] | { [key: string]: JsonValue };

// SAFETY: registry.json is validated against shadcn's schema by `pnpm registry:validate` in CI;
// these fields are a subset of that schema.
const registry = JSON.parse(readFileSync(path.join(root, "registry.json"), "utf8")) as {
  items: RegistryItem[];
};

function run(command: string, args: readonly string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, CI: "1" } });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}\n${output}`));
    });
  });
}

function writeConsumer(dir: string): void {
  const json = (file: string, value: JsonValue) =>
    writeFileSync(path.join(dir, file), `${JSON.stringify(value, null, 2)}\n`);

  json("package.json", {
    name: "ombra-consumer",
    private: true,
    type: "module",
    dependencies: { react: "19.3.1", "react-dom": "19.3.1" },
    devDependencies: {
      "@types/react": "19.3.3",
      "@types/react-dom": "19.3.0",
      tailwindcss: "4.3.5",
      ...Object.fromEntries(
        Object.entries(compilers).map(([alias, version]) => [alias, `npm:typescript@${version}`]),
      ),
    },
  });
  json("components.json", {
    $schema: "https://ui.shadcn.com/schema.json",
    style: "base-nova",
    rsc: false,
    tsx: true,
    tailwind: {
      config: "",
      css: "src/index.css",
      baseColor: "neutral",
      cssVariables: true,
      prefix: "",
    },
    iconLibrary: "lucide",
    aliases: {
      components: "@/components",
      utils: "@/lib/utils",
      ui: "@/components/ui",
      lib: "@/lib",
      hooks: "@/hooks",
    },
  });
  // create-vite's tsconfig.app.json for React, with `types` emptied (no Vite installed here),
  // `strict` on, and the `@/` alias shadcn's setup adds. `DOM.Iterable` is listed as the
  // template did while it shipped TypeScript 5; from 6 on, `DOM` includes it.
  json("tsconfig.json", {
    compilerOptions: {
      target: "es2023",
      lib: ["ES2023", "DOM", "DOM.Iterable"],
      module: "esnext",
      types: [],
      skipLibCheck: true,
      moduleResolution: "bundler",
      allowImportingTsExtensions: true,
      verbatimModuleSyntax: true,
      moduleDetection: "force",
      noEmit: true,
      jsx: "react-jsx",
      strict: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      erasableSyntaxOnly: true,
      noFallthroughCasesInSwitch: true,
      paths: { "@/*": ["./src/*"] },
    },
    include: ["src"],
  });
  mkdirSync(path.join(dir, "src"));
  writeFileSync(path.join(dir, "src/index.css"), '@import "tailwindcss";\n');
}

async function checkItem(item: RegistryItem, origin: string): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), `${item.name}-consumer-`));

  try {
    writeConsumer(dir);
    await run("npm", ["install", "--no-audit", "--no-fund"], dir);
    await run(shadcn, ["add", `${origin}/r/${item.name}.json`, "--yes"], dir);

    for (const file of item.files) {
      const installed = path.join(dir, "src", file.target);

      if (!existsSync(installed)) throw new Error(`${file.target} was not installed`);
    }

    const usage = path.join(dir, "src/usage");
    mkdirSync(usage);

    for (const file of [`${item.name}.tsx`, ...(extraExamples.get(item.name) ?? [])]) {
      cpSync(path.join(examples, file), path.join(usage, file));
    }

    for (const alias of Object.keys(compilers)) {
      await run("node", [path.join(dir, "node_modules", alias, "bin/tsc"), "-p", "."], dir);
    }

    rmSync(dir, { recursive: true, force: true });
    console.log(
      `✔ ${item.name}: installs and typechecks with TypeScript ${Object.values(compilers).join(", ")}`,
    );
  } catch (error) {
    throw new Error(`${item.name} (consumer kept at ${dir})`, { cause: error });
  }
}

const out = mkdtempSync(path.join(tmpdir(), "ombra-registry-"));

await run(shadcn, ["build", "registry.json", "-o", path.join(out, "r")], root);

const server = createServer((request, response) => {
  const file = path.join(out, path.normalize(new URL(request.url ?? "/", "http://x").pathname));

  if (!file.startsWith(out) || !existsSync(file)) {
    response.writeHead(404).end();

    return;
  }

  response.writeHead(200, { "content-type": "application/json" }).end(readFileSync(file));
});

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

// SAFETY: a server listening on a TCP port reports an AddressInfo, not a pipe name.
const { port } = server.address() as AddressInfo;

try {
  for (const item of registry.items) await checkItem(item, `http://127.0.0.1:${port}`);
} finally {
  server.close();
  rmSync(out, { recursive: true, force: true });
}
