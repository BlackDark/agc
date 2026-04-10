# syntax=docker/dockerfile:1.6
# Default build target is `production` (last stage). For plain-HTTP Kasm UI: `docker build --target dev`.
# See: https://github.com/kasmtech/workspaces-core-images/issues/2 (remove -sslOnly; require_ssl: false)
FROM kasmweb/chromium:1.18.0 AS base

USER root

# apprise (via pipx) + bun runtime + wget for the CDP readiness probe
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       ca-certificates curl unzip wget python3-pip python3-venv pipx \
  && PIPX_HOME=/opt/pipx PIPX_BIN_DIR=/usr/local/bin pipx install apprise \
  && curl -fsSL https://bun.sh/install | BUN_INSTALL=/opt/bun bash \
  && ln -sf /opt/bun/bin/bun /usr/local/bin/bun \
  && rm -rf /var/lib/apt/lists/*

# Node 22 + tsx: Playwright connectOverCDP hangs on the WebSocket step under Bun; native WS to the same URL works.
RUN ARCH=$(dpkg --print-architecture) \
  && case "$ARCH" in amd64) NA=x64;; arm64) NA=arm64;; *) echo "unsupported arch: $ARCH" >&2; exit 1;; esac \
  && curl -fsSL "https://nodejs.org/dist/v22.14.0/node-v22.14.0-linux-${NA}.tar.xz" \
  | tar -xJ -C /usr/local --strip-components=1 \
  && node --version \
  && npm install -g tsx@4.19.2 \
  && rm -rf /root/.npm

# Application
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY src ./src
COPY tsconfig.json ./

# Persistent profile directory (mount /data as a volume).
# Kasm's image uses UID 1000 ("kasm-user").
RUN mkdir -p /data/profile && chown -R 1000:1000 /data /app

# Replace kasm's app launcher with our wrapper that enables CDP, persists the
# profile to /data/profile, waits for CDP, and runs the claimer (tsx + Node for Playwright CDP).
COPY docker/custom_startup.sh /dockerstartup/custom_startup.sh
RUN chmod +x /dockerstartup/custom_startup.sh

# Upstream bug: KASM_PROCS['custom_startup'] is set but the monitor case only matches 'custom_script'.
RUN sed -i 's/^\([[:space:]]*\)custom_script)/\1custom_script|custom_startup)/' /dockerstartup/vnc_startup.sh

# Optional Xvnc flag (not in kasmvnc.yaml): disable HTTP Basic Auth on the websocket UI (unsupported by Kasm; dev convenience).
RUN sed -i 's/-interface 0\.0\.0\.0 -BlacklistThreshold=0 -FreeKeyMappings/-interface 0.0.0.0 -BlacklistThreshold=0 -FreeKeyMappings -disableBasicAuth/g' /dockerstartup/vnc_startup.sh

# cleanup() runs on SIGTERM; kill $! fails with "No such process" if that PID already exited (e.g. once-mode shutdown), which made the container exit 1.
# (Use \$ so the shell does not expand $! before sed runs.)
RUN sed -i '/^function cleanup ()/,/^}/ s/^    kill -s SIGTERM \$!/    kill -s SIGTERM \$! 2>\/dev\/null || true/' /dockerstartup/vnc_startup.sh

ENV CDP_URL=http://127.0.0.1:9223

VOLUME ["/data"]

# --- Dev: plain HTTP on 6901 (no TLS), no Basic Auth (already patched above). Unsupported upstream; local tooling only.
FROM base AS dev
USER root
RUN sed -i 's/ -sslOnly / /g' /dockerstartup/vnc_startup.sh \
  && sed -i 's/require_ssl: true/require_ssl: false/' /usr/share/kasmvnc/kasmvnc_defaults.yaml
USER 1000

# --- Production: HTTPS + self-signed cert (default image)
FROM base AS production
USER 1000
