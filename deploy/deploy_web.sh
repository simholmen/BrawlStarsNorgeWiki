#!/usr/bin/env bash
# Build and (re)start the Next.js wiki on the droplet.
#
#   deploy/deploy_web.sh --install   one-time: write + enable the systemd unit, then deploy
#   deploy/deploy_web.sh             build web/ and restart the service
#
# Run as the user that owns the clone (not root). Needs:
#   - Node >= 20.9 (`node -v`)
#   - web/.env.local with SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY (see web/.env.example)
#   - sudo for systemctl. For unattended runs from auto_pull.sh, allow exactly this command:
#       echo "$USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart bsnorge-web" \
#         | sudo tee /etc/sudoers.d/bsnorge-web
#
# The build happens before the restart, so a failed build leaves the running site untouched.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE="bsnorge-web"
LOG_FILE="$REPO_DIR/deploy/deploy_web.log"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG_FILE"; }

if [ "${1:-}" = "--install" ]; then
    NODE="$(command -v node)" || { echo "node not found; install Node >= 20.9 first"; exit 1; }
    sed -e "s#__REPO_DIR__#$REPO_DIR#g" -e "s#__USER__#$(id -un)#g" -e "s#__NODE__#$NODE#g" \
        "$REPO_DIR/deploy/web.service" | sudo tee "/etc/systemd/system/$SERVICE.service" >/dev/null
    sudo systemctl daemon-reload
    sudo systemctl enable "$SERVICE"
    log "Installed $SERVICE.service"
fi

if [ ! -f "$REPO_DIR/web/.env.local" ]; then
    log "ERROR: $REPO_DIR/web/.env.local is missing (copy web/.env.example and fill it in)"
    exit 1
fi

cd "$REPO_DIR/web"
log "Building $(git -C "$REPO_DIR" rev-parse --short HEAD)..."
npm ci --no-audit --no-fund >>"$LOG_FILE" 2>&1
npm cache clean --force >/dev/null 2>&1 || true  # the droplet's disk is small
WIKI_DOCS_DIR="$REPO_DIR/docs" npm run build >>"$LOG_FILE" 2>&1 || {
    log "ERROR: build failed, service not restarted (see $LOG_FILE)"
    exit 1
}
sudo systemctl restart "$SERVICE"
log "Deployed and restarted $SERVICE"
