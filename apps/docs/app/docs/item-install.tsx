import { installCommands } from "../../lib/install";
import { HighlightedCode, panelClassName, panelHeaderClassName } from "./code";
import { InstallTabs } from "./install-tabs";

/** A registry item's install command, one tab per package manager. */
export function ItemInstall({ item }: { item: string }) {
  return (
    <InstallTabs
      panelClassName={panelClassName}
      headerClassName={panelHeaderClassName}
      commands={installCommands(item).map((entry) => ({
        manager: entry.manager,
        command: entry.command,
        code: <HighlightedCode code={entry.command} lang="bash" />,
      }))}
    />
  );
}
