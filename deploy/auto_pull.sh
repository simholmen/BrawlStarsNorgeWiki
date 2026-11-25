#!/usr/bin/env bash
# Keeps this clone in sync with GitHub. Meant to run from cron on the droplet:
#
#   25,55 * * * * /path/to/BrawlStarsNorgeWiki/deploy/auto_pull.sh
#
# (every 30 min, a few minutes before an ingest cron that runs at :00/:30, so
# each ingest run starts on the newest code)
#
# - Only pulls when origin has new commits (cheap fetch otherwise).
# - Fast-forward only: never creates merge commits or rewrites history.
# - Throws away local changes in rankedstats/fetchresult/ first, since ingest.py
#   rewrites those debug dumps on every run and they would otherwise block the pull.
# - Any OTHER local change aborts the pull and is logged, so nothing is lost silently.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="main"
LOG_FILE="$REPO_DIR/deploy/auto_pull.log"
LOCK_FILE="/tmp/brawlstarsnorgewiki_auto_pull.lock"
REGENERATED_PATHS=("rankedstats/fetchresult")

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG_FILE"; }

# Never run two pulls at the same time.
exec 9>"$LOCK_FILE"
flock -n 9 || exit 0

cd "$REPO_DIR"

if ! git fetch --quiet origin "$BRANCH" 2>>"$LOG_FILE"; then
    log "ERROR: git fetch failed"
    exit 1
fi

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$BRANCH")"
[ "$LOCAL" = "$REMOTE" ] && exit 0

# Drop changes to files that ingest.py regenerates anyway.
for p in "${REGENERATED_PATHS[@]}"; do
    [ -e "$p" ] && git checkout --quiet -- "$p" 2>/dev/null || true
done

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    log "ERROR: local changes block the pull, fix by hand:"
    git status --short --untracked-files=no >> "$LOG_FILE"
    exit 1
fi

if git merge --ff-only --quiet "origin/$BRANCH" >>"$LOG_FILE" 2>&1; then
    log "Updated ${LOCAL:0:7} -> ${REMOTE:0:7}: $(git log -1 --format=%s)"
else
    log "ERROR: fast-forward failed (droplet has its own commits?). Fix by hand."
    exit 1
fi

# --- Wiki (Next.js on beta.*): keep it in step with what was just pulled. -----------------------
# Only once the bsnorge-web service has been installed (deploy/deploy_web.sh --install).
if systemctl cat bsnorge-web >/dev/null 2>&1; then
    changed() { [ -n "$(git diff --name-only "$LOCAL" "$REMOTE" -- "$@")" ]; }

    # No import of docs/_personer / docs/_klubber here: since Phase 4 the people/clubs content
    # lives in Supabase and is edited on the site (tools/import_wiki.py refuses to overwrite it).

    # Rebuild when the app or the hand-written pages it renders from docs/ changed. Person/club
    # edits don't need a rebuild: the site refreshes those itself on save.
    if changed web docs/wiki docs/diverse docs/_data; then
        deploy/deploy_web.sh >>"$LOG_FILE" 2>&1 || log "ERROR: wiki deploy failed (see above)"
    fi
fi
