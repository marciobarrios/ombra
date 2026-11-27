"use client";

import { useId, useReducer } from "react";
import type { ReactNode } from "react";

import { OmbraAlbum } from "@/components/ombra/ombra-album";
import type { OmbraAlbumPhoto } from "@/components/ombra/ombra-album";
import { OmbraGallery } from "@/components/ombra/ombra-gallery";
import type { OmbraGalleryItem } from "@/components/ombra/ombra-gallery";
import type { MorphEngine } from "@/components/ombra/types";
import { useReducedMotion } from "@/components/ombra/use-reduced-motion";

import { photos } from "../../../examples/photos";
import { PhotoCredit } from "../../photo-credit";
import {
  PLAYGROUND_ALBUM_TITLE,
  PLAYGROUND_DEFAULTS,
  PLAYGROUND_LAYOUTS,
  PLAYGROUND_MORPHS,
  playgroundKey,
  playgroundMorph,
} from "../../../lib/playground";
import type { PlaygroundLayout, PlaygroundSettings } from "../../../lib/playground";

const items: readonly OmbraGalleryItem[] = photos.map((photo) => ({
  ...photo,
  frame: `${photo.width} / ${photo.height}`,
}));

const album: readonly OmbraAlbumPhoto[] = photos.map((photo) => ({
  ...photo,
  sources: [{ srcSet: photo.srcSet, type: "image/jpeg" }],
}));

type PlaygroundAction =
  | { type: "layout-picked"; layout: PlaygroundLayout }
  | { type: "morph-picked"; morph: MorphEngine }
  | { type: "reduced-motion-toggled"; reducedMotion: boolean };

function playgroundReducer(
  state: PlaygroundSettings,
  action: PlaygroundAction,
): PlaygroundSettings {
  switch (action.type) {
    case "layout-picked":
      return state.layout === action.layout ? state : { ...state, layout: action.layout };
    case "morph-picked":
      return state.morph === action.morph ? state : { ...state, morph: action.morph };
    case "reduced-motion-toggled":
      return state.reducedMotion === action.reducedMotion
        ? state
        : { ...state, reducedMotion: action.reducedMotion };
  }
}

const optionClassName =
  "flex min-h-11 cursor-pointer items-center rounded-md px-3 text-sm text-foreground/70 transition-colors hover:text-foreground has-checked:bg-foreground/[0.08] has-checked:font-medium has-checked:text-foreground has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-brand";

function Choice<Value extends string>({
  legend,
  name,
  options,
  value,
  onPick,
}: {
  legend: string;
  name: string;
  options: readonly { value: Value; label: string }[];
  value: Value;
  onPick: (value: Value) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 font-display text-xs tracking-[0.18em] text-foreground/70 uppercase">
        {legend}
      </legend>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <label key={option.value} className={optionClassName}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onPick(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The controls, the live recipe they configure, and the code they map to. `snippets` holds
 * every combination, highlighted on the server, keyed by `playgroundKey`.
 */
export function Playground({ snippets }: { snippets: Readonly<Record<string, ReactNode>> }) {
  const [settings, dispatch] = useReducer(playgroundReducer, PLAYGROUND_DEFAULTS);
  const systemReduced = useReducedMotion();
  const name = useId();
  const morph = playgroundMorph(settings);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:gap-x-8">
        <Choice
          legend="Layout"
          name={`${name}-layout`}
          options={PLAYGROUND_LAYOUTS}
          value={settings.layout}
          onPick={(layout) => dispatch({ type: "layout-picked", layout })}
        />
        <Choice
          legend="Morph"
          name={`${name}-morph`}
          options={PLAYGROUND_MORPHS}
          value={settings.morph}
          onPick={(picked) => dispatch({ type: "morph-picked", morph: picked })}
        />
        <fieldset className="min-w-0">
          <legend className="mb-2 font-display text-xs tracking-[0.18em] text-foreground/70 uppercase">
            Motion
          </legend>
          <label className={`w-fit ${optionClassName}`}>
            <input
              type="checkbox"
              checked={settings.reducedMotion}
              onChange={(event) =>
                dispatch({
                  type: "reduced-motion-toggled",
                  reducedMotion: event.currentTarget.checked,
                })
              }
              className="mr-2 size-4 accent-foreground"
            />
            Reduced motion
          </label>
        </fieldset>
      </div>
      {systemReduced ? (
        <p className="text-sm leading-6 text-foreground/70">
          Your system asks for reduced motion, so every morph fades here.
        </p>
      ) : null}

      {/* A new recipe for a new layout: the two do not share a root. */}
      <div key={settings.layout}>
        {settings.layout === "gallery" ? (
          <OmbraGallery items={items} morph={morph} />
        ) : (
          <OmbraAlbum
            title={PLAYGROUND_ALBUM_TITLE}
            photos={album}
            morph={morph}
            className="max-w-md"
          />
        )}
      </div>
      <PhotoCredit />

      {snippets[playgroundKey(settings)]}
    </div>
  );
}
