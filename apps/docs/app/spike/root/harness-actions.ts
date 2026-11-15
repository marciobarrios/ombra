export type Section = "controlled" | "free";

/** Events from the galleries, and from tests driving the bench through `window.ombraHarness`. */
export type HarnessAction =
  | { type: "open-change-asked"; section: Section; open: boolean }
  | { type: "active-change-asked"; section: Section; itemId: string }
  | { type: "policy-changed"; allowOpen?: boolean; allowActive?: boolean; allowClose?: boolean }
  | { type: "parent-opened"; activeId?: string }
  | { type: "parent-closed" }
  | { type: "parent-selected"; activeId: string }
  | { type: "items-reversed"; section: Section }
  | { type: "item-removed"; section: Section; itemId: string }
  | { type: "items-cleared"; section: Section };

declare global {
  interface Window {
    ombraHarness?: { dispatch: (action: HarnessAction) => void };
  }
}
