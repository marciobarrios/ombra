/**
 * The docs site's theme choice (MAR-106). "system" leaves `data-theme` off `<html>`, so the
 * CSS follows `prefers-color-scheme`; "light" and "dark" set it. The choice lives in
 * `localStorage` and the inline script below applies it before first paint.
 */
export type ThemeChoice = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "ombra-theme";

export function parseThemeChoice(value: string | null | undefined): ThemeChoice {
  return value === "light" || value === "dark" ? value : "system";
}

/** Runs in `<head>` before the body paints. Storage can throw in private modes. */
export const themeScript = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
