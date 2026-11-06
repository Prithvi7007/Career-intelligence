import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePortalCoverage } from '../scan-audit.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(path.join(root,p),'utf8');

test('source-backed discovery expansion enables 100 employer sources',()=>{
  const yaml=read('deploy/career-ops/portals.yml');
  const coverage=parsePortalCoverage(yaml);
  assert.equal(coverage.companies,100);
  assert.equal(coverage.boards,0);
  const positive=yaml.match(/^    - "/gm)||[];
  assert.equal(positive.length,43);
  assert.match(yaml,/Marketing Mix/);
  assert.match(yaml,/Forecasting/);
  assert.match(yaml,/Causal Inference/);
  assert.match(yaml,/Machine Learning/);
  assert.doesNotMatch(yaml,/^location_filter:/m);
  assert.doesNotMatch(yaml,/^visa_filter:/m);
});

test('upgrade shell syntax and scoping are correct',()=>{
  const file=path.join(root,'scripts/upgrade-discovery.sh');
  assert.doesNotThrow(()=>execFileSync('bash',['-n',file],{timeout:10000}));
  const script=read('scripts/upgrade-discovery.sh');
  const required=[
    'set -Eeuo pipefail','APP=career-intelligence',
    'REPO="$(cd -- "$(dirname -- "$0")/.." && pwd -P)"',
    'UPSTREAM=/opt/career-ops',
    'BASE_REV=239e810afb44fb2038e86328fa27bff9771b19a9',
    'repo_git(){ setpriv --reuid="$uid" --regid="$gid"',
    'repo_git archive --format=tar HEAD',
    'chmod 0755 "$STAGE"',
    'node "$UPSTREAM/validate-portals.mjs" --file',
    'cmp -s "$DATA/portals.yml" <(repo_git show',
    'install -o "$APP" -g "$APP" -m 0600',
    'systemctl restart "$APP"',
    'mv -- "$BACKUP/application" "$APP_DIR"',
    '"coreConfigured":true'
  ];
  for(const item of required) assert.ok(script.includes(item),'missing upgrade guarantee: '+item);
  assert.doesNotMatch(script,/systemctl restart (crew|wedding)|ufw allow|nginx -t/);
});

test('audit is linked to dashboard and sourced from server-side scanner metrics',()=>{
  const html=read('public/index.html');
  const js=read('public/app.js');
  const server=read('server.mjs');
  assert.match(html,/href="\/audit.css"/);
  assert.match(html,/id="audit-found"/);
  assert.match(html,/id="audit-dupes"/);
  assert.match(html,/id="audit-errors"/);
  assert.match(js,/function renderAudit\(\)/);
  assert.match(js,/last recorded/i);
  assert.match(server,/readDiscoveryAudit\(ROOT\)/);
  assert.match(server,/1200000/);
  assert.match(server,/\/audit.css/);
});
