import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseScanRuns, parsePortalCoverage, readDiscoveryAudit } from '../scan-audit.mjs';

const header='status\tfound\ttimestamp\tcompanies\tboards\tfiltered_title\tfiltered_location\tfiltered_salary\tdupes\tnew_added\terrors';
const completed='completed\t435\t2026-11-06T16:30:00.000Z\t91\t4\t210\t25\t5\t90\t105\t3';
const failed='failed\t200\t2026-11-06T17:00:00.000Z\t91\t0\t150\t0\t0\t11\t0\t15';

test('reads upstream scanner counters by header names even when reordered', () => {
  const row=parseScanRuns(header+'\n'+completed+'\n');
  assert.equal(row.companies,91);
  assert.equal(row.boards,4);
  assert.equal(row.found,435);
  assert.equal(row.filtered,240);
  assert.equal(row.dupes,90);
  assert.equal(row.added,105);
  assert.equal(row.errors,3);
  assert.deepEqual(row.filters.map(x=>x.key),['filtered_title','filtered_location','filtered_salary']);
});

test('latest failed run is visible rather than replaced by the last completed one', () => {
  const result=parseScanRuns(header+'\n'+completed+'\n'+failed+'\n');
  assert.equal(result.status,'failed');
  assert.equal(result.errors,15);
  assert.equal(result.added,null);
  assert.equal(result.found,200);
});

test('rejects malformed or missing run logs rather than fabricating scan results', () => {
  assert.equal(parseScanRuns(''),null);
  assert.equal(parseScanRuns('timestamp\tstatus\n2026-11-06\tcompleted'),null);
  assert.equal(parseScanRuns(header+'\ncompleted\tnope\t2026-11-06T16:00:00Z\t5\t0\t0\t0\t0\t0\t0\t0'),null);
  assert.equal(parseScanRuns(header+'\nunknown\t4\t2026-11-06T16:00:00Z\t5\t0\t0\t0\t0\t0\t0\t0'),null);
});

test('counts only enabled employer and board sources without a hard result cap', () => {
  const yaml='tracked_companies:\n  - name: Alpha\n    enabled: true\n  - name: Beta\n    enabled: false\njob_boards:\n  - name: Board\n    enabled: true\n';
  assert.deepEqual(parsePortalCoverage(yaml),{companies:1,boards:1,total:2});
});

test('reads private scanner audit without modifying personal data', async () => {
  const root=await mkdtemp(path.join(tmpdir(),'career-audit-'));
  await mkdir(path.join(root,'data'));
  await writeFile(path.join(root,'data/scan-runs.tsv'),header+'\n'+completed+'\n');
  await writeFile(path.join(root,'portals.yml'),'tracked_companies:\n  - name: Alpha\n    enabled: true\n');
  const audit=await readDiscoveryAudit(root);
  assert.equal(audit.latest.added,105);
  assert.equal(audit.coverage.companies,1);
  assert.deepEqual(await readDiscoveryAudit(''),{coverage:null,latest:null});
});
