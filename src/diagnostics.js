const RAW_BASE="https://raw.githubusercontent.com/jonathanjoelneptune/Locale/main/src/data";
const production=location.hostname!=="localhost"&&!location.hostname.startsWith("127.");
const fmt=new Intl.NumberFormat("en-US");
const pct=value=>Number.isFinite(Number(value))?`${(Number(value)*100).toFixed(1)}%`:"—";
const n=value=>fmt.format(Number(value||0));
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));

async function json(name){
  const url=production?`${RAW_BASE}/${name}?v=${Date.now()}`:`./src/data/${name}`;
  const response=await fetch(url,{cache:"no-store"});
  if(!response.ok)throw new Error(`${name}: ${response.status}`);
  return response.json();
}

let dashboard=null;
async function load(){
  const status=document.querySelector("#diagStatus");
  status.textContent="Loading current coverage…";
  try{
    dashboard=await json("coverage-dashboard.json");
    const select=document.querySelector("#regionSelect");
    const old=select.value;
    select.innerHTML=Object.entries(dashboard.regions||{}).map(([id,row])=>`<option value="${esc(id)}">${esc(row.name||id)}</option>`).join("");
    if(old&&dashboard.regions?.[old])select.value=old;
    render(select.value||Object.keys(dashboard.regions||{})[0]);
    status.textContent=`Generated ${dashboard.generatedAt?new Date(dashboard.generatedAt).toLocaleString():"unknown"} · Metric v${dashboard.metricVersion||1}`;
  }catch(error){
    status.textContent=`Coverage diagnostics unavailable: ${error.message}`;
  }
}

function summary(label,value,detail,tone=""){
  return `<article class="summary-card"><span>${esc(label)}</span><strong class="${tone}">${esc(value)}</strong><small>${esc(detail)}</small></article>`;
}
function metricRows(items){
  const max=Math.max(1,...items.map(item=>Number(item.value||0)));
  return `<div class="metric-list">${items.map(item=>`<div class="metric-row"><div><label>${esc(item.label)}</label><div class="bar"><i style="width:${Math.min(100,100*Number(item.value||0)/max)}%"></i></div></div><strong>${esc(item.display??n(item.value))}</strong></div>`).join("")}</div>`;
}
function render(id){
  const row=dashboard?.regions?.[id];
  if(!row)return;
  const preciseTone=row.preciseLocationTargetMet?"good":"warn";
  document.querySelector("#summaryCards").innerHTML=[
    summary("Events",n(row.eventCount),"canonical upcoming events"),
    summary("Location precision",pct(row.preciseLocationRate),`target ${pct(row.preciseLocationTarget)}`,preciseTone),
    summary("Known places",n(row.placeCount),"canonical venue registry"),
    summary("Discovery queue",n(row.discovery.candidateCount),`${n(row.discovery.withWebsiteCount)} with websites`),
    summary("Auto sources",n(row.dynamicSourceCount),`${pct(row.discovery.promotionRate)} promotion yield`,row.dynamicSourceCount?"good":"warn"),
    summary("Area checks",`${n((row.coverageAreaAcceptance||row.neighborhoodAcceptance).passing)}/${n((row.coverageAreaAcceptance||row.neighborhoodAcceptance).measured)}`,"passing local coverage targets",(row.coverageAreaAcceptance||row.neighborhoodAcceptance).passing===(row.coverageAreaAcceptance||row.neighborhoodAcceptance).measured?"good":"warn")
  ].join("");

  const funnel=[
    {label:"Candidates",value:row.discovery.candidateCount},
    {label:"Websites found",value:row.discovery.withWebsiteCount},
    {label:"Qualified",value:row.discovery.qualifiedCount},
    {label:"Retry queue",value:row.discovery.retryCount},
    {label:"Needs website",value:row.discovery.needsWebsiteCount}
  ];
  document.querySelector("#discoveryFunnel").innerHTML=metricRows(funnel);
  const cellText=row.discovery.cells?`${row.discovery.cells.completed||0}/${row.discovery.cells.total||0} regional cells`:"";
  const areaText=row.discovery.areaSweeps?`${row.discovery.areaSweeps.completed||0}/${(row.coverageAreaAcceptance||row.neighborhoodAcceptance).measured||0} focused areas swept`:"";
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

  const failures=Object.entries(row.discovery.failureReasons||{}).slice(0,10).map(([label,value])=>({label:label.replaceAll("-"," "),value}));
  document.querySelector("#failureReasons").innerHTML=metricRows(failures);

  document.querySelector("#sourceRows").innerHTML=(row.sourceHealth||[]).map(source=>`<tr>
    <td>${esc(source.sourceId)}</td><td><span class="status-pill ${source.status==="ok"?"ok":"failed"}">${esc(source.status)}</span></td><td>${n(source.count)}</td>
  </tr>`).join("");
}

document.querySelector("#regionSelect").addEventListener("change",event=>render(event.target.value));
document.querySelector("#areaGroupSelect").addEventListener("change",()=>render(document.querySelector("#regionSelect").value));
document.querySelector("#refreshDiagnostics").addEventListener("click",load);
load();
