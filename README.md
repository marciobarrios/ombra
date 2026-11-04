# Ombra

Ombra (Catalan for “shadow”) is an open-source React lightbox. It is distributed as a [shadcn registry](https://ui.shadcn.com): you copy the source into your app with `shadcn add`, and you do not take a runtime dependency on an Ombra package.

The core is React, [Base UI](https://base-ui.com) Dialog, and Tailwind. There is no animation library in the core. Motion, themes, and the final compound API come later. This repository currently holds the workspace scaffold and a morph-engine spike at `/spike`.

## Develop

Node.js 24 (`nvm use`) and pnpm 10.

```bash
pnpm install
pnpm dev
```

The docs app serves the home page and the spike at <http://127.0.0.1:3000/spike>.

| Script | What it does |
| --- | --- |
| `pnpm dev` | Next.js dev server for `apps/docs` |
| `pnpm build` | Registry JSON, then the Next.js production build |
| `pnpm lint` | Oxlint, including the vendored anti-slop plugin |
| `pnpm format` / `pnpm format:check` | Oxfmt |
| `pnpm typecheck` | `next typegen` and `tsc` |
| `pnpm test:e2e` | Playwright (Chromium, WebKit, and mobile device profiles) |
| `pnpm registry:build` | `shadcn build` into `apps/docs/public/r` |

`pnpm test:e2e` expects a production build already, because Playwright starts `next start`.

## Registry

`registry.json` at the repo root is the install entry. `pnpm registry:build` writes `apps/docs/public/r` (gitignored) so the docs site can serve the built items. Items in this spike:

- `ombra` — gallery, morph, pull, and zoom used by the spike. The compound API is not final.
- `ombra-morph` — geometry, FLIP / View Transition helpers, and the frame sampler.
- `ombra-zoom` — pinch, double-tap, and ctrl+wheel zoom.

## Deploying the docs app

One Vercel project, rooted at the docs app. Do not create the project from this repo automatically.

- Root Directory: `apps/docs`
- Install: default is fine when Vercel installs the pnpm workspace from the repository root. If the install runs inside `apps/docs` and cannot see the lockfile, set it to `cd ../.. && pnpm install --frozen-lockfile`.
- Build: the package script, `pnpm --dir ../.. run registry:build && next build`
- Output: `apps/docs/.next`
- Node.js 24

## Layout

- `apps/docs` — Next.js App Router docs shell and the `/spike` page
- `registry/ombra` — source copied by the registry. It is also a private workspace package so TypeScript and Next can resolve React from outside `apps/docs`.
- `tools/oxlint/anti-slop` — vendored [anti-slop](https://github.com/dmmulroy/anti-slop) plugin (see `UPSTREAM`)
- `e2e` — Playwright tests

See `AGENTS.md` for conventions and `SPIKE.md` for the engine comparison.
