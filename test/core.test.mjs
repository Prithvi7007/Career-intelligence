import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { parseTracker, parseInbox, readLeads, writeLeads, normalizeLead, combine } from '../core.mjs';
import { createServer } from '../server.mjs';

test('parses canonical Career-Ops tracker with score /5',()=>{
  const md='| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n|---|---|---|---|---|---|---|---|---|\n| 3 | 2026-11-06 | Acme | Senior Data Scientist | 4.5/5 | Interview | no | [report](reports/a.md) | note |';
  const rows=parseTracker(md);
  assert.equal(rows.length,1);
  assert.equal(rows[0].company,'Acme');
  assert.equal(rows[0].score,4.5);
  assert.equal(rows[0].status,'Interview');
});
test('parses pending only, preserving link',()=>{
  const md='# Pending\n- [ ] https://company.com/jobs/3 | Example Co | Data Scientist\n- [x] https://company.com/jobs/2 | Example Co | Closed\n';
  const rows=parseInbox(md);
  assert.equal(rows.length,1);
  assert.equal(rows[0].url,'https://company.com/jobs/3');
});
test('rejects dangerous job URL and blank roles',()=>{
  assert.throws(()=>normalizeLead({company:'A',title:'B',url:'javascript:alert(1)'}));
  assert.throws(()=>normalizeLead({company:'',title:'B'}));
});
test('persists and reads private manually created leads',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'career-iq-'));
  const file=path.join(dir,'data','leads.json');
  await writeLeads(file,[{id:'a',company:'Acme',title:'Scientist'}]);
  assert.equal((await readLeads(file))[0].title,'Scientist');
  assert.ok((await readFile(file,'utf8')).includes('Acme'));
});
test('deduplicates URL between core and manual records',()=>{
  const core={jobs:[{url:'https://acme.com/job/1'}]};
  assert.equal(combine(core,[{url:'https://acme.com/job/1'},{url:'https://acme.com/job/2'}]).length,2);
});
test('HTTP server responds without external dependencies and rejects nonlocal Host',async()=>{
  const server=createServer();
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const port=server.address().port;
  try{
    let r=await fetch('http://127.0.0.1:'+port+'/api/health');
    assert.equal(r.status,200);
    const code=await new Promise((resolve,reject)=>{
      const q=http.get({hostname:'127.0.0.1',port,path:'/api/health',headers:{Host:'attacker.example'}},resp=>{
        resp.resume();resolve(resp.statusCode);
      });
      q.on('error',reject);
    });
    assert.equal(code,403);
  }finally{
    await new Promise(r=>server.close(r));
  }
});
