type Rgb = readonly [number, number, number];

/** A parsed `#rrggbb` or `#rrggbbaa` colour, channels from 0 to 1. */
type ParsedColour = { rgb: Rgb; alpha: number };

/** WCAG AA for body text, with a little room so axe's own rounding cannot tip a token under. */
const TARGET_RATIO = 4.6;

function parseHex(hex: string): ParsedColour {
  const value = hex.replace("#", "");
  const channel = (index: number) => parseInt(value.slice(index, index + 2), 16) / 255;

  return {
    rgb: [channel(0), channel(2), channel(4)],
    alpha: value.length === 8 ? channel(6) : 1,
  };
}

function toHex(rgb: Rgb): string {
  const channel = (value: number) =>
    Math.round(Math.min(1, Math.max(0, value)) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${rgb.map(channel).join("")}`;
}

function toLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function fromLinear(value: number): number {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
}

function luminance(rgb: Rgb): number {
  return 0.2126 * toLinear(rgb[0]) + 0.7152 * toLinear(rgb[1]) + 0.0722 * toLinear(rgb[2]);
}

function contrast(first: Rgb, second: Rgb): number {
  const a = luminance(first);
  const b = luminance(second);

  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** sRGB to OKLab, so a change of lightness keeps the hue. */
function toOklab(rgb: Rgb): Rgb {
  const r = toLinear(rgb[0]);
  const g = toLinear(rgb[1]);
  const b = toLinear(rgb[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab(lab: Rgb): Rgb {
  const [lightness, a, b] = lab;
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const cache = new Map<string, string>();

/**
 * The theme colour moved just far enough from `background` to read at AA: darker on a light
 * panel, lighter on a dark one, with the same hue. A colour with alpha is first flattened onto
 * the panel, which is what the reader sees. A colour that already passes comes back unchanged.
 */
export function readableOn(color: string, background: string): string {
  const key = `${color}|${background}`;
  const known = cache.get(key);

  if (known) return known;

  const panel = parseHex(background).rgb;
  const { rgb, alpha } = parseHex(color);

  const flat: Rgb = [
    rgb[0] * alpha + panel[0] * (1 - alpha),
    rgb[1] * alpha + panel[1] * (1 - alpha),
    rgb[2] * alpha + panel[2] * (1 - alpha),
  ];

  let result = alpha === 1 ? color : toHex(flat);

  if (contrast(flat, panel) < TARGET_RATIO) {
    const step = luminance(panel) > 0.5 ? -0.005 : 0.005;
    const [lightness, a, b] = toOklab(flat);
    let candidate = flat;

    for (let next = lightness; next > 0 && next < 1; next += step) {
      candidate = fromOklab([next, a, b]);

      if (contrast(candidate, panel) >= TARGET_RATIO) break;
    }

    result = toHex(candidate);
  }

  cache.set(key, result);

  return result;
}
