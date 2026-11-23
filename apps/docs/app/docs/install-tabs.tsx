"use client";

import { Tabs } from "@base-ui/react/tabs";
import { useReducer } from "react";
import type { ReactNode } from "react";

import { CopyButton } from "./copy-button";

export type InstallCommand = {
  manager: string;
  command: string;
  /** The command, already highlighted on the server. */
  code: ReactNode;
};

type TabsState = { manager: string };

type TabsAction = { type: "manager-selected"; manager: string };

function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case "manager-selected":
      return state.manager === action.manager ? state : { manager: action.manager };
  }
}

/** One install command per package manager, with the copy button for the selected one. */
export function InstallTabs({
  commands,
  panelClassName,
  headerClassName,
}: {
  commands: readonly InstallCommand[];
  panelClassName: string;
  headerClassName: string;
}) {
  const [state, dispatch] = useReducer(tabsReducer, { manager: commands[0]?.manager ?? "" });
  const selected = commands.find((entry) => entry.manager === state.manager) ?? commands[0];

  return (
    <Tabs.Root
      value={state.manager}
      onValueChange={(value) => {
        const entry = commands.find((command) => command.manager === value);

        if (entry) dispatch({ type: "manager-selected", manager: entry.manager });
      }}
      className={panelClassName}
    >
      <div className={headerClassName}>
        <Tabs.List aria-label="Package manager" className="relative flex h-11 items-stretch gap-1">
          {commands.map((entry) => (
            <Tabs.Tab
              key={entry.manager}
              value={entry.manager}
              className="px-2 font-mono text-xs text-foreground/70 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand data-active:text-foreground"
            >
              {entry.manager}
            </Tabs.Tab>
          ))}
          <Tabs.Indicator className="absolute bottom-[-1px] left-(--active-tab-left) h-px w-(--active-tab-width) bg-foreground transition-[left,width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none" />
        </Tabs.List>
        {selected ? <CopyButton text={selected.command} variant="code" /> : null}
      </div>
      {commands.map((entry) => (
        <Tabs.Panel
          key={entry.manager}
          value={entry.manager}
          className="code-tokens overflow-x-auto px-4 py-3.5 font-mono text-[13px] leading-6 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
        >
          <pre>
            <code>{entry.code}</code>
          </pre>
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}
