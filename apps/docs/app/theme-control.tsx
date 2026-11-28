"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useId, useSyncExternalStore } from "react";

import { THEME_STORAGE_KEY, parseThemeChoice } from "../lib/theme";
import type { ThemeChoice } from "../lib/theme";

const options = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
] as const;

const listeners = new Set<() => void>();

function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;

  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;

  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent) {
  if (event.key === THEME_STORAGE_KEY) applyTheme(parseThemeChoice(event.newValue));
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  if (listeners.size === 1) window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);

    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): ThemeChoice {
  return parseThemeChoice(document.documentElement.dataset.theme);
}

/** The server cannot know the stored choice, so nothing is checked until hydration. */
function getServerSnapshot(): ThemeChoice | null {
  return null;
}

function chooseTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the choice still applies.
  }

  applyTheme(choice);
}

/** System, Light and Dark, as one radio group. The choice persists in `localStorage`. */
export function ThemeControl({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const name = useId();

  return (
    <fieldset className={`inline-flex rounded-full border border-foreground/15 p-0.5 ${className}`}>
      <legend className="sr-only">Theme</legend>
      {options.map(({ value, label, Icon }) => (
        <label
          key={value}
          title={label}
          className="relative grid size-8 cursor-pointer place-items-center rounded-full text-foreground/60 transition-colors hover:text-foreground has-checked:bg-foreground/10 has-checked:text-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand"
        >
          <input
            type="radio"
            name={name}
            value={value}
            checked={theme === value}
            onChange={() => chooseTheme(value)}
            className="sr-only"
          />
          <Icon aria-hidden="true" className="size-4" />
          <span className="sr-only">{label}</span>
        </label>
      ))}
    </fieldset>
  );
}
