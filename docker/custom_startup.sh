#!/usr/bin/env bash
# Replaces kasm's /dockerstartup/custom_startup.sh.
#
# Launches Chromium with CDP enabled and a persistent profile at /data/profile,
# waits for the CDP endpoint, then runs the claimer (tsx + Node) in the foreground so
# this script (which kasm_startup.sh expects to stay alive) keeps running.
#
# In RUN_MODE=once the claimer exits after one pass; we then send TERM to PID 1
# so the whole container shuts down (we run as the same UID as PID 1).
set -eu

CDP_URL="${CDP_URL:-http://127.0.0.1:9223}"

CHROMIUM_FLAGS="\
--start-maximized \
--no-first-run \
--no-default-browser-check \
--disable-features=Translate \
--user-data-dir=/data/profile \
--remote-debugging-port=9223 \
--remote-debugging-address=127.0.0.1 \
--remote-allow-origins=*"

mkdir -p /data/profile

# Background loop: keep chromium alive (matches the original kasm pattern).
(
  /usr/bin/filter_ready 2>/dev/null || true
  /usr/bin/desktop_ready 2>/dev/null || true
  while true; do
    if ! pgrep -x chromium >/dev/null; then
      # shellcheck disable=SC2086
      chromium $CHROMIUM_FLAGS >/tmp/chromium.log 2>&1 || true
    fi
    sleep 1
  done
) &
CHROMIUM_LOOP_PID=$!

# Wait for CDP to come up.
i=0
until wget -q -O- "${CDP_URL}/json/version" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 120 ]; then
    echo "claimer: timed out waiting for CDP at ${CDP_URL}" >&2
    exit 1
  fi
  sleep 1
done

echo "claimer: CDP is up, starting entrypoint (tsx + Node — Playwright CDP WebSocket is unreliable under Bun)"

set +e
/usr/local/bin/tsx /app/src/entrypoint.ts
rc=$?
set -e

if [ "$rc" != 0 ]; then
  echo "claimer: entrypoint exited with rc=$rc" >&2
fi

if [ "${RUN_MODE:-schedule}" = "once" ]; then
  echo "claimer: RUN_MODE=once finished (rc=$rc), shutting container down"
  kill -TERM "$CHROMIUM_LOOP_PID" 2>/dev/null || true
  # We run as the same UID as PID 1, so we can signal it directly.
  kill -TERM 1 2>/dev/null || true
  # Stay alive until init tears the container down; exiting immediately would let the
  # vnc monitor restart this script while shutdown is in flight.
  exec tail -f /dev/null
fi

exit "$rc"
