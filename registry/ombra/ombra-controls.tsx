"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import { useCallback, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import { activeIndex } from "./gallery-state";
import { useOmbraRoot } from "./ombra-root";
import type { OmbraRootContextValue } from "./ombra-root";
import { clampScrollLeft } from "./scroll-range";
import { useReducedMotion } from "./use-reduced-motion";
import { useReducerWithBailout } from "./use-reducer-with-bailout";

export type OmbraActionProps = useRender.ComponentProps<"button">;

/** Where the viewer is navigating: the active item, and its position in the collection. */
export type OmbraNavigationState = {
  activeId: string | null;
  /** Zero-based position of the active item, or -1 when there is none. */
  index: number;
  count: number;
};

export type OmbraCounterState = OmbraNavigationState & {
  /** One-based position of the active item, or 0 when there is none. */
  position: number;
};

export type OmbraCounterProps = Omit<
  useRender.ComponentProps<"span", OmbraCounterState>,
  "children"
> & {
  /**
   * Formats the text from the position and count. Without it, the counter shows
   * `position / count` in digits.
   */
  children?: (state: OmbraCounterState) => ReactNode;
};

export type OmbraThumbnailsState = { overflowing: boolean };

export type OmbraThumbnailsProps = useRender.ComponentProps<"nav", OmbraThumbnailsState>;

export type OmbraThumbnailState = { active: boolean };

export type OmbraThumbnailProps = useRender.ComponentProps<"button", OmbraThumbnailState> & {
  /** The item this thumbnail goes to. It matches the slide's and the trigger's `itemId`. */
  itemId: string;
};

type ActionOptions<State extends Record<string, unknown>> = {
  slot: string;
  disabled: boolean;
  onPress: () => void;
  /** Default classes, before the caller's. */
  classes?: string;
  state?: State;
  stateAttributes?: useRender.Parameters<
    State,
    HTMLButtonElement,
    undefined
  >["stateAttributesMapping"];
};

/**
 * The viewer's round action buttons. Repeated taps must not invoke Safari's native
 * double-tap zoom, so they set `touch-action: manipulation`.
 */
export const ACTION_CLASSES =
  "inline-flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-full text-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-current disabled:opacity-30";

/**
 * A button part. The caller's handler runs first, and may call
 * `event.preventBaseUIHandler()` to cancel `onPress`.
 */
export function useOmbraAction<State extends Record<string, unknown>>(
  {
    slot,
    disabled,
    onPress,
    classes = ACTION_CLASSES,
    state,
    stateAttributes,
  }: ActionOptions<State>,
  {
    ref,
    className,
    render,
    disabled: disabledProp,
    ...props
  }: useRender.ComponentProps<"button", State>,
) {
  const off = disabled || disabledProp === true;

  return useRender({
    defaultTagName: "button",
    render,
    ref,
    state,
    stateAttributesMapping: stateAttributes,
    props: {
      "data-slot": slot,
      "data-disabled": off ? "" : undefined,
      ...mergeProps<"button">(
        {
          type: "button",
          // A `render` element that is not a button ignores `disabled`.
          onClick: () => {
            if (!off) onPress();
          },
          // Disabling the focused control makes the browser drop focus on the page,
          // and the viewer's keys stop working. The dialog itself can take it.
          onBlur: (event) => {
            const button = event.currentTarget;

            if (!button.disabled || !button.isConnected) return;

            const dialog = button.closest<HTMLElement>("[role=dialog]");
            const next = event.relatedTarget;

            if (!dialog || (next instanceof Node && dialog.contains(next))) return;

            dialog.focus({ preventScroll: true });
          },
        },
        props,
        { disabled: off, className: cn(classes, className) },
      ),
    },
  });
}

function navigationState({ state }: OmbraRootContextValue): OmbraNavigationState {
  return { activeId: state.activeId, index: activeIndex(state), count: state.itemIds.length };
}

/**
 * Goes to an item. Resets the zoom first: a zoomed track cannot scroll. Without a mounted
 * track, the item becomes active directly.
 */
export function navigateTo(root: OmbraRootContextValue, itemId: string, behavior: ScrollBehavior) {
  const slides = root.slides();

  if (!slides) {
    root.requestActive(itemId);

    return;
  }

  if (itemId === root.latestActiveId() && slides.navigationTarget() === null) return;

  root.zoomControlsRef.current?.reset();
  slides.navigate(itemId, behavior);
}

/** Goes one item back or forward from a smooth navigation's destination, or the active item. */
export function stepFrom(root: OmbraRootContextValue, by: -1 | 1, behavior: ScrollBehavior) {
  const ids = root.state.itemIds;
  const target = root.slides()?.navigationTarget() ?? null;
  const from = ids.indexOf(target ?? root.latestActiveId() ?? "");
  const itemId = ids[(from < 0 ? 0 : from) + by];

  if (itemId !== undefined) navigateTo(root, itemId, behavior);
}

// Widgets that use the arrow keys, Home and End themselves.
const KEY_OWNERS = [
  "input",
  "textarea",
  "select",
  "audio[controls]",
  "video[controls]",
  "[contenteditable]:not([contenteditable=false])",
  ...[
    "textbox",
    "searchbox",
    "combobox",
    "listbox",
    "menu",
    "menubar",
    "slider",
    "spinbutton",
    "radiogroup",
    "tablist",
    "tree",
    "treegrid",
    "grid",
  ].map((role) => `[role=${role}]`),
].join(",");

/** The viewer's own scrollers, which its shortcuts drive. */
const OWN_SCROLLERS = "[data-slot=ombra-track],[data-slot=ombra-thumbnails]";

function scrolls(element: Element, axis: "x" | "y"): boolean {
  const style = getComputedStyle(element);
  const overflow = axis === "x" ? style.overflowX : style.overflowY;

  if (overflow !== "auto" && overflow !== "scroll") return false;

  return axis === "x"
    ? element.scrollWidth > element.clientWidth + 1
    : element.scrollHeight > element.clientHeight + 1;
}

/**
 * Whether the viewer may act on a key that reached `event.currentTarget`. It leaves alone a
 * key a handler already prevented, browser shortcuts, text entry and other widgets that use
 * the key. A navigation key, given the `scroller` axis it would scroll a panel on, also leaves
 * a panel of the consumer's alone, and Shift with it extends a selection.
 */
export function viewerShortcut(
  event: KeyboardEvent<HTMLElement>,
  scroller: "x" | "y" | "xy" | null,
): boolean {
  const { defaultPrevented, metaKey, ctrlKey, altKey, shiftKey } = event;

  if (defaultPrevented || event.nativeEvent.isComposing || metaKey || ctrlKey || altKey) {
    return false;
  }

  if (scroller !== null && shiftKey) return false;

  const target = event.target;

  if (!(target instanceof Element)) return true;

  if (target.closest(KEY_OWNERS)) return false;

  if (scroller === null) return true;

  for (
    let element: Element | null = target;
    element && element !== event.currentTarget;
    element = element.parentElement
  ) {
    if (element.matches(OWN_SCROLLERS)) return true;

    if (
      (scroller !== "y" && scrolls(element, "x")) ||
      (scroller !== "x" && scrolls(element, "y"))
    ) {
      return false;
    }
  }

  return true;
}

/** Smooth scrolling, unless the person prefers reduced motion. */
function useScrollBehavior(): ScrollBehavior {
  return useReducedMotion() ? "auto" : "smooth";
}

/**
 * Goes to the previous item. Disabled on the first. Supply visible text or `aria-label` in the
 * consumer's language.
 */
export function OmbraPrevious(props: OmbraActionProps) {
  const root = useOmbraRoot();
  const behavior = useScrollBehavior();
  const { index } = navigationState(root);

  return useOmbraAction(
    {
      slot: "ombra-previous",
      disabled: index <= 0,
      onPress: () => stepFrom(root, -1, behavior),
    },
    props,
  );
}

/**
 * Goes to the next item. Disabled on the last. Supply visible text or `aria-label` in the
 * consumer's language.
 */
export function OmbraNext(props: OmbraActionProps) {
  const root = useOmbraRoot();
  const behavior = useScrollBehavior();
  const { index, count } = navigationState(root);

  return useOmbraAction(
    {
      slot: "ombra-next",
      disabled: index < 0 || index >= count - 1,
      onPress: () => stepFrom(root, 1, behavior),
    },
    props,
  );
}

const COUNTER_ATTRIBUTES: useRender.Parameters<
  OmbraCounterState,
  HTMLSpanElement,
  undefined
>["stateAttributesMapping"] = {
  activeId: () => null,
  index: () => null,
  position: (position) => ({ "data-position": String(position) }),
  count: (count) => ({ "data-count": String(count) }),
};

/** The active item's position. The caller formats it; without children it shows `1 / 12`. */
export function OmbraCounter({ ref, render, className, children, ...props }: OmbraCounterProps) {
  const navigation = navigationState(useOmbraRoot());
  const state: OmbraCounterState = { ...navigation, position: navigation.index + 1 };

  const content = children ? children(state) : `${state.position} / ${state.count}`;

  return useRender({
    defaultTagName: "span",
    render,
    ref,
    state,
    stateAttributesMapping: COUNTER_ATTRIBUTES,
    props: { "data-slot": "ombra-counter", ...props, className, children: content },
  });
}

type StripAction = { type: "strip-measured"; overflowing: boolean };

function stripReducer(state: OmbraThumbnailsState, action: StripAction): OmbraThumbnailsState {
  return state.overflowing === action.overflowing ? state : { overflowing: action.overflowing };
}

// Keyframes need real CSS, so this ships as a stylesheet rather than Tailwind classes. The
// frame is the strip's positioned parent; the cues sit over the strip's ends.
const EDGE_STYLES = `@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: --ombra-strip) and
    (scroll-timeline: --ombra-strip inline) and
    (timeline-scope: --ombra-strip) and
    (animation-range: calc(100% - 20px) 100%) {
    [data-slot="ombra-thumbnails-frame"] {
      timeline-scope: --ombra-strip;
    }

    [data-slot="ombra-thumbnails"] {
      scroll-timeline: --ombra-strip inline;
    }

    [data-slot="ombra-thumbnails-frame"]:has(> [data-overflowing="true"]) > [data-slot="ombra-strip-edge-start"],
    [data-slot="ombra-thumbnails-frame"]:has(> [data-overflowing="true"]) > [data-slot="ombra-strip-edge-end"] {
      display: block;
      position: absolute;
      z-index: 1;
      top: 0.25rem;
      bottom: 0.25rem;
      width: 1.25rem;
      pointer-events: none;
      animation: ombra-strip-edge-in linear both;
      animation-timeline: --ombra-strip;
      animation-range: 0px 20px;
    }

    [data-slot="ombra-thumbnails-frame"] > [data-slot="ombra-strip-edge-start"] {
      left: 0;
      background: linear-gradient(to right, var(--ombra-surface), transparent);
    }

    [data-slot="ombra-thumbnails-frame"]:has(> [data-overflowing="true"]) > [data-slot="ombra-strip-edge-end"] {
      right: 0;
      background: linear-gradient(to left, var(--ombra-surface), transparent);
      animation-name: ombra-strip-edge-out;
      animation-range: calc(100% - 20px) 100%;
    }

    @keyframes ombra-strip-edge-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes ombra-strip-edge-out {
      from { opacity: 1; }
      to { opacity: 0; }
    }
  }
}`;

const STRIP_ATTRIBUTES: useRender.Parameters<
  OmbraThumbnailsState,
  HTMLElement,
  undefined
>["stateAttributesMapping"] = {
  overflowing: (overflowing) => ({ "data-overflowing": overflowing ? "true" : "false" }),
};

/**
 * The thumbnail strip: a horizontal scroller around `OmbraThumbnail`s. It keeps the active
 * thumbnail in view, snaps and centres its ends once the thumbnails overflow it, and fades an
 * edge cue in at each end with more thumbnails beyond. It carries `data-overflowing`.
 *
 * It renders a `nav`: name it with `aria-label` in the consumer's language. With fewer than two
 * items there is nowhere to go, so it renders nothing.
 */
export function OmbraThumbnails({
  ref,
  render,
  className,
  children,
  ...props
}: OmbraThumbnailsProps) {
  const { state: root } = useOmbraRoot();
  const behavior = useScrollBehavior();
  const [state, send] = useReducerWithBailout(stripReducer, { overflowing: false });
  const stripRef = useRef<HTMLElement | null>(null);
  const single = root.itemIds.length < 2;
  const rowRef = useRef<HTMLDivElement>(null);
  const { overflowing } = state;

  const bind = useCallback((node: HTMLElement | null) => {
    stripRef.current = node;
  }, []);

  useLayoutEffect(() => {
    const strip = stripRef.current;
    const row = rowRef.current;

    if (single || !strip || !row) return;

    const measure = () => {
      const style = getComputedStyle(row);
      const pad = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);

      send({
        type: "strip-measured",
        overflowing: row.scrollWidth - pad > strip.clientWidth + 1,
      });
    };

    measure();

    const observer = new ResizeObserver(measure);

    observer.observe(strip);
    observer.observe(row);

    return () => {
      observer.disconnect();
    };
  }, [send, single]);

  useLayoutEffect(() => {
    const strip = stripRef.current;

    const current = strip?.querySelector<HTMLElement>(
      "[data-slot=ombra-thumbnail][data-active=true]",
    );

    if (!strip || !current) return;

    const delta = current.getBoundingClientRect().left - strip.getBoundingClientRect().left;
    const left = strip.scrollLeft + delta - (strip.clientWidth - current.clientWidth) / 2;

    strip.scrollTo({ left: clampScrollLeft(strip, left), behavior });
  }, [root.activeId, root.phase, behavior, overflowing]);

  const strip = useRender({
    defaultTagName: "nav",
    render,
    ref: [bind, ref ?? null],
    state,
    stateAttributesMapping: STRIP_ATTRIBUTES,
    props: {
      "data-slot": "ombra-thumbnails",
      ...props,
      className: cn(
        "touch-pan-x overflow-x-auto overflow-y-hidden py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        overflowing && "snap-x snap-mandatory",
        className,
      ),
      children: (
        <div
          ref={rowRef}
          data-slot="ombra-thumbnails-row"
          className={cn(
            "mx-auto flex w-max gap-2",
            // Half a default thumbnail each side, so the first and last can rest centred.
            overflowing ? "px-[max(0.25rem,calc(50%-1.375rem))]" : "px-1",
          )}
        >
          {children}
        </div>
      ),
    },
  });

  if (single) return null;

  return (
    <div data-slot="ombra-thumbnails-frame" className="relative min-w-0">
      {strip}
      <span data-slot="ombra-strip-edge-start" aria-hidden="true" className="hidden" />
      <span data-slot="ombra-strip-edge-end" aria-hidden="true" className="hidden" />
      <style data-slot="ombra-strip-edge-styles">{EDGE_STYLES}</style>
    </div>
  );
}

/**
 * Goes to its item, and carries `data-active` and `aria-current` while that item is active.
 * Supply `aria-label` or visible text in the consumer's language.
 */
export function OmbraThumbnail({ itemId, ...props }: OmbraThumbnailProps) {
  const root = useOmbraRoot();
  const behavior = useScrollBehavior();
  const active = root.state.activeId === itemId;

  return useOmbraAction(
    {
      slot: "ombra-thumbnail",
      disabled: false,
      onPress: () => navigateTo(root, itemId, behavior),
      classes: cn(
        "size-11 shrink-0 snap-center overflow-hidden rounded-lg border-2 p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-current",
        active ? "border-current" : "border-transparent opacity-60",
      ),
      state: { active },
      stateAttributes: THUMBNAIL_ATTRIBUTES,
    },
    { "aria-current": active ? "true" : undefined, ...props },
  );
}

const THUMBNAIL_ATTRIBUTES: useRender.Parameters<
  OmbraThumbnailState,
  HTMLButtonElement,
  undefined
>["stateAttributesMapping"] = {
  active: (active) => ({ "data-active": active ? "true" : "false" }),
};
