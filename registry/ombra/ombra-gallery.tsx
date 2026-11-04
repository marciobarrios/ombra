"use client";

import { Dialog } from "@base-ui/react/dialog";
import { cn } from "cn";
import { useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { flushSync } from "react-dom";

import {
  boxFromRect,
  containBox,
  coverCrop,
  indexFromScroll,
  mostlyVisible,
  poseBetween,
  RESTING_POSE,
  revealElement,
} from "./geometry";
import { startFrameSampler } from "./frame-sampler";
import type { FrameSampler } from "./frame-sampler";
import {
  MORPH_EASING,
  VIEW_TRANSITION_NAME,
  mountFlight,
  playFlight,
  runViewTransition,
  supportsViewTransitions,
} from "./morph";
import type { Flight } from "./morph";
import type { Box, FlipPose, FrameSample, MorphEngine, OmbraItem } from "./types";
import { motionDuration } from "./types";
import { usePull } from "./use-pull";
import { useReducedMotion } from "./use-reduced-motion";
import { useZoom } from "./use-zoom";

const ENGINE_OPTIONS: { id: MorphEngine; label: string }[] = [
  { id: "vt", label: "View Transition" },
  { id: "flip", label: "FLIP" },
  { id: "fade", label: "Fade" },
];

type Phase = "closed" | "opening" | "open" | "closing";

export type OmbraGalleryProps = {
  items: readonly OmbraItem[];
  engine: MorphEngine;
  slow: boolean;
  onEngineChange: (engine: MorphEngine) => void;
  onSlowChange: (slow: boolean) => void;
  className?: string;
};

function imageChild(element: HTMLElement): HTMLImageElement | null {
  const child = element.querySelector("img");

  if (child instanceof HTMLImageElement) return child;

  return null;
}

function EngineSwitch({
  engine,
  onEngineChange,
  tone,
}: {
  engine: MorphEngine;
  onEngineChange: (engine: MorphEngine) => void;
  tone: "paper" | "ink";
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Morph engine"
      data-slot="ombra-engine"
      className={cn(
        "flex flex-wrap rounded-full p-1",
        tone === "paper" ? "bg-black/5" : "bg-white/10",
      )}
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
              tone === "paper" && selected && "bg-[#241e18] text-[#f6f1ea]",
              tone === "paper" && !selected && "text-[#241e18] focus-visible:outline-[#8f3d2b]",
              tone === "ink" && selected && "bg-white text-[#241e18]",
              tone === "ink" && !selected && "text-white focus-visible:outline-white",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function FrameReadout({
  longest,
  dropped,
  engine,
}: {
  longest: string;
  dropped: string;
  engine: MorphEngine;
}) {
  return (
    <div
      data-slot="ombra-readout"
      className="pointer-events-none w-max rounded-md bg-black/80 px-3 py-2 font-mono text-[11px] leading-4 text-white"
    >
      <div>Longest frame {longest} ms</div>
      <div>Dropped (&gt;33 ms) {dropped}</div>
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
    "inline-flex size-11 items-center justify-center rounded-full text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-30",
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
  onEngineChange,
  onSlowChange,
  className,
}: OmbraGalleryProps) {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("closed");
  const [index, setIndex] = useState(0);
  const [animEpoch, setAnimEpoch] = useState(0);
  const [readout, setReadout] = useState<FrameSample | null>(null);
  const [sharpId, setSharpId] = useState<string | null>(null);
  const [stripOverflows, setStripOverflows] = useState(false);
  const [releaseScroll, setReleaseScroll] = useState(false);

  const triggers = useRef<Array<HTMLButtonElement | null>>([]);
  const images = useRef<Array<HTMLImageElement | null>>([]);
  const slides = useRef<Array<HTMLDivElement | null>>([]);
  const trackRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<{ unmount: () => void; close: () => void } | null>(null);
  const flightRef = useRef<Flight | null>(null);
  const preserveFlightRef = useRef(false);
  const tokenRef = useRef(0);
  const originRef = useRef<Box | null>(null);
  const phaseRef = useRef(phase);
  const indexRef = useRef(index);
  const engineRef = useRef(engine);
  const slowRef = useRef(slow);
  const reducedRef = useRef(reduced);
  const driverRef = useRef<MorphEngine>("flip");
  const settledRef = useRef(true);
  const samplerRef = useRef<FrameSampler | null>(null);
  const vtRef = useRef<ViewTransition | null>(null);
  const seenIndex = useRef(index);

  phaseRef.current = phase;
  indexRef.current = index;
  engineRef.current = engine;
  slowRef.current = slow;
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
  };

  const zoom = useZoom(trackRef, layerRef, open && phase === "open", settleTrack);

  const pulling = usePull(
    trackRef,
    open && phase === "open" && !zoom.zoomed,
    settledRef,
    reduced,
    slow,
    () => {
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

    const item = items[index];

    if (!item) return;

    let cancelled = false;
    const loader = new Image();

    loader.src = item.src;

    void loader.decode().then(
      () => {
        if (!cancelled) setSharpId(item.id);
      },
      () => undefined,
    );

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

  useLayoutEffect(() => {
    const track = trackRef.current;

    if (!open || !track) return;

    settledRef.current = true;

    let timer = 0;

    const commit = () => {
      settledRef.current = true;
      const next = indexFromScroll(track);

      setIndex((current) => (current === next ? current : next));
    };

    const onScroll = () => {
      settledRef.current = false;
      window.clearTimeout(timer);
      timer = window.setTimeout(commit, 140);
    };

    const onScrollEnd = () => {
      window.clearTimeout(timer);
      commit();
    };

    track.addEventListener("scroll", onScroll, { passive: true });
    track.addEventListener("scrollend", onScrollEnd);

    return () => {
      track.removeEventListener("scroll", onScroll);
      track.removeEventListener("scrollend", onScrollEnd);
      window.clearTimeout(timer);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (phase !== "opening" && phase !== "closing") return;

    if (driverRef.current === "vt") return;

    const token = tokenRef.current;
    let alive = true;
    let attempts = 0;

    beginSample();

    if (phase === "opening") runOpen();
    else runClose();

    return () => {
      alive = false;

      if (preserveFlightRef.current) {
        preserveFlightRef.current = false;
        flightRef.current?.hold();

        return;
      }

      flightRef.current?.destroy();
      flightRef.current = null;
    };

    function retry(again: () => void) {
      attempts += 1;

      if (attempts > 30) {
        endSample();

        if (phase === "opening") setPhase("open");
        else finishClose();

        return;
      }

      requestAnimationFrame(() => {
        if (!alive || tokenRef.current !== token) return;

        again();
      });
    }

    function runOpen() {
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
      const duration = motionDuration(480, slowRef.current, reducedRef.current);

      fadeBackdrop(0, 1, duration);

      if (driverRef.current === "fade") {
        fadePopup(0, 1, duration, () => {
          if (!alive || tokenRef.current !== token) return;

          endSample();
          setPhase("open");
        });

        return;
      }

      fadePopup(0, 1, duration, null);

      const crop = coverCrop(item.width, item.height, origin.width, origin.height);
      const from = poseBetween(origin, home, crop);
      const src = cachedSrc(itemIndex);
      const existing = flightRef.current;
      const startPose = existing ? existing.hold() : from;
      const flight = existing ?? mountFlight(home, from, src);

      flightRef.current = flight;
      hideThumb(itemIndex);

      const hero = images.current[itemIndex];

      if (hero) hero.style.visibility = "hidden";

      void playFlight(flight, startPose, RESTING_POSE, duration).then((completed) => {
        if (!alive || tokenRef.current !== token || !completed) return;

        if (hero) hero.style.visibility = "";

        showThumb(itemIndex);
        flightRef.current?.destroy();
        flightRef.current = null;
        endSample();
        setPhase("open");
      });
    }

    function runClose() {
      const itemIndex = indexRef.current;
      const item = items[itemIndex];
      const trigger = triggers.current[itemIndex];
      const duration = motionDuration(420, slowRef.current, reducedRef.current);

      if (!item || !trigger) {
        retry(runClose);

        return;
      }

      const revealed = revealElement(trigger);
      const thumb = imageChild(trigger);
      const fade = driverRef.current === "fade" || revealed === "hidden" || !thumb;

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

      const thumbBox = boxFromRect(thumb.getBoundingClientRect());
      const crop = coverCrop(item.width, item.height, thumbBox.width, thumbBox.height);
      const endPose = poseBetween(thumbBox, home, crop);
      const hero = images.current[itemIndex];

      if (hero) hero.style.visibility = "hidden";

      hideThumb(itemIndex);
      fadeBackdrop(1, 0, duration);
      fadePopup(1, 0, duration, null);

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

      void playFlight(flight, from, endPose, duration).then((completed) => {
        if (!alive || tokenRef.current !== token || !completed) return;

        showThumb(itemIndex);
        flightRef.current?.destroy();
        flightRef.current = null;
        endSample();
        finishClose();
      });
    }
    // The animation reads refs on purpose so a re-render does not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, animEpoch]);

  function beginSample() {
    samplerRef.current?.stop();
    samplerRef.current = startFrameSampler();
  }

  function endSample() {
    const sample = samplerRef.current?.stop() ?? null;

    samplerRef.current = null;

    if (sample && sample.frames > 1) setReadout(sample);
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

  function fadeBackdrop(from: number, to: number, duration: number) {
    const backdrop = backdropRef.current;

    if (!backdrop || duration <= 0) return;

    const animation = backdrop.animate([{ opacity: from }, { opacity: to }], {
      duration,
      easing: MORPH_EASING,
      fill: "forwards",
    });

    void animation.finished.then(
      () => {
        animation.cancel();
      },
      () => undefined,
    );
  }

  function fadePopup(from: number, to: number, duration: number, done: (() => void) | null) {
    const popup = popupRef.current;

    if (!popup || duration <= 0) {
      if (popup) popup.style.opacity = done ? "" : String(to);

      done?.();

      return;
    }

    const animation = popup.animate([{ opacity: from }, { opacity: to }], {
      duration,
      easing: "ease-out",
      fill: "forwards",
    });

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

  function openAt(nextIndex: number) {
    const trigger = triggers.current[nextIndex];
    const thumb = trigger ? imageChild(trigger) : null;

    if (!trigger || !thumb) return;

    vtRef.current?.skipTransition();
    driverRef.current = reducedRef.current ? "fade" : engineRef.current;
    originRef.current = boxFromRect(thumb.getBoundingClientRect());

    if (driverRef.current === "vt" && supportsViewTransitions() && !flightRef.current) {
      openWithViewTransition(nextIndex, thumb);

      return;
    }

    preserveFlightRef.current = flightRef.current !== null;
    tokenRef.current += 1;
    setAnimEpoch((value) => value + 1);
    setIndex(nextIndex);
    setOpen(true);
    setPhase("opening");
  }

  function openWithViewTransition(nextIndex: number, thumb: HTMLImageElement) {
    const token = ++tokenRef.current;
    const duration = motionDuration(480, slowRef.current, false);

    beginSample();
    document.documentElement.style.setProperty("--ombra-vt-duration", `${duration}ms`);
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
    });

    vtRef.current = transition;

    void transition?.finished.then(
      () => {
        if (tokenRef.current !== token) return;

        thumb.style.viewTransitionName = "";

        const hero = images.current[nextIndex];

        if (hero) hero.style.viewTransitionName = "";

        endSample();
        setPhase("open");
        vtRef.current = null;
      },
      () => {
        if (tokenRef.current !== token) return;

        endSample();
        setPhase("open");
      },
    );
  }

  function requestClose() {
    if (phaseRef.current === "closed" || phaseRef.current === "closing") return;

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

    preserveFlightRef.current = flightRef.current !== null;
    tokenRef.current += 1;
    setAnimEpoch((value) => value + 1);
    setPhase("closing");
  }

  function closeWithViewTransition(thumb: HTMLImageElement) {
    const token = ++tokenRef.current;
    const duration = motionDuration(420, slowRef.current, false);
    const hero = images.current[indexRef.current];

    beginSample();
    document.documentElement.style.setProperty("--ombra-vt-duration", `${duration}ms`);

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

    void transition?.finished.then(
      () => {
        thumb.style.viewTransitionName = "";

        if (tokenRef.current !== token) return;

        endSample();
        vtRef.current = null;
        document.documentElement.style.setProperty("--ombra-pull-live", "0");
      },
      () => {
        thumb.style.viewTransitionName = "";
        endSample();
      },
    );
  }

  function goTo(nextIndex: number, behavior: ScrollBehavior) {
    if (nextIndex < 0 || nextIndex >= count || nextIndex === indexRef.current) return;

    zoomRef.current.reset();
    setIndex(nextIndex);
    scrollTrackTo(nextIndex, behavior);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(indexRef.current + 1, "auto");
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(indexRef.current - 1, "auto");
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
      zoomRef.current.reset();
    }
  }

  const longest = readout ? readout.longestMs.toFixed(1) : "–";
  const dropped = readout ? String(readout.dropped) : "–";

  return (
    <div data-slot="ombra-root" className={cn("text-[#241e18]", className)}>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col items-start gap-3">
          <EngineSwitch engine={engine} tone="paper" onEngineChange={onEngineChange} />
          <FrameReadout longest={longest} dropped={dropped} engine={effective} />
        </div>
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
            className="mb-3 block w-full break-inside-avoid overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8f3d2b]"
            style={{ aspectRatio: item.frame }}
          >
            <img
              src={item.thumbSrc}
              srcSet={item.srcSet}
              sizes="(min-width: 768px) 30vw, 50vw"
              alt={item.alt}
              width={item.width}
              height={item.height}
              className="h-full w-full object-cover"
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
            ref={backdropRef}
            data-slot="ombra-backdrop"
            className={cn(
              "fixed inset-0 z-50 bg-black/88",
              phase === "closing" && "pointer-events-none",
            )}
          />
          <Dialog.Popup
            ref={popupRef}
            data-slot="ombra-viewer"
            data-engine={effective}
            data-phase={phase}
            data-zoomed={zoom.zoomed ? "true" : "false"}
            data-pulling={pulling ? "true" : "false"}
            initialFocus={closeRef}
            finalFocus={() => triggers.current[indexRef.current] ?? true}
            onKeyDown={onKeyDown}
            className={cn(
              "fixed inset-0 z-50 flex h-dvh w-full flex-col overflow-hidden bg-transparent text-white outline-none",
              phase === "closing" && "pointer-events-none",
            )}
          >
            <Dialog.Title className="sr-only">{active?.alt ?? "Photo"}</Dialog.Title>
            <Dialog.Description className="sr-only">{active?.caption ?? ""}</Dialog.Description>
            <div data-slot="ombra-sheet" className="flex min-h-0 min-w-0 flex-1 flex-col">
              <header className="flex flex-col gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col items-start gap-2">
                    <p
                      data-slot="ombra-counter"
                      className="font-mono text-xs tracking-wide text-white/80"
                    >
                      {index + 1} / {count}
                    </p>
                    <FrameReadout longest={longest} dropped={dropped} engine={effective} />
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
                <EngineSwitch engine={engine} tone="ink" onEngineChange={onEngineChange} />
              </header>

              <div className="relative min-h-0 min-w-0 flex-1">
                <div className="@container h-full min-w-0">
                  <div
                    ref={trackRef}
                    data-slot="ombra-track"
                    className="flex h-full min-w-0 snap-x snap-mandatory items-stretch gap-4 overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                    <div aria-hidden="true" className="shrink-0 basis-[max(0px,calc(7cqi-1rem))]" />
                    {items.map((item, itemIndex) => {
                      const near = Math.abs(itemIndex - index) <= 1;
                      const source = sharpId === item.id ? item.src : item.thumbSrc;

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
                          className="flex w-[86cqi] shrink-0 snap-center snap-always items-center justify-center"
                        >
                          <div
                            ref={itemIndex === index ? layerRef : undefined}
                            data-slot="ombra-zoom"
                            className="flex h-full w-full items-center justify-center"
                          >
                            {near ? (
                              <img
                                ref={(node) => {
                                  images.current[itemIndex] = node;
                                }}
                                data-slot="ombra-image"
                                data-active={itemIndex === index ? "true" : "false"}
                                src={source}
                                srcSet={item.srcSet}
                                sizes="100vw"
                                alt=""
                                width={item.width}
                                height={item.height}
                                draggable={false}
                                fetchPriority={itemIndex === index ? "high" : "low"}
                                className="max-h-full max-w-full object-contain"
                              />
                            ) : (
                              <div className="h-3/4 w-full bg-white/5" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div aria-hidden="true" className="shrink-0 basis-[max(0px,calc(7cqi-1rem))]" />
                  </div>
                </div>
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2">
                  <IconButton
                    label="Previous photo"
                    slot="ombra-prev"
                    className="pointer-events-auto bg-black/40"
                    disabled={index === 0}
                    onClick={() => goTo(index - 1, reduced ? "auto" : "smooth")}
                  >
                    <Chevron direction="left" />
                  </IconButton>
                </div>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                  <IconButton
                    label="Next photo"
                    slot="ombra-next"
                    className="pointer-events-auto bg-black/40"
                    disabled={index === count - 1}
                    onClick={() => goTo(index + 1, reduced ? "auto" : "smooth")}
                  >
                    <Chevron direction="right" />
                  </IconButton>
                </div>
              </div>

              <footer className="px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <p data-slot="ombra-caption" className="mb-3 text-center text-sm text-white/80">
                  {active?.caption}
                </p>
                <div
                  ref={stripRef}
                  data-slot="ombra-thumbnails"
                  data-overflowing={stripOverflows ? "true" : "false"}
                  className={cn(
                    "overflow-x-auto overflow-y-hidden py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
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
                            "size-11 shrink-0 snap-center overflow-hidden border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                            selected ? "border-white" : "border-transparent opacity-60",
                          )}
                        >
                          <img src={item.thumbSrc} alt="" className="h-full w-full object-cover" />
                        </button>
                      );
                    })}
                  </div>
                </div>
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
