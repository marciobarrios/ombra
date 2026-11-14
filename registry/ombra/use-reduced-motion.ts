"use client";

import { useSyncExternalStore } from "react";

let query: MediaQueryList | null = null;

// Created on first use, since the module also loads on the server. React reads the snapshot on
// every render, so one list is shared instead of parsing the query each time.
function reducedMotionQuery(): MediaQueryList {
  query ??= window.matchMedia("(prefers-reduced-motion: reduce)");

  return query;
}

function subscribe(onChange: () => void): () => void {
  const list = reducedMotionQuery();

  list.addEventListener("change", onChange);

  return () => {
    list.removeEventListener("change", onChange);
  };
}

function getSnapshot(): boolean {
  return reducedMotionQuery().matches;
}

// The server cannot know the setting. Hydration starts from `false` and then reads the query.
function getServerSnapshot(): boolean {
  return false;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
