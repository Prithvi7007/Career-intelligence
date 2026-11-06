#!/usr/bin/env bash
# One-time isolated Career-Ops scanner connection for the existing dashboard.
# Operated on the VPS only after this script has been reviewed and merged.
# Does not touch CREW Games, wedding services, Nginx or GitHub credentials.
set -Eeuo pipefail
umask 022

APP=career-intelligence
CHECKOUT="$(cd -- "$(dirname -- "$0")/.." && pwd -P)"
UPSTREAM=https://github.com/career-ops-hq/career-ops.git
UPSTREAM_SHA=64ea4e3eeac0eaae359100136f511892410025ae
CODE=/opt/career-ops
DATA=/var/lib/career-intelligence/career-ops
CONF=/etc/career-intelligence/config.env
STAGE=''
BACKUP=''
CONFIG_MODIFIED=0
FINISHED=0
CODE_TO_VALIDATE=''

say(){ printf 'Career-Ops connector: %s\n' "$*"; }
fail(){ printf 'Career-Ops connector: ERROR: %s\n' "$*" >&2; exit 1; }
cleanup(){
  if [[ "$CONFIG_MODIFIED" == 1 && "$FINISHED" != 1 && -f "$BACKUP" ]]; then
    cp -a -- "$BACKUP" "$CONF"
    systemctl restart "$APP" >/dev/null 2>&1 || true
    say 'Restored previous dashboard environment after unsuccessful activation.'
  fi
  [[ -z "$STAGE" || ! -d "$STAGE" ]] || rm -rf -- "$STAGE"
  [[ -z "$BACKUP" || ! -f "$BACKUP" ]] || rm -f -- "$BACKUP"
}
trap cleanup EXIT

[[ $EUID == 0 ]] || fail 'Run as root using sudo.'
for bin in git node npm install stat setpriv systemctl runuser curl grep mktemp mv; do
  command -v "$bin" >/dev/null 2>&1 || fail "Missing command: $bin"
done
id "$APP" >/dev/null 2>&1 || fail 'Dedicated career-intelligence service account is missing.'
systemctl is-active --quiet "$APP" || fail 'Career Intelligence service is not active.'
[[ -f "$CONF" ]] || fail 'Existing dashboard config.env was not found.'
[[ -f "$CHECKOUT/deploy/career-ops/portals.yml" ]] || fail 'Reviewed portals configuration is missing.'
[[ -f "$CHECKOUT/deploy/career-ops/profile.yml" ]] || fail 'Scanner-only profile template is missing.'
[[ -d "$CHECKOUT/.git" ]] || fail 'Must run from the Career Intelligence Git checkout.'

owner_uid="$(stat -c '%u' "$CHECKOUT")"
owner_gid="$(stat -c '%g' "$CHECKOUT")"
repo_git(){ setpriv --reuid="$owner_uid" --regid="$owner_gid" --clear-groups git -C "$CHECKOUT" "$@"; }
origin="$(repo_git remote get-url origin)"
case "$origin" in
  "$UPSTREAM") fail 'Do not run from the upstream Career-Ops repository.' ;;
  "https://github.com/Prithvi7007/Career-intelligence.git"|"https://github.com/Prithvi7007/Career-intelligence"|"git@github.com:Prithvi7007/Career-intelligence.git") ;;
  *) fail 'Unexpected Career Intelligence source checkout origin.' ;;
esac
[[ "$(repo_git branch --show-current)" == main ]] || fail 'Checkout must be on merged main.'
[[ -z "$(repo_git status --porcelain)" ]] || fail 'Checkout has local changes.'
[[ "$(repo_git rev-parse HEAD)" == "$(repo_git rev-parse refs/remotes/origin/main)" ]] \
  || fail 'Checkout is not at origin/main. Fast-forward main as checkout owner first.'

if grep -Eq '^[[:space:]]*(CAREER_OPS_ROOT|CAREER_OPS_CODE_ROOT|CAREER_OPS_PORTALS|CAREER_OPS_PROFILE)=' "$CONF"; then
  fail 'Career-Ops environment is already configured. Refusing to overwrite or double-append.'
fi

if [[ -e "$CODE" ]]; then
  [[ -f "$CODE/scan.mjs" && -d "$CODE/.git" ]] || fail "$CODE exists but is not a Career-Ops Git checkout."
  [[ "$(git -c "safe.directory=$CODE" -C "$CODE" remote get-url origin)" == "$UPSTREAM" ]] \
    || fail 'Existing Career-Ops checkout has a different origin.'
  [[ "$(git -c "safe.directory=$CODE" -C "$CODE" rev-parse HEAD)" == "$UPSTREAM_SHA" ]] \
    || fail 'Existing Career-Ops checkout uses a different revision; do not overwrite it.'
  [[ -d "$CODE/node_modules" ]] || fail 'Existing pinned Career-Ops checkout has no dependencies. Install them separately.'
  say "Using existing pinned Career-Ops checkout at $CODE."
else
  STAGE="$(mktemp -d /opt/.career-ops-bootstrap.XXXXXXXX)"
  git -C "$STAGE" init --quiet
  git -C "$STAGE" remote add origin "$UPSTREAM"
  git -C "$STAGE" fetch --quiet --depth 1 origin "$UPSTREAM_SHA"
  git -C "$STAGE" checkout --quiet --detach "$UPSTREAM_SHA"
  [[ "$(git -C "$STAGE" rev-parse HEAD)" == "$UPSTREAM_SHA" ]] || fail 'Pinned source revision mismatch.'
  say 'Installing upstream dependencies without running lifecycle scripts or downloading browsers.'
  (cd "$STAGE" && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install \
    --ignore-scripts --no-audit --no-fund --package-lock=false)
  node --check "$STAGE/scan.mjs"
  chmod 0755 "$STAGE"
  CODE_TO_VALIDATE="$STAGE"
fi

install -d -o "$APP" -g "$APP" -m 0700 "$DATA"
install -d -o "$APP" -g "$APP" -m 0700 "$DATA/config" "$DATA/data"
if [[ ! -e "$DATA/portals.yml" ]]; then
  install -o "$APP" -g "$APP" -m 0600 \
    "$CHECKOUT/deploy/career-ops/portals.yml" "$DATA/portals.yml"
fi
if [[ ! -e "$DATA/config/profile.yml" ]]; then
  install -o "$APP" -g "$APP" -m 0600 \
    "$CHECKOUT/deploy/career-ops/profile.yml" "$DATA/config/profile.yml"
fi
if [[ -z "$CODE_TO_VALIDATE" ]]; then CODE_TO_VALIDATE="$CODE"; fi
# Validate YAML using the upstream validator, running unprivileged.
runuser -u "$APP" -- env CAREER_OPS_ROOT="$DATA" \
  node "$CODE_TO_VALIDATE/validate-portals.mjs" --file "$DATA/portals.yml"
runuser -u "$APP" -- env CAREER_OPS_ROOT="$DATA" \
  node "$CODE_TO_VALIDATE/scan.mjs" --help >/dev/null

if [[ -n "$STAGE" ]]; then
  mv -- "$STAGE" "$CODE"
  STAGE=''
fi
BACKUP="$(mktemp /etc/career-intelligence/.config-env.backup.XXXXXXXX)"
cp -a -- "$CONF" "$BACKUP"
printf '\nCAREER_OPS_ROOT=%s\nCAREER_OPS_CODE_ROOT=%s\nCAREER_OPS_PORTALS=%s\nCAREER_OPS_PROFILE=%s\n' \
  "$DATA" "$CODE" "$DATA/portals.yml" "$DATA/config/profile.yml" >> "$CONF"
chmod 0600 "$CONF"
CONFIG_MODIFIED=1

if ! systemctl restart "$APP"; then
  fail 'Dashboard service restart failed.'
fi

ready=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  reply="$(curl --silent --show-error --fail --max-time 3 http://127.0.0.1:3417/api/health || true)"
  if [[ "$reply" == *'"status":"ok"'* && "$reply" == *'"coreConfigured":true'* ]]; then
    ready=1
    break
  fi
  sleep 1
done
[[ "$ready" == 1 ]] || fail 'The dashboard did not report a connected scanner after restart.'
FINISHED=1
rm -f -- "$BACKUP"
BACKUP=''
say 'Success: Career-Ops scanner is configured for the private dashboard.'
say 'No initial scan was triggered. Sign in and click Scan portals to discover listings.'
say "Pinned upstream source: $UPSTREAM_SHA"
say 'Only career-intelligence.service was restarted.'
