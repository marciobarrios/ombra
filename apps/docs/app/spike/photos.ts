import type { OmbraItem } from "../../../../registry/ombra/types";

type PhotoSource = {
  id: string;
  file: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
  frame: string;
};

const sources: readonly PhotoSource[] = [
  {
    id: "road",
    file: "01",
    alt: "Desert road through red rock toward a distant peak",
    caption: "Two lanes, red stone, and a long way still to go.",
    width: 1600,
    height: 2400,
    frame: "2 / 3",
  },
  {
    id: "ridge",
    file: "02",
    alt: "Hiker standing on a ridge above a green mountain range",
    caption: "One figure, and a whole weather system of hills.",
    width: 1600,
    height: 1063,
    frame: "1 / 1",
  },
  {
    id: "forest",
    file: "03",
    alt: "Sunlit path through a dense green forest",
    caption: "The path bends where the light gets in.",
    width: 1600,
    height: 1066,
    frame: "3 / 4",
  },
  {
    id: "cliffs",
    file: "04",
    alt: "Green cliffs and a winding road under a breaking sky",
    caption: "Cloud on the cliff, road in the grass.",
    width: 1600,
    height: 953,
    frame: "16 / 9",
  },
  {
    id: "boats",
    file: "05",
    alt: "Rowboats on a turquoise alpine lake",
    caption: "The water is doing most of the talking.",
    width: 1600,
    height: 1067,
    frame: "4 / 5",
  },
  {
    id: "falls",
    file: "06",
    alt: "Tall waterfall with a footbridge across the gorge",
    caption: "A thin bridge in a very tall place.",
    width: 1600,
    height: 2400,
    frame: "3 / 4",
  },
  {
    id: "night",
    file: "07",
    alt: "Snowy peaks under the Milky Way",
    caption: "Night, and the ridge still holding snow.",
    width: 1600,
    height: 1068,
    frame: "16 / 9",
  },
  {
    id: "valley",
    file: "08",
    alt: "Forested valley leading to snow-covered mountains",
    caption: "Spruce in front, weather on the summits.",
    width: 1600,
    height: 1067,
    frame: "1 / 1",
  },
  {
    id: "shore",
    file: "09",
    alt: "Purple dusk over a rocky shoreline",
    caption: "The last warm light stays on the water.",
    width: 1600,
    height: 1067,
    frame: "3 / 2",
  },
  {
    id: "fog",
    file: "10",
    alt: "Pine forest disappearing into fog",
    caption: "The trees keep going after the fog starts.",
    width: 1600,
    height: 1067,
    frame: "4 / 5",
  },
  {
    id: "dock",
    file: "11",
    alt: "Wooden boats tied beside a cabin on a mountain lake",
    caption: "Boats waiting, mountains not.",
    width: 1600,
    height: 1067,
    frame: "5 / 4",
  },
  {
    id: "meadow",
    file: "12",
    alt: "Granite cliff rising over a sunlit meadow",
    caption: "The wall, and the grass in front of it.",
    width: 1600,
    height: 1067,
    frame: "16 / 9",
  },
];

export const photos: readonly OmbraItem[] = sources.map((source) => {
  const thumbSrc = `/photos/${source.file}-960.jpg`;
  const src = `/photos/${source.file}-1600.jpg`;

  return {
    id: source.id,
    alt: source.alt,
    caption: source.caption,
    width: source.width,
    height: source.height,
    frame: source.frame,
    thumbSrc,
    src,
    srcSet: `${thumbSrc} 960w, ${src} 1600w`,
  };
});
