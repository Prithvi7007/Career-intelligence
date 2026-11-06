#!/usr/bin/env bash
# First-time, source-reviewed installation for the private Career Intelligence dashboard.
# Deliberately does not touch CREW Games, the wedding site, Nginx, or firewalls.
set -Eeuo pipefail
umask 027

APP=career-intelligence
CHECKOUT="$(cd -- "$(dirname -- "$0")/.." && pwd -P)"
APP_DIR="/opt/career-intelligence"
UNIT="/etc/systemd/system/career-intelligence.service"
STATE_DIR="/var/lib/career-intelligence"
SETTINGS_DIR="/etc/career-intelligence"
SOURCE_REPO="https://github.com/Prithvi7007/Career-intelligence.git"
stage=""
installed=0
succeeded=0

# Git checks are scoped to this known bridge checkout: no root-wide safe.directory changes.
repo_git() { git -c "safe.directory=$CHECKOUT" -C "$CHECKOUT" "$@"; }
say() { printf 'Career Intelligence: %s\n' "$*"; }
fail() { printf 'Career Intelligence: ERROR: %s\n' "$*" >&2; exit 1; }

cleanup() {
  if [[ -n "$stage" && -d "$stage" ]]; then rm -rf -- "$stage"; fi
  if [[ "$installed" == 1 && "$succeeded" != 1 ]]; then
    say "Installation failed; removing only the new Career Intelligence unit and source."
    systemctl disable --now "$APP" >/dev/null 2>&1 || true
    rm -f -- "$UNIT"
    systemctl daemon-reload || true
    rm -rf -- "$APP_DIR"
    say "The dedicated user and data directory were retained for inspection."
  fi
}
trap cleanup EXIT

[[ "$EUID" == 0 ]] || fail 'Run this reviewed installer as root via sudo.'
for cmd in git tar node systemctl curl useradd runuser readlink; do
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is required. No changes made."
done
[[ -e "$APP_DIR" ]] && fail "$APP_DIR already exists. This is an initial-install script, not an upgrade tool."
[[ -e "$UNIT" ]] && fail "$UNIT already exists. Refusing to replace an existing service."
systemctl cat "$APP.service" >/dev/null 2>&1 && fail "The $APP service is already registered. Refusing to overwrite."

[[ -d "$CHECKOUT/.git" ]] || fail 'Run from a Git checkout of Career Intelligence.'
origin="$(repo_git remote get-url origin)"
case "$origin" in
  "$SOURCE_REPO"|"https://github.com/Prithvi7007/Career-intelligence"|"git@github.com:Prithvi7007/Career-intelligence.git") ;;
  *) fail "Unexpected source repository. Expected $SOURCE_REPO" ;;
esac
[[ "$(repo_git branch --show-current)" == main ]] || fail 'Checkout must be on the reviewed main branch.'
[[ -z "$(repo_git status --porcelain)" ]] || fail 'Checkout has local changes. Refusing an unreviewed deployment.'
main_sha="$(repo_git rev-parse HEAD)"
remote_sha="$(repo_git rev-parse --verify refs/remotes/origin/main)"
[[ "$main_sha" == "$remote_sha" ]] || fail 'Checkout is not at origin/main. Fetch and fast-forward before installation.'
[[ -f "$CHECKOUT/server.mjs" && -f "$CHECKOUT/deploy/career-intelligence.service" ]] || fail 'Missing reviewed application or systemd unit.'

node_path="$(readlink -f "$(command -v node)")"
[[ "$node_path" =~ ^/[a-zA-Z0-9_./-]+$ && -x "$node_path" ]] || fail 'Node path is not suitable for the system service.'
node -e '
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 13)) process.exit(1);
' || fail 'Node.js 22.13 or newer is required. No installation changes made.'

say "Validated reviewed main commit $main_sha and Node $("$node_path" --version)."
if id "$APP" >/dev/null 2>&1; then
  say 'Reusing the existing dedicated Career Intelligence service account.'
else
  useradd --system --user-group --home-dir "$STATE_DIR" --shell /usr/sbin/nologin "$APP"
fi
runuser -u "$APP" -- "$node_path" --version >/dev/null \
  || fail 'Node is not accessible to the unprivileged service account (e.g. installed under /root/.nvm). Use a system-wide Node.js installation.'

stage="$(mktemp -d /opt/.career-intelligence-install.XXXXXXXX)"
repo_git archive --format=tar HEAD | tar -x -f - -C "$stage"
[[ -f "$stage/server.mjs" && -f "$stage/public/index.html" ]] || fail 'Missing application files in reviewed archive.'
"$node_path" --check "$stage/server.mjs"
"$node_path" --check "$stage/public/app.js"

install -d -m 0700 -o "$APP" -g "$APP" "$STATE_DIR"
install -d -m 0700 -o root -g root "$SETTINGS_DIR"
# Optional service configuration: systemd loads it as root; never commit credentials.
if [[ ! -e "$SETTINGS_DIR/config.env" ]]; then
  install -m 0600 -o root -g root /dev/null "$SETTINGS_DIR/config.env"
fi

chown -R root:root "$stage"
chmod -R go-w "$stage"
chmod 0755 "$stage"
mv -- "$stage" "$APP_DIR"
stage=""
# All service-account writes are restricted to the dedicated StateDirectory.
sed "s|@NODE_BINARY@|$node_path|g" \
  "$APP_DIR/deploy/career-intelligence.service" > "$UNIT"
chmod 0644 "$UNIT"
installed=1

systemctl daemon-reload
systemctl enable --now "$APP.service"
ready=0
for _ in $(seq 1 20); do
  if curl --silent --fail --max-time 2 \
     --header 'Host: 127.0.0.1:3417' \
     http://127.0.0.1:3417/api/health | grep -q '"status":"ok"'; then
    ready=1
    break
  fi
  sleep 1
done
[[ "$ready" == 1 ]] || fail 'Service health check did not pass. Inspect journalctl -u career-intelligence.'
succeeded=1
say 'Private dashboard installed and healthy on 127.0.0.1:3417.'
say 'It is NOT publicly exposed and does not yet run Career-Ops or AI evaluations.'
say 'Access from your laptop using an SSH tunnel:'
printf '%s\n' '  ssh -N -L 3417:127.0.0.1:3417 root@YOUR_VPS_HOST'
printf '%s\n' '  Visit http://127.0.0.1:3417'
