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

      animation.commitStyles();
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

export function playFlight(
  flight: Flight,
  from: FlipPose,
  to: FlipPose,
  duration: number,
): Promise<boolean> {
  flight.animation?.cancel();

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
    { duration, easing: MORPH_EASING, fill: "forwards" },
  );

  flight.animation = animation;

  return animation.finished.then(
    () => true,
    () => false,
  );
}

export function supportsViewTransitions(): boolean {
  return "startViewTransition" in document;
}

export function runViewTransition(update: () => void): ViewTransition | null {
  if (!supportsViewTransitions()) {
    update();

    return null;
  }

  return document.startViewTransition(update);
}
