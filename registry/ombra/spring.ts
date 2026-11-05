/** Slightly under-damped (ζ ≈ 0.82). Critical damping is 2 * sqrt(stiffness). */
export const MORPH_SPRING = { stiffness: 230, damping: 25 };

/** Shorter snap for pull release and zoom (ζ ≈ 0.78). */
export const SNAP_SPRING = { stiffness: 500, damping: 35 };

const REST = 0.005;
const REST_VELOCITY = 0.08;
const STEPS = 16;
const MAX_VELOCITY = 12;
const MAX_STIFFNESS = 2000;
const MAX_DAMPING = 200;

export type SpringInput = {
  stiffness: number;
  damping: number;
  /** Progress units per second. Positive moves toward the target. */
  velocity?: number;
};

export type SpringPlan = {
  easing: string;
  duration: number;
  linear: boolean;
};

export function normalizeVelocity(pixelsPerSecond: number, distance: number): number {
  const span = Math.abs(distance);

  if (!Number.isFinite(span) || span < 8) return 0;

  if (pixelsPerSecond === Number.POSITIVE_INFINITY) return MAX_VELOCITY;

  if (pixelsPerSecond === Number.NEGATIVE_INFINITY) return -MAX_VELOCITY;

  if (!Number.isFinite(pixelsPerSecond)) return 0;

  const value = pixelsPerSecond / span;

  if (!Number.isFinite(value)) return 0;

  return Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, value));
}

export function springCurve(input: SpringInput): SpringPlan {
  const stiffness = Math.min(
    MAX_STIFFNESS,
    Math.max(1, finiteOr(input.stiffness, MORPH_SPRING.stiffness)),
  );

  const damping = Math.min(MAX_DAMPING, Math.max(0, finiteOr(input.damping, 0)));

  const velocity = Math.max(
    -MAX_VELOCITY,
    Math.min(MAX_VELOCITY, finiteOr(input.velocity ?? 0, 0)),
  );

  const seconds = settleSeconds(stiffness, damping, velocity);
  const duration = Math.max(1, Math.round(seconds * 1000));
  const linear = supportsLinearEasing();

  if (!linear) {
    return { easing: cubicFallback(velocity, duration), duration, linear: false };
  }

  const easing = linearEasing(stiffness, damping, velocity, seconds);

  if (!Number.isFinite(duration) || easing.includes("NaN") || easing.includes("Infinity")) {
    return {
      easing: cubicFallback(velocity, duration),
      duration: finiteOr(duration, 1),
      linear: false,
    };
  }

  return { easing, duration, linear: true };
}

function supportsLinearEasing(): boolean {
  if (typeof CSS === "undefined") return false;

  return CSS.supports("animation-timing-function", "linear(0, 1)");
}

function progress(stiffness: number, damping: number, velocity: number, time: number): number {
  const omega = Math.sqrt(stiffness);
  const zeta = damping / (2 * omega);
  const underdamped = zeta < 0.999 ? underdampedProgress(omega, zeta, velocity, time) : null;
  const value = underdamped ?? criticalProgress(omega, velocity, time);

  if (!Number.isFinite(value)) return time <= 0 ? 0 : 1;

  return value;
}

function underdampedProgress(
  omega: number,
  zeta: number,
  velocity: number,
  time: number,
): number | null {
  const wd = omega * Math.sqrt(Math.max(0, 1 - zeta * zeta));

  if (wd <= 1e-4) return null;

  const amplitude = -1;
  const wave = (velocity + zeta * omega * amplitude) / wd;
  const decay = Math.exp(-zeta * omega * time);
  const displacement = decay * (amplitude * Math.cos(wd * time) + wave * Math.sin(wd * time));

  return 1 + displacement;
}

function criticalProgress(omega: number, velocity: number, time: number): number {
  const amplitude = -1;
  const slope = velocity + omega * amplitude;

  return 1 + (amplitude + slope * time) * Math.exp(-omega * time);
}

function settleSeconds(stiffness: number, damping: number, velocity: number): number {
  const step = 1 / 120;
  let time = 0;
  let quiet = 0;

  while (time < 1.8) {
    const here = progress(stiffness, damping, velocity, time);
    const ahead = progress(stiffness, damping, velocity, time + step);
    const speed = (ahead - here) / step;

    if (Math.abs(here - 1) < REST && Math.abs(speed) < REST_VELOCITY) {
      quiet += 1;

      if (quiet > 4) return time;
    } else {
      quiet = 0;
    }

    time += step;
  }

  return 1.8;
}

function linearEasing(
  stiffness: number,
  damping: number,
  velocity: number,
  seconds: number,
): string {
  let easing = "linear(";

  for (let index = 0; index <= STEPS; index += 1) {
    const unit = index / STEPS;
    const value = index === 0 ? 0 : progress(stiffness, damping, velocity, unit * seconds);
    const shown = index === STEPS ? 1 : round(value);

    if (index > 0) easing += ", ";

    easing += String(shown);

    if (index > 0) easing += ` ${round(unit * 100)}%`;
  }

  return `${easing})`;
}

function cubicFallback(velocity: number, durationMs: number): string {
  const slope = Math.max(0, finiteOr(velocity, 0)) * (finiteOr(durationMs, 1) / 1000);
  const rise = Math.min(1.3, 0.82 + slope * 0.12);
  const land = Math.min(1.15, 1.04 + Math.min(slope, 3) * 0.02);

  return `cubic-bezier(0.2, ${round(rise)}, 0.28, ${round(land)})`;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
