import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildScanArgs, shouldVerifyPostings } from '../scan-options.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(path.join(root,p),'utf8');

test('default bulk discovery never requires Chromium liveness fallback',()=>{
  assert.equal(shouldVerifyPostings(undefined),false);
  assert.equal(shouldVerifyPostings(''),false);
  assert.equal(shouldVerifyPostings('false'),false);
  assert.deepEqual(buildScanArgs(),['--quiet']);
  assert.deepEqual(buildScanArgs(false),['--quiet']);
});

test('verification is an explicit operator opt-in, not silently enabled',()=>{
  for(const value of ['true','1','yes','on',' TRUE '])assert.equal(shouldVerifyPostings(value),true);
  for(const value of ['no','0','off','something else'])assert.equal(shouldVerifyPostings(value),false);
  assert.deepEqual(buildScanArgs(true),['--verify','--quiet']);
});

test('server uses configured mode, reports timeouts and retains scan failure details',()=>{
  const backend=read('server.mjs');
  assert.match(backend,/shouldVerifyPostings\(process\.env\.CAREER_SCAN_VERIFY\)/);
  assert.match(backend,/buildScanArgs\(VERIFY_POSTINGS\)/);
  assert.doesNotMatch(backend,/scan\.mjs'\),'--verify'/);
  assert.match(backend,/timedOut\s*=\s*true/);
  assert.match(backend,/scanner failed/);
  assert.match(backend,/scan=\{status,message,completedAt:new Date\(\)\.toISOString\(\),mode:SCAN_MODE\}/);
});

test('dashboard exposes safe failure text and honest liveness status',()=>{
  const html=read('public/index.html');
  const js=read('public/app.js');
  assert.match(html,/id="scan-error" class="audit-scan-error" role="alert"/);
  assert.match(html,/id="scan-mode-note"/);
  assert.match(js,/error\.textContent=/);
  assert.match(js,/scan\.status!=='error'/);
  assert.match(js,/Confirm each listing on the employer website before applying/);
  assert.doesNotMatch(js,/error\.innerHTML=/);
});
