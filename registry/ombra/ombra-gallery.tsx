"use client";

import { Dialog } from "@base-ui/react/dialog";
import { cn } from "cn";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { flushSync } from "react-dom";

import { listenForCloseInput } from "./close-input";
import {
  boxContains,
  boxDistance,
  boxFromRect,
  clipInset,
  containBox,
  coverCrop,
  isRendered,
  mostlyUnclipped,
  mostlyVisible,
  poseBetween,
  RESTING_POSE,
  revealElement,
  uncropBox,
} from "./geometry";
import { startFrameSampler } from "./frame-sampler";
import type { FrameSampler } from "./frame-sampler";
import { isOpen } from "./gallery-state";
import {
  MORPH_EASING,
  MORPH_STYLES,
  continueAnimation,
  continueFlight,
  flightKeyframes,
  flightRemaining,
  flightVisibleBox,
  mountFlight,
  nameSharedElement,
  playFlight,
  readPose,
  readViewTransitionBox,
  rebaseFlight,
  resolveMorphEngine,
  retireFlight,
  runViewTransition,
  unnameSharedElement,
  viewTransitionFaded,
  viewTransitionRemaining,
  watchLayoutShift,
  watchSettled,
  whenDecoded,
} from "./morph";
import type { Flight } from "./morph";
import { OmbraBackdrop, OmbraClose, OmbraContent, OmbraPortal } from "./ombra-dialog";
import { OmbraRoot, useOmbraRoot } from "./ombra-root";
import { OmbraTrigger } from "./ombra-trigger";
import type { OmbraMediaSource, OmbraRootProps } from "./ombra-root";
import { OmbraMedia, OmbraSlide, OmbraSlides } from "./ombra-slides";
import { MORPH_SPRING, normalizeVelocity, springCurve } from "./spring";
import type { Box, FlipPose, FrameSample, MorphEngine, MorphKind, OmbraItem } from "./types";
import { motionDuration } from "./types";
import { fitToVisualViewport, usePageZoomGuard } from "./use-page-zoom-guard";
import { usePull } from "./use-pull";
import { useReducedMotion } from "./use-reduced-motion";
import { useReducerWithBailout } from "./use-reducer-with-bailout";
import { useZoom } from "./use-zoom";

// Keyframes need real CSS, so this ships as a stylesheet rather than Tailwind classes.
const stripEdgeStyles = `@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: --ombra-strip) and
    (scroll-timeline: --ombra-strip inline) and
    (timeline-scope: --ombra-strip) and
    (animation-range: calc(100% - 20px) 100%) {
    [data-slot="ombra-viewer"] footer {
      position: relative;
      timeline-scope: --ombra-strip;
    }

    [data-slot="ombra-thumbnails"] {
      scroll-timeline: --ombra-strip inline;
    }

    [data-slot="ombra-viewer"] footer:has([data-overflowing="true"]) [data-slot="ombra-strip-edge-start"],
    [data-slot="ombra-viewer"] footer:has([data-overflowing="true"]) [data-slot="ombra-strip-edge-end"] {
      display: block;
      position: absolute;
      z-index: 1;
      bottom: calc(max(0.75rem, env(safe-area-inset-bottom)) + 0.25rem);
      width: 1.25rem;
      height: 2.75rem;
      pointer-events: none;
      animation: ombra-strip-edge-in linear both;
      animation-timeline: --ombra-strip;
      animation-range: 0px 20px;
    }

    [data-slot="ombra-viewer"] footer [data-slot="ombra-strip-edge-start"] {
      left: 1rem;
      background: linear-gradient(to right, var(--ombra-surface), transparent);
    }

    [data-slot="ombra-viewer"] footer:has([data-overflowing="true"]) [data-slot="ombra-strip-edge-end"] {
      right: 1rem;
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

/** State that comes from the DOM, so it stays React-side instead of in `gallery-state.ts`. */
type ViewState = {
  /** Photos whose full-size source has decoded, so the slide can drop its thumbnail. */
  sharpIds: ReadonlySet<string>;
  stripOverflows: boolean;
};

type ViewAction = { type: "decoded"; id: string } | { type: "strip-measured"; overflows: boolean };

const initialViewState: ViewState = { sharpIds: new Set(), stripOverflows: false };

function viewReducer(state: ViewState, action: ViewAction): ViewState {
  switch (action.type) {
    case "decoded":
      if (state.sharpIds.has(action.id)) return state;

      return { ...state, sharpIds: new Set([...state.sharpIds, action.id]) };

    case "strip-measured":
      if (state.stripOverflows === action.overflows) return state;

      return { ...state, stripOverflows: action.overflows };
  }
}

// The end of a close is a sliver of spring overshoot, moving too little to see. It
// would keep the page locked and read a swipe as a reversal, so a close ends here.
const ARRIVED_PX = 1.5;
const FADED_OPACITY = 0.02;

/** The rest of an opening morph, running on the real photo after a swipe took over. */
type HeroMorph = { index: number; hero: HTMLElement; animations: Animation[] };

// Placing the track and snapping can land a fraction of a pixel off.
const SWIPE_START_PX = 2;

// How long a landed morph may wait for the photo under it to decode before the
// swap. A cached bitmap is ready within a frame; this only caps a slow network.
const DECODE_WAIT_MS = 120;

export type OmbraViewerOptions = {
  /**
   * The morph between a thumbnail and the viewer. FLIP is the default (MAR-12). A
   * browser without View Transitions runs FLIP for `vt`, and reduced motion always fades.
   */
  engine?: MorphEngine;
  /** Triples every morph duration, to inspect a transition frame by frame. */
  slow?: boolean;
  /** Spike experiment: a spring curve in place of the cubic easing (MAR-12 kept the cubic). */
  spring?: boolean;
  /** Called after each open or close with its frame timing. The spike's readout and benchmark collect these. */
  onFrameSample?: (kind: MorphKind, sample: FrameSample) => void;
};

export type OmbraGalleryProps = Omit<OmbraRootProps, "children"> &
  OmbraViewerOptions & {
    /** Each item's `id` is its stable identity: a reorder keeps the open photo open. */
    items: readonly OmbraItem[];
    className?: string;
  };

function releaseVelocity(pixelsPerSecond: number, from: Box, to: Box): number {
  const dx = to.x + to.width / 2 - (from.x + from.width / 2);
  const dy = to.y + to.height / 2 - (from.y + from.height / 2);
  const distance = Math.hypot(dx, dy);

  if (distance < 8) return 0;

  return normalizeVelocity((pixelsPerSecond * dy) / distance, distance);
}

function opacityOf(element: HTMLElement | null): number {
  return element ? Number.parseFloat(getComputedStyle(element).opacity) : 0;
}

/**
 * Where a photo rests: its media's own box, so a media the caller sized or placed itself is
 * still where the morph lands. While a zoom or a hand-off moves the media, its box is not the
 * resting one, so this falls back to the largest box of its ratio centred in its frame.
 */
function restingBox(media: OmbraMediaSource, frame: HTMLElement): Box {
  for (
    let node: HTMLElement | null = media.element;
    node && node !== frame;
    node = node.parentElement
  ) {
    if (getComputedStyle(node).transform !== "none" || node.getAnimations().length > 0) {
      return containBox(boxFromRect(frame.getBoundingClientRect()), media.width / media.height);
    }
  }

  return boxFromRect(media.element.getBoundingClientRect());
}

/**
 * Paints `src`, a decoded thumbnail, on an image still loading its own source. An image with
 * a `srcset` (Next.js Image always has one) would keep choosing from it, so the set comes
 * off until the browser's own choice has decoded, then goes back.
 */
function showDecoded(image: HTMLImageElement, src: string) {
  const srcset = image.getAttribute("srcset");

  if (srcset === null) {
    image.src = src;

    return;
  }

  const sizes = image.getAttribute("sizes");
  const own = image.getAttribute("src");
  const loader = new Image();

  if (sizes !== null) loader.sizes = sizes;

  loader.srcset = srcset;

  if (own !== null) loader.src = own;

  image.removeAttribute("srcset");
  image.src = src;

  void loader
    .decode()
    .catch(() => undefined)
    .then(() => {
      // Something else, such as a render, has set a source since.
      if (image.getAttribute("src") !== src || image.hasAttribute("srcset")) return;

      image.setAttribute("srcset", srcset);

      if (own !== null) image.setAttribute("src", own);
    });
}

/** The image inside a slide's media, which can take a decoded source while it still loads. */
function imageIn(media: HTMLElement | null): HTMLImageElement | null {
  if (!media) return null;

  if (media instanceof HTMLImageElement) return media;

  return media.querySelector("img");
}

function IconButton({
  label,
  className,
  onClick,
  disabled,
  slot,
  children,
}: {
  label: string;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  slot: string;
  children: ReactNode;
}) {
  const classes = cn(
    // Repeated toolbar taps must not invoke Safari's native double-tap zoom.
    // The viewer's pan-x pan-y ancestor also removes native pinch here (MAR-80).
    "inline-flex size-11 touch-manipulation items-center justify-center rounded-full text-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current disabled:opacity-30",
    className,
  );

  return (
    <button
      type="button"
      data-slot={slot}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={classes}
    >
      {children}
    </button>
  );
}

export function OmbraGallery({
  open,
  defaultOpen,
  onOpenChange,
  activeId,
  defaultActiveId,
  onActiveIdChange,
  ...viewer
}: OmbraGalleryProps) {
  return (
    <OmbraRoot
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      activeId={activeId}
      defaultActiveId={defaultActiveId}
      onActiveIdChange={onActiveIdChange}
    >
      <GalleryViewer {...viewer} />
    </OmbraRoot>
  );
}

/**
 * The viewer's morph driver: it runs the open and close morphs, the pull to dismiss and zoom,
 * and finds the photos through the parts. `OmbraSlides` supplies the track, each `OmbraSlide`
 * its snap box and each `OmbraMedia` the box a morph lands on. Spike-stage: MAR-143 moves it
 * behind the public parts, so a composition will not call it.
 */
export function useOmbraViewer({
  engine = "flip",
  slow = false,
  spring = false,
  onFrameSample,
}: OmbraViewerOptions = {}) {
  const reduced = useReducedMotion();
  const root = useOmbraRoot();
  const { state: gallery, send } = root;
  const { phase, activeId, epoch: animEpoch, itemIds: ids } = gallery;

  // Positions still address the parts' DOM lists; the active ID chooses which one.
  const index = Math.max(0, activeId === null ? 0 : ids.indexOf(activeId));

  const open = isOpen(gallery);

  // The pull hook listens on the track, so the viewer renders again when it mounts.
  const trackNode = useSyncExternalStore(
    root.subscribeSlides,
    () => root.slides()?.element ?? null,
    () => null,
  );

  const trackRef = useRef<HTMLElement | null>(null);

  trackRef.current = trackNode;

  const layerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const backdropAnimationRef = useRef<Animation | null>(null);
  const popupAnimationRef = useRef<Animation | null>(null);
  const sheetAnimationRef = useRef<Animation | null>(null);
  const flightRef = useRef<Flight | null>(null);
  const retiringFlightRef = useRef<Flight | null>(null);
  const closeInputRef = useRef<(() => void) | null>(null);
  const vtClosingRef = useRef(false);
  const resumeRef = useRef<{ backdrop: number; popup: number } | null>(null);
  const preserveFlightRef = useRef(false);
  const heroMorphRef = useRef<HeroMorph | null>(null);
  const stopTrackWatchRef = useRef<(() => void) | null>(null);
  const stopFollowRef = useRef<(() => void) | null>(null);
  const tokenRef = useRef(0);
  const originRef = useRef<Box | null>(null);
  const phaseRef = useRef(phase);
  const indexRef = useRef(index);
  const engineRef = useRef(engine);
  const slowRef = useRef(slow);
  const springRef = useRef(spring);
  const flickRef = useRef(0);
  const reducedRef = useRef(reduced);
  const driverRef = useRef<MorphEngine>("flip");
  const zoomGestureRef = useRef(false);
  const sizesRef = useRef(new Map<string, { width: number; height: number }>());
  const samplerRef = useRef<FrameSampler | null>(null);
  const sampleKindRef = useRef<MorphKind>("open");
  const vtRef = useRef<ViewTransition | null>(null);
  const seenId = useRef(activeId);
  const rootRef = useRef(root);
  const idsRef = useRef(ids);

  phaseRef.current = phase;
  indexRef.current = index;
  rootRef.current = root;
  idsRef.current = ids;
  engineRef.current = engine;
  slowRef.current = slow;
  springRef.current = spring;
  reducedRef.current = reduced;

  const effective: MorphEngine = reduced ? "fade" : engine;
  const onFrameSampleRef = useRef(onFrameSample);

  onFrameSampleRef.current = onFrameSample;
  const count = ids.length;

  // The track reports whether it has come to rest; the pull waits for that.
  const settledRef = useMemo<RefObject<boolean>>(
    () => ({
      get current() {
        return rootRef.current.slides()?.settled() ?? true;
      },
      set current(_: boolean) {},
    }),
    [],
  );

  const settleTrack = () => {
    rootRef.current.slides()?.settle();
  };

  const zoom = useZoom(
    trackRef,
    layerRef,
    phase === "open",
    settleTrack,
    spring,
    slow,
    reduced,
    zoomGestureRef,
  );

  // Before the morph layout effects, so FLIP measures the viewer where it is shown.
  usePageZoomGuard(open, popupRef);

  // A FLIP or fade opening can be cut by a vertical drag. A view transition opening
  // hands its presses to the root, which already dismisses as an outside press.
  const pullCutsOpening = phase === "opening" && driverRef.current !== "vt";

  const pulling = usePull(
    trackNode,
    (phase === "open" || pullCutsOpening) && !zoom.zoomed,
    pullCutsOpening,
    settledRef,
    reduced,
    slow,
    spring,
    (velocity) => {
      flickRef.current = velocity;
      rootRef.current.requestClose();

      // A controlled parent may refuse the close. The pull hook already let go, so
      // put the sheet back rather than leave it shrunk at the drag's pose.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // A View Transition close stays "open" until its update callback runs.
          if (vtClosingRef.current) return;

          if (phaseRef.current !== "open" && phaseRef.current !== "opening") return;

          flickRef.current = 0;
          document.documentElement.style.setProperty("--ombra-pull-live", "0");
        });
      });
    },
  );

  const zoomRef = useRef(zoom);

  zoomRef.current = zoom;

  // A zoom gesture owns the track's scroll position, and a zoomed photo stays where it is.
  useLayoutEffect(() => {
    const hold = root.trackHoldRef;

    hold.current = () => {
      if (zoomGestureRef.current) return "gesture";

      return zoomRef.current.zoomed ? "zoomed" : "free";
    };

    return () => {
      hold.current = null;
    };
  }, [root.trackHoldRef]);

  useLayoutEffect(() => {
    if (seenId.current === activeId) return;

    seenId.current = activeId;
    zoomRef.current.reset();
  }, [activeId]);

  useLayoutEffect(() => {
    root.driverRef.current = {
      open: (itemId, intent) => {
        const nextIndex = idsRef.current.indexOf(itemId);

        if (nextIndex < 0) return false;

        if (intent.reason === "reverse" || phaseRef.current === "closing" || vtClosingRef.current) {
          return reopenFromClose(nextIndex, intent.reason === "reverse" ? intent.speed : 0);
        }

        return openAt(nextIndex);
      },
      close: startClose,
    };
  });

  useLayoutEffect(() => {
    const driver = root.driverRef;

    return () => {
      driver.current = null;
    };
  }, [root.driverRef]);

  // The dialog can take more than one frame to mount, and the fade only starts once
  // it has. Mount at the fade's first value so the resting opacity never paints.
  const openingOpacity = (part: "backdrop" | "popup"): string | null => {
    if (phaseRef.current !== "opening" || driverRef.current === "vt") return null;

    return String(resumeRef.current?.[part] ?? 0);
  };

  const bindBackdrop = useCallback((node: HTMLDivElement | null) => {
    backdropRef.current = node;

    const opacity = openingOpacity("backdrop");

    if (node && opacity !== null) node.style.opacity = opacity;
  }, []);

  const bindPopup = useCallback((node: HTMLDivElement | null) => {
    popupRef.current = node;

    if (node) fitToVisualViewport(node);

    const opacity = openingOpacity("popup");

    if (node && opacity !== null) node.style.opacity = opacity;
  }, []);

  useLayoutEffect(() => {
    if (phase !== "opening" && phase !== "closing") return;

    if (driverRef.current === "vt") return;

    const token = tokenRef.current;
    let alive = true;
    let attempts = 0;

    beginSample(phase === "opening" ? "open" : "close");

    if (phase === "opening") runOpen();
    else runClose();

    return () => {
      alive = false;
      stopCloseInput();
      stopTrackWatch();
      stopFollow();
      cancelHeroMorph();

      if (preserveFlightRef.current) {
        preserveFlightRef.current = false;
        flightRef.current?.hold();
      } else {
        flightRef.current?.destroy();
        flightRef.current = null;
      }

      // A replacement morph increments the token before this cleanup and starts
      // its own sampler. Unmount does not, so stop the rAF loop here.
      if (tokenRef.current === token) {
        samplerRef.current?.stop();
        samplerRef.current = null;
      }
    };

    function retry(again: () => void) {
      attempts += 1;

      if (attempts > 30) {
        endSample();

        if (phase === "opening") {
          if (backdropRef.current) backdropRef.current.style.opacity = "";

          if (popupRef.current) popupRef.current.style.opacity = "";

          send({ type: "opened" });
        } else {
          finishClose();
        }

        return;
      }

      requestAnimationFrame(() => {
        if (!alive || tokenRef.current !== token) return;

        again();
      });
    }

    function runOpen() {
      restoreVisibility();

      const itemIndex = indexRef.current;
      const item = mediaAt(itemIndex);
      const slide = frameAt(itemIndex);
      // Measured again now the viewer is mounted: locking the page scroll can move
      // the thumbnail, and a retried open starts frames after the tap.
      const origin = thumbnailBox(itemIndex) ?? originRef.current;

      if (!item || !slide || !origin) {
        retry(runOpen);

        return;
      }

      placeTrack(item.itemId);

      // Measure the slide at rest, not at the pose a reversed pull close still holds:
      // the photo would land offset by the drag and jump when the hero replaces it.
      const animateSheetBack = releaseSheetHold();
      const home = restingBox(item, slide);
      const fadeDuration = motionDuration(480, slowRef.current, reducedRef.current);
      const existing = flightRef.current;
      const flick = flickRef.current;
      const resume = resumeRef.current;

      flickRef.current = 0;
      resumeRef.current = null;

      const velocity = existing
        ? releaseVelocity(flick, boxFromRect(existing.element.getBoundingClientRect()), home)
        : 0;

      const timing =
        driverRef.current === "fade"
          ? { duration: fadeDuration, easing: MORPH_EASING }
          : morphTiming(480, velocity);

      animateSheetBack(timing.duration, timing.easing);
      fadeBackdrop(resume?.backdrop ?? 0, 1, timing.duration, timing.easing);

      if (driverRef.current === "fade") {
        fadePopup(resume?.popup ?? 0, 1, timing.duration, () => {
          if (!alive || tokenRef.current !== token) return;

          endSample();
          send({ type: "opened" });
        });

        return;
      }

      fadePopup(
        resume?.popup ?? 0,
        1,
        timing.duration,
        null,
        springRef.current ? timing.easing : "ease-out",
      );

      const crop = coverCrop(item.width, item.height, origin.width, origin.height);
      const from = poseBetween(origin, home, crop);
      const src = cachedSrc(itemIndex);
      const startPose = existing ? rebaseFlight(existing, home) : from;
      const flight = existing ?? mountFlight(home, from, src);

      flightRef.current = flight;
      hideThumb(itemIndex);

      const hero = item.element;
      const heroImage = imageIn(hero);

      hero.style.visibility = "hidden";

      // The slide may still be loading its own source. The clone's is decoded, so
      // the photo under it is ready to paint when the clone goes.
      if (heroImage && (!heroImage.complete || heroImage.naturalWidth === 0)) {
        showDecoded(heroImage, flight.image.src);
      }

      const settle = () => {
        if (!alive || tokenRef.current !== token) return;

        hero.style.visibility = "";

        settleOpen(itemIndex);
      };

      // The clone holds the last frame, so waiting for the photo under it is invisible.
      const land = (completed: boolean) => {
        if (!completed) return;

        if (!heroImage) {
          settle();

          return;
        }

        void whenDecoded(heroImage, DECODE_WAIT_MS).then(settle);
      };

      void playFlight(flight, startPose, RESTING_POSE, timing.duration, timing.easing).then(land);

      // The viewer fills the visual viewport, so an address bar that collapses or
      // returns mid-flight moves the photo's resting box. Rebase onto the new box
      // and fly the rest of the way there, so the clone lands where the photo is.
      followLayout(() => {
        if (flightRef.current !== flight) return;

        const next = restingBox(item, slide);

        const remaining = flightRemaining(flight);

        if (remaining <= 0 || boxDistance(next, flight.home) < 0.5) return;

        const pose = rebaseFlight(flight, next);

        void playFlight(flight, pose, RESTING_POSE, remaining, timing.easing).then(land);
      });

      watchTrackForSwipe(() => {
        void handOffFlight(itemIndex)?.finished.then(settle, () => undefined);
      });
    }

    function runClose() {
      restoreVisibility();

      const itemIndex = indexRef.current;
      const item = mediaAt(itemIndex);
      const trigger = triggerAt(itemIndex);
      const thumb = thumbAt(itemIndex);
      // A trigger that unmounted, or one a scroll container still clips after
      // revealing it, has no box to land on. Fade instead of flying somewhere wrong.
      const revealed = item && thumb && isRendered(trigger) ? revealElement(trigger) : "hidden";
      const flick = flickRef.current;

      flickRef.current = 0;

      const pull = Number(
        document.documentElement.style.getPropertyValue("--ombra-pull-live") || "0",
      );

      // Read before the pull is cleared. A close that cuts an opening short leaves
      // from the scrim and chrome it reached instead of jumping to full strength.
      const scrimFrom = opacityOf(backdropRef.current);
      const popupFrom = opacityOf(popupRef.current);

      if (driverRef.current === "fade" || revealed === "hidden" || !item || !thumb) {
        const fadeDuration = motionDuration(200, slowRef.current, reducedRef.current);
        const flying = flightRef.current;

        flightRef.current = null;

        // A photo still in the air fades where it is, so it never jumps to rest.
        if (flying) {
          const hero = heroAt(itemIndex);

          if (hero) hero.style.visibility = "hidden";

          retiringFlightRef.current?.destroy();
          retiringFlightRef.current = flying;
          retireFlight(flying, fadeDuration);
        }

        // Same as the morph: keep the sheet and scrim where a pull released them.
        document.documentElement.style.setProperty("--ombra-pull-live", "0");
        holdPulledSheet(pull);
        fadeBackdrop(scrimFrom, 0, fadeDuration);
        fadePopup(popupFrom, 0, fadeDuration, () => {
          if (!alive || tokenRef.current !== token) return;

          endSample();
          finishClose();
        });

        return;
      }

      // Revealing it may have brought a thumbnail the page had not decoded yet.
      if (thumb instanceof HTMLImageElement) void thumb.decode().catch(() => undefined);

      const slide = frameAt(itemIndex);

      const pulledBox = slide ? restingBox(item, slide) : null;

      document.documentElement.style.setProperty("--ombra-pull-live", "0");

      const home = slide ? restingBox(item, slide) : flightRef.current?.home;

      if (!home) {
        finishClose();

        return;
      }

      // The pull hook clears the variable when the gesture ends, which would snap
      // the sheet and scrim back before paint. Hold the dragged pose on the sheet
      // and fade the scrim from the opacity the drag already reached.
      holdPulledSheet(pull);

      const thumbBox = boxFromRect(thumb.getBoundingClientRect());
      const crop = coverCrop(item.width, item.height, thumbBox.width, thumbBox.height);
      const endPose = poseBetween(thumbBox, home, crop);
      const fromBox = pulledBox ?? home;
      const velocity = releaseVelocity(flick, fromBox, thumbBox);
      const timing = morphTiming(420, velocity);
      const hero = item.element;

      hero.style.visibility = "hidden";

      hideThumb(itemIndex);
      fadeBackdrop(scrimFrom, 0, timing.duration, timing.easing);
      fadePopup(
        popupFrom,
        0,
        timing.duration,
        null,
        springRef.current ? timing.easing : "ease-out",
      );

      let from: FlipPose = RESTING_POSE;
      let flight = flightRef.current;

      if (flight) {
        from = flight.hold();
      } else if (pulledBox && Math.abs(pull) > 0.02) {
        from = poseBetween(pulledBox, home, { inline: 0, block: 0 });
      }

      if (!flight) {
        flight = mountFlight(home, from, shownSrc(itemIndex));
        flightRef.current = flight;
      }

      let target = thumbBox;

      // The clone holds the thumbnail's pose until the thumbnail can paint.
      const land = (completed: boolean) => {
        if (!alive || tokenRef.current !== token || !completed) return;

        void whenDecoded(thumb, DECODE_WAIT_MS).then(() => {
          if (!alive || tokenRef.current !== token) return;

          showThumb(itemIndex);
          flightRef.current?.destroy();
          flightRef.current = null;
          endSample();
          finishClose();
        });
      };

      void playFlight(flight, from, endPose, timing.duration, timing.easing).then(land);

      // A page that scrolls or a viewport that resizes mid-close moves the thumbnail.
      // Fly the rest of the way to where it is now instead of its old coordinates.
      followLayout(() => {
        if (flightRef.current !== flight) return;

        const next = boxFromRect(thumb.getBoundingClientRect());
        const remaining = flightRemaining(flight);

        if (remaining <= 0 || boxDistance(next, target) < 0.5) return;

        target = next;

        const nextCrop = coverCrop(item.width, item.height, next.width, next.height);

        void playFlight(
          flight,
          flight.hold(),
          poseBetween(next, home, nextCrop),
          remaining,
          timing.easing,
        ).then(land);
      });

      armCloseInput(
        () =>
          boxDistance(flightVisibleBox(flight), target) < ARRIVED_PX &&
          opacityOf(backdropRef.current) < FADED_OPACITY &&
          opacityOf(popupRef.current) < FADED_OPACITY,
        () => {
          backdropAnimationRef.current?.finish();
          popupAnimationRef.current?.finish();
          flight.finish();
        },
      );
    }
    // The animation reads refs on purpose so a re-render does not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, animEpoch]);

  function beginSample(kind: MorphKind) {
    // A close that cuts an open short still reports the open's frames so far.
    endSample();
    sampleKindRef.current = kind;
    samplerRef.current = startFrameSampler();
  }

  function endSample() {
    const sample = samplerRef.current?.stop() ?? null;

    samplerRef.current = null;

    if (sample && sample.frames > 1) {
      onFrameSampleRef.current?.(sampleKindRef.current, sample);
    }
  }

  /** The trigger on the page for a photo, which is also its focus target. */
  function triggerAt(itemIndex: number): HTMLElement | null {
    const itemId = idsRef.current[itemIndex];

    return itemId === undefined ? null : (rootRef.current.triggerFor(itemId)?.element ?? null);
  }

  /** The thumbnail a photo's morph flies from and lands on. */
  function thumbAt(itemIndex: number): HTMLElement | null {
    const itemId = idsRef.current[itemIndex];

    return itemId === undefined ? null : (rootRef.current.triggerFor(itemId)?.media ?? null);
  }

  /**
   * The box a photo's media fits and centres itself in: its parent, or the zoom surface's
   * parent, since zooming scales the surface and never the resting box. In the gallery that
   * is the slide; a slide with a caption gives the media a box of its own.
   */
  function frameAt(itemIndex: number): HTMLElement | null {
    const itemId = idsRef.current[itemIndex];

    if (itemId === undefined || !rootRef.current.slideFor(itemId)) return null;

    let frame = rootRef.current.mediaFor(itemId)?.element.parentElement ?? null;

    while (frame?.dataset.slot === "ombra-zoom") frame = frame.parentElement;

    return frame;
  }

  /** The media a photo's morph lands on, with its intrinsic size. Only while the viewer is mounted. */
  function mediaAt(itemIndex: number): OmbraMediaSource | null {
    const itemId = idsRef.current[itemIndex];
    const media = itemId === undefined ? null : rootRef.current.mediaFor(itemId);

    if (itemId !== undefined && media) {
      sizesRef.current.set(itemId, { width: media.width, height: media.height });
    }

    return media;
  }

  /**
   * A photo's intrinsic size. It outlives the media, because a view transition close leaves
   * nothing mounted behind it while the photo is still in flight.
   */
  function sizeAt(itemIndex: number): { width: number; height: number } | null {
    const itemId = idsRef.current[itemIndex];

    return (
      mediaAt(itemIndex) ?? (itemId === undefined ? null : sizesRef.current.get(itemId)) ?? null
    );
  }

  function heroAt(itemIndex: number): HTMLElement | null {
    return mediaAt(itemIndex)?.element ?? null;
  }

  function cachedSrc(itemIndex: number): string {
    const thumb = thumbAt(itemIndex);
    const src = thumb instanceof HTMLImageElement ? thumb.currentSrc : "";

    return src || imageIn(heroAt(itemIndex))?.currentSrc || "";
  }

  /** The source the viewer shows for a photo, which is decoded, or the thumbnail's. */
  function shownSrc(itemIndex: number): string {
    const image = imageIn(heroAt(itemIndex));

    if (image?.complete && image.naturalWidth > 0 && image.currentSrc) return image.currentSrc;

    return cachedSrc(itemIndex);
  }

  function showHeroes() {
    for (const itemId of idsRef.current) {
      const hero = rootRef.current.mediaFor(itemId)?.element;

      if (hero) hero.style.visibility = "";
    }
  }

  function thumbnailBox(itemIndex: number): Box | null {
    const trigger = triggerAt(itemIndex);
    const thumb = thumbAt(itemIndex);

    if (!thumb || !isRendered(trigger)) return null;

    return boxFromRect(thumb.getBoundingClientRect());
  }

  /** The current slide's trigger, or the nearest one still on the page if it is gone. */
  function focusTarget(): HTMLElement | null {
    const count = idsRef.current.length;
    const current = indexRef.current;

    for (let distance = 0; distance < count; distance += 1) {
      for (const candidate of [current - distance, current + distance]) {
        const trigger = candidate >= 0 && candidate < count ? triggerAt(candidate) : null;

        if (isRendered(trigger)) return trigger;
      }
    }

    return null;
  }

  function stopFollow() {
    stopFollowRef.current?.();
    stopFollowRef.current = null;
  }

  function followLayout(changed: () => void) {
    stopFollow();
    stopFollowRef.current = watchLayoutShift(popupRef.current, changed);
  }

  function hideThumb(itemIndex: number) {
    const thumb = thumbAt(itemIndex);

    if (thumb) thumb.style.visibility = "hidden";
  }

  function showThumb(itemIndex: number) {
    const thumb = thumbAt(itemIndex);

    if (thumb) thumb.style.visibility = "";
  }

  function restoreVisibility() {
    for (const itemIndex of idsRef.current.keys()) {
      const thumb = thumbAt(itemIndex);

      if (thumb) thumb.style.visibility = "";
    }

    showHeroes();
  }

  function sheetElement(): HTMLElement | null {
    const sheet = popupRef.current?.querySelector("[data-slot=ombra-sheet]");

    if (sheet instanceof HTMLElement) return sheet;

    return null;
  }

  function holdPulledSheet(pull: number) {
    sheetAnimationRef.current?.cancel();
    sheetAnimationRef.current = null;

    // The pull is signed: negative while the photo is pushed up.
    const amount = Math.abs(pull);

    if (amount <= 0.02) return;

    const sheet = sheetElement();

    if (!sheet) return;

    sheet.style.transform = `translate3d(0, ${pull * 22}dvh, 0) scale(${1 - amount * 0.07})`;
    sheet.style.transformOrigin = "center center";
    sheet.style.borderRadius = `${amount * 24}px`;
  }

  function clearSheetHold() {
    const sheet = sheetElement();

    if (!sheet) return;

    sheet.style.transform = "";
    sheet.style.transformOrigin = "";
    sheet.style.borderRadius = "";
  }

  /**
   * A reversed pull dismissal starts with the sheet still held at the drag pose.
   * Clears the hold so the caller can measure the resting layout, and returns the
   * animation back from that pose for the caller to start once it has.
   */
  function releaseSheetHold(): (duration: number, easing: string) => void {
    const sheet = sheetElement();
    const transform = sheet?.style.transform;
    const borderRadius = sheet?.style.borderRadius;

    clearSheetHold();

    return (duration, easing) => {
      animateSheetFrom(sheet, transform, borderRadius, duration, easing);
    };
  }

  function animateSheetFrom(
    sheet: HTMLElement | null,
    transform: string | undefined,
    borderRadius: string | undefined,
    duration: number,
    easing: string,
  ) {
    if (!sheet || !transform || duration <= 0) return;

    sheetAnimationRef.current?.cancel();
    sheetAnimationRef.current = sheet.animate(
      [
        { transform, borderRadius },
        { transform: "none", borderRadius: "0px" },
      ],
      { duration, easing },
    );
  }

  function settleOpen(itemIndex: number) {
    stopTrackWatch();
    stopFollow();
    heroMorphRef.current = null;
    showThumb(itemIndex);
    flightRef.current?.destroy();
    flightRef.current = null;
    endSample();
    send({ type: "opened" });
  }

  function stopTrackWatch() {
    stopTrackWatchRef.current?.();
    stopTrackWatchRef.current = null;
  }

  function watchTrackForSwipe(onSwipe: () => void) {
    stopTrackWatch();

    const track = trackRef.current;

    if (!track) return;

    const start = track.scrollLeft;

    const onScroll = () => {
      if (Math.abs(track.scrollLeft - start) < SWIPE_START_PX) return;

      stopTrackWatch();
      onSwipe();
    };

    track.addEventListener("scroll", onScroll, { passive: true });
    stopTrackWatchRef.current = () => {
      track.removeEventListener("scroll", onScroll);
    };
  }

  /** Everything the opening fade should still reach once the photo itself is opaque. */
  function viewerPartsAround(hero: HTMLElement): HTMLElement[] {
    const parts = popupRef.current?.querySelectorAll<HTMLElement>(
      "header, footer, [data-slot=ombra-nav], [data-slot=ombra-slide]",
    );

    // A caption beside the photo, inside its own slide, fades with the rest.
    const slide = hero.closest("[data-slot=ombra-slide]");
    const besides = slide ? [...slide.children].filter((part) => part instanceof HTMLElement) : [];

    return [...(parts ?? []), ...besides].filter(
      (part): part is HTMLElement => part instanceof HTMLElement && !part.contains(hero),
    );
  }

  function revealHero(hero: HTMLElement, src: string) {
    const image = imageIn(hero);

    // A swipe can arrive before the slide's own source has loaded. The thumbnail
    // the morph started from is already decoded, and the sharp source replaces it.
    if (image && (!image.complete || image.naturalWidth === 0)) showDecoded(image, src);

    hero.style.visibility = "";
  }

  // The hero lives in the scroller, so it follows a native swipe with no lag. It
  // takes over the clone's animation at the same moment, which keeps it on the same
  // pixels. The popup fade would turn it translucent, so that moves to the rest.
  function handOffFlight(itemIndex: number): Animation | null {
    const flight = flightRef.current;
    const hero = heroAt(itemIndex);

    if (!flight || !hero) return null;

    const morph = continueFlight(flight, hero);

    if (!morph) return null;

    const animations = [morph];

    for (const fade of popupRef.current?.getAnimations() ?? []) {
      for (const part of viewerPartsAround(hero)) {
        const moved = continueAnimation(fade, part);

        if (moved) animations.push(moved);
      }

      fade.cancel();
    }

    revealHero(hero, flight.image.src);
    stopFollow();
    flight.destroy();
    flightRef.current = null;
    heroMorphRef.current = { index: itemIndex, hero, animations };

    return morph;
  }

  // A view transition cannot move onto an element, so this restarts from its live
  // frame and scrim. The curve changes, but the photo stays on the same pixels.
  function handOffViewTransition(itemIndex: number, token: number) {
    const item = mediaAt(itemIndex);
    const hero = item?.element;
    const box = readViewTransitionBox();
    const remaining = viewTransitionRemaining();

    if (!item || !hero || !box || remaining <= 0) return;

    const scrim = Number(
      getComputedStyle(document.documentElement, "::view-transition-new(root)").opacity,
    );

    const crop = coverCrop(item.width, item.height, box.width, box.height);
    const pose = poseBetween(box, boxFromRect(hero.getBoundingClientRect()), crop);
    // A new animation can start a fraction of a millisecond in the future, and
    // without a backwards fill the photo would paint at rest for that one frame.
    const timing = { duration: remaining, easing: MORPH_EASING, fill: "backwards" as const };

    const morph = hero.animate(flightKeyframes(pose, RESTING_POSE), timing);

    const fades = viewerPartsAround(hero).map((part) =>
      part.animate([{ opacity: scrim }, { opacity: 1 }], timing),
    );

    heroMorphRef.current = { index: itemIndex, hero, animations: [morph, ...fades] };
    hideThumb(itemIndex);
    unnameSharedElement(hero);
    revealHero(hero, cachedSrc(itemIndex));
    vtRef.current?.skipTransition();
    vtRef.current = null;
    fadeBackdrop(scrim, 1, remaining);

    void morph.finished.then(
      () => {
        if (tokenRef.current === token) settleOpen(itemIndex);
      },
      () => undefined,
    );
  }

  function cancelHeroMorph() {
    for (const animation of heroMorphRef.current?.animations ?? []) animation.cancel();

    heroMorphRef.current = null;
  }

  // A close during the handoff starts from wherever the photo is, so it goes back
  // to being a clone. If the swipe already selected another slide, that one is at rest.
  function reclaimHeroMorph() {
    const handoff = heroMorphRef.current;

    if (!handoff) return;

    const pose = readPose(handoff.hero);

    cancelHeroMorph();

    if (handoff.index !== indexRef.current) return;

    flightRef.current = mountFlight(
      boxFromRect(handoff.hero.getBoundingClientRect()),
      pose,
      cachedSrc(handoff.index),
    );
  }

  // A view transition cannot run backwards. A close during its opening swaps the
  // pseudo-elements for a clone on the same pixels, with the viewer at the scrim's
  // current strength, so the close leaves from where the photo is instead of the end.
  function reclaimViewTransitionOpening() {
    if (phaseRef.current !== "opening" || driverRef.current !== "vt" || !vtRef.current) return;

    const itemIndex = indexRef.current;
    const item = mediaAt(itemIndex);
    const slide = frameAt(itemIndex);
    const box = readViewTransitionBox();

    if (!item || !slide || !box || flightRef.current || reducedRef.current) return;

    const scrim = Number(
      getComputedStyle(document.documentElement, "::view-transition-new(root)").opacity,
    );

    // The clone's home is the photo at rest, where the FLIP close expects it.
    const home = restingBox(item, slide);
    const crop = coverCrop(item.width, item.height, box.width, box.height);
    const pose = poseBetween(box, home, crop);

    flightRef.current = mountFlight(home, pose, cachedSrc(itemIndex));
    hideThumb(itemIndex);
    // The opening's own clean-up only runs when it settles, which it no longer will.
    unnameSharedElement(item.element);
    vtRef.current.skipTransition();
    vtRef.current = null;

    const opacity = String(Number.isFinite(scrim) ? scrim : 1);

    if (backdropRef.current) backdropRef.current.style.opacity = opacity;

    if (popupRef.current) popupRef.current.style.opacity = opacity;
  }

  useLayoutEffect(
    () => () => {
      stopTrackWatch();
      cancelHeroMorph();
    },
    // Only refs are read, and this only runs on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function placeTrack(itemId: string) {
    rootRef.current.slides()?.scrollTo(itemId, "auto");
  }

  function morphTiming(baseMs: number, velocity: number) {
    if (reducedRef.current || !springRef.current) {
      return {
        duration: motionDuration(baseMs, slowRef.current, reducedRef.current),
        easing: MORPH_EASING,
      };
    }

    const curve = springCurve({ ...MORPH_SPRING, velocity });

    return {
      duration: slowRef.current ? curve.duration * 3 : curve.duration,
      easing: curve.easing,
    };
  }

  function fadeBackdrop(from: number, to: number, duration: number, easing: string = MORPH_EASING) {
    const backdrop = backdropRef.current;

    if (!backdrop) return;

    backdropAnimationRef.current?.cancel();
    backdropAnimationRef.current = null;
    // The resting CSS opacity is 1. Cancelling a fade-out drops fill:forwards and
    // the scrim paints at full strength for a frame before the dialog unmounts.
    backdrop.style.opacity = to === 0 && duration <= 0 ? "0" : "";

    if (duration <= 0) return;

    const animation = backdrop.animate([{ opacity: from }, { opacity: to }], {
      duration,
      easing,
      fill: "forwards",
    });

    backdropAnimationRef.current = animation;

    void animation.finished.then(
      () => {
        if (backdropAnimationRef.current !== animation) return;

        backdrop.style.opacity = to === 0 ? "0" : "";
        animation.cancel();
        backdropAnimationRef.current = null;
      },
      () => undefined,
    );
  }

  function fadePopup(
    from: number,
    to: number,
    duration: number,
    done: (() => void) | null,
    easing = "ease-out",
  ) {
    const popup = popupRef.current;

    popupAnimationRef.current?.cancel();
    popupAnimationRef.current = null;

    if (!popup || duration <= 0) {
      if (popup) popup.style.opacity = done ? "" : String(to);

      done?.();

      return;
    }

    popup.style.opacity = "";

    const animation = popup.animate([{ opacity: from }, { opacity: to }], {
      duration,
      easing,
      fill: "forwards",
    });

    popupAnimationRef.current = animation;

    void animation.finished.then(
      () => {
        if (!done) return;

        popup.style.opacity = "";
        done();
      },
      () => undefined,
    );
  }

  const restoreFocusRef = useRef(false);

  function finishClose() {
    stopFollow();
    clearSheetHold();
    document.documentElement.style.setProperty("--ombra-pull-live", "0");

    restoreVisibility();
    restoreFocusRef.current = true;
    send({ type: "closed" });
  }

  useLayoutEffect(() => {
    if (phase !== "closed") return;

    if (!restoreFocusRef.current) return;

    restoreFocusRef.current = false;
    const trigger = focusTarget();

    requestAnimationFrame(() => {
      // The close already revealed its own trigger. A stand-in for one that is
      // gone must not scroll the page once the viewer has faded.
      trigger?.focus({ preventScroll: true });
    });
  }, [phase]);

  function stopCloseInput() {
    closeInputRef.current?.();
    closeInputRef.current = null;
  }

  useEffect(() => stopCloseInput, []);

  function armCloseInput(arrived: () => boolean, finish: () => void) {
    stopCloseInput();

    const stopInput = listenForCloseInput({
      onReverse: (speed) => reopenItem(indexRef.current, speed),
      onTap: (x, y) => {
        const itemIndex = closeTapTarget(x, y);

        return itemIndex !== null && reopenItem(itemIndex, 0);
      },
    });

    const stopWatching = watchSettled(arrived, finish);

    closeInputRef.current = () => {
      stopInput();
      stopWatching();
    };
  }

  /** A reversal is an open request too, so a controlled parent can refuse it. */
  function reopenItem(itemIndex: number, speed: number): boolean {
    const itemId = idsRef.current[itemIndex];

    return (
      itemId !== undefined && rootRef.current.requestOpen(itemId, { reason: "reverse", speed })
    );
  }

  function closeTapTarget(x: number, y: number): number | null {
    const flight = flightRef.current;

    const live = vtClosingRef.current
      ? readViewTransitionBox()
      : flight && flightVisibleBox(flight);

    // The flying photo covers whatever is under it, so it wins the hit test.
    if (live && boxContains(live, x, y)) return indexRef.current;

    const itemIndex = idsRef.current.findIndex((_, candidate) => {
      const trigger = triggerAt(candidate);

      return trigger && boxContains(boxFromRect(trigger.getBoundingClientRect()), x, y);
    });

    return itemIndex < 0 ? null : itemIndex;
  }

  function reopenFromClose(nextIndex: number, speed: number): boolean {
    const closingIndex = indexRef.current;
    const same = nextIndex === closingIndex;
    let resume = { backdrop: opacityOf(backdropRef.current), popup: opacityOf(popupRef.current) };

    if (vtClosingRef.current) {
      const item = sizeAt(closingIndex);
      const box = readViewTransitionBox();

      if (!item || !box) return false;

      // A view transition cannot run backwards, and the dialog is already gone
      // from the DOM behind it. Replace the pseudo-elements with a FLIP clone at
      // the same frame, which every later step already knows how to reverse.
      const crop = coverCrop(item.width, item.height, box.width, box.height);
      const pose = { transform: RESTING_POSE.transform, clipPath: clipInset(crop) };

      const oldRoot = getComputedStyle(document.documentElement, "::view-transition-old(root)");
      const scrim = Number.parseFloat(oldRoot.opacity);

      resume = { backdrop: scrim || 0, popup: scrim || 0 };
      flightRef.current = mountFlight(uncropBox(box, crop), pose, cachedSrc(closingIndex));
      vtClosingRef.current = false;
      vtRef.current?.skipTransition();
      vtRef.current = null;

      if (same) hideThumb(closingIndex);
    }

    stopCloseInput();

    if (!same && flightRef.current) {
      retiringFlightRef.current?.destroy();
      retiringFlightRef.current = flightRef.current;
      flightRef.current = null;
      retireFlight(
        retiringFlightRef.current,
        motionDuration(120, slowRef.current, reducedRef.current),
      );
    }

    flickRef.current = same ? -speed : 0;
    resumeRef.current = resume;
    document.documentElement.style.setProperty("--ombra-pull-live", "0");

    return openAt(nextIndex, true);
  }

  function openAt(nextIndex: number, handoff = false): boolean {
    const trigger = triggerAt(nextIndex);
    const thumb = thumbAt(nextIndex);
    const itemId = idsRef.current[nextIndex];

    if (!trigger || !thumb || itemId === undefined) return false;

    vtRef.current?.skipTransition();
    // A thumbnail mostly cut off by a scroll container would fly out with its hidden
    // part showing on the first frame, so it fades in instead.
    driverRef.current = resolveMorphEngine(
      engineRef.current,
      reducedRef.current || !mostlyUnclipped(trigger),
    );
    originRef.current = boxFromRect(thumb.getBoundingClientRect());

    if (!handoff && driverRef.current === "vt" && !flightRef.current) {
      openWithViewTransition(nextIndex, itemId, thumb);

      return true;
    }

    // A clone already in the air keeps flying, and the FLIP effect bails while
    // the driver is still "vt", which would leave the dialog stuck in "opening".
    if (driverRef.current === "vt") driverRef.current = "flip";

    preserveFlightRef.current = flightRef.current !== null;
    tokenRef.current += 1;
    send({ type: "open-requested", itemId, restart: true });

    return true;
  }

  function openWithViewTransition(nextIndex: number, itemId: string, thumb: HTMLElement) {
    const token = ++tokenRef.current;
    const timing = morphTiming(480, 0);

    beginSample("open");
    document.documentElement.style.setProperty("--ombra-vt-duration", `${timing.duration}ms`);
    document.documentElement.style.setProperty("--ombra-vt-easing", timing.easing);
    // The pseudo-elements would otherwise swallow a swipe aimed at the track. iOS Safari
    // still blocks it until the transition ends, which is accepted because VT is optional.
    document.documentElement.style.setProperty("--ombra-vt-pointer-events", "none");
    nameSharedElement(thumb);

    const transition = runViewTransition(() => {
      unnameSharedElement(thumb);
      flushSync(() => {
        send({ type: "open-requested", itemId, restart: false });
      });

      const hero = heroAt(nextIndex);

      nameSharedElement(hero);

      placeTrack(itemId);
      watchTrackForSwipe(() => {
        handOffViewTransition(nextIndex, token);
      });
    });

    vtRef.current = transition;

    const settled = () => {
      if (tokenRef.current !== token) return false;

      document.documentElement.style.removeProperty("--ombra-vt-pointer-events");

      // A swipe skipped the transition, and the hero's morph ends the opening.
      return heroMorphRef.current === null;
    };

    void transition?.finished.then(
      () => {
        if (!settled()) return;

        stopTrackWatch();
        unnameSharedElement(thumb);

        unnameSharedElement(heroAt(nextIndex));

        endSample();
        send({ type: "opened" });
        vtRef.current = null;
      },
      () => {
        if (!settled()) return;

        stopTrackWatch();
        endSample();
        send({ type: "opened" });
      },
    );
  }

  function startClose() {
    if (phaseRef.current === "closed" || phaseRef.current === "closing") return;

    stopTrackWatch();
    document.documentElement.style.removeProperty("--ombra-vt-pointer-events");
    reclaimHeroMorph();
    reclaimViewTransitionOpening();
    driverRef.current = resolveMorphEngine(engineRef.current, reducedRef.current);
    vtRef.current?.skipTransition();

    const trigger = triggerAt(indexRef.current);
    const thumb = thumbAt(indexRef.current);
    const canMorph = trigger ? mostlyVisible(trigger) : false;

    if (driverRef.current === "vt" && canMorph && thumb && !flightRef.current) {
      closeWithViewTransition(thumb);

      return;
    }

    // Same bail-out as open: an off-screen thumbnail, or a flight already in
    // the air, must fall through to FLIP/fade instead of staying on "vt".
    if (driverRef.current === "vt") driverRef.current = "flip";

    preserveFlightRef.current = flightRef.current !== null;
    tokenRef.current += 1;
    // An off-screen thumbnail cannot be a morph target, so the page may scroll during the fade.
    send({ type: "close-requested", releaseScroll: !canMorph });
  }

  function closeWithViewTransition(thumb: HTMLElement) {
    const token = ++tokenRef.current;
    const hero = heroAt(indexRef.current);
    const flick = flickRef.current;

    flickRef.current = 0;

    const from = hero ? boxFromRect(hero.getBoundingClientRect()) : null;

    vtClosingRef.current = true;

    const velocity = from
      ? releaseVelocity(flick, from, boxFromRect(thumb.getBoundingClientRect()))
      : 0;

    const timing = morphTiming(420, velocity);

    beginSample("close");
    document.documentElement.style.setProperty("--ombra-vt-duration", `${timing.duration}ms`);
    document.documentElement.style.setProperty("--ombra-vt-easing", timing.easing);

    nameSharedElement(hero);

    const transition = runViewTransition(() => {
      unnameSharedElement(hero);

      // The root unmounts the dialog in this same synchronous commit.
      flushSync(() => {
        send({ type: "closed" });
      });
      revealElement(thumb.parentElement instanceof HTMLElement ? thumb.parentElement : thumb);
      nameSharedElement(thumb);
    });

    vtRef.current = transition;
    armCloseInput(
      () => {
        const box = readViewTransitionBox();

        return (
          box !== null &&
          boxDistance(box, boxFromRect(thumb.getBoundingClientRect())) < ARRIVED_PX &&
          viewTransitionFaded(FADED_OPACITY)
        );
      },
      () => {
        transition?.skipTransition();
      },
    );

    void transition?.finished.then(
      () => {
        unnameSharedElement(thumb);

        if (tokenRef.current !== token) return;

        stopCloseInput();
        vtClosingRef.current = false;
        endSample();
        vtRef.current = null;
        document.documentElement.style.setProperty("--ombra-pull-live", "0");
      },
      () => {
        unnameSharedElement(thumb);

        if (tokenRef.current !== token) return;

        stopCloseInput();
        vtClosingRef.current = false;
        endSample();
        vtRef.current = null;
      },
    );
  }

  /** Where navigation starts from: a smooth scroll's destination, or the active photo. */
  function navigationFrom(): number {
    const target = rootRef.current.slides()?.navigationTarget() ?? null;
    const at = target === null ? -1 : idsRef.current.indexOf(target);

    return at < 0 ? indexRef.current : at;
  }

  function goTo(nextIndex: number, behavior: ScrollBehavior) {
    const slides = rootRef.current.slides();
    const itemId = idsRef.current[nextIndex];

    if (!slides || itemId === undefined) return;

    if (nextIndex === indexRef.current && slides.navigationTarget() === null) return;

    zoomRef.current.reset();
    slides.navigate(itemId, behavior);
  }

  /** Goes one photo back or forward from where navigation is heading. */
  function step(by: -1 | 1) {
    goTo(navigationFrom() + by, reducedRef.current ? "auto" : "smooth");
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      goTo(0, "auto");
    } else if (event.key === "End") {
      event.preventDefault();
      goTo(count - 1, "auto");
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomRef.current.zoomIn();
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      zoomRef.current.zoomOut();
    } else if (event.key === "0") {
      event.preventDefault();
      zoomRef.current.home();
    }
  }

  return {
    phase,
    open,
    /** The active photo's position in the collection. */
    index,
    count,
    zoom,
    pulling,
    /** Goes to a position, smoothly unless `behavior` says otherwise. */
    goTo,
    step,
    /** Attach to the active slide's zoom surface. */
    layerRef,
    /** Render once, outside the dialog, so a closing view transition still has it. */
    morphStyles: <style data-slot="ombra-morph-styles">{MORPH_STYLES}</style>,
    backdropProps: {
      ref: bindBackdrop,
      className: cn(phase === "closing" && "pointer-events-none"),
    },
    contentProps: {
      ref: bindPopup,
      "data-engine": effective,
      "data-phase": phase,
      "data-zoomed": zoom.zoomed ? "true" : "false",
      "data-pulling": pulling ? "true" : "false",
      finalFocus: () => focusTarget() ?? true,
      onKeyDown,
      className: cn(phase === "closing" && "pointer-events-none"),
    },
  };
}

function GalleryViewer({
  items,
  className,
  ...options
}: Omit<OmbraGalleryProps, keyof OmbraRootProps>) {
  const viewer = useOmbraViewer(options);
  const { phase, open, index, count, zoom } = viewer;
  const { registerItem } = useOmbraRoot();
  const reduced = useReducedMotion();
  const [view, sendView] = useReducerWithBailout(viewReducer, initialViewState);
  const { sharpIds, stripOverflows } = view;
  const stripRef = useRef<HTMLDivElement>(null);
  const active = items[index];

  // The slides only mount with the viewer, so the gallery registers its collection in the
  // order of `items`. Registered without nodes, that order holds even when a trigger leaves
  // the page, which would otherwise move its item in the document-ordered list.
  useLayoutEffect(() => {
    const stops = items.map((item) => registerItem(item.id));

    return () => {
      for (const stop of stops) stop();
    };
  }, [items, registerItem]);

  useLayoutEffect(() => {
    if (!open) return;

    let cancelled = false;

    // Decode the neighbors before they enter the viewport, and retain decoded
    // sources so changing selection never downgrades an outgoing photo.
    for (const item of items.slice(Math.max(0, index - 1), index + 2)) {
      const loader = new Image();

      loader.sizes = "100vw";
      loader.srcset = item.srcSet;
      loader.src = item.src;

      void loader.decode().then(
        () => {
          if (cancelled) return;

          sendView({ type: "decoded", id: item.id });
        },
        () => undefined,
      );
    }

    return () => {
      cancelled = true;
    };
  }, [open, index, items]);

  useLayoutEffect(() => {
    const strip = stripRef.current;

    if (!open || !strip) return;

    const row = strip.querySelector<HTMLElement>("[data-slot=ombra-thumbnails-row]");

    if (!row) return;

    const measure = () => {
      const style = getComputedStyle(row);

      const pad = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);

      const content = row.scrollWidth - pad;

      sendView({ type: "strip-measured", overflows: content > strip.clientWidth + 1 });
    };

    measure();

    const observer = new ResizeObserver(measure);

    observer.observe(strip);

    return () => {
      observer.disconnect();
    };
  }, [open, phase, items.length, stripOverflows]);

  useLayoutEffect(() => {
    const strip = stripRef.current;

    if (!open || !strip) return;

    const current = strip.querySelector<HTMLElement>("[data-active=true]");

    if (!current) return;

    const delta = current.getBoundingClientRect().left - strip.getBoundingClientRect().left;
    const left = strip.scrollLeft + delta - (strip.clientWidth - current.clientWidth) / 2;

    strip.scrollTo({ left: Math.max(0, left), behavior: reduced ? "auto" : "smooth" });
  }, [index, open, phase, reduced, stripOverflows]);

  return (
    <div
      data-slot="ombra-root"
      data-spring={options.spring ? "on" : "off"}
      className={cn("text-foreground", className)}
    >
      {viewer.morphStyles}
      <div className="columns-2 gap-3 md:columns-3">
        {items.map((item) => (
          <OmbraTrigger
            key={item.id}
            itemId={item.id}
            className="relative mb-3 block w-full break-inside-avoid overflow-hidden rounded-[6px] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:inset-ring after:inset-ring-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            style={{ aspectRatio: item.frame }}
          >
            <img
              src={item.thumbSrc}
              srcSet={item.srcSet}
              sizes="(min-width: 768px) 30vw, 50vw"
              alt={item.alt}
              width={item.width}
              height={item.height}
              className="h-full w-full rounded-[inherit] object-cover"
            />
          </OmbraTrigger>
        ))}
      </div>

      <p className="mt-10 max-w-xl text-sm leading-6 text-foreground/70">
        Photographs from Unsplash, used under the Unsplash License. Thumbnails are cover crops; the
        viewer shows the full frame.
      </p>

      {/* OmbraRoot supplies the Base UI dialog root, shared with the triggers above. */}
      <OmbraPortal>
        <OmbraBackdrop {...viewer.backdropProps} />
        <OmbraContent
          {...viewer.contentProps}
          data-slot="ombra-viewer"
          className={cn("p-0", viewer.contentProps.className)}
        >
          <Dialog.Title className="sr-only">{active?.alt ?? "Photo"}</Dialog.Title>
          <Dialog.Description className="sr-only">{active?.caption ?? ""}</Dialog.Description>
          <div data-slot="ombra-sheet" className="flex min-h-0 min-w-0 flex-1 flex-col">
            <header className="flex touch-none flex-col gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col items-start gap-2">
                  <p
                    data-slot="ombra-counter"
                    className="font-mono text-xs tracking-wide text-(--ombra-ink)/80"
                  >
                    {index + 1} / {count}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <IconButton
                    label="Zoom out"
                    slot="ombra-zoom-out"
                    onClick={() => zoom.zoomOut()}
                    disabled={!zoom.zoomed}
                  >
                    <MinusIcon />
                  </IconButton>
                  <IconButton label="Zoom in" slot="ombra-zoom-in" onClick={() => zoom.zoomIn()}>
                    <PlusIcon />
                  </IconButton>
                  <OmbraClose aria-label="Close">
                    <CloseIcon />
                  </OmbraClose>
                </div>
              </div>
            </header>

            <div className="relative min-h-0 min-w-0 flex-1">
              <OmbraSlides>
                {items.map((item, itemIndex) => {
                  const sharp = sharpIds.has(item.id);
                  const current = itemIndex === index;

                  return (
                    <OmbraSlide
                      key={item.id}
                      itemId={item.id}
                      aria-label={`${itemIndex + 1} of ${count}`}
                    >
                      {/* Keep Safari's native double-tap zoom off this surface.
                            The ancestor track still owns horizontal scrolling. */}
                      <div
                        ref={current ? viewer.layerRef : undefined}
                        data-slot="ombra-zoom"
                        className="flex h-full min-h-0 w-full min-w-0 touch-manipulation items-center justify-center"
                      >
                        <OmbraMedia
                          width={item.width}
                          height={item.height}
                          className="rounded-[6px] outline outline-1 -outline-offset-1 outline-(--ombra-ink)/10"
                        >
                          <img
                            data-slot="ombra-image"
                            data-active={current ? "true" : "false"}
                            src={sharp ? item.src : item.thumbSrc}
                            srcSet={sharp ? item.srcSet : undefined}
                            sizes="100vw"
                            alt=""
                            width={item.width}
                            height={item.height}
                            draggable={false}
                            fetchPriority={current ? "high" : "low"}
                            className="rounded-[inherit]"
                          />
                        </OmbraMedia>
                      </div>
                    </OmbraSlide>
                  );
                })}
              </OmbraSlides>
              <div
                data-slot="ombra-nav"
                className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2"
              >
                <IconButton
                  label="Previous photo"
                  slot="ombra-prev"
                  className="pointer-events-auto bg-(--ombra-surface)/40"
                  disabled={index === 0}
                  onClick={() => viewer.step(-1)}
                >
                  <Chevron direction="left" />
                </IconButton>
              </div>
              <div
                data-slot="ombra-nav"
                className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2"
              >
                <IconButton
                  label="Next photo"
                  slot="ombra-next"
                  className="pointer-events-auto bg-(--ombra-surface)/40"
                  disabled={index === count - 1}
                  onClick={() => viewer.step(1)}
                >
                  <Chevron direction="right" />
                </IconButton>
              </div>
            </div>

            <footer className="px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <p
                data-slot="ombra-caption"
                className="mb-3 touch-none text-center text-sm text-(--ombra-ink)/80"
              >
                {active?.caption}
              </p>
              <div
                ref={stripRef}
                data-slot="ombra-thumbnails"
                data-overflowing={stripOverflows ? "true" : "false"}
                className={cn(
                  "touch-pan-x overflow-x-auto overflow-y-hidden py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                  stripOverflows && "snap-x snap-mandatory",
                )}
              >
                <div
                  data-slot="ombra-thumbnails-row"
                  className={cn(
                    "mx-auto flex w-max gap-2",
                    stripOverflows ? "px-[max(0.25rem,calc(50%-1.375rem))]" : "px-1",
                  )}
                >
                  {items.map((item, itemIndex) => {
                    const selected = itemIndex === index;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-slot="ombra-thumbnail"
                        data-active={selected ? "true" : "false"}
                        aria-current={selected ? "true" : undefined}
                        aria-label={item.alt}
                        onClick={() => viewer.goTo(itemIndex, reduced ? "auto" : "smooth")}
                        className={cn(
                          "size-11 shrink-0 snap-center overflow-hidden rounded-lg border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current",
                          selected ? "border-current" : "border-transparent opacity-60",
                        )}
                      >
                        <img
                          src={item.thumbSrc}
                          alt=""
                          className="h-full w-full rounded-[6px] object-cover outline outline-1 -outline-offset-1 outline-(--ombra-ink)/10"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
              <span data-slot="ombra-strip-edge-start" aria-hidden="true" className="hidden" />
              <span data-slot="ombra-strip-edge-end" aria-hidden="true" className="hidden" />
              <style data-slot="ombra-strip-edge-styles">{stripEdgeStyles}</style>
            </footer>
          </div>
          <p role="status" data-slot="ombra-live" className="sr-only">
            {open ? `${index + 1} of ${count}. ${active?.caption ?? ""}` : ""}
          </p>
        </OmbraContent>
      </OmbraPortal>
    </div>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
      <path
        d={direction === "left" ? "M12 4 L6 10 L12 16" : "M8 4 L14 10 L8 16"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
      <path
        d="M10 4 V16 M4 10 H16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
      <path
        d="M4 10 H16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
      <path
        d="M5 5 L15 15 M15 5 L5 15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
