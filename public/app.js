const $ = id => document.getElementById(id);
const state = {
  data: { jobs: [], statuses: [], configured: false, scan: { status: 'idle' }, audit: {coverage:null,latest:null} },
  page: 'overview', search: '', stage: 'all', sort: 'recent', demo: false
};
const examples = [
  { id:'example-1', title:'Senior Marketing Data Scientist', company:'Example Entertainment Co.', location:'Orlando, FL', status:'Evaluated', score:4.7, source:'demo', priority:'high', date:'2026-11-06' },
  { id:'example-2', title:'Principal Applied Scientist', company:'Example Technology Co.', location:'Remote', status:'Saved', score:null, source:'demo', priority:'high', date:'2026-11-05' },
  { id:'example-3', title:'Marketing Measurement Lead', company:'Example Media Co.', location:'New York, NY', status:'Interview', score:4.2, source:'demo', priority:'medium', date:'2026-11-03' },
  { id:'example-4', title:'AI Engineering Manager', company:'Example Software Co.', location:'Remote', status:'New', score:null, source:'demo', priority:'medium', date:'2026-11-02' }
];
const pageInfo = {
  overview: ['Your next move,', 'made smarter.', 'Discover better opportunities, keep your search focused, and move with clarity.', 'Opportunity feed'],
  opportunities: ['Opportunities,', 'all in one place.', 'Review everything on your radar, with transparent fit scores and statuses.', 'All opportunities'],
  pipeline: ['Every application,', 'one clear view.', 'Your applications, interviews, outcomes, and what needs attention.', 'Application pipeline'],
  insights: ['Clarity from', 'your search.', 'An evidence-first view of how your job search is progressing.', 'Evaluated opportunities']
};
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const jobs = () => state.demo ? examples : state.data.jobs;
const inProcess = j => ['Applied','Responded','Assessment','Interview','Offer','Hired'].includes(j.status);
const safeUrl = value => {
  try { const u = new URL(value); return ['https:','http:'].includes(u.protocol) ? u.href : ''; }
  catch { return ''; }
};
function note(message, isError = false) {
  const el = $('notice');
  el.textContent = message;
  el.classList.toggle('error',isError);
  el.hidden = false;
}
async function request(url, options = {}) {
  const response = await fetch(url,{
    ...options,
    headers: { 'Content-Type':'application/json', 'X-Requested-With':'CareerIntelligence', ...(options.headers||{}) }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed ('+response.status+')');
  return data;
}
async function refresh() {
  try {
    state.data = await request('/api/state');
    render();
  } catch(error) {
    note(error.message,true);
    $('connection').textContent = 'Disconnected';
  }
}
function badge(status) {
  const color = ['Interview','Offer','Hired'].includes(status) ? 'green'
    : ['Saved','Evaluated'].includes(status) ? 'purple'
    : ['New','Applied'].includes(status) ? 'orange' : '';
  return '<span class="pill '+color+'">'+escapeHtml(status||'Saved')+'</span>';
}
function jobHtml(job) {
  const link = safeUrl(job.url);
  const title = escapeHtml(job.title);
  const company = escapeHtml(job.company);
  const initials = company.split(/\s+/).slice(0,2).map(s=>s.charAt(0)).join('').toUpperCase();
  const titleHtml = link
    ? '<a href="'+escapeHtml(link)+'" rel="noopener noreferrer" target="_blank">'+title+' ↗</a>'
    : title;
  const source = job.source==='career-ops' ? 'CAREER-OPS'
    : job.source==='scan' ? 'DISCOVERED'
    : job.source==='demo' ? 'EXAMPLE' : 'SAVED MANUALLY';
  const location = job.location ? '<span class="pill">⌾ '+escapeHtml(job.location)+'</span>' : '';
  const priority = job.priority==='high' ? '<span class="pill orange">HIGH PRIORITY</span>' : '';
  const score = job.score==null ? '<strong class="score unscored">—</strong><small>NOT SCORED</small>'
    : '<strong class="score">'+Number(job.score).toFixed(1)+'<sup> / 5</sup></strong><small>EVALUATED FIT</small>';
  const statusSelect = job.source==='manual' && !state.demo
    ? '<select class="status-select" data-id="'+escapeHtml(job.id)+'" aria-label="Status for '+title+'">'
      + state.data.statuses.map(s => '<option '+(s===job.status?'selected ':'')+'value="'+escapeHtml(s)+'">'+escapeHtml(s)+'</option>').join('')
      + '</select>'
    : '<small class="readonly">'+(job.source==='demo'?'Demo only':job.source==='scan'?'Pending evaluation':'Read-only sync')+'</small>';
  return '<article class="job"><div class="company-icon">'+escapeHtml(initials)+'</div>'
    + '<div class="job-main"><h3>'+titleHtml+'</h3><p>'+company+'</p>'
    + '<div class="tags">'+badge(job.status)+'<span class="pill">'+source+'</span>'+location+priority+'</div></div>'
    + '<div class="job-score">'+score+statusSelect+'</div></article>';
}
function renderAudit() {
  const audit=state.data.audit||{};
  const latest=audit.latest;
  const coverage=audit.coverage;
  const num=n=>Number.isFinite(n)?n.toLocaleString('en-US'):'—';
  $('audit-configured').textContent=num(coverage?.companies);
  $('audit-found').textContent=num(latest?.found);
  $('audit-filtered').textContent=num(latest?.filtered);
  $('audit-dupes').textContent=num(latest?.dupes);
  $('audit-added').textContent=num(latest?.added);
  $('audit-errors').textContent=num(latest?.errors);
  if (!latest) {
    $('audit-status').textContent=state.data.scan?.status==='running'?'Scan running':'No scan recorded';
    $('audit-subtitle').textContent='Configured employer sources and the last recorded upstream scan.';
    $('audit-details').textContent='Run Scan portals to see real coverage, exclusions, duplicates, source errors and new discoveries.';
    return;
  }
  const when=new Date(latest.timestamp).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  const running=state.data.scan?.status==='running';
  $('audit-status').textContent=running?'Scan running · previous results':(latest.status==='failed'?'Last scan failed':'Last scan completed');
  $('audit-subtitle').textContent='Last recorded attempt: '+when+' · '+latest.companies+' employers and '+latest.boards+' job boards attempted';
  const breakdown=(latest.filters||[]).map(x=>x.label+': '+num(x.value)).join(' · ');
  $('audit-details').textContent=(latest.status==='failed'?'Incomplete run; new-job count is intentionally unavailable. ':'')
    +(breakdown||'No recorded filter exclusions')+'.'
    +' Data reflects one scanner run; overall opportunities may include earlier discoveries.';
}

function render() {
  renderAudit();
  const all = jobs();
  const total=all.length;
  const strong=all.filter(j => j.score!=null && j.score>=4).length;
  const applied=all.filter(inProcess).length;
  const review=all.filter(j => ['New','Saved','Evaluated'].includes(j.status)).length;
  $('total').textContent=total;
  $('strong').textContent=strong;
  $('active').textContent=applied;
  $('review').textContent=review;
  $('today').textContent = new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}).toUpperCase();
  $('connection').innerHTML = '<i></i> Private workspace';
  $('core-status').textContent=state.data.configured ? 'Connected' : 'Not connected';
  $('scan-status').textContent=state.data.scan?.status||'Idle';
  $('rate').textContent = total ? Math.round(100*applied/total)+'%' : '0%';
  $('progress-bar').style.width = total ? (100*applied/total)+'%' : '0%';
  $('progress-description').textContent = applied+' of '+total+' roles have reached the application stage or beyond.';
  const page=pageInfo[state.page];
  $('hero-title').innerHTML=escapeHtml(page[0])+'<br><em>'+escapeHtml(page[1])+'</em>';
  $('hero-description').textContent=page[2];
  $('list-heading').textContent=page[3];
  $('crumb').textContent=state.page.toUpperCase();
  document.querySelectorAll('[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===state.page));

  let shown=all.filter(j=>(state.stage==='all'||j.status===state.stage)
    && [j.title,j.company,j.location].join(' ').toLowerCase().includes(state.search.toLowerCase()));
  if(state.page==='pipeline')shown=shown.filter(j=>!['New','Saved'].includes(j.status));
  if(state.page==='insights')shown=shown.filter(j=>j.score!=null);
  if(state.page==='insights'||state.sort==='match')shown.sort((a,b)=>(b.score||0)-(a.score||0));
  else if(state.sort==='company')shown.sort((a,b)=>a.company.localeCompare(b.company));
  else shown.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));

  $('count').textContent=shown.length+(shown.length===1?' role':' roles');
  $('result-count').textContent='Showing '+shown.length+' of '+total+' opportunities';
  $('jobs').innerHTML=shown.map(jobHtml).join('')||'<div class="empty"><span>✳</span><h3>'
    + (state.page==='insights'?'No evaluated roles yet':state.page==='pipeline'?'No active applications yet':'Your next opportunity starts here')
    + '</h3><p>'+(state.demo?'Try another filter.':'Add a role, connect Career-Ops, or preview example data.')+'</p></div>';
  $('demo').textContent=state.demo?'Exit example mode':'Explore example data';
  $('tip-title').textContent=review?'Evaluate your shortlist':applied?'Keep momentum':'Start with one role';
  $('tip-description').textContent=review
    ? review+' roles could use a closer look. Run an upstream Career-Ops evaluation to get real fit scores.'
    : applied?'Keep your tracker current and prepare for upcoming interviews.'
      :'Add a role you are considering or connect Career-Ops to discover opportunities.';
  $('scan').disabled=state.data.scan?.status==='running';
  $('scan').textContent=state.data.scan?.status==='running'?'Scanning…':'↻ Scan portals';
}

document.querySelectorAll('[data-page]').forEach(el=>el.addEventListener('click',()=>{
  state.page=el.dataset.page;render();
}));
$('search').addEventListener('input',e=>{state.search=e.target.value;render();});
$('stage').addEventListener('change',e=>{state.stage=e.target.value;render();});
$('sort').addEventListener('change',e=>{state.sort=e.target.value;render();});
$('demo').addEventListener('click',()=>{
  state.demo=!state.demo;
  note(state.demo?'Example mode: fictional roles only. Nothing is saved.':'Your real workspace is now shown.');
  render();
});
$('jobs').addEventListener('change',async e=>{
  const select=e.target.closest('select[data-id]');
  if(!select) return;
  const chosen=select.value;
  try{
    await request('/api/leads/'+encodeURIComponent(select.dataset.id),{
      method:'PATCH', body:JSON.stringify({status:chosen})
    });
    note('Application status updated.');
    await refresh();
  }catch(error){note(error.message,true);await refresh();}
});
$('add').addEventListener('click',()=>$('dialog').showModal());
$('cancel').addEventListener('click',()=>$('dialog').close());
$('lead-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const body={
    title:$('job-title').value,
    company:$('company').value,
    url:$('job-url').value,
    location:$('location').value,
    priority:$('priority').value
  };
  try{
    await request('/api/leads',{method:'POST',body:JSON.stringify(body)});
    $('dialog').close();$('lead-form').reset();state.demo=false;
    state.page='opportunities';state.stage='all';$('stage').value='all';
    note('Opportunity saved. No application was submitted.');
    await refresh();
  }catch(error){note(error.message,true);}
});
$('scan').addEventListener('click',async()=>{
  try{
    await request('/api/scan',{method:'POST'});
    note('Scanning configured portals. The inbox will refresh when complete.');
    await refresh();
  }catch(error){note(error.message,true);}
});
setInterval(()=>{if(state.data.scan?.status==='running')refresh();},5000);
refresh();
