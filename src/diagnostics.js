const RAW_BASE="https://raw.githubusercontent.com/jonathanjoelneptune/Locale/main/src/data";
const ACTIONS_RUNS="https://api.github.com/repos/jonathanjoelneptune/Locale/actions/workflows/discover-sources.yml/runs?branch=main&per_page=5";
const production=location.hostname!=="localhost"&&!location.hostname.startsWith("127.");
const fmt=new Intl.NumberFormat("en-US");
const pct=value=>Number.isFinite(Number(value))?`${(Number(value)*100).toFixed(1)}%`:"—";
const n=value=>fmt.format(Number(value||0));
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const safeUrl=value=>{try{const url=new URL(value);return ["http:","https:"].includes(url.protocol)?url.href:null}catch{return null}};
const timeValue=value=>typeof value==="number"?value:Date.parse(value||"");
const dateText=value=>Number.isFinite(timeValue(value))?new Date(timeValue(value)).toLocaleString():"—";
const shortDate=value=>Number.isFinite(timeValue(value))?new Date(timeValue(value)).toLocaleString([],{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"—";
const duration=value=>{
  const ms=Math.max(0,Number(value||0));
  if(ms<1000)return `${ms} ms`;
  const seconds=Math.round(ms/1000);
  if(seconds<60)return `${seconds}s`;
  const minutes=Math.floor(seconds/60),rest=seconds%60;
  return `${minutes}m ${rest}s`;
};
const relative=value=>{
  const time=timeValue(value);
  if(!Number.isFinite(time))return "—";
  const delta=Date.now()-time;
  const future=delta<0;
  const abs=Math.abs(delta);
  const unit=abs<60000?"second":abs<3600000?"minute":abs<86400000?"hour":"day";
  const size=unit==="second"?1000:unit==="minute"?60000:unit==="hour"?3600000:86400000;
  const amount=Math.max(1,Math.round(abs/size));
  return future?`in ${amount} ${unit}${amount===1?"":"s"}`:`${amount} ${unit}${amount===1?"":"s"} ago`;
};
const statusClass=value=>{
  const normalized=String(value||"").toLowerCase();
  if(["ok","success","completed","qualified","pass","healthy"].includes(normalized))return "success";
  if(["in_progress","running"].includes(normalized))return "running";
  if(["failure","failed","retry","cancelled","timed_out"].includes(normalized))return "failed";
  return normalized.replace(/[^a-z0-9-]+/g,"-")||"queued";
};
const pill=value=>`<span class="status-pill ${statusClass(value)}">${esc(String(value||"unknown").replaceAll("_"," "))}</span>`;

async function json(name){
  const url=production?`${RAW_BASE}/${name}?v=${Date.now()}`:`./src/data/${name}`;
  const response=await fetch(url,{cache:"no-store"});
  if(!response.ok)throw new Error(`${name}: ${response.status}`);
  return response.json();
}
async function optionalJson(name){
  try{return await json(name)}catch{return null}
}

let dashboard=null;
let live=null;
let systemHealth=null;
let actionsState={run:null,jobs:[],checkedAt:null,error:null};
let actionsLastFetch=0;
let loading=false;
let refreshSeconds=30;

function summary(label,value,detail,tone=""){
  return `<article class="summary-card"><span>${esc(label)}</span><strong class="${tone}">${esc(value)}</strong><small>${esc(detail)}</small></article>`;
}
function metricRows(items){
  if(!items.length)return '<div class="empty-note">No data yet.</div>';
  const max=Math.max(1,...items.map(item=>Number(item.value||0)));
  return `<div class="metric-list">${items.map(item=>`<div class="metric-row"><div><label>${esc(item.label)}</label><div class="bar"><i style="width:${Math.min(100,100*Number(item.value||0)/max)}%"></i></div></div><strong>${esc(item.display??n(item.value))}</strong></div>`).join("")}</div>`;
}
function kv(label,value,detail="",tone=""){
  return `<div class="kv"><label>${esc(label)}</label><strong class="${tone}">${esc(value)}</strong>${detail?`<small>${esc(detail)}</small>`:""}</div>`;
}
function regionRow(id){return dashboard?.regions?.[id]||null}
function lastRun(){return live?.lastRun||null}
function regionState(id){return live?.regions?.[id]||{}}
function regionProfile(id){
  return lastRun()?.regionProfiles?.[id]||{
    mode:"unknown",
    configuredAreaCount:regionRow(id)?.coverageAreaAcceptance?.measured||0,
    measured:regionRow(id)?.coverageAreaAcceptance?.measured||0,
    passing:regionRow(id)?.coverageAreaAcceptance?.passing||0,
    passRate:(regionRow(id)?.coverageAreaAcceptance?.passing||0)/Math.max(1,regionRow(id)?.coverageAreaAcceptance?.measured||0),
    severeGapCount:0,
    mediumGapCount:0
  };
}

async function fetchActions(force=false){
  if(!production){
    actionsState={run:null,jobs:[],checkedAt:new Date().toISOString(),error:"Live Actions status is only queried on the deployed diagnostics page."};
    return;
  }
  if(!force&&Date.now()-actionsLastFetch<115000)return;
  actionsLastFetch=Date.now();
  try{
    const response=await fetch(ACTIONS_RUNS,{headers:{Accept:"application/vnd.github+json"},cache:"no-store"});
    if(!response.ok)throw new Error(`GitHub Actions API ${response.status}`);
    const payload=await response.json();
    const run=payload.workflow_runs?.[0]||null;
    let jobs=actionsState.run?.id===run?.id?(actionsState.jobs||[]):[];
    const active=["queued","in_progress","waiting","pending"].includes(run?.status);
    const needJobs=!!run?.jobs_url&&(active||actionsState.run?.id!==run?.id||!jobs.length);
    if(needJobs){
      const jobsResponse=await fetch(run.jobs_url,{headers:{Accept:"application/vnd.github+json"},cache:"no-store"});
      if(jobsResponse.ok)jobs=(await jobsResponse.json()).jobs||[];
    }
    actionsState={run,jobs,checkedAt:new Date().toISOString(),error:null};
  }catch(error){
    actionsState={...actionsState,checkedAt:new Date().toISOString(),error:error.message};
  }
}

function renderSystemHealth(){
  const container=document.querySelector("#systemHealth");
  const generated=document.querySelector("#systemHealthGenerated");
  if(!container)return;
  if(!systemHealth){
    container.innerHTML='<div class="empty-note">System health will populate after the next reconciliation cycle.</div>';
    if(generated)generated.textContent="";
    return;
  }
  if(generated)generated.textContent=`health snapshot ${relative(systemHealth.generatedAt)}`;
  const components=[
    ["Discovery",systemHealth.discovery],
    ["Reconciliation",systemHealth.reconciliation],
    ["Event refresh",systemHealth.eventRefresh],
    ["Location resolution",systemHealth.locationResolution]
  ];
  container.innerHTML=`<div class="mode-banner"><div>${pill(systemHealth.status)} <strong>${esc(String(systemHealth.status||"unknown").toUpperCase())}</strong></div>
    <p>Workers continuously update factual state. Reconciliation owns the derived diagnostics views and the watchdog recovers stale workers.</p>
  </div><div class="kv-grid">${components.map(([label,row])=>{
    const detail=row?.laggingFacts?"newer factual state is waiting for reconciliation":row?.stale?"past stale threshold":`last update ${relative(row?.lastRunAt||row?.lastGeneratedAt)}`;
    return kv(label,row?.stale?"STALE":"HEALTHY",detail,row?.stale?"bad":"good");
  }).join("")}</div>`;
}

function renderWorker(){
  const container=document.querySelector("#workerStatus");
  const steps=document.querySelector("#workerSteps");
  const freshness=document.querySelector("#workerFreshness");
  if(!container||!steps)return;
  freshness.textContent=actionsState.checkedAt?`Actions checked ${relative(actionsState.checkedAt)}`:"";
  const run=actionsState.run;
  if(!run){
    container.innerHTML=`<div class="worker-line"><span class="worker-title">No live Actions status available</span><span class="worker-meta">${esc(actionsState.error||"The latest completed data below is still available.")}</span></div>`;
    steps.innerHTML="";
    return;
  }
  const runUrl=safeUrl(run.html_url);
  const started=run.run_started_at||run.created_at;
  const isActive=["queued","in_progress","waiting","pending"].includes(run.status);
  const completedAt=run.updated_at;
  container.innerHTML=`<div class="worker-line">
    ${pill(run.status)}
    <span class="worker-title">Discovery run #${n(run.run_number)}</span>
    <span class="worker-meta">${isActive?`started ${relative(started)}`:`${esc(run.conclusion||run.status)} · ${relative(completedAt)}`}</span>
    ${runUrl?`<a class="worker-link" href="${esc(runUrl)}" target="_blank" rel="noopener">Open GitHub run ↗</a>`:""}
  </div>`;
  const job=actionsState.jobs?.[0];
  const visible=(job?.steps||[]).filter(step=>!/^Post |^Set up job$|^Complete job$/i.test(step.name||""));
  steps.innerHTML=visible.map(step=>`<div class="worker-step ${statusClass(step.status==="completed"?step.conclusion:step.status)}">
    <strong>${esc(step.name)}</strong>
    <small>${esc(step.status==="completed"?(step.conclusion||"completed"):step.status)}</small>
  </div>`).join("")||'<div class="empty-note">Waiting for job-step detail.</div>';
}

function renderAdaptive(id){
  const profile=regionProfile(id);
  const run=lastRun()||{};
  const budget=run.discoveryBudget||{};
  const mode=profile.mode==="unmeasured"?(run.discoveryMode||"unmeasured"):profile.mode;
  const passRate=Number(profile.passRate||0);
  const maintenanceProgress=Math.min(1,passRate/.95);
  const lastOverpass=live?.lastOverpassRunAt;
  const interval=Number(budget.overpassMinIntervalMinutes||0);
  const nextOverpass=lastOverpass&&interval?new Date(Date.parse(lastOverpass)+interval*60000).toISOString():null;
  document.querySelector("#adaptiveControl").innerHTML=`
    <div class="mode-banner"><div>${pill(mode)} <strong>${esc(mode)}</strong></div>
      <p>${mode==="bootstrap"?"Maximum discovery throughput while coverage has large gaps.":mode==="accelerated"?"High discovery throughput while major gaps remain.":mode==="convergence"?"Targeted discovery while closing the remaining gaps.":mode==="maintenance"?"Coverage is mature; discovery is running at a sustainable maintenance cadence.":"Coverage targets are not configured for this region yet."}</p>
    </div>
    <div class="progress-track"><i style="width:${(maintenanceProgress*100).toFixed(1)}%"></i></div>
    <div class="progress-caption"><span>${pct(passRate)} passing</span><span>95% maintenance threshold</span></div>
    <div class="kv-grid" style="margin-top:9px">
      ${kv("Passing areas",`${n(profile.passing)}/${n(profile.measured)}`,`${n(profile.configuredAreaCount)} configured`,passRate>=.95?"good":"warn")}
      ${kv("Severe gaps",n(profile.severeGapCount),"gap score ≥70",profile.severeGapCount?"bad":"good")}
      ${kv("Medium+ gaps",n(profile.mediumGapCount),"gap score ≥45",profile.mediumGapCount?"warn":"good")}
      ${kv("Probe budget",n(budget.probeLimit),`${n(budget.probeConcurrency)} concurrent`)}
      ${kv("Area sweeps",n(budget.areaSweeps),"per Overpass cycle")}
      ${kv("Regional cells",n(budget.regionalCells),"per Overpass cycle")}
      ${kv("Overpass cadence",interval?`${interval} min`:"—",lastOverpass?`last ${relative(lastOverpass)}`:"not run")}
      ${kv("Next Overpass",nextOverpass?(Date.now()>=Date.parse(nextOverpass)?"due now":relative(nextOverpass)):"—","provider-safe geographic discovery",nextOverpass&&Date.now()>=Date.parse(nextOverpass)?"warn":"")}
    </div>`;
}

function renderLatestRun(id){
  const run=lastRun();
  if(!run){
    document.querySelector("#latestRun").innerHTML='<div class="empty-note">No completed adaptive-discovery run has been recorded yet.</div>';
    return;
  }
  const regionFocus=(run.focusAreas||[]).filter(item=>item.regionId===id);
  const newCandidates=Number(run.seededFromRegistry||0)+Number(run.seededFromRegionalSweep||0)+Number(run.seededFromAreaSweep||0);
  document.querySelector("#latestRun").innerHTML=`
    <div class="kv-grid">
      ${kv("Finished",relative(run.finishedAt),dateText(run.finishedAt))}
      ${kv("Duration",duration(run.durationMs),`${dateText(run.startedAt)} start`)}
      ${kv("Probed",n(run.probed),`${n(run.discoveryBudget?.probeConcurrency)} concurrent`)}
      ${kv("Promoted",n(run.promoted),"new ingestion sources",run.promoted?"good":"warn")}
      ${kv("Probe failures",n(run.failed),run.probed?`${pct(run.failed/run.probed)} of probes`:"no probes",run.failed===run.probed&&run.probed?"warn":"")}
      ${kv("New candidates",n(newCandidates),`${n(run.seededFromAreaSweep)} area + ${n(run.seededFromRegionalSweep)} regional`)}
      ${kv("Overpass",run.overpassRun?"ran":"deferred",run.overpassRun?"geographic discovery attempted":"cadence not due",run.overpassRun?"":"muted")}
      ${kv("Focused areas",n(regionFocus.length),regionFocus.map(item=>item.name).slice(0,3).join(", ")||"none this run")}
      ${kv("Moved to cold",n(run.coldMigrated||0),"low-value failures deferred 45–180 days")}
      ${kv("Probe lanes",Object.entries(run.probeLaneCounts||{}).filter(([,v])=>v).map(([k,v])=>`${k} ${v}`).join(" · ")||"—","actual selected lane mix")}
      ${kv("Global queue",run.queueAfter?`${n(run.queueAfter.due)} due / ${n(run.queueAfter.total)} total`:"—","all configured regions; regional queue is shown separately below")}
    </div>`;
}

function renderQueue(id,row){
  const discovery=row.discovery||{};
  const run=lastRun()||{};
  const budget=run.discoveryBudget||{};
  const dueCount=Number(discovery.dueCount||0);
  const perRun=Math.max(1,Number(budget.probeLimit||1));
  const cycles=Math.ceil(dueCount/perRun);
  const runsPerHour=2;
  const theoreticalHours=cycles/runsPerHour;
  const clearText=dueCount===0?"clear":theoreticalHours<1?`~${Math.max(10,Math.ceil(theoreticalHours*60/10)*10)} min`:`~${theoreticalHours.toFixed(1)} hr`;
  document.querySelector("#queueThroughput").innerHTML=`
    <div class="kv-grid">
      ${kv("Candidates",n(discovery.candidateCount),"total queue")}
      ${kv("Websites",n(discovery.withWebsiteCount),`${pct(discovery.withWebsiteCount/Math.max(1,discovery.candidateCount))} website-backed`)}
      ${kv("Due now",n(dueCount),"eligible for probing",dueCount?"warn":"good")}
      ${kv("Retry queue",n(discovery.retryCount),"short-term retry/backoff",discovery.retryCount?"warn":"")}
      ${kv("Cold storage",n(discovery.coldCount||0),"low-yield candidates retained for periodic resampling",discovery.coldCount?"muted":"")}
      ${kv("Low-value inventory",n(discovery.lowValueCount||0),"not competing for hot probe slots",discovery.lowValueCount?"muted":"")}
      ${kv("Needs website",n(discovery.needsWebsiteCount),"cannot qualify yet",discovery.needsWebsiteCount?"warn":"")}
      ${kv("Qualified",n(discovery.qualifiedCount),`${pct(discovery.promotionRate)} yield`,discovery.qualifiedCount?"good":"warn")}
      ${kv("Theoretical cycles",n(cycles),`${perRun} probes/run`)}
      ${kv("Backlog floor",clearText,"assumes 2 gap-fill runs/hour and no new candidates")}
    </div>`;
}

function latestOverpassTelemetry(){
  const direct=lastRun()?.overpassEndpoints||[];
  if(direct.some(item=>item.attempts))return direct;
  for(const run of live?.runHistory||[]){
    if((run.overpassEndpoints||[]).some(item=>item.attempts))return run.overpassEndpoints;
  }
  return direct;
}
function renderOverpass(){
  const rows=latestOverpassTelemetry();
  if(!rows?.length){
    document.querySelector("#overpassHealth").innerHTML='<div class="empty-note">No endpoint telemetry recorded yet. It will appear after the next Overpass cycle.</div>';
    return;
  }
  document.querySelector("#overpassHealth").innerHTML=`<div class="overpass-list">${rows.map(item=>{
    const hostname=(()=>{try{return new URL(item.endpoint).hostname}catch{return item.endpoint}})();
    const cooling=Number(item.cooldownUntil||0)>Date.now();
    const status=item.attempts?item.lastStatus:"not attempted";
    return `<div class="endpoint-card">
      <div class="endpoint-head"><strong><span class="status-dot ${statusClass(status)}"></span>${esc(hostname)}</strong><span>${pill(cooling?"cooldown":status)}</span></div>
      <div class="endpoint-stats"><span>${n(item.attempts)} attempts</span><span>${n(item.successes)} success</span><span>${n(item.failures)} fail</span><span>${item.lastLatencyMs!=null?`${n(item.lastLatencyMs)} ms`:"—"}</span></div>
      <small>${item.lastError?esc(item.lastError):item.lastFinishedAt?`last response ${esc(relative(item.lastFinishedAt))}`:"not used in captured cycle"}${cooling?` · cooldown until ${esc(dateText(item.cooldownUntil))}`:""}</small>
    </div>`;
  }).join("")}</div>`;
}

function probeResultLabel(item){
  if(item.status==="qualified")return "qualified";
  return item.lastResult?.reason||item.status||"unknown";
}
function probeDetail(item){
  const result=item.lastResult||{};
  if(item.status==="qualified")return [result.kind,result.eventCount!=null?`${result.eventCount} events`:null,result.url].filter(Boolean).join(" · ");
  return result.detail||result.reason||"—";
}
function renderProbes(id){
  const all=(live?.recentProbeResults?.length?live.recentProbeResults:lastRun()?.probeResults||[])
    .filter(item=>item.regionId===id)
    .sort((a,b)=>String(b.lastCheckedAt||b.checkedAt||"").localeCompare(String(a.lastCheckedAt||a.checkedAt||"")))
    .slice(0,60);
  const qualified=all.filter(item=>item.status==="qualified").length;
  document.querySelector("#probeSummary").textContent=`${all.length} recent · ${qualified} qualified`;
  document.querySelector("#probeRows").innerHTML=all.map(item=>{
    const checked=item.lastCheckedAt||item.checkedAt;
    const result=probeResultLabel(item);
    const url=safeUrl(item.website);
    return `<tr>
      <td class="nowrap">${esc(relative(checked))}<br><small>${esc(shortDate(checked))}</small></td>
      <td><strong>${esc(item.name)}</strong>${url?`<br><small><a href="${esc(url)}" target="_blank" rel="noopener">website ↗</a></small>`:""}</td>
      <td>${esc(String(item.category||"—").replaceAll("-"," "))}</td>
      <td>${pill(item.probeLane||"unknown")}</td>
      <td>${pill(result)}</td>
      <td>${n(item.attempts)}</td>
      <td class="cell-detail">${esc(probeDetail(item))}</td>
      <td class="nowrap">${item.nextCheckAt?esc(relative(item.nextCheckAt)):"—"}<br><small>${item.nextCheckAt?esc(shortDate(item.nextCheckAt)):""}</small></td>
    </tr>`;
  }).join("")||'<tr><td colspan="8">No probe results recorded for this region yet.</td></tr>';
}

function renderRunHistory(){
  const runs=(live?.runHistory||[]).slice(0,24);
  const totalProbes=runs.reduce((sum,row)=>sum+Number(row.probed||0),0);
  const totalPromoted=runs.reduce((sum,row)=>sum+Number(row.promoted||0),0);
  document.querySelector("#runHistorySummary").textContent=runs.length?`${totalProbes} probes · ${totalPromoted} promotions across ${runs.length} runs`:"History begins with the next worker run";
  document.querySelector("#runHistoryRows").innerHTML=runs.map(run=>{
    const newCandidates=Number(run.seededFromRegistry||0)+Number(run.seededFromRegionalSweep||0)+Number(run.seededFromAreaSweep||0);
    return `<tr>
      <td class="nowrap">${esc(relative(run.finishedAt))}<br><small>${esc(shortDate(run.finishedAt))}</small></td>
      <td>${pill(run.discoveryMode||"unknown")}</td>
      <td>${esc(duration(run.durationMs))}</td>
      <td>${n(run.probed)}</td>
      <td><strong class="${run.promoted?"good":""}">${n(run.promoted)}</strong></td>
      <td><strong class="${run.failed?"warn":""}">${n(run.failed)}</strong></td>
      <td>${n(newCandidates)}</td>
      <td>${run.overpassRun?pill("ran"):pill("deferred")}</td>
      <td>${n(run.queueAfter?.due||0)}</td>
    </tr>`;
  }).join("")||'<tr><td colspan="9">Run history has not been accumulated yet.</td></tr>';
}

function renderAreaSweeps(id){
  const sweeps=Object.entries(regionState(id).coverageAreaSweeps||{})
    .map(([areaId,value])=>({areaId,...value}))
    .sort((a,b)=>String(b.lastAttemptAt||"").localeCompare(String(a.lastAttemptAt||"")));
  const areaNames=new Map((regionRow(id)?.coverageAreas||[]).map(item=>[item.id,item.name]));
  document.querySelector("#areaSweepRows").innerHTML=sweeps.map(item=>{
    const ok=!!item.lastCompletedAt&&!item.error;
    const status=ok?"success":item.error?"failed":"queued";
    return `<tr>
      <td><strong>${esc(areaNames.get(item.areaId)||item.areaId)}</strong></td>
      <td>${pill(status)}</td>
      <td class="nowrap">${esc(relative(item.lastAttemptAt))}</td>
      <td>${item.candidateCount==null?"—":n(item.candidateCount)}</td>
      <td>${item.newCount==null?"—":n(item.newCount)}</td>
      <td class="cell-detail">${item.error?`${esc(item.error)}<br>`:""}<small>${item.nextAttemptAt?esc(relative(item.nextAttemptAt)):ok?"completed":"—"}</small></td>
    </tr>`;
  }).join("")||'<tr><td colspan="6">No focused area sweeps recorded yet.</td></tr>';
}

function renderRegionalCells(id,row){
  const cells=row.discovery?.cells||{};
  document.querySelector("#regionalCells").innerHTML=`<div class="kv-grid" style="margin-bottom:9px">
    ${kv("Completed",`${n(cells.completed)}/${n(cells.total)}`,"systematic regional grid")}
    ${kv("Remaining",n(cells.remaining),"cells still unswept",cells.remaining?"warn":"good")}
    ${kv("Failed",n(cells.failed),"current retry backlog",cells.failed?"bad":"good")}
    ${kv("Core / high / dining",`${n(cells.core)} / ${n(cells.high)} / ${n(cells.dining)}`,"configured cells")}
  </div>`;
  const failures=Object.entries(regionState(id).failedCells||{})
    .map(([cellId,value])=>({cellId,...value}))
    .sort((a,b)=>String(b.lastAttemptAt||"").localeCompare(String(a.lastAttemptAt||"")));
  document.querySelector("#cellRows").innerHTML=failures.map(item=>`<tr>
    <td class="mono">${esc(item.cellId)}</td><td>${pill("failed")}</td><td>${n(item.attempts)}</td>
    <td class="nowrap">${esc(relative(item.lastAttemptAt))}</td>
    <td class="cell-detail">${esc(item.error||"")}${item.nextAttemptAt?`<br><small>${esc(relative(item.nextAttemptAt))}</small>`:""}</td>
  </tr>`).join("")||'<tr><td colspan="5">No regional cell failures currently recorded.</td></tr>';
}

function renderPromotions(id){
  const promotions=(live?.recentPromotions||[]).filter(source=>source.regions?.includes(id));
  document.querySelector("#promotionRows").innerHTML=promotions.map(source=>{
    const url=safeUrl(source.endpoint);
    return `<tr><td class="nowrap">${esc(relative(source.discoveredAt))}</td><td><strong>${esc(source.name)}</strong></td><td>${esc(source.adapter)}</td><td>${n(source.discoveryEventCount)}</td><td class="url-cell">${url?`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>`:"—"}</td></tr>`;
  }).join("")||'<tr><td colspan="5">No auto-promoted sources yet.</td></tr>';
}

function render(id){
  const row=regionRow(id);
  if(!row)return;
  const profile=regionProfile(id);
  const run=lastRun()||{};
  const preciseTone=row.preciseLocationTargetMet?"good":"warn";
  const acceptance=row.coverageAreaAcceptance||row.neighborhoodAcceptance||{passing:0,measured:0};
  document.querySelector("#summaryCards").innerHTML=[
    summary("Discovery mode",String(profile.mode==="unmeasured"?(run.discoveryMode||"unmeasured"):profile.mode).toUpperCase(),`${n(run.discoveryBudget?.probeLimit)} probes/run · ${n(run.discoveryBudget?.probeConcurrency)} concurrent`,profile.mode==="maintenance"?"good":"warn"),
    summary("Events",n(row.eventCount),"canonical upcoming events"),
    summary("Location precision",pct(row.preciseLocationRate),`target ${pct(row.preciseLocationTarget)}`,preciseTone),
    summary("Discovery queue",n(row.discovery.candidateCount),`${n(row.discovery.dueCount)} due · ${n(row.discovery.withWebsiteCount)} websites`),
    summary("Auto sources",n(row.dynamicSourceCount),`${pct(row.discovery.promotionRate)} promotion yield`,row.dynamicSourceCount?"good":"warn"),
    summary("Area coverage",`${n(acceptance.passing)}/${n(acceptance.measured)}`,`${pct(acceptance.passing/Math.max(1,acceptance.measured))} passing`,acceptance.passing===acceptance.measured&&acceptance.measured?"good":"warn")
  ].join("");

  renderSystemHealth();
  renderAdaptive(id);
  renderLatestRun(id);
  renderQueue(id,row);
  renderOverpass();
  renderProbes(id);
  renderRunHistory();
  renderAreaSweeps(id);
  renderRegionalCells(id,row);
  renderPromotions(id);

  const funnel=[
    {label:"Candidates",value:row.discovery.candidateCount},
    {label:"Websites found",value:row.discovery.withWebsiteCount},
    {label:"Due now",value:row.discovery.dueCount},
    {label:"Qualified",value:row.discovery.qualifiedCount},
    {label:"Retry queue",value:row.discovery.retryCount},
    {label:"Cold storage",value:row.discovery.coldCount||0},
    {label:"Low-value inventory",value:row.discovery.lowValueCount||0},
    {label:"Needs website",value:row.discovery.needsWebsiteCount}
  ];
  document.querySelector("#discoveryFunnel").innerHTML=metricRows(funnel);
  const cellText=row.discovery.cells?`${row.discovery.cells.completed||0}/${row.discovery.cells.total||0} regional cells`:"";
  const areaText=row.discovery.areaSweeps?`${row.discovery.areaSweeps.completed||0}/${acceptance.measured||0} focused areas completed`:"";
  document.querySelector("#discoveryGenerated").textContent=[cellText,areaText].filter(Boolean).join(" · ");

  document.querySelector("#locationResolution").innerHTML=metricRows([
    {label:"Unresolved venue queries",value:row.locationResolution.unresolvedVenueCount},
    {label:"Resolved pending refresh",value:row.locationResolution.resolvedPendingRefreshCount},
    {label:"Events represented",value:row.locationResolution.representedEventCount},
    {label:"High-priority unresolved",value:row.locationResolution.highPriorityCount}
  ]);

  const areaRows=row.coverageAreas||row.neighborhoods||[];
  const groupSelect=document.querySelector("#areaGroupSelect");
  const previousGroup=groupSelect.value||"all";
  const groups=[...new Set(areaRows.map(item=>item.group).filter(Boolean))].sort();
  groupSelect.innerHTML='<option value="all">All areas</option>'+groups.map(group=>`<option value="${esc(group)}">${esc(group.replaceAll("-"," "))}</option>`).join("");
  groupSelect.value=groups.includes(previousGroup)?previousGroup:"all";
  const visibleAreas=areaRows.filter(item=>groupSelect.value==="all"||item.group===groupSelect.value);
  document.querySelector("#neighborhoodRows").innerHTML=visibleAreas.map(item=>`<tr>
    <td><strong>${esc(item.name)}</strong><br><small>${item.radiusMiles} mi radius</small></td>
    <td>${esc((item.group||"").replaceAll("-"," "))}</td>
    <td>${esc((item.coverageClass||"mixed").replaceAll("-"," "))}</td>
    <td>${n(item.preciseEventsNext28d)}</td>
    <td>${n(item.uniqueVenuesNext28d)}</td>
    <td>${n(item.discovery?.withWebsiteCount||0)} / ${n(item.discovery?.candidateCount||0)}</td>
    <td>${item.fridaySaturdayNightAverage} / ${item.targets.fridaySaturdayNightAverage}</td>
    <td>${n(item.recurringLocalOccurrences30d)} / ${n(item.targets.recurringLocalOccurrences30d)}</td>
    <td><strong class="${Number(item.gapScore||0)>=60?"bad":Number(item.gapScore||0)>=30?"warn":"good"}">${n(item.gapScore||0)}</strong></td>
    <td><span class="status-pill ${item.acceptance.pass?"pass":"fail"}">${item.acceptance.pass?"PASS":"GAP"}</span></td>
  </tr>`).join("")||'<tr><td colspan="10">No coverage areas configured.</td></tr>';

  const recurring=Object.entries(row.recurringActivityCounts||{}).sort((a,b)=>b[1]-a[1]).map(([label,value])=>({label:label.replaceAll("-"," "),value}));
  document.querySelector("#recurringActivity").innerHTML=metricRows(recurring);

  const failures=Object.entries(row.discovery.failureReasons||{}).slice(0,12).map(([label,value])=>({label:label.replaceAll("-"," "),value}));
  document.querySelector("#failureReasons").innerHTML=metricRows(failures);

  document.querySelector("#sourceRows").innerHTML=(row.sourceHealth||[]).map(source=>`<tr>
    <td>${esc(source.sourceId)}</td><td>${pill(source.status)}</td><td>${n(source.count)}</td>
  </tr>`).join("")||'<tr><td colspan="3">No source health rows.</td></tr>';

  renderWorker();
}

async function load({silent=false,forceActions=false}={}){
  if(loading)return;
  loading=true;
  const status=document.querySelector("#diagStatus");
  if(!silent)status.textContent="Loading current operations state…";
  try{
    const [nextDashboard,nextLive,nextSystemHealth]=await Promise.all([
      json("coverage-dashboard.json"),
      optionalJson("discovery-live.json"),
      optionalJson("system-health.json")
    ]);
    let stateFallback=null,coverageFallback=null;
    if(!nextLive){
      [stateFallback,coverageFallback]=await Promise.all([
        optionalJson("discovery-state.json"),
        optionalJson("discovery-coverage.json")
      ]);
    }
    dashboard=nextDashboard;
    systemHealth=nextSystemHealth;
    live=nextLive||{
      generatedAt:coverageFallback?.generatedAt||stateFallback?.lastRunAt||null,
      lastRun:stateFallback?.lastRun||coverageFallback?.run||null,
      runHistory:stateFallback?.runHistory||[],
      lastOverpassRunAt:stateFallback?.lastOverpassRunAt||null,
      regions:stateFallback?.regions||{},
      recentProbeResults:stateFallback?.lastRun?.probeResults||[],
      recentPromotions:[]
    };

    const select=document.querySelector("#regionSelect");
    const old=select.value;
    select.innerHTML=Object.entries(dashboard.regions||{}).map(([id,row])=>`<option value="${esc(id)}">${esc(row.name||id)}</option>`).join("");
    if(old&&dashboard.regions?.[old])select.value=old;
    const id=select.value||Object.keys(dashboard.regions||{})[0];

    await fetchActions(forceActions);
    render(id);

    const generated=live?.generatedAt||dashboard.generatedAt;
    const stale=generated&&Date.now()-Date.parse(generated)>20*60*1000;
    document.querySelector("#liveBadge").classList.toggle("stale",!!stale);
    status.textContent=`Repository ${systemHealth?.status||"health pending"} · live snapshot ${generated?relative(generated):"unknown"} · coverage generated ${dashboard.generatedAt?relative(dashboard.generatedAt):"unknown"} · metric v${dashboard.metricVersion||1}`;
  }catch(error){
    status.textContent=`Diagnostics unavailable: ${error.message}`;
  }finally{
    loading=false;
  }
}

document.querySelector("#regionSelect").addEventListener("change",event=>render(event.target.value));
document.querySelector("#areaGroupSelect").addEventListener("change",()=>render(document.querySelector("#regionSelect").value));
document.querySelector("#refreshDiagnostics").addEventListener("click",()=>load({forceActions:true}));

setInterval(()=>{
  refreshSeconds--;
  if(refreshSeconds<=0){
    refreshSeconds=30;
    load({silent:true});
  }
  const el=document.querySelector("#autoRefreshText");
  if(el)el.textContent=`Auto refresh ${refreshSeconds}s`;
},1000);

setInterval(async()=>{
  await fetchActions(false);
  renderWorker();
},120000);

load({forceActions:true});
