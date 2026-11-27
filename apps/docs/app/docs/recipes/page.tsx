import type { Metadata } from "next";

import { AlbumRecipe, BentoRecipe, GalleryRecipe, MosaicRecipe } from "../../../examples/recipes";
import { recipes } from "../../../lib/guides";
import { GuidePage } from "../guide-page";

export const metadata: Metadata = {
  title: `${recipes.title} — Ombra`,
  description: recipes.description,
};

function RecipesDemo() {
  return (
    <div className="flex flex-col gap-10">
      <div>
        <h3 className="mb-4 font-mono text-xs text-foreground/70">OmbraGallery</h3>
        <GalleryRecipe />
      </div>
      <div>
        <h3 className="mb-4 font-mono text-xs text-foreground/70">OmbraGallery with OmbraBento</h3>
        <BentoRecipe />
      </div>
      <div>
        <h3 className="mb-4 font-mono text-xs text-foreground/70">OmbraGallery with OmbraMosaic</h3>
        <MosaicRecipe />
      </div>
      <div>
        <h3 className="mb-4 font-mono text-xs text-foreground/70">OmbraAlbum</h3>
        <AlbumRecipe />
      </div>
    </div>
  );
}

export default function RecipesPage() {
  return <GuidePage guide={recipes} demo={<RecipesDemo />} />;
}
