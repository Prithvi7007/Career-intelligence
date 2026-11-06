import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { STATUSES, readCore, readLeads, writeLeads, normalizeLead, combine } from './core.mjs';

const HOME = path.dirname(fileURLToPath(import.meta.url));
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3417);
const DATA_FILE = path.resolve(process.env.CAREER_INTELLIGENCE_DATA || path.join(HOME, 'data/leads.json'));
const ROOT = process.env.CAREER_OPS_ROOT ? path.resolve(process.env.CAREER_OPS_ROOT) : '';
const CODE = process.env.CAREER_OPS_CODE_ROOT ? path.resolve(process.env.CAREER_OPS_CODE_ROOT) : ROOT;
const STATIC = { '/': ['index.html','text/html; charset=utf-8'], '/app.js': ['app.js','text/javascript; charset=utf-8'], '/style.css': ['style.css','text/css; charset=utf-8'] };
let scan = { status: 'idle', message: 'No scan started', completedAt: null };
let writeQueue = Promise.resolve();

function response(res, status, obj) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(obj));
}
function forbidden(req) {
  // This starter is intentionally localhost-only: no authentication or public exposure.
  if (!req.headers.host || !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers.host)) return true;
  if (['POST','PATCH','DELETE'].includes(req.method)) {
    if (req.headers['x-requested-with'] !== 'CareerIntelligence') return true;
    const origin = req.headers.origin;
    if (origin && !['http://localhost:' + PORT, 'http://127.0.0.1:' + PORT].includes(origin)) return true;
  }
  return false;
}
async function body(req) {
  let raw='';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 16384) throw new Error('Request too large');
  }
  return JSON.parse(raw || '{}');
}
async function mutate(fn) {
  const run = writeQueue.then(async () => {
    const leads = await readLeads(DATA_FILE);
    const result = fn(leads);
    await writeLeads(DATA_FILE, leads);
    return result;
  });
  writeQueue = run.catch(()=>{});
  return run;
}
async function getState() {
  const [core, leads] = await Promise.all([readCore(ROOT), readLeads(DATA_FILE)]);
  return { configured:core.configured, jobs:combine(core,leads), scan, statuses:STATUSES };
}
function startScan() {
  scan = {status:'running', message:'Scanning configured portals...', completedAt:null};
  const child = spawn(process.execPath, [path.join(CODE,'scan.mjs'),'--verify','--quiet'], {
    cwd:CODE, stdio:['ignore','pipe','pipe'], env:{...process.env, CAREER_OPS_ROOT:ROOT}
  });
  let log = '', done = false;
  const collect = data => {log=(log+data.toString()).slice(-3000);};
  child.stdout.on('data',collect);
  child.stderr.on('data',collect);
  const timeout=setTimeout(()=>child.kill('SIGTERM'), 180000);
  child.on('error',e=>finish('error',e.message));
  child.on('close',code=>finish(code===0?'complete':'error',(log.trim()||('Scanner exited '+code)).slice(-650)));
  function finish(status,message){
    if(done) return;
    done=true;
    clearTimeout(timeout);
    scan={status,message,completedAt:new Date().toISOString()};
  }
}
export function createServer() {
  return http.createServer(async(req,res)=>{
    try {
      if (forbidden(req)) return response(res,403,{error:'This private dashboard only accepts localhost requests.'});
      const pathname = new URL(req.url,'http://localhost').pathname;
      if (req.method==='GET' && pathname==='/api/state') return response(res,200,await getState());
      if (req.method==='GET' && pathname==='/api/health') return response(res,200,{status:'ok',coreConfigured:Boolean(ROOT)});
      if (req.method==='POST' && pathname==='/api/leads') {
        const input=normalizeLead(await body(req));
        const lead=await mutate(leads=>{
          const x={...input,id:randomUUID(),status:'Saved',score:null,source:'manual',date:new Date().toISOString().slice(0,10)};
          leads.unshift(x);
          return x;
        });
        return response(res,201,lead);
      }
      if (req.method==='PATCH' && pathname.startsWith('/api/leads/')) {
        const id=pathname.slice('/api/leads/'.length);
        const input=await body(req);
        if (!STATUSES.includes(input.status)) return response(res,400,{error:'Invalid status.'});
        const found=await mutate(leads=>{
          const x=leads.find(x=>x.id===id);
          if(x) x.status=input.status;
          return x||null;
        });
        return found?response(res,200,found):response(res,404,{error:'Manual lead not found.'});
      }
      if(req.method==='POST' && pathname==='/api/scan') {
        if(!ROOT) return response(res,409,{error:'Connect Career-Ops first by setting CAREER_OPS_ROOT.'});
        if(scan.status==='running') return response(res,409,{error:'A scan is already running.'});
        try{await fs.access(path.join(CODE,'scan.mjs'));}catch{return response(res,409,{error:'Career-Ops scan.mjs not found. Set CAREER_OPS_CODE_ROOT.'});}
        startScan();
        return response(res,202,scan);
      }
      if(req.method==='GET' && STATIC[pathname]) {
        const [name,type]=STATIC[pathname];
        const file=await fs.readFile(path.join(HOME,'public',name));
        res.writeHead(200,{
          'Content-Type':type,
          'X-Content-Type-Options':'nosniff',
          'Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"
        });
        return res.end(file);
      }
      return response(res,404,{error:'Not found'});
    } catch(e) {
      return response(res,e instanceof SyntaxError?400:500,{error:e.message||'Unexpected error'});
    }
  });
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(!['127.0.0.1','localhost','::1'].includes(HOST)) {
    console.error('Only loopback binds are supported. Use an SSH tunnel or authenticated reverse proxy.');
    process.exit(1);
  }
  createServer().listen(PORT,HOST,()=>console.log('Career Intelligence: http://'+HOST+':'+PORT));
}
