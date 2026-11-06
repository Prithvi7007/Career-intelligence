#!/usr/bin/env bash
# Reviewed, one-time Career Intelligence discovery update. No CREW/wedding/Nginx changes.
set -Eeuo pipefail
umask 077
APP=career-intelligence
REPO="$(cd -- "$(dirname -- "$0")/.." && pwd -P)"
APP_DIR=/opt/career-intelligence
DATA=/var/lib/career-intelligence/career-ops
UPSTREAM=/opt/career-ops
BASE_REV=239e810afb44fb2038e86328fa27bff9771b19a9
STAGE=''
BACKUP=''
ROLLED=0
CONFIG_UPDATED=0
SUCCESS=0
say(){ printf 'Career Intelligence upgrade: %s\n' "$*"; }
fail(){ printf 'Career Intelligence upgrade: ERROR: %s\n' "$*" >&2; exit 1; }
rollback(){
  if [[ "$SUCCESS" != 1 && "$ROLLED" == 1 ]]; then
    say 'Upgrade failed. Restoring previous Career Intelligence code and portal config.'
    if [[ -d "$BACKUP/application" ]]; then
      if [[ -d "$APP_DIR" ]]; then mv -- "$APP_DIR" "$BACKUP/failed-upgrade"; fi
      mv -- "$BACKUP/application" "$APP_DIR" || true
    fi
    if [[ "$CONFIG_UPDATED" == 1 && -f "$BACKUP/portals.yml" ]]; then
      install -o "$APP" -g "$APP" -m 0600 "$BACKUP/portals.yml" "$DATA/portals.yml" || true
    fi
    systemctl restart "$APP" || true
  fi
  if [[ -n "$STAGE" && -d "$STAGE" ]]; then rm -rf -- "$STAGE"; fi
}
trap rollback EXIT

[[ $EUID == 0 ]] || fail 'Run with sudo on the VPS.'
for binary in git stat setpriv tar node install mv systemctl curl grep mktemp cmp runuser; do
  command -v "$binary" >/dev/null 2>&1 || fail "Missing $binary."
done
systemctl is-active --quiet "$APP" || fail 'Existing career-intelligence service is not active.'
[[ -d "$APP_DIR" && -f "$APP_DIR/server.mjs" ]] || fail 'Expected existing dashboard installation.'
[[ -d "$UPSTREAM" && -f "$UPSTREAM/validate-portals.mjs" ]] || fail 'Upstream scanner is not installed.'
[[ -d "$DATA" && -f "$DATA/portals.yml" ]] || fail 'Private scanner portals.yml is missing.'
[[ -d "$REPO/.git" ]] || fail 'Must run from the Career Intelligence Git checkout.'
uid="$(stat -c '%u' "$REPO")"
gid="$(stat -c '%g' "$REPO")"
repo_git(){ setpriv --reuid="$uid" --regid="$gid" --clear-groups git -C "$REPO" "$@"; }
origin="$(repo_git remote get-url origin)"
case "$origin" in
  "https://github.com/Prithvi7007/Career-intelligence.git"|"https://github.com/Prithvi7007/Career-intelligence"|"git@github.com:Prithvi7007/Career-intelligence.git") ;;
  *) fail 'Unexpected repository origin.' ;;
esac
[[ "$(repo_git branch --show-current)" == main ]] || fail 'Checkout must be on main.'
[[ -z "$(repo_git status --porcelain)" ]] || fail 'Working tree must be clean.'
[[ "$(repo_git rev-parse HEAD)" == "$(repo_git rev-parse refs/remotes/origin/main)" ]] \
  || fail 'Checkout is not at up-to-date origin/main.'

STAGE="$(mktemp -d /opt/.career-intelligence-upgrade.XXXXXXXX)"
repo_git archive --format=tar HEAD | tar -xf - -C "$STAGE"
node --check "$STAGE/server.mjs"
node --check "$STAGE/scan-audit.mjs"
node --check "$STAGE/public/app.js"
[[ -f "$STAGE/public/audit.css" ]] || fail 'Discovery audit stylesheet missing.'
# The private unprivileged service account needs traverse access to staging.
chmod 0755 "$STAGE"
runuser -u "$APP" -- env CAREER_OPS_ROOT="$DATA" \
  node "$UPSTREAM/validate-portals.mjs" --file "$STAGE/deploy/career-ops/portals.yml"

if cmp -s "$DATA/portals.yml" <(repo_git show "$BASE_REV:deploy/career-ops/portals.yml"); then
  CONFIG_UPDATED=1
  say 'Initial 11-employer config unchanged: preparing expanded portal list.'
else
  say 'Private portals.yml was customized: preserving it instead of overwriting.'
fi

BACKUP="$(mktemp -d /opt/.career-intelligence-rollback.XXXXXXXX)"
cp -a -- "$DATA/portals.yml" "$BACKUP/portals.yml"
chown -R root:root "$STAGE"
chmod -R go-w "$STAGE"
mv -- "$APP_DIR" "$BACKUP/application"
ROLLED=1
mv -- "$STAGE" "$APP_DIR"
STAGE=''

if [[ "$CONFIG_UPDATED" == 1 ]]; then
  install -o "$APP" -g "$APP" -m 0600 \
    "$APP_DIR/deploy/career-ops/portals.yml" "$DATA/portals.yml"
fi
systemctl restart "$APP"
ready=0
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  reply="$(curl -fsS --max-time 2 http://127.0.0.1:3417/api/health 2>/dev/null || true)"
  if [[ "$reply" == *'"status":"ok"'* && "$reply" == *'"coreConfigured":true'* ]]; then ready=1; break; fi
  sleep 1
done
[[ "$ready" == 1 ]] || fail 'Dashboard health check failed.'
SUCCESS=1
say "Upgrade healthy. Previous application saved at $BACKUP/application"
if [[ "$CONFIG_UPDATED" == 1 ]]; then
  say 'Expanded discovery config active. Existing pipeline and scan history preserved.'
else
  say 'Audit deployed. Custom portal settings remain unchanged.'
fi
say 'Only career-intelligence.service was restarted; no scan was started.'
