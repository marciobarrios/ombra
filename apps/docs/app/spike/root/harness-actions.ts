export type Section = "controlled" | "free";

/** Events from the galleries, and from tests driving the bench through `window.ombraHarness`. */
export type HarnessAction =
  /** `openOnly` controls `open` and leaves the active item uncontrolled. */
  | { type: "open-change-asked"; section: Section | "openOnly" | "vt"; open: boolean }
  | { type: "active-change-asked"; section: Section; itemId: string }
  | { type: "policy-changed"; allowOpen?: boolean; allowActive?: boolean; allowClose?: boolean }
  | { type: "parent-opened"; activeId?: string; section?: "openOnly" | "vt" }
  | { type: "parent-closed"; section?: "vt" }
  | { type: "parent-selected"; activeId: string; section?: "activeOnly" }
  | { type: "items-reversed"; section: Section }
  | { type: "item-removed"; section: Section; itemId: string }
  | { type: "items-cleared"; section: Section };

declare global {
  interface Window {
    ombraHarness?: { dispatch: (action: HarnessAction) => void };
  }
}
