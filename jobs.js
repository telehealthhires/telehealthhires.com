/* Telehealth Hires shared listings script.
   Setup once: replace JOBS_CSV_URL with the published CSV URL for your public job-data sheet.
   Only publish public job information. Keep private employer/customer data in a separate sheet. */
const JOBS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTrneGiSYHgtx3q7dYZJF-1ddrJ8iVUjpusOPdb37Tb0lY25EWi3OSyLTfOVmHQPT4oB7uNXKLLBdSa/pub?gid=0&single=true&output=csv';
const FEATURED_VISIBLE_COUNT = 6;
const FEATURED_ROTATION_MS = 30000;
let allJobs = [];
let featuredJobs = [];
let featuredStart = 0;
let featuredTimer = null;

function parseCSV(text) {
  const rows=[]; let row=[], cell='', quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i], next=text[i+1];
    if(c==='"' && quoted && next==='"'){cell+='"';i++;}
    else if(c==='"'){quoted=!quoted;}
    else if(c===',' && !quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&next==='\n')i++;row.push(cell);if(row.some(v=>v.trim()!==''))rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(cell.length||row.length){row.push(cell);if(row.some(v=>v.trim()!==''))rows.push(row);}
  if(!rows.length)return [];
  const headers=rows.shift().map(h=>h.trim().toLowerCase().replace(/\s+/g,' ').replace(/[^a-z0-9 ]/g,''));
  return rows.map(values=>{const obj={};headers.forEach((h,i)=>obj[h]=(values[i]||'').trim());return obj;});
}
function val(job,...keys){for(const key of keys){const k=key.toLowerCase().replace(/\s+/g,' ').replace(/[^a-z0-9 ]/g,'');if(job[k])return job[k];}return '';}
function truthy(v){return ['yes','y','true','1','featured'].includes(String(v||'').trim().toLowerCase());}
function parseDate(s){if(!s)return null;const clean=String(s).trim();let d;if(/^\d{4}-\d{1,2}-\d{1,2}$/.test(clean)){const [y,m,day]=clean.split('-').map(Number);d=new Date(y,m-1,day,12,0,0);}else d=new Date(clean);return Number.isNaN(d.getTime())?null:d;}
function normalizeJob(j){
  const expires=val(j,'expiration date','expires','expiry date');
  const status=(val(j,'status','listing status')||'active').toLowerCase();
  const rawApply=val(j,'apply url','application link','apply link','application url');
  const apply=/^https?:\/\//i.test(rawApply)?rawApply:'';
  return {title:val(j,'job title','title','role')||'Untitled position',employer:val(j,'employer','company','organization')||'Employer not specified',discipline:val(j,'discipline','profession','therapy discipline'),arrangement:val(j,'work arrangement','arrangement','work setting','remote status'),employment:val(j,'employment type','job type','schedule'),states:val(j,'state eligibility','eligible states','states','location','location states'),salary:val(j,'compensation','salary','pay range'),apply,posted:val(j,'date posted','posted date','posting date'),description:val(j,'description','job summary','summary'),featured:truthy(val(j,'featured','featured listing','is featured')),status,expires};
}
function isActive(j){if(!['active','published','live',''].includes(j.status))return false;const exp=parseDate(j.expires);if(exp){exp.setHours(23,59,59,999);if(exp<new Date())return false;}return !!j.title&&!!j.apply;}
function safeText(text){return String(text||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function disciplineLabel(v){const x=(v||'').toLowerCase();if(x.includes('speech')||x==='slp')return 'SLP';if(x.includes('occupational')||x==='ot')return 'OT';if(x.includes('physical')||x==='pt')return 'PT';return v||'Therapy';}
function cardHTML(j,isFeatured=false){const details=[j.arrangement,j.employment,j.states,j.salary].filter(Boolean).map(v=>`<span class="job-detail">${safeText(v)}</span>`).join('');const desc=j.description?`<p class="job-description">${safeText(j.description)}</p>`:'';const badge=isFeatured?'<span class="job-badge">Featured</span>':'';const posted=j.posted?`<p class="tiny" style="margin:0">Posted ${safeText(j.posted)}</p>`:'';return `<article class="job-card ${isFeatured?'is-featured':''}"><div class="job-card-top"><span class="job-discipline">${safeText(disciplineLabel(j.discipline))}</span>${badge}</div><h3>${safeText(j.title)}</h3><p class="job-employer">${safeText(j.employer)}</p><div class="job-details">${details}</div>${desc}${posted}<a class="btn btn-dark" href="${safeText(j.apply)}" target="_blank" rel="noopener noreferrer">View job &amp; apply</a></article>`;}
function shuffle(items){const a=items.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function renderFeatured(){const grid=document.getElementById('featuredJobGrid');if(!grid)return;const visible=featuredJobs.length?Array.from({length:Math.min(FEATURED_VISIBLE_COUNT,featuredJobs.length)},(_,i)=>featuredJobs[(featuredStart+i)%featuredJobs.length]):[];grid.innerHTML=visible.length?visible.map(j=>cardHTML(j,true)).join(''):'<div class="job-empty"><strong>No featured jobs available right now.</strong><p style="margin:8px 0 0">Featured opportunities appear here when active listings are marked Featured in the job sheet.</p></div>';}
function renderAll(){const grid=document.getElementById('allJobGrid');if(!grid)return;const disciplineFilter=document.getElementById('filterDiscipline');const stateFilter=document.getElementById('filterState');const arrangementFilter=document.getElementById('filterArrangement');const employmentFilter=document.getElementById('filterEmployment');const q=stateFilter.value.trim().toLowerCase();const results=allJobs.filter(j=>{const discipline=disciplineFilter.value;const d=disciplineLabel(j.discipline);const arrangement=arrangementFilter.value.toLowerCase();const a=(j.arrangement||'').toLowerCase();const employment=employmentFilter.value.toLowerCase();const e=(j.employment||'').toLowerCase();const arrangementMatch=!arrangement||(arrangement==='remote'?(a.includes('remote')||a.includes('telehealth')):a.includes(arrangement));return(!discipline||d===discipline)&&(!q||(j.states||'').toLowerCase().includes(q))&&arrangementMatch&&(!employment||e.includes(employment));});const count=document.getElementById('jobCount');count.textContent=`${results.length} active ${results.length===1?'listing':'listings'}`;grid.innerHTML=results.length?results.map(j=>cardHTML(j,j.featured)).join(''):'<div class="job-empty"><strong>No jobs match those filters.</strong><p style="margin:8px 0 0">Try another discipline, state, or work arrangement.</p></div>';}
function showLoadMessage(message,isError=false){const markup=`<div class="${isError?'job-error':'job-empty'}"><strong>${message}</strong><p style="margin:8px 0 0">${isError?'Check that the Google Sheet is published as CSV and that its URL is correct.':'Publish your job-data sheet as CSV and set JOBS_CSV_URL in jobs.js.'}</p></div>`;const fg=document.getElementById('featuredJobGrid');const ag=document.getElementById('allJobGrid');if(fg)fg.innerHTML=markup;if(ag)ag.innerHTML=markup;const count=document.getElementById('jobCount');if(count)count.textContent=isError?'Unable to load listings':'Listings not connected yet';}
async function loadJobs(){if(!JOBS_CSV_URL.startsWith('https://')){showLoadMessage('Job listings are ready to connect.');return;}try{const response=await fetch(JOBS_CSV_URL,{cache:'no-store'});if(!response.ok)throw new Error('Could not load the job sheet.');allJobs=parseCSV(await response.text()).map(normalizeJob).filter(isActive);featuredJobs=shuffle(allJobs.filter(j=>j.featured));renderFeatured();renderAll();if(featuredTimer)clearInterval(featuredTimer);if(featuredJobs.length>FEATURED_VISIBLE_COUNT){featuredTimer=setInterval(()=>{featuredStart=(featuredStart+FEATURED_VISIBLE_COUNT)%featuredJobs.length;if(featuredStart===0)featuredJobs=shuffle(featuredJobs);renderFeatured();},FEATURED_ROTATION_MS);}}catch(e){showLoadMessage('Job listings could not be loaded.',true);}}
const filters=['filterDiscipline','filterState','filterArrangement','filterEmployment'].map(id=>document.getElementById(id)).filter(Boolean);filters.forEach(el=>el.addEventListener(el.id==='filterState'?'input':'change',renderAll));const clear=document.getElementById('clearJobFilters');if(clear)clear.addEventListener('click',()=>{filters.forEach(el=>el.value='');renderAll();});
const params=new URLSearchParams(window.location.search);if(params.get('featured')==='yes'){const discipline=document.getElementById('filterDiscipline');if(discipline){/* directory remains unfiltered so users can view all jobs; featured jobs are highlighted */}}
loadJobs();
