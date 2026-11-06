import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const STATUSES = ['Saved', 'Evaluated', 'Applied', 'Responded', 'Assessment', 'Interview', 'Offer', 'Rejected', 'Discarded', 'SKIP', 'Hired'];

function cells(line) {
  if (!/^\s*\|/.test(line)) return [];
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(s => s.trim().replace(/\\\|/g, '|'));
}
function text(s) { return String(s || '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*]/g, '').replaceAll(String.fromCharCode(96),'').trim(); }
function url(s) {
  const match = String(s || '').match(/https?:\/\/[^\s<>|)]+/i);
  if (!match) return '';
  try { const u = new URL(match[0]); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch { return ''; }
}
function num(s) { const n = Number(String(s || '').match(/\d+(?:\.\d+)?/)?.[0]); return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null; }
function hash(s) { return createHash('sha256').update(s).digest('hex').slice(0, 16); }
export function parseTracker(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  let headers = null;
  const out = [];
  for (const line of lines) {
    const row = cells(line);
    if (!row.length) continue;
    const normalized = row.map(x => text(x).toLowerCase());
    if (normalized.includes('company') && normalized.includes('role') && normalized.includes('status')) { headers = normalized; continue; }
    if (!headers || row.length < 4 || row.every(x => /^[-:\s]+$/.test(x))) continue;
    const get = (name) => row[headers.indexOf(name)] || '';
    const company = text(get('company'));
    const title = text(get('role'));
    if (!company || !title) continue;
    const link = url(get('url')) || url(get('role'));
    const s = text(get('status'));
    out.push({ id: 'core-' + hash([get('#'), company, title].join('|')), company, title, status: STATUSES.find(x => x.toLowerCase() === s.toLowerCase()) || 'Evaluated', score: num(get('score')), location: text(get('location')), url: link, date: text(get('date')), source: 'career-ops', priority: '', report: text(get('report')) });
  }
  return out;
}
export function parseInbox(markdown) {
  return String(markdown || '').split(/\r?\n/).filter(line => /^\s*- \[ \] /.test(line)).map(line => {
    const raw = line.replace(/^\s*- \[ \] /, '');
    const link = url(raw);
    const fields = raw.split('|').map(text);
    let company = fields[1] || '';
    let title = fields[2] || '';
    if (link && fields[0]) {
      const head = fields[0].replace(link, '').trim();
      if (head && !company) company = head;
    }
    if (!company) { try { company = new URL(link).hostname.replace(/^www\./, ''); } catch { company = 'Uncategorized'; } }
    if (!title) title = 'New opportunity';
    return link ? {id: 'scan-' + hash(link), company, title, status: 'New', score: null, location: '', url: link, date: '', source: 'scan', priority: ''} : null;
  }).filter(Boolean);
}
export async function readCore(root) {
  if (!root) return { configured: false, jobs: [] };
  const load = async file => { try { return await fs.readFile(path.join(root, file), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return ''; throw e; } };
  const [tracker, inbox] = await Promise.all([load('data/applications.md'), load('data/pipeline.md')]);
  const official = parseTracker(tracker);
  const pending = parseInbox(inbox);
  const keys = new Set(official.filter(x => x.url).map(x => x.url));
  return { configured: true, jobs: [...official, ...pending.filter(x => !keys.has(x.url))] };
}
export function normalizeLead(value) {
  const company = String(value?.company || '').trim();
  const title = String(value?.title || '').trim();
  const location = String(value?.location || '').trim();
  const link = String(value?.url || '').trim();
  if (!company || company.length > 120 || !title || title.length > 160 || location.length > 160) throw new Error('Company and job title are required (max 120 and 160 characters).');
  if (link) { try { if (!['https:', 'http:'].includes(new URL(link).protocol)) throw Error(); } catch { throw new Error('Use an http(s) job posting URL.'); } }
  return { company, title, location, url: link, priority: ['high', 'medium', 'low'].includes(value.priority) ? value.priority : 'medium' };
}
export async function readLeads(file) { try { const x = JSON.parse(await fs.readFile(file, 'utf8')); return Array.isArray(x) ? x : []; } catch(e) { if (e.code === 'ENOENT') return []; throw e; } }
export async function writeLeads(file, leads) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + '.tmp-' + process.pid;
  await fs.writeFile(tmp, JSON.stringify(leads, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  await fs.rename(tmp, file);
}
export function combine(core, manual) {
  const urlSet = new Set(core.jobs.filter(x=>x.url).map(x=>x.url));
  return [...core.jobs, ...manual.filter(x => !x.url || !urlSet.has(x.url))];
}
