"use client";

import { useCallback, useReducer, useRef } from "react";

/**
 * `useReducer` that drops an action which would leave the state unchanged before React schedules
 * a render. React only bails out of a reducer update after it has run the component again, so
 * without this every scroll, resize or pointer event that repeats a value would re-run the
 * component. The reducer must return the same object when nothing changes.
 */
export function useReducerWithBailout<S, A>(
  reducer: (state: S, action: A) => S,
  initial: S,
): [S, (action: A) => void] {
  const [state, dispatch] = useReducer(reducer, initial);
  // Every action passes through `send`, so this is the state after all queued actions.
  const latest = useRef(state);

  const send = useCallback(
    (action: A) => {
      const next = reducer(latest.current, action);

      if (next === latest.current) return;

      latest.current = next;
      dispatch(action);
    },
    [reducer],
  );

  return [state, send];
}
