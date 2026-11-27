import registry from "../../../registry.json";

import { DOCS_ORIGIN } from "./origin";

/** The registry entries and the install commands every docs page shows for them. */
export type RegistryItem = (typeof registry.items)[number];

export type ItemName = RegistryItem["name"];

export type InstallCommand = { manager: "pnpm" | "npm" | "yarn" | "bun"; command: string };

export function registryItems(): readonly RegistryItem[] {
  return registry.items;
}

export function registryItem(name: string): RegistryItem | undefined {
  return registry.items.find((item) => item.name === name);
}

function itemUrl(name: string): string {
  return `${DOCS_ORIGIN}/r/${name}.json`;
}

/** The command the prompt and the Markdown use. */
export function installCommand(name: string): string {
  return `npx shadcn add ${itemUrl(name)}`;
}

export function installCommands(name: string): readonly InstallCommand[] {
  const url = itemUrl(name);

  return [
    { manager: "pnpm", command: `pnpm dlx shadcn add ${url}` },
    { manager: "npm", command: installCommand(name) },
    { manager: "yarn", command: `yarn dlx shadcn add ${url}` },
    { manager: "bun", command: `bunx --bun shadcn add ${url}` },
  ];
}

/** What `shadcn add` writes for an item: its files, the packages it installs, and its CSS. */
export type ItemContents = {
  /** The directory every file lands in, such as `components/ombra`. */
  directory: string;
  files: readonly string[];
  dependencies: readonly string[];
  registryDependencies: readonly string[];
  css: boolean;
};

export function itemContents(item: RegistryItem): ItemContents {
  const targets = item.files.map((file) => file.target);
  const directory = targets[0]?.slice(0, targets[0].lastIndexOf("/")) ?? "";

  return {
    directory,
    files: targets.map((target) => target.slice(directory.length + 1)),
    dependencies: ("dependencies" in item ? item.dependencies : undefined) ?? [],
    registryDependencies:
      ("registryDependencies" in item ? item.registryDependencies : undefined) ?? [],
    css: "css" in item,
  };
}
