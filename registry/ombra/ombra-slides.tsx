"use client";

import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import { createContext, useCallback, useContext, useLayoutEffect, useRef } from "react";
import type { CSSProperties } from "react";

import { indexFromScroll } from "./geometry";
import { useOmbraRoot } from "./ombra-root";
import type { OmbraSlidesHandle } from "./ombra-root";
import { useReducedMotion } from "./use-reduced-motion";

// A scroll with no `scrollend` (older WebKit) counts as rested after this quiet spell.
const SCROLL_REST_MS = 140;

export type OmbraSlidesProps = useRender.ComponentProps<"div">;

export type OmbraSlideProps = useRender.ComponentProps<"div"> & {
  /** The item this slide shows. It matches the trigger's `itemId`, not a position. */
  itemId: string;
};

export type OmbraMediaProps = useRender.ComponentProps<"div"> & {
  /** Intrinsic width of the media, in any unit that shares a ratio with `height`. */
  width: number;
  /** Intrinsic height of the media. */
  height: number;
};

const SlideContext = createContext<string | null>(null);

/** The item of the `OmbraSlide` a part is rendered in. Throws outside a slide. */
export function useSlideItem(part: string): string {
  const itemId = useContext(SlideContext);

  if (itemId === null) throw new Error(`<${part}> must be rendered inside <OmbraSlide>.`);

  return itemId;
}

/** The spacers let the first and last slides rest in the centre. */
const SPACER = "shrink-0 basis-[max(0px,calc(7cqi-1rem))]";

/**
 * The native scroll-snap track. The active item follows the slide nearest the centre as the
 * track scrolls, so a smooth navigation publishes each slide it passes rather than jumping to
 * the destination. When the track rests on a slide a controlled parent refused, it glides back
 * to the active one.
 */
export function OmbraSlides({ ref, className, render, children, ...props }: OmbraSlidesProps) {
  const root = useOmbraRoot();
  const reduced = useReducedMotion();
  const rootRef = useRef(root);
  const reducedRef = useRef(reduced);
  const handleRef = useRef<OmbraSlidesHandle | null>(null);
  const snapRef = useRef<((behavior: ScrollBehavior) => void) | null>(null);

  rootRef.current = root;
  reducedRef.current = reduced;

  const bind = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;

    let settled = true;
    let target: string | null = null;
    let timer = 0;
    const hold = () => rootRef.current.trackHoldRef.current?.() ?? "free";

    const centred = () => {
      const slides = node.querySelectorAll<HTMLElement>("[data-slot=ombra-slide]");
      const slide = slides[indexFromScroll(node)];

      return slide ? rootRef.current.slideItem(slide) : null;
    };

    const scrollTo = (itemId: string, behavior: ScrollBehavior) => {
      const slide = rootRef.current.slideFor(itemId);

      if (!slide) return;

      const delta = slide.getBoundingClientRect().left - node.getBoundingClientRect().left;
      const left = node.scrollLeft + delta - (node.clientWidth - slide.clientWidth) / 2;

      node.scrollTo({ left: Math.max(0, left), behavior });
    };

    const behavior = (): ScrollBehavior => (reducedRef.current ? "auto" : "smooth");

    const publish = () => {
      if (hold() === "gesture") return;

      const itemId = centred();

      if (itemId !== null) rootRef.current.requestActive(itemId);
    };

    /** Scrolls to the root's active item when the track rests on another slide. */
    const snapToActive = (to: ScrollBehavior) => {
      const activeId = rootRef.current.latestActiveId();

      if (activeId === null || rootRef.current.state.phase !== "open") return;

      if (!settled || hold() !== "free" || centred() === activeId) return;

      scrollTo(activeId, to);
    };

    const settle = () => {
      settled = true;
      target = null;
      publish();
      // A controlled parent may keep the active item. Glide back to it once the parent
      // has had its render, rather than rest on a slide it refused.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          snapToActive(behavior());
        });
      });
    };

    const onScroll = () => {
      settled = false;
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, SCROLL_REST_MS);
      publish();
    };

    const onScrollEnd = () => {
      window.clearTimeout(timer);
      settle();
    };

    const onTrackInput = () => {
      target = null;
    };

    const handle: OmbraSlidesHandle = {
      element: node,
      settled: () => settled,
      navigationTarget: () => target,
      centred,
      scrollTo,
      navigate: (itemId, to) => {
        if (itemId === rootRef.current.latestActiveId() && target === null) return;

        target = to === "smooth" ? itemId : null;

        // Smooth scrolling publishes the centred slide as it moves. Selecting the
        // destination now would flash its border before the first scroll event.
        if (to !== "smooth") rootRef.current.requestActive(itemId);

        scrollTo(itemId, to);
      },
      settle: () => {
        const itemId = centred();
        const slide = itemId === null ? null : rootRef.current.slideFor(itemId);

        slide?.scrollIntoView({ inline: "center", block: "nearest", behavior: behavior() });

        if (itemId !== null) rootRef.current.requestActive(itemId);
      },
    };

    node.addEventListener("scroll", onScroll, { passive: true });
    node.addEventListener("scrollend", onScrollEnd);
    node.addEventListener("wheel", onTrackInput, { passive: true });
    node.addEventListener("pointerdown", onTrackInput, { passive: true });
    handleRef.current = handle;
    snapRef.current = snapToActive;

    const unregister = rootRef.current.registerSlides(handle);

    return () => {
      unregister();
      handleRef.current = null;
      snapRef.current = null;
      node.removeEventListener("scroll", onScroll);
      node.removeEventListener("scrollend", onScrollEnd);
      node.removeEventListener("wheel", onTrackInput);
      node.removeEventListener("pointerdown", onTrackInput);
      window.clearTimeout(timer);
    };
  }, []);

  // A reorder or a removal moves the active slide under the track. Put it back at once.
  // Keyed on the order, not the array: a new array with the same IDs moves nothing.
  const order = root.state.itemIds.join("\n");

  useLayoutEffect(() => {
    snapRef.current?.("auto");
  }, [order]);

  // A controlled parent can choose another item while the viewer is open.
  const { activeId } = root.state;

  useLayoutEffect(() => {
    if (handleRef.current?.navigationTarget() != null) return;

    snapRef.current?.(reducedRef.current ? "auto" : "smooth");
  }, [activeId]);

  // useRender merges the local and caller refs, including React 19 ref cleanups.
  return useRender({
    render,
    ref: [bind, ref ?? null],
    props: {
      "data-slot": "ombra-track",
      ...props,
      // A tab stop, so this scrollable region is keyboard-reachable. The dialog handles
      // Arrow, Home and End from here the same way it does from any other control.
      tabIndex: 0,
      className: cn(
        // Each slide is 86% of the track, so its neighbours peek in from both sides.
        "@container flex h-full min-w-0 snap-x snap-mandatory items-stretch gap-4 overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-current",
        className,
      ),
      children: (
        <>
          <div aria-hidden="true" className={SPACER} />
          {children}
          <div aria-hidden="true" className={SPACER} />
        </>
      ),
    },
  });
}

/**
 * One item's snap box. It keeps its size while the viewer is pulled or a photo is zoomed, so
 * the track never re-snaps under a gesture. Captions and other markup go inside it as children.
 */
export function OmbraSlide({ itemId, ref, className, render, ...props }: OmbraSlideProps) {
  const { registerSlide, state } = useOmbraRoot();
  const active = state.activeId === itemId;

  const register = useCallback(
    (element: HTMLElement | null) => {
      if (!element) return;

      return registerSlide({ itemId, element });
    },
    [itemId, registerSlide],
  );

  return (
    <SlideContext.Provider value={itemId}>
      {useRender({
        render,
        ref: [register, ref ?? null],
        props: {
          "data-slot": "ombra-slide",
          "data-active": active ? "true" : "false",
          role: "group",
          "aria-roledescription": "slide",
          ...props,
          className: cn(
            // A size container, so the media inside can fit itself to the slide.
            "flex h-full min-h-0 w-[86cqi] shrink-0 snap-center snap-always items-center justify-center [container-type:size]",
            className,
          ),
        },
      })}
    </SlideContext.Provider>
  );
}

/**
 * The full-size media a morph lands on. It sizes itself to the largest box of its intrinsic
 * ratio that fits its parent's size container, centred, which is where the open morph ends
 * and the close morph leaves from. Any image renderer inside it works: a native `img`,
 * Next.js `Image`, a `picture`. The first `<img>` inside receives a decoded source when a
 * swipe catches it still loading.
 *
 * `OmbraSlide` is a size container, so media directly in a slide fills it. Beside a caption,
 * give the media a parent of its own with `container-type: size` that centres it.
 */
export function OmbraMedia({
  width,
  height,
  ref,
  className,
  style,
  render,
  ...props
}: OmbraMediaProps) {
  const itemId = useSlideItem("OmbraMedia");
  const { registerMedia } = useOmbraRoot();

  const register = useCallback(
    (element: HTMLElement | null) => {
      if (!element) return;

      return registerMedia({ itemId, element, width, height });
    },
    [itemId, width, height, registerMedia],
  );

  const ratio = width > 0 && height > 0 ? width / height : 1;

  const fit: CSSProperties = {
    aspectRatio: `${width} / ${height}`,
    width: `min(100cqw, calc(100cqh * ${ratio}))`,
    ...style,
  };

  return useRender({
    render,
    ref: [register, ref ?? null],
    props: {
      "data-slot": "ombra-media",
      ...props,
      style: fit,
      className: cn(
        // m-auto centres it in a flex parent, which is where the morph expects it.
        "relative m-auto max-h-full max-w-full shrink-0 [&>img]:h-full [&>img]:w-full [&>img]:object-contain",
        className,
      ),
    },
  });
}
