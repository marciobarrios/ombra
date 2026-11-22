"use client";

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

export function CopyPrompt({ prompt }: { prompt: string }) {
  const [state, dispatch] = useReducer(copyReducer, { status: "idle" });

  const label =
    state.status === "copied"
      ? "Copied"
      : state.status === "failed"
        ? "Copy failed"
        : "Copy prompt";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          className="inline-flex min-h-11 items-center rounded-full bg-foreground px-5 text-sm text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          onClick={() => {
            void navigator.clipboard.writeText(prompt).then(
              () => {
                dispatch({ type: "copy-succeeded" });
                window.setTimeout(() => dispatch({ type: "copy-reset" }), 2000);
              },
              () => dispatch({ type: "copy-failed" }),
            );
          }}
        >
          {label}
        </button>
        <span className="sr-only" aria-live="polite">
          {state.status === "copied" ? "Prompt copied." : ""}
        </span>
      </div>
      <pre
        data-agent-prompt=""
        className="overflow-x-auto rounded-lg bg-foreground/5 p-4 font-mono text-sm leading-6 whitespace-pre-wrap break-words"
      >
        {prompt}
      </pre>
    </div>
  );
}
