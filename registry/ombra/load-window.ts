// Which full-size photos the viewer loads ahead of a swipe. The active photo always loads,
// first; its neighbours follow once it has, unless the connection asks to save data.

/** What the browser says about the connection. Chromium only; other browsers report nothing. */
export type ConnectionHint = {
  saveData?: boolean;
  effectiveType?: string;
};

/** How many photos on each side of the active one load ahead: 1, or 0 on a slow or saving connection. */
export function loadReach(hint: ConnectionHint | null | undefined): number {
  if (!hint) return 1;

  if (hint.saveData) return 0;

  if (hint.effectiveType === "slow-2g" || hint.effectiveType === "2g") return 0;

  return 1;
}

/**
 * The items to load, in order: the active one, then the next, then the previous, each only
 * while it exists. An active index outside the list loads nothing.
 */
export function loadOrder<T>(items: readonly T[], active: number, reach: number): T[] {
  const current = items[active];

  if (current === undefined) return [];

  const order = [current];

  for (let step = 1; step <= reach; step += 1) {
    const next = items[active + step];
    const previous = active - step >= 0 ? items[active - step] : undefined;

    if (next !== undefined) order.push(next);

    if (previous !== undefined) order.push(previous);
  }

  return order;
}

/** The connection hint of this browser, read when a load starts so a change is picked up. */
export function connectionHint(): ConnectionHint | null {
  if (typeof navigator === "undefined") return null;

  // SAFETY: `connection` is the Network Information API, missing outside Chromium; the
  // optional field covers that, and only the two fields read here are typed.
  const connection = (navigator as Navigator & { connection?: ConnectionHint }).connection;

  return connection ?? null;
}
