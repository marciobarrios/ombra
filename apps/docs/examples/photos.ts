export type Photo = {
  /** Stable identity: triggers, slides and thumbnails find each other by it. */
  id: string;
  alt: string;
  caption: string;
  /** The full-size source the viewer shows. */
  src: string;
  /** A smaller file for the grid and the thumbnail strip. */
  thumbSrc: string;
  srcSet: string;
  /** The image's intrinsic size, so the viewer can fit it before it loads. */
  width: number;
  height: number;
};

function photo(file: string, details: Omit<Photo, "src" | "thumbSrc" | "srcSet">): Photo {
  const base = `/photos/${file}`;

  return {
    ...details,
    src: `${base}-1600.jpg`,
    thumbSrc: `${base}-960.jpg`,
    srcSet: `${base}-960.jpg 960w, ${base}-1600.jpg 1600w`,
  };
}

export const photos: readonly Photo[] = [
  photo("01", {
    id: "road",
    alt: "Desert road through red rock toward a distant peak",
    caption: "Two lanes, red stone, and a long way still to go.",
    width: 1600,
    height: 2400,
  }),
  photo("02", {
    id: "ridge",
    alt: "Hiker standing on a ridge above a green mountain range",
    caption: "One figure, and a whole weather system of hills.",
    width: 1600,
    height: 1063,
  }),
  photo("03", {
    id: "forest",
    alt: "Sunlit path through a dense green forest",
    caption: "The path bends where the light gets in.",
    width: 1600,
    height: 1066,
  }),
  photo("04", {
    id: "cliffs",
    alt: "Green cliffs and a winding road under a breaking sky",
    caption: "Cloud on the cliff, road in the grass.",
    width: 1600,
    height: 953,
  }),
];
