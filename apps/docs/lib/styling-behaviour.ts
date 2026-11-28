import { browserSupport } from "./getting-started";
import type { Guide } from "./guides";
import { registryItems } from "./install";
import { listApiParts } from "./item-surface";
import type { ApiHook, ApiPart } from "./item-surface";

/**
 * The Styling contract and Behaviour notes pages. The slot and state tables come from
 * `item-surface.ts`, and the global CSS from `registry.json`, so neither can drift from
 * what the registry ships.
 */

type CssRules = { [selector: string]: string | CssRules };

function cssText(rules: CssRules, depth = 0): string {
  const indent = "  ".repeat(depth);

  return Object.entries(rules)
    .map(([key, value]) =>
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- shadcn's css field is a JSON tree: a string leaf is a declaration, an object is a rule block.
      typeof value === "string"
        ? `${indent}${key}: ${value};`
        : `${indent}${key} {\n${cssText(value, depth + 1)}\n${indent}}`,
    )
    .join("\n");
}

/** The global CSS every item ships through its `css` field, as `shadcn add` writes it. */
function registryCss(): string {
  return registryItems()
    .flatMap((item) => ("css" in item && item.css ? [cssText(item.css)] : []))
    .join("\n\n");
}

function partList(part: ApiPart): string {
  return `\`${part.name}\``;
}

function andList(names: readonly string[]): string {
  if (names.length < 2) return names.join("");

  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

function slotItems(): readonly string[] {
  return listApiParts().flatMap((part) =>
    part.slot ? [`\`${part.slot}\`: ${partList(part)}.`] : [],
  );
}

/** Each attribute or variable once, with the parts that set it. */
function hookItems(pick: (part: ApiPart) => readonly ApiHook[] | undefined): readonly string[] {
  const hooks = new Map<string, { note: string; parts: string[] }>();

  for (const part of listApiParts()) {
    for (const hook of pick(part) ?? []) {
      const entry = hooks.get(hook.name);

      if (entry) entry.parts.push(partList(part));
      else hooks.set(hook.name, { note: hook.note, parts: [partList(part)] });
    }
  }

  return [...hooks].map(
    ([name, { note, parts }]) => `\`${name}\`, set by ${andList(parts)}. ${note}`,
  );
}

export const styling: Guide = {
  slug: "styling",
  title: "Styling contract",
  description:
    "The data-slot names, state attributes and CSS variables Ombra publishes, how className and render work, and the global CSS each registry item ships.",
  sections: [
    {
      id: "class-names",
      title: "className and render",
      blocks: [
        {
          kind: "text",
          text: "Where a part has default classes, they are Tailwind CSS classes merged with yours through `cn()`, so a class you pass wins over a default it conflicts with. On the Base UI dialog parts and the controls, `className` may also be a function of the part's state that returns a string.",
        },
        {
          kind: "text",
          text: "Every part that renders an element, except `OmbraCaption` and the two recipes, takes Base UI's `render` prop, which swaps the element the part renders while keeping its behaviour, attributes and handlers. Pass an element, such as `render={<a href={href} />}`, or a function that spreads the props it receives onto your element: `render={(props) => <a {...props} href={href} />}`. The [API reference](/docs/api) lists the element each part renders by default.",
        },
        {
          kind: "text",
          text: "The files are yours, so a default you never want is better removed from the source than overridden on every use.",
        },
      ],
    },
    {
      id: "slots",
      title: "data-slot names",
      blocks: [
        {
          kind: "text",
          text: "Every part that renders an element carries a `data-slot`, so CSS can select it without a class of its own: `[data-slot=ombra-close]`.",
        },
        { kind: "list", items: slotItems() },
        {
          kind: "text",
          text: "Some slots belong to markup inside a part or to the recipes, not to a part of their own:",
        },
        {
          kind: "list",
          items: [
            "`ombra-sheet`: a wrapper you add around the content's children. The registry CSS scales and rounds it while the viewer is pulled.",
            "`ombra-thumbnails-frame` and `ombra-thumbnails-row`: the frame around the thumbnail strip and the row inside it.",
            "`ombra-live`: the polite live region inside `OmbraSlides`.",
            "`ombra-root`, `ombra-image` and `ombra-nav` in `OmbraGallery`, and `ombra-album-header` in `OmbraAlbum`. The recipes also replace the content's slot: their `OmbraContent` is `ombra-viewer` in the gallery and `ombra-album` in the album, so select those, not `ombra-content`, when you style a recipe. Keep `ombra-nav` on the gallery's previous and next wrappers: the opening morph fades it in with the controls around the photo.",
          ],
        },
      ],
    },
    {
      id: "state-attributes",
      title: "State attributes",
      blocks: [
        {
          kind: "text",
          text: "Parts report their state as `data-*` attributes, so a style can follow the viewer without React state: `[data-slot=ombra-content][data-phase=closing] .caption { opacity: 0 }`. The viewer's own attributes need an `OmbraRoot` around the parts.",
        },
        { kind: "list", items: hookItems((part) => part.dataAttributes) },
        {
          kind: "text",
          text: "Base UI's own attributes apply too: `data-open`, `data-closed`, `data-starting-style` and `data-ending-style` on the backdrop and the content.",
        },
      ],
    },
    {
      id: "css-variables",
      title: "CSS variables",
      blocks: [
        {
          kind: "text",
          text: "Values that change every frame are CSS variables, not props, so a drag or a pinch does not re-render React on each frame; the viewer renders only when a state such as `data-pulling` or `data-zoomed` changes. Read the variables in `calc()` to tie your own styles to the gesture: `opacity: calc(1 - max(var(--ombra-pull), -1 * var(--ombra-pull)))` fades a header as the viewer is pulled.",
        },
        { kind: "list", items: hookItems((part) => part.cssVariables) },
        {
          kind: "text",
          text: "`--ombra-pull-live`, on the document root, is the value `--ombra-pull` reads. The viewer writes it during a pull; style against `--ombra-pull` instead, because only the alias is part of the contract.",
        },
      ],
    },
    {
      id: "themes",
      title: "Light and dark themes",
      blocks: [
        {
          kind: "text",
          text: "The viewer has no colours of its own. `--ombra-surface` and `--ombra-ink` default to your `--color-background` and `--color-foreground`, so the backdrop, the controls, the captions and the thumbnail strip's edge fades follow whatever switches those tokens: a `prefers-color-scheme` query, or a class or attribute your theme toggle sets on `<html>`. Set the two variables on the content and the backdrop to give the viewer a different surface.",
        },
        {
          kind: "text",
          text: "iOS Safari 26 picks the colour of its status bar and toolbar once, while the backdrop is still fading in, and falls back to its default glass, which follows the system appearance. The bars blend in when your theme matches the system setting. When a manual choice differs from it, such as a dark theme on a phone set to light, the bars can show the other appearance around the viewer. Keep `color-scheme` on the root in step with the chosen theme.",
        },
      ],
    },
    {
      id: "global-css",
      title: "Global CSS",
      blocks: [
        {
          kind: "text",
          text: "Some styles cannot be classes on one element: the pull drives the sheet, the backdrop and the chrome together, and forced colours need system colours on every control. The `ombra` item ships them through its `css` field, and `shadcn add` writes them into your global stylesheet. Edit them there like your other styles.",
        },
        {
          kind: "list",
          items: [
            "`@property --ombra-pull-live` registers the pull as a number, so it can be interpolated and read in `calc()`.",
            "The sheet's transform and radius, and the backdrop's opacity, follow the pull. With reduced motion the sheet stays still and only the backdrop fades.",
            "`OmbraChrome` fades out while `data-chrome` is `hidden`, and comes back while focus is inside it.",
            "In forced colours, the buttons get a border, focus a `Highlight` outline, and the active thumbnail a `Highlight` border.",
          ],
        },
        { kind: "code", lang: "css", title: "The ombra item's css", text: registryCss() },
        {
          kind: "text",
          text: "The morph's View Transition styles and the thumbnail strip's edge cues ship as `<style>` elements the parts render, not as global CSS.",
        },
      ],
    },
  ],
};

export const behaviour: Guide = {
  slug: "behaviour",
  title: "Behaviour notes",
  description:
    "How the morph engines differ, what the trigger image needs, the accessibility you supply, the keyboard shortcuts, the gestures, and browser support.",
  sections: [
    {
      id: "morph-engines",
      title: "Morph engines",
      blocks: [
        {
          kind: "text",
          text: "`OmbraRoot` takes `morph`, the engine that carries the photo between the thumbnail and the viewer. `data-engine` on the content reports the engine requested, or `fade` under reduced motion.",
        },
        {
          kind: "list",
          items: [
            "`flip`, the default, animates a fixed copy of the photo with the Web Animations API. Its movement runs in `transform`-only effects, so the compositor runs it even when the main thread is busy; the corners animate in an effect of their own. It follows its target while in flight: a page scroll or a viewport resize retargets the close.",
            "`vt` runs the morph as a View Transition. A browser without `document.startViewTransition` runs `flip` instead.",
            "`fade` cross-fades the viewer in and out without moving the photo.",
            "**Reduced motion** forces `fade`, whatever `morph` asks for.",
          ],
        },
        {
          kind: "text",
          text: "Both moving engines put the photo on the same pixels at the same moment, so switching engines changes how the morph runs, not how it looks. A close during an opening leaves from the frame on screen.",
        },
        {
          kind: "text",
          text: "Known View Transitions limits, the reason `vt` is optional:",
        },
        {
          kind: "list",
          items: [
            "A view transition cannot run backwards, so a close during a `vt` opening hands the photo to a `flip` copy first.",
            "A view transition shows a snapshot of the page, so a swipe during the opening has to restart from the live box. On iOS Safari the swipe is blocked until the `vt` opening ends; `flip` lets it through.",
            "A press during a `vt` opening closes the viewer as a press outside it, so a vertical drag cannot cut the opening into a pull as it does with `flip`.",
            "While a view transition runs, every other `view-transition-name` on the page is cleared, so only the photo travels.",
          ],
        },
      ],
    },
    {
      id: "trigger-image",
      title: "What the trigger image needs",
      blocks: [
        {
          kind: "text",
          text: "The morph measures the thumbnail inside each `OmbraTrigger`: the first `<img>`, or the element you pass as `mediaRef`. It needs:",
        },
        {
          kind: "list",
          items: [
            "**A laid-out size.** Give the image a width and a height in CSS, so it has a box before the file loads.",
            "**Object fit.** Use `object-fit: cover`. The morph crops the full photo to the thumbnail's box as `cover` would, centred. A different fit, or an `object-position` off centre, starts the morph from a different frame than the one on screen.",
            "**No clipping and no transformed ancestor.** The morph measures the thumbnail's box on screen and flies its copy above the page, untransformed. A parent with `overflow: hidden` that cuts the thumbnail off, or a rotated, skewed or animating ancestor, makes the flight start or land somewhere the visible thumbnail is not. Round the image itself rather than a clipping wrapper.",
          ],
        },
        {
          kind: "text",
          text: "The crop is computed from the `width` and `height` you give `OmbraMedia`. A thumbnail file your CDN cropped to another aspect ratio, such as a square cut from a landscape photo, shows a different part of the photo than that crop. The morph then reframes mid-flight. Serve thumbnails at the photo's own ratio and let `object-fit` crop them.",
        },
        {
          kind: "text",
          text: "The viewer fades out instead of morphing when the trigger of the photo it shows is gone, or when less than 55% of the trigger's width or height is visible once the page has scrolled it into view, clipped by the viewport or a scroll container. It never morphs onto another photo's thumbnail.",
        },
      ],
    },
    {
      id: "accessibility",
      title: "Accessibility",
      blocks: [
        {
          kind: "text",
          text: "Base UI's dialog traps focus, makes the page behind it inert and locks its scroll. What Ombra cannot know, you supply:",
        },
        {
          kind: "list",
          items: [
            "**The dialog's name.** Put `aria-label` on `OmbraContent`, or an `OmbraTitle` inside it. Ombra ships no visible text.",
            "**Action labels.** Every icon-only control needs an `aria-label` in your language: close, previous, next, the zoom buttons and each thumbnail. Each trigger needs a name too, usually its image's `alt`.",
            "**Slide names.** Name each `OmbraSlide` after its photo with `aria-label`, and give the image inside it an empty `alt` so the name is read once.",
          ],
        },
        {
          kind: "list",
          items: [
            "**Focus on open.** Focus starts on the first enabled `OmbraClose`, without scrolling the page. With no enabled close button, it goes to the dialog itself.",
            "**Focus on close.** Focus returns to the trigger of the photo on screen, even after navigating. With that trigger gone, it goes to the nearest rendered trigger. In browsers that support `focusVisible`, the focus ring shows only when the viewer was last used from the keyboard.",
            "**Live region.** `OmbraSlides` holds a polite live region that announces each slide the track comes to rest on, `Image 3 of 12` by default. Pass `announce` to word it, as `OmbraGallery` does to add the caption.",
            "**Only the active slide** is exposed to assistive technology; the others are hidden until they become active.",
            "**Reduced motion** turns every morph into a fade, keeps the pulled sheet still and jumps between slides instead of scrolling.",
            "**Forced colours** get borders and `Highlight` outlines from the global CSS.",
          ],
        },
      ],
    },
    {
      id: "keyboard",
      title: "Keyboard shortcuts",
      blocks: [
        {
          kind: "list",
          items: [
            "`ArrowLeft` and `ArrowRight`: the previous and next photo.",
            "`Home` and `End`: the first and last photo.",
            "`+` or `=`: zoom in. `-` or `_`: zoom out. `0`: back to the fitted size. On a slide without `OmbraZoom` these keys do nothing, but the viewer still takes them.",
            "`Escape`: close.",
            "`Tab` moves through the controls and stays inside the viewer. `Enter` or `Space` presses the focused control.",
          ],
        },
        {
          kind: "text",
          text: "The navigation and zoom shortcuts above stand aside when they would take a key from something else: with Ctrl, Meta or Alt held, while an IME composes, inside a form field, a media control, an editable element or a widget with keys of its own such as a menu, slider or tab list, and, for the arrows and `Home` or `End`, inside a scroller of your own on that axis or with Shift held. `Escape`, `Tab`, `Enter` and `Space` are the dialog's and the buttons' own. Your `onKeyDown` on `OmbraContent` runs first, and `event.preventDefault()` there replaces a shortcut.",
        },
      ],
    },
    {
      id: "gestures",
      title: "Gestures",
      blocks: [
        {
          kind: "list",
          items: [
            "**Swipe** between photos with a finger, a sideways trackpad scroll, or a sideways wheel. The track is native CSS scroll snap, so it moves the way the platform scrolls.",
            "**Pull to dismiss** up or down, by touch, mouse drag or a vertical trackpad swipe. A pull that goes far enough, or is released fast enough in the direction of the pull, closes the viewer; a shorter, slower one settles back. A trackpad swipe has no release, so it closes as soon as it crosses the threshold. The close lands the same way as any other: a morph onto the thumbnail when there is one to land on, a fade otherwise, and a fade with `fade` or reduced motion. While the track is still snapping, only a plainly vertical drag pulls, so a slightly diagonal flick to the next photo does not close it.",
            "**Zoom** on a slide with `OmbraZoom`: pinch, double-tap or double-click, Ctrl and the wheel, or a trackpad pinch. Zoom stops where the photo shows at its natural size, or at `maxScale`, and the first zoom past the fitted size raises `sizes` on an `img` with `srcset`, so the browser loads a sharper file.",
            "**Pan** a zoomed photo by dragging it. Past its edge the drag carries on into the neighbouring photo, and on release the track glides there or back, depending on how far and how fast it went.",
            "**Tap** the photo to hide or show the `OmbraChrome` regions.",
          ],
        },
        {
          kind: "text",
          text: "One gesture owns the photo at a time: a pinch never scales a photo that is being pulled, and a pull ignores a second finger once it starts. A vertical drag during a `flip` or `fade` opening cuts it and closes from where the photo is; during a `vt` opening, a press closes the viewer as a press outside it. A trackpad swipe that closes the viewer does not scroll the page with the momentum that follows.",
        },
      ],
    },
    browserSupport,
  ],
};
