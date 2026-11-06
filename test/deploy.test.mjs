import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const installer = path.join(root, 'scripts/install-vps.sh');
const unit = path.join(root, 'deploy/career-intelligence.service');

test('installer has valid Bash syntax', () => {
  assert.doesNotThrow(() => execFileSync('bash', ['-n', installer], { timeout: 10000 }));
});

test('systemd unit runs as a dedicated unprivileged user with private data', () => {
  const source = readFileSync(unit, 'utf8');
  for (const required of [
    'User=career-intelligence', 'Group=career-intelligence',
    'WorkingDirectory=/opt/career-intelligence',
    'Environment=HOST=127.0.0.1', 'Environment=PORT=3417',
    'StateDirectory=career-intelligence', 'StateDirectoryMode=0700',
    'UMask=0077', 'NoNewPrivileges=true', 'ProtectSystem=strict',
    'ProtectHome=true', 'CapabilityBoundingSet=',
    'CAREER_INTELLIGENCE_DATA=/var/lib/career-intelligence/leads.json',
  ]) assert.ok(source.includes(required), 'missing unit directive: ' + required);
  assert.ok(!source.includes('User=root'));
  assert.ok(!source.includes('0.0.0.0'));
});

test('installer fails closed on existing service, unsafe branch and incompatible runtime', () => {
  const source = readFileSync(installer, 'utf8');
  for (const required of [
    'set -Eeuo pipefail', '[[ "$EUID" == 0 ]]',
    '[[ -e "$APP_DIR" ]] && fail',
    '[[ -e "$UNIT" ]] && fail',
    'branch --show-current', 'status --porcelain',
    'refs/remotes/origin/main',
    'repo_git() { git -c "safe.directory=$CHECKOUT" -C "$CHECKOUT" "$@"; }',
    'repo_git remote get-url origin',
    'repo_git archive --format=tar HEAD',
    'Node.js 22.13 or newer is required',
     'runuser -u "$APP"',
    'systemctl enable --now "$APP.service"',
    'http://127.0.0.1:3417/api/health',
    'if [[ "$installed" == 1 && "$succeeded" != 1 ]]',
  ]) assert.ok(source.includes(required), 'missing installer safeguard: ' + required);
  assert.ok(!source.includes('systemctl restart crew'));
  assert.ok(!source.includes('systemctl restart wedding'));
  assert.ok(!source.includes('ufw allow'));
  assert.ok(!source.includes('curl | bash'));
});
