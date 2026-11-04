import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-24">
      <p className="font-display text-sm tracking-[0.22em] text-[#8f3d2b]">OMBRA</p>
      <h1 className="font-display mt-4 text-5xl leading-none sm:text-6xl">A lightbox you own.</h1>
      <p className="mt-6 max-w-xl text-lg leading-8 text-[#241e18]/80">
        Ombra is an open-source React lightbox, distributed as a shadcn registry. The core stays on
        React, Base UI, and Tailwind. Motion is optional, and not in this spike.
      </p>
      <Link
        href="/spike"
        className="mt-8 inline-flex min-h-11 items-center self-start rounded-full bg-[#241e18] px-5 text-sm text-[#f6f1ea] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8f3d2b]"
      >
        Open the morph spike
      </Link>
    </main>
  );
}
