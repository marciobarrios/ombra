# Ombra agent notes

Ombra is a shadcn registry, not an npm component library. Users copy files. Do not add a runtime dependency to the core beyond React, `@base-ui/react`, and `cn`.

## Linear issues and pull requests

- Confirm that each Linear issue belongs to Ombra and matches the change before linking it.
- For every issue fully resolved by a PR, include a separate `Fixes MAR-123` line in the PR description, replacing the example with the actual issue identifier. A bare ID, branch name, or PR comment is not a substitute for an explicit closing keyword in the description.
- For partial work, investigations with remaining acceptance criteria, or related follow-ups, use `Refs MAR-123` (contributing work) or `Relates to MAR-123` (context only). Do not use a closing keyword until the PR completes the issue's scope.
- Before handing off a PR, verify its saved description contains the intended closing lines and the issues are linked in Linear. Automatic completion requires the team's GitHub integration to map **On PR or commit merge** to **Done**; when multiple PRs implement one issue, completion waits for the final linked PR. See [Linear's GitHub integration docs](https://linear.app/docs/github).
- When reconciling stale issues, verify the implementing PRs have merged and the issue's acceptance criteria are satisfied, then mark the issue Done with links to the merged PRs. Keep issues open when implementation or required validation remains.

## Stack

- pnpm 10, Node.js 24 (`.nvmrc`). This VM’s `/exec-daemon/node` is Node 22 and sits earlier on `PATH`. Put the Node 24 bin first before `pnpm`, `next`, `oxlint`, or Playwright.
- React 19 and Next.js 16 (App Router, Cache Components) in `apps/docs`.
- TypeScript 7. Next 16.4 typechecks with the project-local `tsc` CLI. Leave that default alone (`useTypeScriptCli` stays on). TypeScript 7.0 has no programmatic API. `pnpm typecheck` runs `next typegen` first because `next-env.d.ts` and the route types are generated and gitignored.
- Tailwind CSS 4. Registry files are scanned with `@source "../../../registry"` in `apps/docs/app/globals.css`.
- shadcn on Base UI (`components.json` style `base-nova`). `lib/utils.ts` re-exports the `cn` package. Dialog primitives come from `@base-ui/react/dialog`.
- Oxlint and Oxfmt. The anti-slop plugin is vendored at `tools/oxlint/anti-slop` (ignored by both tools). `@oxlint/plugins` must match the installed `oxlint` version exactly. Record any rule relaxation with an inline comment saying why.
- Playwright projects: `chromium`, `webkit`, `chromium-mobile` (Pixel 7), `webkit-mobile` (iPhone 13). WebKit here is not iOS Safari.

## Registry

- Item names are `ombra-*`.
- Source lives in `registry/ombra`. `registry/package.json` exists only so the workspace can resolve `react` and `@base-ui/react` for files outside `apps/docs`. `shadcn build` does not publish that package file. Run the build from the repo root: `shadcn build registry.json -o apps/docs/public/r`. Paths in `registry.json` are relative to that file, and the CLI resolves them from the process cwd.
- Built JSON under `apps/docs/public/r` is generated. Do not commit it.
- The spike UI may live in `apps/docs/app/spike`. Promote something into `registry/ombra` only when the behaviour is worth keeping.

## Spike behaviour

- Missing `?engine=` defaults to `flip`, matching the product default confirmed in MAR-12 on 6 November 2026. View Transitions remain optional. Reduced motion forces `fade`. Spring versus cubic is still undecided.
- Morph engines: `vt` (View Transition API), `flip` (WAAPI FLIP on a fixed clone), `fade`.
- FLIP animates `transform` and `clip-path` only. The clone is on `document.body` so the dialog cannot clip it.
- Slide track and thumbnail strip use native scroll-snap. Zoom sets `overflow: hidden` and `touch-action: none` on the track until the scale returns to 1, and hands extra pan off to `scrollLeft`.
- Pull progress is the CSS variable `--ombra-pull-live` on `documentElement`, not React state, so a drag does not re-render every frame.

## Inspiration

Demos from other lightboxes are ideas only. Do not copy their source, CSS, or docs. In particular, ramka is GPL-3.0 or paid.
