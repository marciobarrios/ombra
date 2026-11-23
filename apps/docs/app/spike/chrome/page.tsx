import { ChromeHarness } from "./chrome-harness";

/** Bench for caption chrome: a long caption, a node caption, and a "1 of 3" counter. */
export default function ChromePage() {
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-12">
      <h1 className="text-2xl text-foreground">Caption and counter chrome</h1>
      <ChromeHarness />
    </main>
  );
}
