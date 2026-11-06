import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(path.join(root,file),'utf8');
const installer = path.join(root, 'scripts/connect-career-ops.sh');

test('Career-Ops connector shell script has valid syntax', () => {
  assert.doesNotThrow(() => execFileSync('bash',['-n',installer],{timeout:10000}));
});

test('the scanner setup is pinned, separated and least-privileged', () => {
  const src=read('scripts/connect-career-ops.sh');
  const expected=[
    'set -Eeuo pipefail',
    'UPSTREAM_SHA=64ea4e3eeac0eaae359100136f511892410025ae',
    'DATA=/var/lib/career-intelligence/career-ops',
    'CODE=/opt/career-ops',
    'CONF=/etc/career-intelligence/config.env',
    'repo_git(){ setpriv --reuid="$owner_uid"',
    'branch --show-current',
    'status --porcelain',
    'refs/remotes/origin/main',
    'git -C "$STAGE" fetch --quiet --depth 1 origin "$UPSTREAM_SHA"',
    '--ignore-scripts --no-audit --no-fund --package-lock=false',
    'node "$CODE_TO_VALIDATE/validate-portals.mjs" --file "$DATA/portals.yml"',
    'runuser -u "$APP"',
    'systemctl restart "$APP"',
    "CONFIG_MODIFIED=1",
    'cp -a -- "$BACKUP" "$CONF"',
    '"coreConfigured":true'
  ];
  for (const item of expected) assert.ok(src.includes(item), 'missing contract '+item);
  assert.ok(!src.includes('systemctl restart crew'));
  assert.ok(!src.includes('systemctl restart wedding'));
  assert.ok(!src.includes('nginx -t'));
  assert.ok(!src.includes('ufw allow'));
  assert.ok(!src.includes('npm ci'));
});

test('scanning config uses reviewed expanded employers and no private details', () => {
  const portals=read('deploy/career-ops/portals.yml');
  const profile=read('deploy/career-ops/profile.yml');
  const found=(portals.match(/^  - name: /gm)||[]).length;
  assert.equal(found,100);
  assert.match(portals,/^tracked_companies:/m);
  assert.match(portals,/^title_filter:/m);
  assert.match(portals,/^search_queries: \[\]/m);
  assert.match(portals,/^    - "Marketing Science"/m);
  assert.match(portals,/^    - "Data Scientist"/m);
  assert.doesNotMatch(portals,/^\s*(?:password|api_key|token)\s*:/im);
  assert.match(profile,/country: United States/);
  assert.doesNotMatch(profile,/full_name:|email:|visa_status:|phone:/);
});

test('documentation describes deliberate operator-only activation',()=>{
  const docs=read('deploy/career-ops/README.md');
  assert.match(docs,/sudo bash "\$REPO\/scripts\/connect-career-ops\.sh"/);
  assert.match(docs,/coreConfigured":true/);
  assert.match(docs,/does not activate|does not .*commands/i);
});
