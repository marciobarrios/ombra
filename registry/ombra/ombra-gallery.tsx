"use client";

import { Dialog } from "@base-ui/react/dialog";
import { cn } from "cn";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  indexFromScroll,
  mostlyVisible,
  poseBetween,
  RESTING_POSE,
  revealElement,
  uncropBox,
} from "./geometry";
import { startFrameSampler } from "./frame-sampler";
import type { FrameSampler } from "./frame-sampler";
import {
  MORPH_EASING,
  VIEW_TRANSITION_NAME,
  continueAnimation,
  flightVisibleBox,
  mountFlight,
  playFlight,
  readPose,
  readViewTransitionBox,
  rebaseFlight,
  retireFlight,
  runViewTransition,
  supportsViewTransitions,
  viewTransitionFaded,
  viewTransitionRemaining,
  watchSettled,
} from "./morph";
import type { Flight } from "./morph";
import { MORPH_SPRING, normalizeVelocity, springCurve } from "./spring";
import type { Box, FlipPose, FrameSample, MorphEngine, OmbraItem } from "./types";
import { motionDuration } from "./types";
import { fitToVisualViewport, usePageZoomGuard } from "./use-page-zoom-guard";
import { usePull } from "./use-pull";
import { useReducedMotion } from "./use-reduced-motion";
import { useZoom } from "./use-zoom";

const ENGINE_OPTIONS: { id: MorphEngine; label: string }[] = [
  { id: "vt", label: "View Transition" },
  { id: "flip", label: "FLIP" },
  { id: "fade", label: "Fade" },
];

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
      background: linear-gradient(to right, black, transparent);
    }

    [data-slot="ombra-viewer"] footer:has([data-overflowing="true"]) [data-slot="ombra-strip-edge-end"] {
      right: 1rem;
      background: linear-gradient(to left, black, transparent);
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

type Phase = "closed" | "opening" | "open" | "closing";

// The end of a close is a sliver of spring overshoot, moving too little to see. It
// would keep the page locked and read a swipe as a reversal, so a close ends here.
const ARRIVED_PX = 1.5;
const FADED_OPACITY = 0.02;

/** The rest of an opening morph, running on the real photo after a swipe took over. */
type HeroMorph = { index: number; hero: HTMLImageElement; animations: Animation[] };

// Placing the track and snapping can land a fraction of a pixel off.
const SWIPE_START_PX = 2;

export type OmbraGalleryProps = {
  items: readonly OmbraItem[];
  engine: MorphEngine;
  slow: boolean;
  spring: boolean;
  onEngineChange: (engine: MorphEngine) => void;
  onSlowChange: (slow: boolean) => void;
  onSpringChange: (spring: boolean) => void;
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

function imageChild(element: HTMLElement): HTMLImageElement | null {
  const child = element.querySelector("img");

  if (child instanceof HTMLImageElement) return child;

  return null;
}

function EngineSwitch({
  engine,
  onEngineChange,
}: {
  engine: MorphEngine;
  onEngineChange: (engine: MorphEngine) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Morph engine"
      data-slot="ombra-engine"
      className="flex flex-wrap rounded-full bg-black/5 p-1"
    >
      {ENGINE_OPTIONS.map((option) => {
        const selected = option.id === engine;

        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onEngineChange(option.id)}
            className={cn(
              "min-h-11 rounded-full px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2",
              selected
                ? "bg-[#241e18] text-[#f6f1ea]"
                : "text-[#241e18] focus-visible:outline-[#8f3d2b]",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SpringToggle({
  spring,
  onSpringChange,
}: {
  spring: boolean;
  onSpringChange: (spring: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={spring}
      data-slot="ombra-spring"
      onClick={() => onSpringChange(!spring)}
      className={cn(
        "min-h-11 rounded-full px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8f3d2b]",
        spring ? "bg-[#241e18] text-[#f6f1ea]" : "text-[#241e18]",
      )}
    >
      Spring
    </button>
  );
}

type MorphKind = "open" | "close";

function formatSample(sample: FrameSample | undefined): string {
  if (!sample) return "–";

  return `${sample.longestMs.toFixed(1)} ms / ${sample.dropped} @ ${sample.intervalMs.toFixed(1)} ms`;
}

function FrameReadout({
  samples,
  engine,
}: {
  samples: Partial<Record<MorphKind, FrameSample>>;
  engine: MorphEngine;
}) {
  return (
    <div
      data-slot="ombra-readout"
      className="pointer-events-none w-max rounded-md bg-black/80 px-3 py-2 font-mono text-[11px] leading-4 text-white"
    >
      <div>Longest frame / dropped @ frame interval</div>
      <div data-slot="ombra-readout-open">Open {formatSample(samples.open)}</div>
      <div data-slot="ombra-readout-close">Close {formatSample(samples.close)}</div>
      <div>Engine {engine}</div>
    </div>
  );
}

function IconButton({
  label,
  className,
  onClick,
  disabled,
  buttonRef,
  slot,
  children,
  close,
}: {
  label: string;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  buttonRef?: RefObject<HTMLButtonElement | null>;
  slot: string;
  children: ReactNode;
  close?: boolean;
}) {
  const classes = cn(
    // Repeated toolbar taps must not invoke Safari's native double-tap zoom.
    // The viewer's pan-x pan-y ancestor also removes native pinch here (MAR-80).
    "inline-flex size-11 touch-manipulation items-center justify-center rounded-full text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-30",
    className,
  );

  if (close) {
    return (
      <Dialog.Close ref={buttonRef} data-slot={slot} aria-label={label} className={classes}>
        {children}
      </Dialog.Close>
    );
  }

  return (
    <button
      ref={buttonRef}
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
  items,
  engine,
  slow,
  spring,
  onEngineChange,
  onSlowChange,
  onSpringChange,
  className,
}: OmbraGalleryProps) {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("closed");
  const [index, setIndex] = useState(0);
  const [animEpoch, setAnimEpoch] = useState(0);
  const [readout, setReadout] = useState<Partial<Record<MorphKind, FrameSample>>>({});
  const [sharpIds, setSharpIds] = useState<ReadonlySet<string>>(() => new Set());
  const [stripOverflows, setStripOverflows] = useState(false);
  const [releaseScroll, setReleaseScroll] = useState(false);

  const triggers = useRef<Array<HTMLButtonElement | null>>([]);
  const images = useRef<Array<HTMLImageElement | null>>([]);
  const slides = useRef<Array<HTMLDivElement | null>>([]);
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackNode, setTrackNode] = useState<HTMLDivElement | null>(null);
  const trackCleanup = useRef<(() => void) | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const backdropAnimationRef = useRef<Animation | null>(null);
  const popupAnimationRef = useRef<Animation | null>(null);
  const sheetAnimationRef = useRef<Animation | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<{ unmount: () => void; close: () => void } | null>(null);
  const flightRef = useRef<Flight | null>(null);
  const retiringFlightRef = useRef<Flight | null>(null);
  const closeInputRef = useRef<(() => void) | null>(null);
  const vtClosingRef = useRef(false);
  const resumeRef = useRef<{ backdrop: number; popup: number } | null>(null);
  const preserveFlightRef = useRef(false);
  const heroMorphRef = useRef<HeroMorph | null>(null);
  const stopTrackWatchRef = useRef<(() => void) | null>(null);
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
  const settledRef = useRef(true);
  const zoomGestureRef = useRef(false);
  const samplerRef = useRef<FrameSampler | null>(null);
  const sampleKindRef = useRef<MorphKind>("open");
  const vtRef = useRef<ViewTransition | null>(null);
  const seenIndex = useRef(index);
  const navigationTarget = useRef<number | null>(null);

  phaseRef.current = phase;
  indexRef.current = index;
  engineRef.current = engine;
  slowRef.current = slow;
  springRef.current = spring;
  reducedRef.current = reduced;

  const effective: MorphEngine = reduced ? "fade" : engine;
  const count = items.length;
  const active = items[index];

  const settleTrack = () => {
    const track = trackRef.current;
    const nearest = track ? indexFromScroll(track) : indexRef.current;
    const slide = slides.current[nearest];

    slide?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: reducedRef.current ? "auto" : "smooth",
    });
    setIndex((current) => (current === nearest ? current : nearest));
  };

  const zoom = useZoom(
    trackRef,
    layerRef,
    open && phase === "open",
    settleTrack,
    spring,
    slow,
    reduced,
    zoomGestureRef,
  );

  // Before the morph layout effects, so FLIP measures the viewer where it is shown.
  usePageZoomGuard(open, popupRef);

  // A FLIP or fade opening can be cut by a downward drag. A view transition opening
  // hands its presses to the root, which already dismisses as an outside press.
  const pullCutsOpening = phase === "opening" && driverRef.current !== "vt";

  const pulling = usePull(
    trackNode,
    open && (phase === "open" || pullCutsOpening) && !zoom.zoomed,
    pullCutsOpening,
    settledRef,
    reduced,
    slow,
    spring,
    (velocity) => {
      flickRef.current = velocity;
      requestClose();
    },
  );

  const zoomRef = useRef(zoom);

  zoomRef.current = zoom;

  useLayoutEffect(() => {
    if (seenIndex.current === index) return;

    seenIndex.current = index;
    zoomRef.current.reset();
  }, [index]);

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

          setSharpIds((current) => {
            if (current.has(item.id)) return current;

            return new Set([...current, item.id]);
          });
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

      setStripOverflows((current) => {
        const next = content > strip.clientWidth + 1;

        return current === next ? current : next;
      });
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

  const bindTrack = useCallback((node: HTMLDivElement | null) => {
    trackRef.current = node;
    setTrackNode(node);
    navigationTarget.current = null;
    const previous = trackCleanup.current;

    previous?.();
    trackCleanup.current = null;

    if (!node) return;

    settledRef.current = true;

    let timer = 0;

    const publish = () => {
      if (zoomGestureRef.current) return;

      const next = indexFromScroll(node);

      setIndex((current) => (current === next ? current : next));
    };

    const settle = () => {
      settledRef.current = true;
      navigationTarget.current = null;
      publish();
    };

    const onScroll = () => {
      settledRef.current = false;
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, 140);
      publish();
    };

    const onScrollEnd = () => {
      window.clearTimeout(timer);
      settle();
    };

    const onTrackInput = () => {
      navigationTarget.current = null;
    };

    node.addEventListener("scroll", onScroll, { passive: true });
    node.addEventListener("scrollend", onScrollEnd);
    node.addEventListener("wheel", onTrackInput, { passive: true });
    node.addEventListener("pointerdown", onTrackInput, { passive: true });
    trackCleanup.current = () => {
      node.removeEventListener("scroll", onScroll);
      node.removeEventListener("scrollend", onScrollEnd);
      node.removeEventListener("wheel", onTrackInput);
      node.removeEventListener("pointerdown", onTrackInput);
      window.clearTimeout(timer);
    };
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

          setPhase("open");
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
      const item = items[itemIndex];
      const slide = slides.current[itemIndex];
      const origin = originRef.current;

      if (!item || !slide || !origin) {
        retry(runOpen);

        return;
      }

      placeTrack(itemIndex);

      const home = containBox(boxFromRect(slide.getBoundingClientRect()), item.width / item.height);
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

      releaseSheetHold(timing.duration, timing.easing);
      fadeBackdrop(resume?.backdrop ?? 0, 1, timing.duration, timing.easing);

      if (driverRef.current === "fade") {
        fadePopup(resume?.popup ?? 0, 1, timing.duration, () => {
          if (!alive || tokenRef.current !== token) return;

          endSample();
          setPhase("open");
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

      const hero = images.current[itemIndex];

      if (hero) hero.style.visibility = "hidden";

      const settle = () => {
        if (!alive || tokenRef.current !== token) return;

        if (hero) hero.style.visibility = "";

        settleOpen(itemIndex);
      };

      void playFlight(flight, startPose, RESTING_POSE, timing.duration, timing.easing).then(
        (completed) => {
          if (completed) settle();
        },
      );

      watchTrackForSwipe(() => {
        void handOffFlight(itemIndex)?.finished.then(settle, () => undefined);
      });
    }

    function runClose() {
      restoreVisibility();

      const itemIndex = indexRef.current;
      const item = items[itemIndex];
      const trigger = triggers.current[itemIndex];

      if (!item || !trigger) {
        retry(runClose);

        return;
      }

      const revealed = revealElement(trigger);
      const thumb = imageChild(trigger);
      const fade = driverRef.current === "fade" || revealed === "hidden" || !thumb;
      const flick = flickRef.current;

      flickRef.current = 0;

      if (fade) {
        flightRef.current?.destroy();
        flightRef.current = null;
        const fadeDuration = motionDuration(200, slowRef.current, reducedRef.current);

        fadeBackdrop(1, 0, fadeDuration);
        fadePopup(1, 0, fadeDuration, () => {
          if (!alive || tokenRef.current !== token) return;

          endSample();
          finishClose();
        });

        return;
      }

      const slide = slides.current[itemIndex];

      const pull = Number(
        document.documentElement.style.getPropertyValue("--ombra-pull-live") || "0",
      );

      const pulledBox = slide
        ? containBox(boxFromRect(slide.getBoundingClientRect()), item.width / item.height)
        : null;

      document.documentElement.style.setProperty("--ombra-pull-live", "0");

      const home = slide
        ? containBox(boxFromRect(slide.getBoundingClientRect()), item.width / item.height)
        : flightRef.current?.home;

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
      const scrimFrom = 1 - Math.min(1, Math.max(0, pull)) * 0.7;
      const hero = images.current[itemIndex];

      if (hero) hero.style.visibility = "hidden";

      hideThumb(itemIndex);
      fadeBackdrop(scrimFrom, 0, timing.duration, timing.easing);
      fadePopup(1, 0, timing.duration, null, springRef.current ? timing.easing : "ease-out");

      let from: FlipPose = RESTING_POSE;
      let flight = flightRef.current;

      if (flight) {
        from = flight.hold();
      } else if (pulledBox && pull > 0.02) {
        from = poseBetween(pulledBox, home, { inline: 0, block: 0 });
      }

      if (!flight) {
        flight = mountFlight(home, from, cachedSrc(itemIndex));
        flightRef.current = flight;
      }

      void playFlight(flight, from, endPose, timing.duration, timing.easing).then((completed) => {
        if (!alive || tokenRef.current !== token || !completed) return;

        showThumb(itemIndex);
        flightRef.current?.destroy();
        flightRef.current = null;
        endSample();
        finishClose();
      });

      armCloseInput(
        () =>
          boxDistance(flightVisibleBox(flight), thumbBox) < ARRIVED_PX &&
          opacityOf(backdropRef.current) < FADED_OPACITY &&
          opacityOf(popupRef.current) < FADED_OPACITY,
        () => {
          backdropAnimationRef.current?.finish();
          popupAnimationRef.current?.finish();
          flight.animation?.finish();
        },
      );
    }
    // The animation reads refs on purpose so a re-render does not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, animEpoch]);

  function beginSample(kind: MorphKind) {
    samplerRef.current?.stop();
    sampleKindRef.current = kind;
    samplerRef.current = startFrameSampler();
  }

  function endSample() {
    const sample = samplerRef.current?.stop() ?? null;

    samplerRef.current = null;

    if (sample && sample.frames > 1) {
      const kind = sampleKindRef.current;

      setReadout((current) => ({ ...current, [kind]: sample }));
    }
  }

  function cachedSrc(itemIndex: number): string {
    const trigger = triggers.current[itemIndex];
    const thumb = trigger ? imageChild(trigger) : null;
    const item = items[itemIndex];

    return thumb?.currentSrc || item?.thumbSrc || "";
  }

  function hideThumb(itemIndex: number) {
    const trigger = triggers.current[itemIndex];
    const thumb = trigger ? imageChild(trigger) : null;

    if (thumb) thumb.style.visibility = "hidden";
  }

  function showThumb(itemIndex: number) {
    const trigger = triggers.current[itemIndex];
    const thumb = trigger ? imageChild(trigger) : null;

    if (thumb) thumb.style.visibility = "";
  }

  function restoreVisibility() {
    for (const trigger of triggers.current) {
      const thumb = trigger ? imageChild(trigger) : null;

      if (thumb) thumb.style.visibility = "";
    }

    for (const image of images.current) {
      if (image) image.style.visibility = "";
    }
  }

  function sheetElement(): HTMLElement | null {
    const sheet = popupRef.current?.querySelector("[data-slot=ombra-sheet]");

    if (sheet instanceof HTMLElement) return sheet;

    return null;
  }

  function holdPulledSheet(pull: number) {
    sheetAnimationRef.current?.cancel();
    sheetAnimationRef.current = null;

    if (pull <= 0.02) return;

    const sheet = sheetElement();

    if (!sheet) return;

    sheet.style.transform = `translate3d(0, ${pull * 22}dvh, 0) scale(${1 - pull * 0.07})`;
    sheet.style.transformOrigin = "center center";
    sheet.style.borderRadius = `${pull * 24}px`;
  }

  function clearSheetHold() {
    const sheet = sheetElement();

    if (!sheet) return;

    sheet.style.transform = "";
    sheet.style.transformOrigin = "";
    sheet.style.borderRadius = "";
  }

  // A reversed pull dismissal starts with the sheet still held at the drag pose.
  function releaseSheetHold(duration: number, easing: string) {
    const sheet = sheetElement();
    const transform = sheet?.style.transform;
    const borderRadius = sheet?.style.borderRadius;

    clearSheetHold();

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
    heroMorphRef.current = null;
    showThumb(itemIndex);
    flightRef.current?.destroy();
    flightRef.current = null;
    endSample();
    setPhase("open");
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

    return [...(parts ?? [])].filter((part) => !part.contains(hero));
  }

  function revealHero(hero: HTMLImageElement, src: string) {
    // A swipe can arrive before the slide's own source has loaded. The thumbnail
    // the morph started from is already decoded, and the sharp source replaces it.
    if (!hero.complete || hero.naturalWidth === 0) hero.src = src;

    hero.style.visibility = "";
  }

  // The hero lives in the scroller, so it follows a native swipe with no lag. It
  // takes over the clone's animation at the same moment, which keeps it on the same
  // pixels. The popup fade would turn it translucent, so that moves to the rest.
  function handOffFlight(itemIndex: number): Animation | null {
    const flight = flightRef.current;
    const hero = images.current[itemIndex];
    const flying = flight?.animation;

    if (!flight || !hero || !flying) return null;

    const morph = continueAnimation(flying, hero);

    if (!morph) return null;

    const animations = [morph];

    for (const fade of popupRef.current?.getAnimations() ?? []) {
      for (const part of viewerPartsAround(hero)) {
        const moved = continueAnimation(fade, part);

        if (moved) animations.push(moved);
      }

      fade.cancel();
    }

    revealHero(hero, flight.element.src);
    flight.destroy();
    flightRef.current = null;
    heroMorphRef.current = { index: itemIndex, hero, animations };

    return morph;
  }

  // A view transition cannot move onto an element, so this restarts from its live
  // frame and scrim. The curve changes, but the photo stays on the same pixels.
  function handOffViewTransition(itemIndex: number, token: number) {
    const item = items[itemIndex];
    const hero = images.current[itemIndex];
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

    const morph = hero.animate(
      [
        { transform: pose.transform, clipPath: pose.clipPath },
        { transform: RESTING_POSE.transform, clipPath: RESTING_POSE.clipPath },
      ],
      timing,
    );

    const fades = viewerPartsAround(hero).map((part) =>
      part.animate([{ opacity: scrim }, { opacity: 1 }], timing),
    );

    heroMorphRef.current = { index: itemIndex, hero, animations: [morph, ...fades] };
    hideThumb(itemIndex);
    hero.style.viewTransitionName = "";
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

  useLayoutEffect(
    () => () => {
      stopTrackWatch();
      cancelHeroMorph();
    },
    // Only refs are read, and this only runs on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function placeTrack(itemIndex: number) {
    scrollTrackTo(itemIndex, "auto");
  }

  function scrollTrackTo(itemIndex: number, behavior: ScrollBehavior) {
    const track = trackRef.current;
    const slide = slides.current[itemIndex];

    if (!track || !slide) return;

    const delta = slide.getBoundingClientRect().left - track.getBoundingClientRect().left;
    const left = track.scrollLeft + delta - (track.clientWidth - slide.clientWidth) / 2;

    track.scrollTo({ left: Math.max(0, left), behavior });
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
    clearSheetHold();
    document.documentElement.style.setProperty("--ombra-pull-live", "0");

    for (const trigger of triggers.current) {
      const thumb = trigger ? imageChild(trigger) : null;

      if (thumb) thumb.style.visibility = "";
    }

    for (const image of images.current) {
      if (image) image.style.visibility = "";
    }

    restoreFocusRef.current = true;
    setOpen(false);
    setPhase("closed");
  }

  useLayoutEffect(() => {
    if (open || phase !== "closed") return;

    actionsRef.current?.unmount();

    if (!restoreFocusRef.current) return;

    restoreFocusRef.current = false;
    const trigger = triggers.current[indexRef.current];

    requestAnimationFrame(() => {
      trigger?.focus();
    });
  }, [open, phase]);

  function stopCloseInput() {
    closeInputRef.current?.();
    closeInputRef.current = null;
  }

  useEffect(() => stopCloseInput, []);

  function armCloseInput(arrived: () => boolean, finish: () => void) {
    stopCloseInput();

    const stopInput = listenForCloseInput({
      onReverse: (speed) => reopenFromClose(indexRef.current, speed),
      onTap: (x, y) => {
        const itemIndex = closeTapTarget(x, y);

        return itemIndex !== null && reopenFromClose(itemIndex, 0);
      },
    });

    const stopWatching = watchSettled(arrived, finish);

    closeInputRef.current = () => {
      stopInput();
      stopWatching();
    };
  }

  function closeTapTarget(x: number, y: number): number | null {
    const flight = flightRef.current;

    const live = vtClosingRef.current
      ? readViewTransitionBox()
      : flight && flightVisibleBox(flight);

    // The flying photo covers whatever is under it, so it wins the hit test.
    if (live && boxContains(live, x, y)) return indexRef.current;

    const itemIndex = triggers.current.findIndex(
      (trigger) => trigger && boxContains(boxFromRect(trigger.getBoundingClientRect()), x, y),
    );

    return itemIndex < 0 ? null : itemIndex;
  }

  function reopenFromClose(nextIndex: number, speed: number): boolean {
    const closingIndex = indexRef.current;
    const same = nextIndex === closingIndex;
    let resume = { backdrop: opacityOf(backdropRef.current), popup: opacityOf(popupRef.current) };

    if (vtClosingRef.current) {
      const item = items[closingIndex];
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
    openAt(nextIndex, true);

    return true;
  }

  function openAt(nextIndex: number, handoff = false) {
    const trigger = triggers.current[nextIndex];
    const thumb = trigger ? imageChild(trigger) : null;

    if (!trigger || !thumb) return;

    vtRef.current?.skipTransition();
    driverRef.current = reducedRef.current ? "fade" : engineRef.current;
    originRef.current = boxFromRect(thumb.getBoundingClientRect());

    if (!handoff && driverRef.current === "vt" && supportsViewTransitions() && !flightRef.current) {
      openWithViewTransition(nextIndex, thumb);

      return;
    }

    // The FLIP effect bails while the driver is still "vt", which leaves the
    // dialog stuck in "opening" when View Transitions are unavailable.
    if (driverRef.current === "vt") driverRef.current = "flip";

    preserveFlightRef.current = flightRef.current !== null;
    tokenRef.current += 1;
    setAnimEpoch((value) => value + 1);
    setIndex(nextIndex);
    setOpen(true);
    setPhase("opening");
  }

  function openWithViewTransition(nextIndex: number, thumb: HTMLImageElement) {
    const token = ++tokenRef.current;
    const timing = morphTiming(480, 0);

    beginSample("open");
    document.documentElement.style.setProperty("--ombra-vt-duration", `${timing.duration}ms`);
    document.documentElement.style.setProperty("--ombra-vt-easing", timing.easing);
    // The pseudo-elements would otherwise swallow a swipe aimed at the track. iOS Safari
    // still blocks it until the transition ends, which is accepted because VT is optional.
    document.documentElement.style.setProperty("--ombra-vt-pointer-events", "none");
    thumb.style.viewTransitionName = VIEW_TRANSITION_NAME;

    const transition = runViewTransition(() => {
      thumb.style.viewTransitionName = "";
      flushSync(() => {
        setIndex(nextIndex);
        setOpen(true);
        setPhase("opening");
      });

      const hero = images.current[nextIndex];

      if (hero) hero.style.viewTransitionName = VIEW_TRANSITION_NAME;

      placeTrack(nextIndex);
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
        thumb.style.viewTransitionName = "";

        const hero = images.current[nextIndex];

        if (hero) hero.style.viewTransitionName = "";

        endSample();
        setPhase("open");
        vtRef.current = null;
      },
      () => {
        if (!settled()) return;

        stopTrackWatch();
        endSample();
        setPhase("open");
      },
    );
  }

  function requestClose() {
    if (phaseRef.current === "closed" || phaseRef.current === "closing") return;

    stopTrackWatch();
    document.documentElement.style.removeProperty("--ombra-vt-pointer-events");
    reclaimHeroMorph();
    driverRef.current = reducedRef.current ? "fade" : engineRef.current;
    vtRef.current?.skipTransition();

    const trigger = triggers.current[indexRef.current];
    const thumb = trigger ? imageChild(trigger) : null;
    const canMorph = trigger ? mostlyVisible(trigger) : false;

    setReleaseScroll(!canMorph);

    if (
      driverRef.current === "vt" &&
      supportsViewTransitions() &&
      canMorph &&
      thumb &&
      !flightRef.current
    ) {
      closeWithViewTransition(thumb);

      return;
    }

    // Same bail-out as open: an off-screen thumbnail, or a flight already in
    // the air, must fall through to FLIP/fade instead of staying on "vt".
    if (driverRef.current === "vt") driverRef.current = "flip";

    preserveFlightRef.current = flightRef.current !== null;
    tokenRef.current += 1;
    setAnimEpoch((value) => value + 1);
    setPhase("closing");
  }

  function closeWithViewTransition(thumb: HTMLImageElement) {
    const token = ++tokenRef.current;
    const hero = images.current[indexRef.current];
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

    if (hero) hero.style.viewTransitionName = VIEW_TRANSITION_NAME;

    const transition = runViewTransition(() => {
      if (hero) hero.style.viewTransitionName = "";

      flushSync(() => {
        setOpen(false);
        setPhase("closed");
      });
      actionsRef.current?.unmount();
      revealElement(thumb.parentElement instanceof HTMLElement ? thumb.parentElement : thumb);
      thumb.style.viewTransitionName = VIEW_TRANSITION_NAME;
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
        thumb.style.viewTransitionName = "";

        if (tokenRef.current !== token) return;

        stopCloseInput();
        vtClosingRef.current = false;
        endSample();
        vtRef.current = null;
        document.documentElement.style.setProperty("--ombra-pull-live", "0");
      },
      () => {
        thumb.style.viewTransitionName = "";

        if (tokenRef.current !== token) return;

        stopCloseInput();
        vtClosingRef.current = false;
        endSample();
        vtRef.current = null;
      },
    );
  }

  function goTo(nextIndex: number, behavior: ScrollBehavior) {
    if (nextIndex < 0 || nextIndex >= count) return;

    if (nextIndex === indexRef.current && navigationTarget.current === null) return;

    zoomRef.current.reset();
    navigationTarget.current = behavior === "smooth" ? nextIndex : null;

    // Smooth scrolling publishes the centered slide as it moves. Selecting the
    // destination now would flash its border before the first scroll event.
    if (behavior !== "smooth") setIndex(nextIndex);
    scrollTrackTo(nextIndex, behavior);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo((navigationTarget.current ?? indexRef.current) + 1, reduced ? "auto" : "smooth");
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo((navigationTarget.current ?? indexRef.current) - 1, reduced ? "auto" : "smooth");
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

  return (
    <div
      data-slot="ombra-root"
      data-spring={spring ? "on" : "off"}
      className={cn("text-[#241e18]", className)}
    >
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col items-start gap-3">
          <EngineSwitch engine={engine} onEngineChange={onEngineChange} />
          <FrameReadout samples={readout} engine={effective} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SpringToggle spring={spring} onSpringChange={onSpringChange} />
          <button
            type="button"
            aria-pressed={slow}
            data-slot="ombra-slow"
            onClick={() => onSlowChange(!slow)}
            className="min-h-11 rounded-full px-3 text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8f3d2b]"
          >
            {slow ? "Slow motion on" : "Slow motion"}
          </button>
        </div>
      </div>

      <div className="columns-2 gap-3 md:columns-3">
        {items.map((item, itemIndex) => (
          <button
            key={item.id}
            ref={(node) => {
              triggers.current[itemIndex] = node;
            }}
            type="button"
            data-slot="ombra-trigger"
            aria-haspopup="dialog"
            onClick={() => openAt(itemIndex)}
            className="relative mb-3 block w-full break-inside-avoid overflow-hidden rounded-[6px] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:inset-ring after:inset-ring-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8f3d2b]"
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
          </button>
        ))}
      </div>

      <p className="mt-10 max-w-xl text-sm leading-6 text-[#241e18]/70">
        Photographs from Unsplash, used under the Unsplash License. Thumbnails are cover crops; the
        viewer shows the full frame.
      </p>

      <Dialog.Root
        open={open}
        modal={phase === "closing" && releaseScroll ? false : true}
        actionsRef={actionsRef}
        onOpenChange={(next, details) => {
          if (next) return;

          details.preventUnmountOnClose();
          requestClose();
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop
            ref={bindBackdrop}
            data-slot="ombra-backdrop"
            className={cn(
              // No page pinch on the backdrop; page zoom returns after close.
              "fixed inset-0 z-50 touch-pan-x touch-pan-y bg-black",
              phase === "closing" && "pointer-events-none",
            )}
          />
          <Dialog.Popup
            ref={bindPopup}
            data-slot="ombra-viewer"
            data-engine={effective}
            data-phase={phase}
            data-zoomed={zoom.zoomed ? "true" : "false"}
            data-pulling={pulling ? "true" : "false"}
            initialFocus={closeRef}
            finalFocus={() => triggers.current[indexRef.current] ?? true}
            onKeyDown={onKeyDown}
            className={cn(
              // pan-x pan-y without pinch-zoom: the page under the viewer cannot pinch-zoom.
              // Descendants intersect with it; the track narrows it to pan-x for its own pinch.
              "fixed inset-0 z-50 flex h-dvh w-full touch-pan-x touch-pan-y flex-col overflow-hidden bg-transparent text-white outline-none",
              phase === "closing" && "pointer-events-none",
            )}
          >
            <Dialog.Title className="sr-only">{active?.alt ?? "Photo"}</Dialog.Title>
            <Dialog.Description className="sr-only">{active?.caption ?? ""}</Dialog.Description>
            <div data-slot="ombra-sheet" className="flex min-h-0 min-w-0 flex-1 flex-col">
              <header className="flex touch-none flex-col gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col items-start gap-2">
                    <p
                      data-slot="ombra-counter"
                      className="font-mono text-xs tracking-wide text-white/80"
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
                    <IconButton label="Close" slot="ombra-close" buttonRef={closeRef} close>
                      <CloseIcon />
                    </IconButton>
                  </div>
                </div>
              </header>

              <div className="relative min-h-0 min-w-0 flex-1">
                <div className="@container h-full min-w-0">
                  <div
                    ref={bindTrack}
                    data-slot="ombra-track"
                    className="flex h-full min-w-0 snap-x snap-mandatory items-stretch gap-4 overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                    <div aria-hidden="true" className="shrink-0 basis-[max(0px,calc(7cqi-1rem))]" />
                    {items.map((item, itemIndex) => {
                      const sharp = sharpIds.has(item.id);

                      return (
                        <div
                          key={item.id}
                          ref={(node) => {
                            slides.current[itemIndex] = node;
                          }}
                          data-slot="ombra-slide"
                          data-active={itemIndex === index ? "true" : "false"}
                          role="group"
                          aria-roledescription="slide"
                          aria-label={`${itemIndex + 1} of ${count}`}
                          className="flex h-full min-h-0 w-[86cqi] shrink-0 snap-center snap-always items-center justify-center"
                        >
                          {/* Keep Safari's native double-tap zoom off this surface.
                              The ancestor track still owns horizontal scrolling. */}
                          <div
                            ref={itemIndex === index ? layerRef : undefined}
                            data-slot="ombra-zoom"
                            className="flex h-full min-h-0 w-full min-w-0 touch-manipulation items-center justify-center"
                          >
                            <img
                              ref={(node) => {
                                images.current[itemIndex] = node;
                              }}
                              data-slot="ombra-image"
                              data-active={itemIndex === index ? "true" : "false"}
                              src={sharp ? item.src : item.thumbSrc}
                              srcSet={sharp ? item.srcSet : undefined}
                              sizes="100vw"
                              alt=""
                              width={item.width}
                              height={item.height}
                              draggable={false}
                              fetchPriority={itemIndex === index ? "high" : "low"}
                              className="h-auto max-h-full min-h-0 w-auto max-w-full min-w-0 rounded-[6px] object-contain outline outline-1 -outline-offset-1 outline-white/10"
                            />
                          </div>
                        </div>
                      );
                    })}
                    <div aria-hidden="true" className="shrink-0 basis-[max(0px,calc(7cqi-1rem))]" />
                  </div>
                </div>
                <div
                  data-slot="ombra-nav"
                  className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2"
                >
                  <IconButton
                    label="Previous photo"
                    slot="ombra-prev"
                    className="pointer-events-auto bg-black/40"
                    disabled={index === 0}
                    onClick={() =>
                      goTo((navigationTarget.current ?? index) - 1, reduced ? "auto" : "smooth")
                    }
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
                    className="pointer-events-auto bg-black/40"
                    disabled={index === count - 1}
                    onClick={() =>
                      goTo((navigationTarget.current ?? index) + 1, reduced ? "auto" : "smooth")
                    }
                  >
                    <Chevron direction="right" />
                  </IconButton>
                </div>
              </div>

              <footer className="px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <p
                  data-slot="ombra-caption"
                  className="mb-3 touch-none text-center text-sm text-white/80"
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
                          onClick={() => goTo(itemIndex, reduced ? "auto" : "smooth")}
                          className={cn(
                            "size-11 shrink-0 snap-center overflow-hidden rounded-lg border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                            selected ? "border-white" : "border-transparent opacity-60",
                          )}
                        >
                          <img
                            src={item.thumbSrc}
                            alt=""
                            className="h-full w-full rounded-[6px] object-cover outline outline-1 -outline-offset-1 outline-white/10"
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
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
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
