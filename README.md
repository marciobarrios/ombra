# Ombra

Ombra (Catalan for “shadow”) is an open-source React lightbox. It is distributed as a [shadcn registry](https://ui.shadcn.com): you copy the source into your app with `shadcn add`, and you do not take a runtime dependency on an Ombra package.

The core is React, [Base UI](https://base-ui.com) Dialog, and Tailwind. There is no animation library in the core. The public API is composition-first: assemble triggers, slides, media, and controls in JSX, with editable defaults copied into your app. Two editable recipes, a grid gallery and a single-cover album, are built from the same parts. See the [composition guide](COMPOSITION.md) for the parts, the recipes, and the morph-engine spike at `/spike`.

The architecture has three layers: behavior primitives, editable styled parts, and ready-made recipes built from the same public parts. [MAR-64](https://linear.app/marciobarrios/issue/MAR-64/migrate-the-lightbox-spike-to-composable-primitives-and-gallery) tracks the migration for v0.1.

## Develop

Node.js 26 (`nvm use` or mise, from `.nvmrc`) and pnpm 10.

```bash
pnpm install
pnpm dev
```

The docs app serves the home page and the spike at <http://127.0.0.1:3000/spike>.

| Script                              | What it does                                              |
| ----------------------------------- | --------------------------------------------------------- |
| `pnpm dev`                          | Next.js dev server for `apps/docs`                        |
| `pnpm build`                        | Registry JSON, then the Next.js production build          |
| `pnpm lint`                         | Oxlint, including the vendored anti-slop plugin           |
| `pnpm format` / `pnpm format:check` | Oxfmt                                                     |
| `pnpm typecheck`                    | `next typegen` and `tsc`                                  |
| `pnpm test:e2e`                     | Playwright (Chromium, WebKit, and mobile device profiles) |
| `pnpm budget`                       | Core gzip size, animation libraries, and the overrun test |
| `pnpm registry:build`               | `shadcn build` into `apps/docs/public/r`                  |
| `pnpm registry:validate`            | `shadcn registry validate` on `registry.json`             |

`pnpm test:e2e` expects a production build already, because Playwright starts `next start`.

## Performance

The budget, how each number is measured, and the iPhone frame-time readout are in [PERFORMANCE.md](PERFORMANCE.md) and on the docs site at `/performance`. `pnpm budget` fails when the gallery and album bundle, zoom included and Base UI excluded, gzip past 32 KB, or when the core imports an animation library. The Chromium suite fails when a sampled gesture frame passes 50 ms.

## Install

Ombra needs a project set up for shadcn with Tailwind CSS 4 (`npx shadcn@latest init`). Then add the core item from the docs site:

```bash
npx shadcn@latest add https://www.useombra.dev/r/ombra.json
```

That copies every part and both recipes into `components/ombra/` (`src/components/ombra/` in a `src/` project), adds `@base-ui/react` and `cn` to your dependencies, and appends the pull-to-dismiss styles to your global CSS. No animation library is installed. Import from the copied files:

```tsx
import { OmbraGallery } from "@/components/ombra/ombra-gallery";
```

The repository is public, so the docs site's URL is the only install path; it needs no token. To install from a branch or a fork instead, build the registry (`pnpm registry:build`) and pass the built file's path or URL to `shadcn add`.

Each registry item has a docs page with a Copy prompt button for a coding agent (`/docs/ombra`, and the same path for `ombra-morph` and `ombra-zoom`). The prompt is generated from this file's `title`, `description` and `docs`, the component props, and the usage example in `apps/docs/examples`, which the docs app typechecks. `/llms.txt` lists the pages, and every docs page is also served as Markdown with no site chrome (`/docs/ombra.md`).

## Registry

`registry.json` at the repo root is the install entry. `pnpm registry:build` writes `apps/docs/public/r` (gitignored) so the docs site can serve the built items, and `pnpm registry:validate` checks it (CI runs both). Every file has a `target` in `components/ombra/`, because the files import each other relatively; without it shadcn would split them across `components/`, `lib/` and `hooks/`. Items:

- `ombra` — the parts, the gallery and album recipes, and the morph, pull and zoom internals. Its `css` carries the pull styles, which the docs app keeps in `globals.css`.
- `ombra-morph` — geometry, FLIP / View Transition helpers, and the frame sampler.
- `ombra-zoom` — pinch, double-tap, ctrl+wheel, and Safari trackpad-pinch zoom, up to the photo's natural size.

One installable item per part and recipe comes in [MAR-87](https://linear.app/marciobarrios/issue/MAR-87).

## Deploying the docs app

One Vercel project, rooted at the docs app. Do not create the project from this repo automatically.

- Root Directory: `apps/docs`
- Install: default is fine when Vercel installs the pnpm workspace from the repository root. If the install runs inside `apps/docs` and cannot see the lockfile, set it to `cd ../.. && pnpm install --frozen-lockfile`.
- Build: the package script, `pnpm --dir ../.. run registry:build && next build`
- Output: `apps/docs/.next`
- Node.js 26 (`engines` in `apps/docs/package.json`, the Vercel root directory; it overrides the project setting)

## Layout

- `apps/docs` — Next.js App Router docs shell and the `/spike` page
- `registry/ombra` — source copied by the registry. It is also a private workspace package so TypeScript and Next can resolve React from outside `apps/docs`.
- `tools/oxlint/anti-slop` — vendored [anti-slop](https://github.com/dmmulroy/anti-slop) plugin (see `UPSTREAM`)
- `e2e` — Playwright tests

See `AGENTS.md` for conventions and `SPIKE.md` for the engine comparison.
