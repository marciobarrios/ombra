import Link from "next/link";

import { OmbraGallery } from "../../../registry/ombra/ombra-gallery";
import { OmbraMosaic } from "../../../registry/ombra/ombra-mosaic";
import { photos } from "./spike/photos";

const demo = photos.slice(0, 6);

const linkClassName =
  "inline-flex min-h-11 items-center text-sm underline decoration-foreground/30 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 pt-24 pb-16">
      <div className="max-w-3xl">
        <p className="font-display text-sm tracking-[0.22em] text-brand">OMBRA</p>
        <h1 className="font-display mt-4 text-5xl leading-none sm:text-6xl">A lightbox you own.</h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-foreground/80">
          Ombra is a small, modern React lightbox built for performance and expressive motion.
          Native browser animations, fluid gestures, and zero animation-library dependencies. Copy
          the source, make it yours, and give your images room to shine.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link
            href="/docs"
            className="inline-flex min-h-11 items-center rounded-full bg-foreground px-5 text-sm text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Read the docs
          </Link>
          <Link href="/docs/quick-start" className={linkClassName}>
            Quick start
          </Link>
          <Link href="/spike" className={linkClassName}>
            Open the morph spike
          </Link>
          <Link href="/performance" className={linkClassName}>
            Performance budget
          </Link>
        </div>
      </div>
      <section aria-labelledby="demo" className="mt-20">
        <h2 id="demo" className="font-display text-2xl">
          Try it
        </h2>
        <p className="mt-2 text-sm leading-6 text-foreground/70">
          Press a photo. Swipe or use the arrow keys, pinch or double-tap to zoom, and pull up or
          down to close.
        </p>
        <div className="mt-6">
          <OmbraGallery items={demo}>
            <OmbraMosaic />
          </OmbraGallery>
        </div>
      </section>
    </main>
  );
}
