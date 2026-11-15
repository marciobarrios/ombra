import type { Box, FlipPose, MorphEngine } from "./types";

export const MORPH_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

export const VIEW_TRANSITION_NAME = "ombra-shared";

// Set on the root while a view transition runs, so the stylesheet can clear every other name.
const MORPHING_ATTRIBUTE = "data-ombra-morph";

/**
 * The view transition's pseudo-elements, and the rule that keeps one named group. Any
 * other `view-transition-name` on the page would fly as a group of its own. The shared
 * element sets its name inline with `!important`, which wins over this rule.
 */
export const MORPH_STYLES = `::view-transition {
  pointer-events: var(--ombra-vt-pointer-events, auto);
}

:root[${MORPHING_ATTRIBUTE}] *,
:root[${MORPHING_ATTRIBUTE}] ::before,
:root[${MORPHING_ATTRIBUTE}] ::after {
  view-transition-name: none !important;
}

::view-transition-group(${VIEW_TRANSITION_NAME}),
::view-transition-old(${VIEW_TRANSITION_NAME}),
::view-transition-new(${VIEW_TRANSITION_NAME}) {
  animation-duration: var(--ombra-vt-duration, 480ms);
  animation-timing-function: var(--ombra-vt-easing, ${MORPH_EASING});
}

::view-transition-old(${VIEW_TRANSITION_NAME}),
::view-transition-new(${VIEW_TRANSITION_NAME}) {
  height: 100%;
  overflow: hidden;
  object-fit: cover;
  border-radius: 6px;
}`;

export type Flight = {
  /** The clip box: `transform` places and crops the photo, `overflow: hidden` clips it. */
  element: HTMLDivElement;
  image: HTMLImageElement;
  /** The clip box's animation. The image's runs beside it on the same timing. */
  animation: Animation | null;
  /** The flight as `transform` and `clip-path` keyframes, for a hand-off onto the real photo. */
  keyframes: Keyframe[];
  home: Box;
  destroy: () => void;
  hold: () => FlipPose;
  finish: () => void;
  play: (from: FlipPose, to: FlipPose, timing: KeyframeAnimationOptions) => Animation;
};

/**
 * A pose as numbers: the image's translate and uniform scale from its home box, and
 * the symmetric crop as a share of each side.
 */
type PoseParts = { x: number; y: number; scale: number; inline: number; block: number };

// The photo's corner radius on screen, at rest and on the thumbnail alike.
const FLIGHT_RADIUS = 6;

// Keyframes sampled along the path. The clip box and the image scale in opposite
// directions, and two linear interpolations only cancel out at the samples.
const FLIGHT_SAMPLES = 16;

export function readPose(element: HTMLElement): FlipPose {
  const style = getComputedStyle(element);
  const transform = style.transform === "none" ? "translate(0px, 0px) scale(1)" : style.transform;

  return {
    transform,
    clipPath: style.clipPath || "inset(0% 0% 0% 0%)",
  };
}

function partsOf(pose: FlipPose): PoseParts {
  const matrix = new DOMMatrixReadOnly(pose.transform);
  const inset = /inset\(([\d.]+)%(?: ([\d.]+)%)?/.exec(pose.clipPath);
  const block = Number.parseFloat(inset?.[1] ?? "0") / 100;
  const inline = Number.parseFloat(inset?.[2] ?? inset?.[1] ?? "0") / 100;

  return { x: matrix.e, y: matrix.f, scale: matrix.a, inline, block };
}

function poseOf(parts: PoseParts): FlipPose {
  const scale = Math.abs(parts.scale) > 0.0001 ? parts.scale : 1;

  return {
    transform: `translate(${parts.x}px, ${parts.y}px) scale(${scale})`,
    clipPath: `inset(${parts.block * 100}% ${parts.inline * 100}% round ${FLIGHT_RADIUS / scale}px)`,
  };
}

/**
 * A pose partway along the path. The visible box moves and resizes in a straight line,
 * as a view transition's group does, so both engines put the photo on the same pixels
 * at the same progress. Interpolating the crop instead would bow the box inwards.
 */
function between(from: PoseParts, to: PoseParts, progress: number): PoseParts {
  const lerp = (a: number, b: number) => a + (b - a) * progress;
  const scale = lerp(from.scale, to.scale);

  const crop = (start: number, end: number) => {
    const visible = lerp(from.scale * visibleShare(start), to.scale * visibleShare(end));

    if (Math.abs(scale) < 0.0001) return lerp(start, end);

    return Math.min(0.495, Math.max(0, (1 - visible / scale) / 2));
  };

  return {
    x: lerp(from.x, to.x),
    y: lerp(from.y, to.y),
    scale,
    inline: crop(from.inline, to.inline),
    block: crop(from.block, to.block),
  };
}

/**
 * The path from one pose to another as `transform` and `clip-path` keyframes, for the
 * real photo when it takes over from a clone or a view transition. Sampled, because
 * a two-frame `inset()` would follow the crop and leave the clone's path.
 */
export function flightKeyframes(fromPose: FlipPose, toPose: FlipPose): Keyframe[] {
  const from = partsOf(fromPose);
  const to = partsOf(toPose);
  const frames: Keyframe[] = [];

  for (let sample = 0; sample <= FLIGHT_SAMPLES; sample += 1) {
    const offset = sample / FLIGHT_SAMPLES;
    const pose = poseOf(between(from, to, offset));

    frames.push({ offset, transform: pose.transform, clipPath: pose.clipPath });
  }

  return frames;
}

/** The visible share of each axis. Kept above zero so the counter-scale stays finite. */
function visibleShare(crop: number): number {
  return Math.max(0.01, 1 - crop * 2);
}

function clipTransform(parts: PoseParts): string {
  const width = parts.scale * visibleShare(parts.inline);
  const height = parts.scale * visibleShare(parts.block);

  return `translate(${parts.x}px, ${parts.y}px) scale(${width}, ${height})`;
}

function imageTransform(parts: PoseParts): string {
  return `scale(${1 / visibleShare(parts.inline)}, ${1 / visibleShare(parts.block)})`;
}

/**
 * The clip box's corners in its own space. Its scale is not uniform, so a fixed radius
 * would shrink and stretch towards a thumbnail and then jump to the thumbnail's 6px
 * when the clone is removed. Dividing by each axis keeps 6px on screen all the way.
 */
function clipRadius(parts: PoseParts): string {
  const width = Math.abs(parts.scale * visibleShare(parts.inline)) || 1;
  const height = Math.abs(parts.scale * visibleShare(parts.block)) || 1;

  return `${FLIGHT_RADIUS / width}px / ${FLIGHT_RADIUS / height}px`;
}

function placeFlight(flight: Pick<Flight, "element" | "image">, parts: PoseParts) {
  flight.element.style.transform = clipTransform(parts);
  flight.element.style.borderRadius = clipRadius(parts);
  flight.image.style.transform = imageTransform(parts);
}

/** The pose on screen now, read back from the clip box and the image. */
function livePose(flight: Pick<Flight, "element" | "image">): FlipPose {
  const read = (element: HTMLElement) => {
    const { transform } = getComputedStyle(element);

    return new DOMMatrixReadOnly(transform === "none" ? undefined : transform);
  };

  const clip = read(flight.element);
  const image = read(flight.image);
  const width = image.a > 0 ? 1 / image.a : 1;
  const height = image.d > 0 ? 1 / image.d : 1;

  return poseOf({
    x: clip.e,
    y: clip.f,
    scale: clip.a / width,
    inline: (1 - width) / 2,
    block: (1 - height) / 2,
  });
}

/**
 * The FLIP clone. WebKit runs a `clip-path` animation on the main thread, and with it
 * the `transform` in the same effect, so a busy main thread stalled the whole flight in
 * Low Power Mode (MAR-96). The crop is a clip box instead: both elements animate only
 * `transform`, which the compositor runs.
 */
export function mountFlight(home: Box, pose: FlipPose, src: string): Flight {
  const element = document.createElement("div");
  const image = document.createElement("img");

  element.setAttribute("aria-hidden", "true");
  element.dataset.slot = "ombra-flight";
  Object.assign(element.style, {
    position: "fixed",
    left: `${home.x}px`,
    top: `${home.y}px`,
    width: `${home.width}px`,
    height: `${home.height}px`,
    margin: "0",
    overflow: "hidden",
    transformOrigin: "center center",
    zIndex: "80",
    pointerEvents: "none",
    willChange: "transform",
  });

  image.alt = "";
  image.src = src;
  image.draggable = false;
  Object.assign(image.style, {
    display: "block",
    width: "100%",
    height: "100%",
    maxWidth: "none",
    objectFit: "fill",
    transformOrigin: "center center",
    willChange: "transform",
  });

  element.append(image);

  let imageAnimation: Animation | null = null;
  // The corners run in an effect of their own. Border radius cannot run on the
  // compositor, and in WebKit it would take the transform in the same effect to the
  // main thread with it (MAR-96). On its own, a stalled main thread only delays the
  // corners, never the flight.
  let cornerAnimation: Animation | null = null;

  const flight: Flight = {
    element,
    image,
    animation: null,
    keyframes: [],
    home,
    destroy() {
      flight.animation?.cancel();
      imageAnimation?.cancel();
      cornerAnimation?.cancel();
      element.remove();
    },
    hold() {
      const poseNow = livePose(flight);

      flight.animation?.cancel();
      imageAnimation?.cancel();
      cornerAnimation?.cancel();
      flight.animation = null;
      imageAnimation = null;
      cornerAnimation = null;
      placeFlight(flight, partsOf(poseNow));

      return poseNow;
    },
    finish() {
      imageAnimation?.finish();
      cornerAnimation?.finish();
      flight.animation?.finish();
    },
    play(fromPose, toPose, timing) {
      const from = partsOf(fromPose);
      const to = partsOf(toPose);

      flight.animation?.cancel();
      imageAnimation?.cancel();
      cornerAnimation?.cancel();

      const clipFrames: Keyframe[] = [];
      const imageFrames: Keyframe[] = [];
      const cornerFrames: Keyframe[] = [];

      for (let sample = 0; sample <= FLIGHT_SAMPLES; sample += 1) {
        const offset = sample / FLIGHT_SAMPLES;
        const parts = between(from, to, offset);

        clipFrames.push({ offset, transform: clipTransform(parts) });
        imageFrames.push({ offset, transform: imageTransform(parts) });
        cornerFrames.push({ offset, borderRadius: clipRadius(parts) });
      }

      // Started in the same task, so all three share a start time and stay in step.
      imageAnimation = image.animate(imageFrames, timing);
      cornerAnimation = element.animate(cornerFrames, timing);
      flight.animation = element.animate(clipFrames, timing);

      return flight.animation;
    },
  };

  placeFlight(flight, partsOf(pose));
  document.body.append(element);

  return flight;
}

/** Moves a flight onto a new home box without moving it on screen. */
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

  const parts = partsOf(pose);
  const ratio = previous.width / home.width;

  const next: PoseParts = {
    ...parts,
    x: previous.x + previous.width / 2 + parts.x - (home.x + home.width / 2),
    y: previous.y + previous.height / 2 + parts.y - (home.y + home.height / 2),
    scale: parts.scale * ratio,
  };

  const { style } = flight.element;

  style.left = `${home.x}px`;
  style.top = `${home.y}px`;
  style.width = `${home.width}px`;
  style.height = `${home.height}px`;
  placeFlight(flight, next);
  flight.home = home;

  return poseOf(next);
}

/** The on-screen box of a flight: the clip box is exactly the visible photo. */
export function flightVisibleBox(flight: Flight): Box {
  const rect = flight.element.getBoundingClientRect();

  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
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
  flight.element.dataset.easing = easing;
  flight.keyframes = flightKeyframes(from, to);

  if (duration <= 0) {
    flight.hold();
    placeFlight(flight, partsOf(to));

    return Promise.resolve(true);
  }

  const animation = flight.play(from, to, { duration, easing, fill: "forwards" });

  return animation.finished.then(
    () => true,
    () => false,
  );
}

/** Runs the rest of a flight on the real photo, from the same moment and on the same curve. */
export function continueFlight(flight: Flight, target: Element): Animation | null {
  const source = flight.animation;
  const effect = source?.effect;

  if (!source || !(effect instanceof KeyframeEffect)) return null;

  const copy = target.animate(flight.keyframes, { ...effect.getTiming(), fill: "none" });

  copy.currentTime = source.currentTime;

  return copy;
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
  if (typeof document === "undefined" || !("startViewTransition" in document)) return false;

  return document.startViewTransition instanceof Function;
}

/**
 * The engine that actually runs. Reduced motion is always a fade, and a browser without
 * View Transitions falls back to FLIP. Callers can still pick FLIP or a fade for a
 * single morph, such as when a clone is already in the air.
 */
export function resolveMorphEngine(requested: MorphEngine, reduced: boolean): MorphEngine {
  if (reduced) return "fade";

  if (requested === "vt" && !supportsViewTransitions()) return "flip";

  return requested;
}

/** Gives an element the shared name, over any rule that clears names during a morph. */
export function nameSharedElement(element: HTMLElement | null | undefined): void {
  element?.style.setProperty("view-transition-name", VIEW_TRANSITION_NAME, "important");
}

export function unnameSharedElement(element: HTMLElement | null | undefined): void {
  element?.style.removeProperty("view-transition-name");
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

let runningTransition: ViewTransition | null = null;

/**
 * Starts a view transition with one named group. Other names on the page are cleared
 * until it ends, so nothing else flies. Without the API the update runs on its own.
 */
export function runViewTransition(update: () => void): ViewTransition | null {
  if (!supportsViewTransitions()) {
    update();

    return null;
  }

  const root = document.documentElement;

  root.setAttribute(MORPHING_ATTRIBUTE, "");

  const transition = document.startViewTransition(update);

  runningTransition = transition;

  // A transition skipped for a new one settles after the new one starts.
  const release = () => {
    if (runningTransition !== transition) return;

    runningTransition = null;
    root.removeAttribute(MORPHING_ATTRIBUTE);
  };

  void transition.finished.then(release, release);

  return transition;
}
