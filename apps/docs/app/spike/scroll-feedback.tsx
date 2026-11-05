export type ScrollFeedback = "off" | "edges" | "emphasis" | "both";

const modes: { value: ScrollFeedback; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "edges", label: "Edge cues" },
  { value: "emphasis", label: "Thumbnail emphasis" },
  { value: "both", label: "Both" },
];

export function parseScrollFeedback(value: string | undefined): ScrollFeedback {
  return modes.find((mode) => mode.value === value)?.value ?? "off";
}

export function ScrollFeedbackControls({
  value,
  onChange,
}: {
  value: ScrollFeedback;
  onChange: (value: ScrollFeedback) => void;
}) {
  return (
    <fieldset className="mt-6 max-w-xl">
      <legend className="text-sm font-medium text-[#241e18]">Scroll feedback experiment</legend>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {modes.map((mode) => (
          <label
            key={mode.value}
            className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"
          >
            <input
              type="radio"
              name="scroll-feedback"
              value={mode.value}
              checked={mode.value === value}
              onChange={() => onChange(mode.value)}
              className="size-4 accent-[#8f3d2b]"
            />
            {mode.label}
          </label>
        ))}
      </div>
      <p className="mt-1 text-sm leading-6 text-[#241e18]/70">
        Choose a mode, then open a photo and swipe. Edge cues show more thumbnails off screen;
        emphasis follows the main photo. Close to compare modes. Reduced motion and browsers without
        CSS timeline support keep the original appearance.
      </p>
    </fieldset>
  );
}

const support = `(animation-timeline: --ombra-spike-strip) and
  (view-timeline: --ombra-spike-slide inline) and
  (scroll-timeline: --ombra-spike-strip inline) and
  (timeline-scope: --ombra-spike-strip) and
  (animation-range: cover 0% cover 100%) and
  (animation-range: calc(100% - 20px) 100%)`;

const edges = `
  [data-slot="ombra-viewer"] footer {
    position: relative;
    timeline-scope: --ombra-spike-strip;
  }

  [data-slot="ombra-thumbnails"] {
    scroll-timeline: --ombra-spike-strip inline;
  }

  [data-slot="ombra-viewer"] footer:has([data-overflowing="true"]) [data-slot="ombra-strip-edge-start"],
  [data-slot="ombra-viewer"] footer:has([data-overflowing="true"]) [data-slot="ombra-strip-edge-end"] {
    display: block;
    position: absolute;
    z-index: 1;
    bottom: calc(max(0.75rem, env(safe-area-inset-bottom)) + 0.25rem);
    width: 1.25rem;
    height: 2.75rem;
    pointer-events: none;
    animation: ombra-spike-edge-in linear both;
    animation-timeline: --ombra-spike-strip;
    animation-range: 0px 20px;
  }

  [data-slot="ombra-viewer"] footer [data-slot="ombra-strip-edge-start"] {
    left: 1rem;
    background: linear-gradient(to right, black, transparent);
  }

  [data-slot="ombra-viewer"] footer:has([data-overflowing="true"]) [data-slot="ombra-strip-edge-end"] {
    right: 1rem;
    background: linear-gradient(to left, black, transparent);
    animation-name: ombra-spike-edge-out;
    animation-range: calc(100% - 20px) 100%;
  }

  @keyframes ombra-spike-edge-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes ombra-spike-edge-out {
    from { opacity: 1; }
    to { opacity: 0; }
  }
`;

function emphasis(count: number): string {
  const names = Array.from({ length: count }, (_, index) => `--ombra-spike-slide-${index}`);

  // Names are scoped to each viewer; no global timeline or registry API is needed for this spike.
  return `
    [data-slot="ombra-sheet"] { timeline-scope: ${names.join(", ")}; }

    [data-slot="ombra-thumbnail"] { opacity: 1; }

    [data-slot="ombra-thumbnail"] img {
      animation: ombra-spike-emphasis linear both;
      animation-range: cover 0% cover 100%;
    }

    ${names
      .map(
        (name, index) => `
          [data-slot="ombra-slide"]:nth-child(${index + 2}) {
            view-timeline: ${name} inline;
          }
          [data-slot="ombra-thumbnail"]:nth-child(${index + 1}) img {
            animation-timeline: ${name};
          }
        `,
      )
      .join("\n")}

    @keyframes ombra-spike-emphasis {
      0%, 10%, 90%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    }
  `;
}

export function ScrollFeedbackStyles({ mode, count }: { mode: ScrollFeedback; count: number }) {
  if (mode === "off") return null;

  return (
    <style data-slot="spike-scroll-feedback">
      {`@media (prefers-reduced-motion: no-preference) {
        @supports ${support} {
          ${mode === "edges" || mode === "both" ? edges : ""}
          ${mode === "emphasis" || mode === "both" ? emphasis(count) : ""}
        }
      }`}
    </style>
  );
}
