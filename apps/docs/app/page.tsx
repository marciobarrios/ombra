import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-24">
      <p className="font-display text-sm tracking-[0.22em] text-brand">OMBRA</p>
      <h1 className="font-display mt-4 text-5xl leading-none sm:text-6xl">A lightbox you own.</h1>
      <p className="mt-6 max-w-xl text-lg leading-8 text-foreground/80">
        Ombra is a small, modern React lightbox built for performance and expressive motion. Native
        browser animations, fluid gestures, and zero animation-library dependencies. Copy the
        source, make it yours, and give your images room to shine.
      </p>
      <Link
        href="/spike"
        className="mt-8 inline-flex min-h-11 items-center self-start rounded-full bg-foreground px-5 text-sm text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        Open the morph spike
      </Link>
    </main>
  );
}
