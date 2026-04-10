# neko-claimer — Design

**Date:** 2026-04-08
**Status:** Approved for planning

## Goal

A single Docker image that bundles [neko](https://github.com/m1k1o/neko) (a containerized browser with a web UI streamed over WebRTC) and a Playwright-based "claimer" that periodically visits Epic Games, Amazon Prime Gaming, and GOG to claim free games and rewards. The user logs into each site **once**, manually, via the neko web UI from any device. The browser profile persists on a mounted volume, so subsequent automated runs reuse the logged-in session. Results are reported via Apprise.

Inspired by [free-games-claimer](https://github.com/P-Adamiec/free-games-claimer), but with the neko twist: the same browser is both the automation target and a remotely-accessible interactive session, so re-login from a phone is trivial and no credentials are ever stored in env vars.

## Non-goals

- Auto-filling site credentials from env vars (manual login only)
- Solving captchas or 2FA programmatically
- A web dashboard beyond what neko already provides
- Supporting more than Epic / Prime / GOG in v1 (the architecture supports adding sites, but v1 ships these three)

## Architecture

A single container runs two cooperating processes under `tini` (PID 1):

1. **neko** — long-running. Hosts the web UI on `NEKO_PORT` and runs a Chromium instance with `--remote-debugging-port=9223` and `--user-data-dir=/data/profile`. CDP is exposed on localhost only.
2. **claimer** — a Bun/TypeScript process. In `RUN_MODE=schedule` it stays alive and an in-process cron fires on `CRON_SCHEDULE`. In `RUN_MODE=once` it runs a single claim pass and then exits, which terminates the container (intended for ad-hoc runs and k8s CronJob usage).

On each scheduled tick the claimer:

1. Connects to the running Chromium via `playwright.chromium.connectOverCDP('http://localhost:9223')`.
2. Iterates the enabled site modules. For each, it opens a fresh `BrowserContext`/`Page`, calls `isLoggedIn(page)`, and either calls `claim(page)` or records `login_required`.
3. Aggregates per-site results into a single run summary.
4. Sends one Apprise notification per the `NOTIFY_ON` filter rules.
5. Disconnects from CDP. Chromium and neko keep running.

### Why bundled (not two containers)

Discussed during brainstorming. The bundled image supports two deploy patterns from one artifact: a long-running `Deployment` (neko always available for re-login from a phone) and a stateless k8s `CronJob` sharing the profile PVC (neko only alive during runs). The cost is that one-shot mode kills neko on exit — acceptable, since one-shot is intended for ad-hoc / CronJob use.

## Code layout

```
src/
  entrypoint.ts        # parses env, starts neko subprocess, waits for CDP, starts scheduler
  config.ts            # env parsing + validation (zod)
  scheduler.ts         # once vs cron dispatch
  claimer.ts           # connectOverCDP, iterate sites, collect results
  sites/
    types.ts           # SiteClaimer interface
    epic.ts
    prime.ts
    gog.ts
  notify.ts            # shells out to `apprise` CLI
  logger.ts
docker/
  Dockerfile
  neko.config          # neko config template, env-substituted at start
test/
  config.test.ts
  notify.test.ts
  scheduler.test.ts
  sites/*.test.ts      # selector smoke tests against fixture HTML
```

Each site module is fully isolated behind the `SiteClaimer` interface. Adding a fourth site is one new file in `src/sites/` plus one line in a registry — no edits to `claimer.ts`, `scheduler.ts`, `notify.ts`, or `config.ts`. Site modules never read env, never know about neko, cron, or notifications.

## `SiteClaimer` interface

```ts
interface SiteClaimer {
  name: string;            // "epic" | "prime" | "gog"
  homeUrl: string;
  isLoggedIn(page: Page): Promise<boolean>;
  claim(page: Page): Promise<ClaimResult>;
}

type ClaimResult =
  | { status: 'claimed'; items: string[] }
  | { status: 'nothing' }
  | { status: 'login_required' }
  | { status: 'error'; error: string };
```

## Configuration

All config via env vars. Validated with zod at startup; invalid config exits 1 with a clear message.

### Core
- `RUN_MODE` — `once` | `schedule` (default `schedule`)
- `CRON_SCHEDULE` — e.g. `0 12 * * *` (required when `RUN_MODE=schedule`)
- `TZ` — IANA timezone for cron (default `UTC`)
- `LOG_LEVEL` — `info` | `debug` (default `info`)

### Sites
- `CLAIM_EPIC` — `true` | `false` (default `true`)
- `CLAIM_PRIME` — `true` | `false` (default `true`)
- `CLAIM_GOG` — `true` | `false` (default `true`)

### Neko
- `NEKO_PASSWORD` — required, user password for the web UI
- `NEKO_ADMIN_PASSWORD` — required, admin password for the web UI
- `NEKO_PORT` — default `8080`
- Profile path is fixed at `/data/profile` (mount `/data` as a volume / PVC)

### Notifications
- `APPRISE_URLS` — comma-separated Apprise URLs (optional; if empty, notifications are disabled)
- `NOTIFY_ON` — comma-separated subset of `claimed,error,login_required,nothing` (default `claimed,error,login_required` — silent when nothing happened)

## Container

- **Base image:** `ghcr.io/m1k1o/neko/chromium:latest` — already provides neko, Chromium, the necessary system libs, and a non-root `neko` user (UID 1000).
- **Layered on top:**
  - Bun runtime
  - Compiled application copied to `/app`
  - `apprise` installed via `pipx` (or apt if available) so the CLI is on `PATH`
- **User:** runs as the existing non-root `neko` user (UID 1000). `/data` is chowned to it at image-build time and expected to be writable at runtime.
- **PID 1:** `tini`. Entrypoint shell script starts neko in the background, polls `http://localhost:9223/json/version` until it responds (with a timeout), then `exec`s `bun run /app/dist/entrypoint.js`.
- **Exposed:** `NEKO_PORT` (default 8080) for the neko web UI.
- **Volume:** `/data` (holds `profile/` and any future state).

## Notifications

`notify.ts` builds a single Markdown body from the `ClaimResult[]` for the run, then shells out:

```
apprise -t "neko-claimer" -b "<body>" <url1> <url2> ...
```

Filtering: a run is reported if **any** of its results match a status listed in `NOTIFY_ON`. One notification per run, never per-site. If `APPRISE_URLS` is empty, the function is a no-op (still logs).

## Error handling

- **Per-site errors** are caught inside `claimer.ts` and recorded as `{status: 'error', error}`. One failing site never blocks the others.
- **`login_required`** is detected by `isLoggedIn()` returning false. The claimer skips `claim()` for that site and reports `login_required` so the user is notified to open the neko UI and re-authenticate.
- **Uncaught exceptions in a scheduler tick** are caught at the top of the tick, logged, and reported via Apprise as a synthetic error result. The scheduler keeps running so the next tick still fires.
- **neko subprocess crash** causes the entrypoint to exit non-zero, which lets the container restart policy (Docker / k8s) recover the whole pod.
- **CDP connect failure** at tick start is treated as a tick-level error (logged + notified) but does not kill the scheduler.

## Testing

`bun test` covers:

- **`config.test.ts`** — env parsing: defaults, valid combinations, invalid combinations (e.g. `RUN_MODE=schedule` without `CRON_SCHEDULE`).
- **`notify.test.ts`** — mocks the `apprise` binary on `PATH`, asserts argv and that filtering by `NOTIFY_ON` works.
- **`scheduler.test.ts`** — once vs schedule dispatch, error isolation between sites, top-level error recovery.
- **`sites/*.test.ts`** — `isLoggedIn` against saved fixture HTML (logged-in and logged-out variants). Selectors are exercised but no live network.

No live-site tests in CI (too brittle). A manual `bun run smoke` script connects to a locally running neko container for hand-testing during development.

## Deployment patterns (documented in README)

1. **k8s `Deployment`** (primary use case) — 1 replica, PVC mounted at `/data`, `RUN_MODE=schedule`, ingress/port-forward to neko UI for login-from-phone. Neko is always available for re-authentication.
2. **k8s `CronJob`** — same image, `RUN_MODE=once`, shared PVC at `/data`. Neko is only alive during runs; logins persist via the PVC. Cleaner k8s-native job model at the cost of "log in any time."
3. **docker compose** — single service, named volume for `/data`, `RUN_MODE=schedule` with internal cron.

## Open questions

None at design time. Each site's exact selectors and login-detection heuristics will be discovered during implementation against the live sites (with the neko UI used for manual exploration).
