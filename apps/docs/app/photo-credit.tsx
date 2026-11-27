// The docs' demo photos come from Unsplash. Each page that shows them prints this once, after
// its last demo, so the recipes stay free of text about the docs' own photos.
export function PhotoCredit() {
  return (
    <p className="mt-10 max-w-xl text-sm leading-6 text-foreground/70">
      Photographs from Unsplash, used under the Unsplash License. Thumbnails are cover crops; the
      viewer shows the full frame.
    </p>
  );
}
