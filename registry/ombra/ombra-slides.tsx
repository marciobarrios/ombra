"use client";

import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import { createContext, useCallback, useContext, useLayoutEffect, useRef } from "react";
import type { CSSProperties } from "react";

import { indexFromScroll } from "./geometry";
import { initialMediaState, mediaReducer, mediaSize } from "./media-status";
import { useOmbraRoot } from "./ombra-root";
import type { OmbraSlidesHandle } from "./ombra-root";
import { clampScrollLeft } from "./scroll-range";
import { useReducedMotion } from "./use-reduced-motion";
import { useReducerWithBailout } from "./use-reducer-with-bailout";

// A scroll with no `scrollend` (older WebKit) counts as rested after this quiet spell.
const SCROLL_REST_MS = 140;

export type OmbraSlidesProps = useRender.ComponentProps<"div"> & {
  /**
   * Polite text for the slide the track has rested on. `position` is one-based.
   * Without it, the announcement is `Image N of M`.
   */
  announce?: (itemId: string, position: number, count: number) => string;
};

export type OmbraSlideProps = useRender.ComponentProps<"div"> & {
  /** The item this slide shows. It matches the trigger's `itemId`, not a position. */
  itemId: string;
};

export type OmbraMediaProps = useRender.ComponentProps<"div"> & {
  /**
   * Intrinsic width of the media, in any unit that shares a ratio with `height`. Give both
   * to reserve the box before the image loads; without them, the image's natural size is used.
   */
  width?: number;
  /** Intrinsic height of the media. */
  height?: number;
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

type LiveState = { text: string };

type LiveAction = { type: "announced"; text: string };

function liveReducer(state: LiveState, action: LiveAction): LiveState {
  if (action.text === "" || action.text === state.text) return state;

  return { text: action.text };
}

function defaultAnnouncement(_itemId: string, position: number, count: number): string {
  return `Image ${position} of ${count}`;
}

function announcementFor(
  itemIds: readonly string[],
  itemId: string | null,
  announce: (itemId: string, position: number, count: number) => string,
): string {
  if (itemId === null) return "";

  const index = itemIds.indexOf(itemId);

  if (index < 0) return "";

  return announce(itemId, index + 1, itemIds.length);
}

/**
 * The native scroll-snap track. The active item follows the slide nearest the centre as the
 * track scrolls, so a smooth navigation publishes each slide it passes rather than jumping to
 * the destination. When the track rests on a slide a controlled parent refused, it glides back
 * to the active one.
 */
export function OmbraSlides({
  ref,
  className,
  render,
  children,
  announce,
  ...props
}: OmbraSlidesProps) {
  const root = useOmbraRoot();
  const reduced = useReducedMotion();
  const rootRef = useRef(root);
  const reducedRef = useRef(reduced);
  const handleRef = useRef<OmbraSlidesHandle | null>(null);
  const snapRef = useRef<((behavior: ScrollBehavior) => void) | null>(null);
  const announceRef = useRef(announce ?? defaultAnnouncement);

  const [{ text }, sendLive] = useReducerWithBailout(liveReducer, {
    text: announcementFor(root.state.itemIds, root.state.activeId, announce ?? defaultAnnouncement),
  });

  const sendLiveRef = useRef(sendLive);

  rootRef.current = root;
  reducedRef.current = reduced;
  announceRef.current = announce ?? defaultAnnouncement;
  sendLiveRef.current = sendLive;

  const bind = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;

    let settled = true;
    let target: string | null = null;
    let timer = 0;
    const hold = () => rootRef.current.trackHoldRef.current?.() ?? "free";

    const announceSettled = (itemId: string | null) => {
      const current = rootRef.current;

      sendLiveRef.current({
        type: "announced",
        text: announcementFor(current.state.itemIds, itemId, announceRef.current),
      });
    };

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

      node.scrollTo({ left: clampScrollLeft(node, left), behavior });
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
      // One announcement for the slide the track rested on, not each slide it passed.
      announceSettled(centred());
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

    const handle = handleRef.current;

    // A change that does not scroll, such as opening on the slide already centred,
    // still has one announcement. A swipe waits for settle instead.
    if (handle?.settled() && activeId !== null && handle.centred() === activeId) {
      sendLiveRef.current({
        type: "announced",
        text: announcementFor(rootRef.current.state.itemIds, activeId, announceRef.current),
      });
    }
  }, [activeId]);

  const named = props["aria-label"] != null || props["aria-labelledby"] != null;

  const carousel = {
    "data-slot": "ombra-track",
    ...props,
    role: "region",
    "aria-roledescription": "carousel",
    // The track scrolls, so it has to be in the tab order. Arrow keys still change
    // slides: the dialog handles them and prevents the native scroll.
    tabIndex: 0,
    className: cn(
      // Each slide is 86% of the track, so its neighbours peek in from both sides.
      // `isolate` keeps the active slide's raise inside the track, under the chrome.
      "@container isolate flex h-full min-w-0 snap-x snap-mandatory items-stretch gap-4 overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-current",
      className,
    ),
    children: (
      <>
        {/* role=status is the polite live region. Its text changes once per rested slide. */}
        <p role="status" data-slot="ombra-live" className="pointer-events-none sr-only">
          {text}
        </p>
        <div aria-hidden="true" className={SPACER} />
        {children}
        <div aria-hidden="true" className={SPACER} />
      </>
    ),
  };

  if (!named) carousel["aria-label"] = "Photos";

  // useRender merges the local and caller refs, including React 19 ref cleanups.
  return useRender({
    render,
    ref: [bind, ref ?? null],
    props: carousel,
  });
}

/**
 * One item's snap box. It keeps its size while the viewer is pulled or a photo is zoomed, so
 * the track never re-snaps under a gesture. Captions and other markup go inside it as children.
 *
 * Never transform the slide itself: browsers take snap positions from the transformed box,
 * so a scale or translate here moves the snap point. Animate the children instead.
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
          // Peeking neighbours stay on screen. Only the active slide is exposed.
          "aria-hidden": active ? undefined : true,
          className: cn(
            // A size container, so the media inside can fit itself to the slide. Size
            // containment makes each slide a stacking context, painted in DOM order, so the
            // active one is raised: a zoomed photo spreads over the peeking neighbours, and
            // the next slide would otherwise paint on top of it.
            "flex h-full min-h-0 w-[86cqi] shrink-0 snap-center snap-always items-center justify-center [container-type:size] data-[active=true]:z-1",
            className,
          ),
        },
      })}
    </SlideContext.Provider>
  );
}

/** The image inside a media part, which reports the media's status. */
function mediaImage(element: HTMLElement): HTMLImageElement | null {
  return element instanceof HTMLImageElement ? element : element.querySelector("img");
}

/**
 * The full-size media a morph lands on. It sizes itself to the largest box of its intrinsic
 * ratio that fits its parent's size container, centred, which is where the open morph ends
 * and the close morph leaves from. Any image renderer inside it works: a native `img`,
 * Next.js `Image`, a `picture`. The first `<img>` inside receives a decoded source when a
 * swipe catches it still loading, and its loads and errors set `data-status`.
 *
 * Without `width` and `height`, the media takes the image's natural size once it loads, and
 * stays transparent until then, so it never paints at a guessed size and jumps.
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
  const [media, sendMedia] = useReducerWithBailout(mediaReducer, initialMediaState);
  const elementRef = useRef<HTMLElement | null>(null);
  const size = mediaSize(width, height, media.natural);
  const sizeWidth = size?.width ?? 0;
  const sizeHeight = size?.height ?? 0;

  const register = useCallback(
    (element: HTMLElement | null) => {
      elementRef.current = element;

      // A morph needs the size, so media still measuring itself is not a landing yet.
      if (!element || !(sizeWidth > 0)) return;

      return registerMedia({ itemId, element, width: sizeWidth, height: sizeHeight });
    },
    [itemId, sizeWidth, sizeHeight, registerMedia],
  );

  useLayoutEffect(() => {
    const element = elementRef.current;

    if (!element) return;

    const report = (image: HTMLImageElement) => {
      if (image.naturalWidth > 0) {
        sendMedia({
          type: "image-loaded",
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
      } else if (image.getAttribute("src") || image.getAttribute("srcset")) {
        sendMedia({ type: "image-failed" });
      }
    };

    // A cached image can finish before this listens.
    const image = mediaImage(element);

    if (image?.complete) report(image);

    // Load and error do not bubble, so listen while they pass down to the image.
    const settled = (event: Event) => {
      const target = mediaImage(element);

      if (event.target !== target || !target) return;

      if (event.type === "error") sendMedia({ type: "image-failed" });
      else report(target);
    };

    element.addEventListener("load", settled, true);
    element.addEventListener("error", settled, true);

    return () => {
      element.removeEventListener("load", settled, true);
      element.removeEventListener("error", settled, true);
    };
  }, [sendMedia]);

  const measuring = width === undefined || height === undefined;
  const hidden = size === null && media.status !== "error";
  const ratio = size ? size.width / size.height : 1;

  const fit: CSSProperties = {
    aspectRatio: size ? `${size.width} / ${size.height}` : "1 / 1",
    width: `min(100cqw, calc(100cqh * ${ratio}))`,
    ...(hidden ? { opacity: 0 } : null),
    ...style,
  };

  return useRender({
    render,
    ref: [register, ref ?? null],
    props: {
      "data-slot": "ombra-media",
      "data-status": media.status,
      ...props,
      style: fit,
      className: cn(
        // m-auto centres it in a flex parent, which is where the morph expects it.
        "relative m-auto max-h-full max-w-full shrink-0 [&>img]:h-full [&>img]:w-full [&>img]:object-contain",
        // Media that measures itself fades in once its size is known.
        measuring && "transition-opacity duration-200 ease-out motion-reduce:transition-none",
        className,
      ),
    },
  });
}
