# Autopilot

Project settings for the global `autopilot` skill. These override its defaults.
Everything in `AGENTS.md` still applies (stack, state rules, Linear and PR rules).

## Basics

- Base branch: `main`. Merge method: `gh pr merge <n> --squash --delete-branch`.
- Linear team: MAR. Confirm the issue belongs to Ombra before starting.
- Package manager: pnpm 10 on Node 24 (`.nvmrc`). Put the Node 24 bin first on `PATH`.

## Worktree setup

No local env files to copy. Run `pnpm install --frozen-lockfile`.

## Commands

Match CI (`.github/workflows/ci.yml`). Run all of these before opening the PR:

```bash
pnpm lint
pnpm format:check   # fix with `pnpm format`
pnpm typecheck
pnpm build
pnpm test:e2e       # needs `pnpm exec playwright install chromium webkit` once
```

- Dev server: `pnpm dev` (docs app, Next.js dev). For evidence and E2E, use the
  production server on `http://127.0.0.1:3000` (`pnpm build && pnpm start`);
  Playwright starts it itself when it isn't already running.
- Playwright projects: `chromium`, `webkit`, `chromium-mobile` (Pixel 7),
  `webkit-mobile` (iPhone 13). Run one with `pnpm test:e2e --project=webkit-mobile`.

## Verification

- Ombra is a gesture- and animation-heavy image viewer. Most issues are
  **interaction** changes: add or update a Playwright spec in `e2e/` that
  drives the gesture (see the existing `*-during-opening`, `zoom-*` and
  `close-reversal` specs for patterns) and run it on all four projects.
- Motion or frame-time changes: use the frame sampler
  (`e2e/frame-sampler.spec.ts`) for before/after numbers.
- The iOS Simulator is useful for Safari-specific behaviour (WebKit desktop is
  not iOS Safari). In T3 Code, use the device tools and release the device with
  `device_close` when done.
- Never add "confirm on a real iPhone" to the feature PR. Device-only checks
  (feel, frame time, VoiceOver, Low Power Mode) go on the milestone's gate
  issue (MAR-12 spike, MAR-81 v0.1, MAR-82 v1), related to this issue. List
  them in the PR under **Verification gaps** with a link to the gate.

## Evidence

- Interaction or animation change: screen recording before and after, from a
  mobile viewport (iPhone 13 size) on the spike page `apps/docs/app/spike`.
  Note the recorder's frame rate when smoothness is the point.
- Visual change: before/after screenshots in light **and** dark mode
  (the site follows `prefers-color-scheme`), desktop and mobile.
- State or flow change (`registry/ombra/gallery-state.ts` reducer, open/close
  lifecycle, engine hand-offs): Mermaid `stateDiagram-v2` of the events and
  transitions, before and after.

## Vercel Preview

- Depth: `full`. The docs site has no backend or user data, so drive the
  interactions on the Preview too.
- Production (the "before" side) is the live docs site from `main`.
- Open the Preview in the iOS Simulator's Safari as well as `agent-browser`:
  it's the closest automated check to a real iPhone, since desktop WebKit
  is not iOS Safari. Release the device with `device_close` afterwards.

## Production monitoring

- Production URL: https://www.useombra.dev (Vercel project `ombra`).
- After a merge: deployment Ready, smoke the home page, `/spike`, and the
  pages the issue touched (mobile and desktop), then Vercel runtime errors
  for 15 minutes.
- No logged-in area, so no test account.

## Merge rules

Auto-merge allowed at **low** risk when all checks are green. Never auto-merge
when the PR:

- adds a runtime dependency to the registry (only React, `@base-ui/react` and
  `cn` are allowed),
- changes `registry.json` item names or the public props/API of an `ombra-*`
  item (users copy these files, so a break can't be rolled back for them),
- relaxes an Oxlint rule or touches `tools/oxlint/` or `oxlint.config.ts`,
- changes CI (`.github/workflows/`).

## Don't

- Commit built registry JSON under `apps/docs/public/r`.
- Use `useState` anywhere, or add a lint disable for it.
- Commit `test-results/` or captures.
