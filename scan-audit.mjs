import { promises as fs } from 'node:fs';
import path from 'node:path';

const FILTERS = Object.freeze([
  ['filtered_title','Title'], ['filtered_tier','Seniority'],
  ['filtered_location','Location'], ['filtered_posting_age','Posting age'],
  ['filtered_salary','Salary'], ['filtered_content','Description'],
  ['filtered_cooldown','Cooldown'], ['filtered_blacklist','Blacklist'],
  ['filtered_visa','Work authorization'], ['filtered_posted_date','Posting date'],
  ['filtered_country_eligibility','Country eligibility']
]);

const number = (row,key) => {
  if (!Object.hasOwn(row,key)) return null;
  const value = String(row[key]).trim();
  if (!/^\d+$/.test(value)) return null;
  const result = Number(value);
  return Number.isSafeInteger(result) ? result : null;
};

export function parseScanRuns(raw) {
  const lines = String(raw || '').split(/\r?\n/).filter(x=>x.trim());
  if (lines.length < 2) return null;
  const headers = lines[0].replace(/^\uFEFF/,'').split('\t').map(x=>x.trim());
  if (new Set(headers).size !== headers.length ||
      !['timestamp','status','companies','found','dupes','new_added','errors'].every(x=>headers.includes(x))) return null;
  // Upstream explicitly says to parse scan-runs.tsv by *header*, not by column offset.
  for (let i=lines.length-1;i>=1;i--) {
    const values = lines[i].split('\t');
    if (values.length !== headers.length) continue;
    const row = Object.fromEntries(headers.map((name,index)=>[name,values[index]]));
    const date = new Date(row.timestamp);
    if (!Number.isFinite(date.getTime()) || !['completed','failed'].includes(row.status)) continue;
    const found=number(row,'found'),companies=number(row,'companies'),
      dupes=number(row,'dupes'),errors=number(row,'errors');
    if ([found,companies,dupes,errors].some(x=>x===null)) continue;
    const filters = FILTERS.map(([key,label])=>({key,label,value:number(row,key)}))
      .filter(x=>x.value!==null);
    const filtered = filters.reduce((sum,x)=>sum+x.value,0);
    return {
      timestamp:date.toISOString(),
      status:row.status,
      companies,boards:number(row,'boards') ?? 0,
      found,filtered,dupes,
      added:row.status==='completed' ? number(row,'new_added') : null,
      errors,
      filters:filters.filter(x=>x.value>0),
      // This source is upstream output, not an estimate from dashboard job count.
      provenance:'career-ops scan-runs.tsv'
    };
  }
  return null;
}

export function parsePortalCoverage(raw) {
  const blocks={tracked_companies:[],job_boards:[]};
  let section=null,current=null;
  for(const line of String(raw||'').split(/\r?\n/)) {
    if(/^[a-z_][\w-]*:/.test(line)) {
      const key=line.match(/^([a-z_][\w-]*):/)[1];
      section=Object.hasOwn(blocks,key)?key:null;
      current=null;
      continue;
    }
    if(!section || /^\s*#/.test(line)) continue;
    const match=line.match(/^  - name:\s*(.+?)\s*$/);
    if(match) {current={name:match[1],enabled:true};blocks[section].push(current);}
    if(current && /^\s{4}enabled:\s*false(?:\s*#.*)?$/.test(line))current.enabled=false;
  }
  const companies=blocks.tracked_companies.filter(x=>x.enabled);
  const boards=blocks.job_boards.filter(x=>x.enabled);
  return { companies:companies.length, boards:boards.length, total:companies.length+boards.length };
}

export async function readDiscoveryAudit(root) {
  if (!root) return { coverage:null, latest:null };
  const read=async file=>{
    try{return await fs.readFile(path.join(root,file),'utf8');}
    catch(e){if(e.code==='ENOENT')return '';throw e;}
  };
  const [runs,portals]=await Promise.all([read('data/scan-runs.tsv'),read('portals.yml')]);
  return { coverage:portals?parsePortalCoverage(portals):null,latest:parseScanRuns(runs) };
}
