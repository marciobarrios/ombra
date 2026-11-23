"use client";

import { Check, Copy } from "lucide-react";
import { useReducer } from "react";

type CopyState = { status: "idle" | "copied" | "failed" };

type CopyAction = { type: "copy-succeeded" } | { type: "copy-failed" } | { type: "copy-reset" };

function copyReducer(_state: CopyState, action: CopyAction): CopyState {
  switch (action.type) {
    case "copy-succeeded":
      return { status: "copied" };
    case "copy-failed":
      return { status: "failed" };
    case "copy-reset":
      return { status: "idle" };
  }
}

const variants = {
  prompt: {
    idle: "Copy prompt",
    className:
      "min-h-9 gap-2 rounded-full bg-foreground px-4 text-sm text-background hover:bg-foreground/85",
    announcement: "Prompt copied.",
  },
  code: {
    idle: "Copy",
    className:
      "min-h-7 gap-1.5 rounded-md px-2 text-xs text-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground",
    announcement: "Code copied.",
  },
} as const;

/**
 * Copies `text` to the clipboard. The code variant reads "Copy" on screen and "Copy code" to
 * assistive technology, so several blocks on one page keep distinct names from the prompt button.
 */
export function CopyButton({ text, variant }: { text: string; variant: "prompt" | "code" }) {
  const [state, dispatch] = useReducer(copyReducer, { status: "idle" });
  const copy = variants[variant];
  const Icon = state.status === "copied" ? Check : Copy;

  return (
    <>
      <button
        type="button"
        className={`inline-flex shrink-0 items-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${copy.className}`}
        onClick={() => {
          void navigator.clipboard.writeText(text).then(
            () => {
              dispatch({ type: "copy-succeeded" });
              window.setTimeout(() => dispatch({ type: "copy-reset" }), 2000);
            },
            () => dispatch({ type: "copy-failed" }),
          );
        }}
      >
        <Icon aria-hidden="true" className="size-3.5" />
        {state.status === "copied" ? (
          "Copied"
        ) : state.status === "failed" ? (
          "Copy failed"
        ) : variant === "code" ? (
          <>
            {copy.idle}
            <span className="sr-only"> code</span>
          </>
        ) : (
          copy.idle
        )}
      </button>
      <span className="sr-only" aria-live="polite">
        {state.status === "copied" ? copy.announcement : ""}
      </span>
    </>
  );
}
