# agc — another games claimer

Bundled [Kasm Workspaces Chromium](https://github.com/kasmtech/workspaces-images) + Playwright claimer that visits Epic Games, Amazon Prime Gaming, and GOG to claim free items on a schedule. Log in once from any device via the Kasm web UI (HTTPS over a single TCP port — works behind any reverse proxy / Cloudflare tunnel / Tailscale node); the browser profile persists on a mounted volume.

## Configuration

All configuration is via environment variables.

| Variable | Default | Description |
|---|---|---|
| `RUN_MODE` | `schedule` | `once` or `schedule` |
| `CRON_SCHEDULE` | — | required when `RUN_MODE=schedule`, e.g. `0 12 * * *` |
| `TZ` | `UTC` | IANA timezone |
| `LOG_LEVEL` | `info` | `info` or `debug` |
| `CLAIM_EPIC` | `true` | enable Epic Games |
| `CLAIM_PRIME` | `true` | enable Amazon Prime Gaming (includes auto-redemption of GOG keys on gog.com) |
| `CLAIM_GOG` | `true` | enable GOG |
| `CLAIM_ITCH` | `false` | enable itch.io (login detection only — claim flow is a stub) |
| `CLAIM_UBISOFT` | `false` | enable Ubisoft Connect (login detection only — claim flow is a stub) |
| `CLAIM_XBOX` | `false` | enable Xbox / Microsoft Store (login detection only — claim flow is a stub) |
| `VNC_PW` | — | Kasm web UI password — set this to whatever you want to log in with |
| `APPRISE_URLS` | — | comma-separated Apprise URLs |
| `NOTIFY_ON` | `claimed,error,login_required` | comma-separated subset of `claimed,error,login_required,nothing` |

Mount `/data` to persist the browser profile (`/data/profile`).

The Kasm web UI is exposed on port **6901** (HTTPS).

## Deployment patterns

### Docker Compose (long-running, primary use case)

```yaml
services:
  agc:
    image: agc:dev
    environment:
      RUN_MODE: schedule
      CRON_SCHEDULE: "0 12 * * *"
      TZ: Europe/Berlin
      VNC_PW: changeme
      APPRISE_URLS: "ntfy://ntfy.example.com/claims"
    ports:
      - "6901:6901"
    volumes:
      - claimer-data:/data
    restart: unless-stopped
volumes:
  claimer-data: {}
```

Open `https://localhost:6901` (accept the self-signed cert), log in with username `kasm_user` and the password you set in `VNC_PW`, then drive the browser to Epic / Prime / GOG and sign in. The profile in `/data/profile` is reused by every scheduled claim run.

### Kubernetes Deployment (long-running)

`Deployment` with 1 replica, PVC mounted at `/data`, `Service` + `Ingress` (with TLS termination if you want — Kasm self-signs by default) to port `6901`.

### Kubernetes CronJob (one-shot)

`CronJob` with the same image, `RUN_MODE=once`, sharing the profile PVC. The container is only alive during runs; it shuts down cleanly when the claimer pass finishes.

## Adding a new site

1. Create `src/sites/<name>.ts` exporting a `SiteClaimer`.
2. Add a `CLAIM_<NAME>` env var to `src/config.ts`.
3. Wire it in `src/sites/registry.ts`.
4. Add fixture-based tests under `test/sites/`.

## Development

```bash
bun install
bunx playwright install chromium
bun test
bun run typecheck
```

To rebuild and smoke-test the container locally:

```bash
docker build -f docker/Dockerfile -t agc:dev .
docker run --rm -p 6901:6901 -v $PWD/data:/data \
  -e VNC_PW=password \
  -e RUN_MODE=schedule -e CRON_SCHEDULE="0 12 * * *" \
  agc:dev
```
