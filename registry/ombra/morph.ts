import type { Box, FlipPose } from "./types";

export const MORPH_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

export const VIEW_TRANSITION_NAME = "ombra-shared";

export type Flight = {
  element: HTMLImageElement;
  animation: Animation | null;
  home: Box;
  destroy: () => void;
  hold: () => FlipPose;
};

export function readPose(element: HTMLElement): FlipPose {
  const style = getComputedStyle(element);
  const transform = style.transform === "none" ? "translate(0px, 0px) scale(1)" : style.transform;

  return {
    transform,
    clipPath: style.clipPath || "inset(0% 0% 0% 0%)",
  };
}

export function mountFlight(home: Box, pose: FlipPose, src: string): Flight {
  const element = document.createElement("img");

  element.alt = "";
  element.setAttribute("aria-hidden", "true");
  element.dataset.slot = "ombra-flight";
  element.src = src;
  element.draggable = false;
  element.style.position = "fixed";
  element.style.left = `${home.x}px`;
  element.style.top = `${home.y}px`;
  element.style.width = `${home.width}px`;
  element.style.height = `${home.height}px`;
  element.style.margin = "0";
  element.style.maxWidth = "none";
  element.style.objectFit = "fill";
  element.style.transformOrigin = "center center";
  element.style.zIndex = "80";
  element.style.pointerEvents = "none";
  element.style.willChange = "transform, clip-path";
  element.style.transform = pose.transform;
  element.style.clipPath = pose.clipPath;
  document.body.append(element);
  promoteAboveTopLayer(element);

  const flight: Flight = {
    element,
    animation: null,
    home,
    destroy() {
      flight.animation?.cancel();
      element.remove();
    },
    hold() {
      const animation = flight.animation;

      if (!animation) return readPose(element);

      try {
        animation.commitStyles();
      } catch (error) {
        // commitStyles throws InvalidStateError when the effect has no target.
        // The computed style still has the in-flight frame until cancel.
        if (!(error instanceof DOMException)) throw error;
      }

      const poseNow = readPose(element);

      animation.cancel();
      flight.animation = null;
      element.style.transform = poseNow.transform;
      element.style.clipPath = poseNow.clipPath;

      return poseNow;
    },
  };

  return flight;
}

/** Moves a flight onto a new home box without moving it on screen. */
// A dialog in the top layer (UI SDK shows its parts as manual popovers) paints over
// everything on body, z-index or not. The clone joins the top layer after it, so it
// stacks above. A portal-based dialog (Base UI) leaves nothing open there.
function promoteAboveTopLayer(element: HTMLElement): void {
  if (!("popover" in HTMLElement.prototype)) return;

  if (!document.querySelector(":popover-open, dialog:modal")) return;

  element.popover = "manual";
  // Undo the UA popover box; left, top, width and height are already inline.
  element.style.right = "auto";
  element.style.bottom = "auto";
  element.style.border = "0";
  element.style.padding = "0";
  element.style.background = "transparent";
  element.style.overflow = "visible";
  element.showPopover();
}

export function rebaseFlight(flight: Flight, home: Box): FlipPose {
  const pose = flight.hold();
  const previous = flight.home;

  if (
    Math.abs(previous.x - home.x) < 0.5 &&
    Math.abs(previous.y - home.y) < 0.5 &&
    Math.abs(previous.width - home.width) < 0.5 &&
    Math.abs(previous.height - home.height) < 0.5
  ) {
    return pose;
  }

  const matrix = new DOMMatrixReadOnly(pose.transform);
  const ratio = previous.width / home.width;
  const dx = previous.x + previous.width / 2 + matrix.e - (home.x + home.width / 2);
  const dy = previous.y + previous.height / 2 + matrix.f - (home.y + home.height / 2);

  // The clip radius is in the flight's own space, which changes size here.
  const clipPath = pose.clipPath.replace(/round .*\)$/, (radii) =>
    radii.replace(/[\d.]+px/g, (radius) => `${Number.parseFloat(radius) * ratio}px`),
  );

  const next: FlipPose = {
    transform: `translate(${dx}px, ${dy}px) scale(${matrix.a * ratio})`,
    clipPath,
  };

  const { style } = flight.element;

  style.left = `${home.x}px`;
  style.top = `${home.y}px`;
  style.width = `${home.width}px`;
  style.height = `${home.height}px`;
  style.transform = next.transform;
  style.clipPath = next.clipPath;
  flight.home = home;

  return next;
}

/** The on-screen box of a flight, which is its transformed box minus the crop. */
export function flightVisibleBox(flight: Flight): Box {
  const rect = flight.element.getBoundingClientRect();
  const inset = /inset\(([\d.]+)%(?: ([\d.]+)%)?/.exec(getComputedStyle(flight.element).clipPath);
  const block = Number.parseFloat(inset?.[1] ?? "0") / 100;
  const inline = Number.parseFloat(inset?.[2] ?? inset?.[1] ?? "0") / 100;

  return {
    x: rect.x + rect.width * inline,
    y: rect.y + rect.height * block,
    width: rect.width * (1 - inline * 2),
    height: rect.height * (1 - block * 2),
  };
}

/** Fades a flight out where it is, then removes it. */
export function retireFlight(flight: Flight, duration: number): void {
  flight.hold();

  if (duration <= 0) {
    flight.destroy();

    return;
  }

  const animation = flight.element.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration,
    easing: "ease-out",
    fill: "forwards",
  });

  void animation.finished.then(flight.destroy, flight.destroy);
}

export function playFlight(
  flight: Flight,
  from: FlipPose,
  to: FlipPose,
  duration: number,
  easing: string = MORPH_EASING,
): Promise<boolean> {
  flight.animation?.cancel();
  flight.element.dataset.easing = easing;

  if (duration <= 0) {
    flight.element.style.transform = to.transform;
    flight.element.style.clipPath = to.clipPath;

    return Promise.resolve(true);
  }

  const animation = flight.element.animate(
    [
      { transform: from.transform, clipPath: from.clipPath },
      { transform: to.transform, clipPath: to.clipPath },
    ],
    { duration, easing, fill: "forwards" },
  );

  flight.animation = animation;

  return animation.finished.then(
    () => true,
    () => false,
  );
}

/** Runs the rest of an animation on another element, from the same moment and on the same curve. */
export function continueAnimation(source: Animation, target: Element): Animation | null {
  const effect = source.effect;

  if (!(effect instanceof KeyframeEffect)) return null;

  const copy = target.animate(effect.getKeyframes(), { ...effect.getTiming(), fill: "none" });

  copy.currentTime = source.currentTime;

  return copy;
}

export function supportsViewTransitions(): boolean {
  if (!("startViewTransition" in document)) return false;

  return document.startViewTransition instanceof Function;
}

/**
 * The live box of the shared image, or null before the pseudo-elements exist.
 * A running view transition has no element to measure, but the group's computed
 * size and transform are the frame on screen.
 */
export function readViewTransitionBox(): Box | null {
  const style = getComputedStyle(
    document.documentElement,
    `::view-transition-group(${VIEW_TRANSITION_NAME})`,
  );

  const width = Number.parseFloat(style.width);
  const height = Number.parseFloat(style.height);

  if (!(width > 0) || !(height > 0)) return null;

  const matrix = new DOMMatrixReadOnly(style.transform === "none" ? undefined : style.transform);

  return { x: matrix.e, y: matrix.f, width: width * matrix.a, height: height * matrix.d };
}

/** Whether the view transition's crossfades have nothing visible left to do. */
export function viewTransitionFaded(limit: number): boolean {
  const root = document.documentElement;
  const opacity = (pseudo: string) => Number(getComputedStyle(root, pseudo).opacity);

  return (
    opacity("::view-transition-old(root)") < limit &&
    opacity(`::view-transition-old(${VIEW_TRANSITION_NAME})`) < limit &&
    opacity(`::view-transition-new(${VIEW_TRANSITION_NAME})`) > 1 - limit
  );
}

/** Checks every frame, calls `done` once when `settled` first holds, and returns a stop. */
export function watchSettled(settled: () => boolean, done: () => void): () => void {
  let frame = requestAnimationFrame(function tick() {
    if (settled()) {
      done();

      return;
    }

    frame = requestAnimationFrame(tick);
  });

  return () => {
    cancelAnimationFrame(frame);
  };
}

/** Milliseconds left on the shared image's group animation, or 0 if it is not running. */
export function viewTransitionRemaining(): number {
  const pseudo = `::view-transition-group(${VIEW_TRANSITION_NAME})`;

  for (const animation of document.getAnimations()) {
    const effect = animation.effect;

    if (!(effect instanceof KeyframeEffect) || effect.pseudoElement !== pseudo) continue;

    const { endTime, localTime } = effect.getComputedTiming();

    return Math.max(0, Number(endTime) - Number(localTime));
  }

  return 0;
}

export function runViewTransition(update: () => void): ViewTransition | null {
  if (!supportsViewTransitions()) {
    update();

    return null;
  }

  return document.startViewTransition(update);
}
