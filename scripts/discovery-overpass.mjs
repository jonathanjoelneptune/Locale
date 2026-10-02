export const OVERPASS_ENDPOINTS=[
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
];

const ENDPOINT_HEALTH=new Map();
const ENDPOINT_TELEMETRY=new Map();
let endpointCursor=0;

function telemetryState(endpoint){
  const current=ENDPOINT_TELEMETRY.get(endpoint);
  if(current)return current;
  const fresh={endpoint,attempts:0,successes:0,failures:0,lastStatus:null,lastError:null,lastStartedAt:null,lastFinishedAt:null,lastLatencyMs:null};
  ENDPOINT_TELEMETRY.set(endpoint,fresh);
  return fresh;
}

function recordAttempt(endpoint){
  const row=telemetryState(endpoint);
  row.attempts++;
  row.lastStartedAt=new Date().toISOString();
  row.lastStatus="running";
  row.lastError=null;
  return Date.now();
}

function recordSuccess(endpoint,startedAt){
  const row=telemetryState(endpoint);
  row.successes++;
  row.lastStatus="ok";
  row.lastFinishedAt=new Date().toISOString();
  row.lastLatencyMs=Math.max(0,Date.now()-startedAt);
}

function recordFailure(endpoint,error,startedAt){
  const row=telemetryState(endpoint);
  row.failures++;
  row.lastStatus="failed";
  row.lastError=String(error?.message||error);
  row.lastFinishedAt=new Date().toISOString();
  row.lastLatencyMs=Math.max(0,Date.now()-startedAt);
}

export function overpassTelemetrySnapshot(){
  return OVERPASS_ENDPOINTS.map(endpoint=>({
    ...telemetryState(endpoint),
    cooldownUntil:endpointState(ENDPOINT_HEALTH,endpoint).cooldownUntil||0,
    consecutiveFailures:endpointState(ENDPOINT_HEALTH,endpoint).failures||0
  }));
}

export function resetOverpassTelemetry(){
  ENDPOINT_TELEMETRY.clear();
}

const relevantTags=[
  ["amenity","nightclub"],["amenity","bar"],["amenity","pub"],["amenity","music_venue"],
  ["amenity","theatre"],["amenity","cinema"],["amenity","arts_centre"],["amenity","community_centre"],
  ["amenity","events_venue"],["amenity","conference_centre"],["amenity","casino"],["amenity","marketplace"],["amenity","library"],
  ["amenity","restaurant"],["amenity","cafe"],
  ["tourism","museum"],["tourism","gallery"],["tourism","attraction"],["tourism","zoo"],["tourism","theme_park"],
  ["leisure","stadium"],["leisure","sports_centre"],["leisure","bowling_alley"],["craft","brewery"]
];

const priorityFor=tags=>{
  if(tags.amenity==="music_venue"||tags.amenity==="nightclub")return 120;
  if(["theatre","arts_centre","bar","pub"].includes(tags.amenity)||tags.craft==="brewery")return 110;
  if(["events_venue","conference_centre","casino"].includes(tags.amenity))return 108;
  if(["cinema","community_centre","marketplace"].includes(tags.amenity))return 98;
  if(tags.amenity==="library")return 78;
  if(["museum","gallery","attraction","zoo","theme_park"].includes(tags.tourism)||["stadium","sports_centre","bowling_alley"].includes(tags.leisure))return 88;
  if(tags.tourism==="hotel")return 50;
  if(tags.amenity==="restaurant")return 34;
  if(tags.amenity==="cafe")return 22;
  return 30;
};

const categoryFor=tags=>{
  if(tags.amenity==="music_venue")return "music-venue";
  if(tags.amenity==="nightclub")return "nightclub";
  if(["bar","pub"].includes(tags.amenity))return tags.amenity;
  if(tags.craft==="brewery")return "brewery";
  if(tags.amenity==="theatre")return "theatre";
  if(tags.amenity==="cinema")return "cinema";
  if(tags.amenity==="arts_centre")return "arts-centre";
  if(tags.amenity==="community_centre")return "community-centre";
  if(tags.amenity==="events_venue")return "events-venue";
  if(tags.amenity==="conference_centre")return "conference-centre";
  if(tags.amenity==="casino")return "casino";
  if(tags.amenity==="marketplace")return "marketplace";
  if(tags.amenity==="library")return "library";
  if(tags.tourism)return tags.tourism;
  if(tags.leisure)return String(tags.leisure).replaceAll("_","-");
  return tags.amenity||"place";
};

const milesBetween=(a,b)=>{
  if(!Number.isFinite(Number(a?.lat))||!Number.isFinite(Number(a?.lng))||!Number.isFinite(Number(b?.lat))||!Number.isFinite(Number(b?.lng)))return Infinity;
  const R=3958.7613,toRad=value=>Number(value)*Math.PI/180;
  const dLat=toRad(Number(b.lat)-Number(a.lat)),dLng=toRad(Number(b.lng)-Number(a.lng));
  const lat1=toRad(a.lat),lat2=toRad(b.lat);
  const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
};

const normalizeUrl=value=>{
  const raw=String(value||"").trim();
  if(!raw)return null;
  try{
    const url=new URL(/^https?:\/\//i.test(raw)?raw:`https://${raw}`);
    if(!["http:","https:"].includes(url.protocol))return null;
    url.hash="";
    return url.href;
  }catch{return null}
};

const bboxForCell=cell=>{
  const radiusMiles=Math.max(0.2,Number(cell.queryRadiusMiles||5));
  const lat=Number(cell.lat),lng=Number(cell.lng);
  const latDelta=radiusMiles/69;
  const cosLat=Math.max(0.2,Math.cos(lat*Math.PI/180));
  const lngDelta=radiusMiles/(69*cosLat);
  return [
    lat-latDelta,
    lng-lngDelta,
    lat+latDelta,
    lng+lngDelta
  ].map(value=>value.toFixed(5)).join(",");
};

export function buildCellOverpassQuery(cell){
  const bbox=bboxForCell(cell);
  const countryCode=String(cell.countryCode||"").toUpperCase().replace(/[^A-Z]/g,"");
  const countryPrefix=countryCode?`area["ISO3166-1"="${countryCode}"]["boundary"="administrative"]->.localeCountry;`:"";
  const scope=countryCode?"(area.localeCountry)":"";
  const nwr=filter=>`nwr${scope}${filter};`;
  if(cell.phase==="dining"){
    return `[out:json][timeout:10][bbox:${bbox}];${countryPrefix}(
      ${nwr('["name"]["website"]["amenity"~"^(restaurant|cafe)$"]')}
      ${nwr('["name"]["contact:website"]["amenity"~"^(restaurant|cafe)$"]')}
      ${nwr('["name"]["website"]["tourism"="hotel"]')}
      ${nwr('["name"]["contact:website"]["tourism"="hotel"]')}
    );out center tags;`;
  }
  return `[out:json][timeout:10][bbox:${bbox}];${countryPrefix}(
    ${nwr('["name"]["website"]["amenity"~"^(nightclub|bar|pub|music_venue|theatre|cinema|arts_centre|community_centre|events_venue|conference_centre|casino|marketplace|library)$"]')}
    ${nwr('["name"]["contact:website"]["amenity"~"^(nightclub|bar|pub|music_venue|theatre|cinema|arts_centre|community_centre|events_venue|conference_centre|casino|marketplace|library)$"]')}
    ${nwr('["name"]["website"]["tourism"~"^(museum|gallery|attraction|zoo|theme_park)$"]')}
    ${nwr('["name"]["contact:website"]["tourism"~"^(museum|gallery|attraction|zoo|theme_park)$"]')}
    ${nwr('["name"]["website"]["leisure"~"^(stadium|sports_centre|bowling_alley)$"]')}
    ${nwr('["name"]["contact:website"]["leisure"~"^(stadium|sports_centre|bowling_alley)$"]')}
    ${nwr('["name"]["website"]["craft"="brewery"]')}
    ${nwr('["name"]["contact:website"]["craft"="brewery"]')}
  );out center tags;`;
}

const retryAfterMs=headers=>{
  const value=headers?.get?.("retry-after");
  if(!value)return 0;
  const seconds=Number(value);
  if(Number.isFinite(seconds))return Math.max(0,seconds*1000);
  const date=Date.parse(value);
  return Number.isFinite(date)?Math.max(0,date-Date.now()):0;
};

const retryableStatus=status=>status===408||status===425||status===429||status>=500;

function endpointOrder(endpoints){
  if(endpoints!==OVERPASS_ENDPOINTS)return [...endpoints];
  const start=endpointCursor++%endpoints.length;
  return [...endpoints.slice(start),...endpoints.slice(0,start)];
}

function endpointState(health,endpoint){
  const current=health.get(endpoint);
  if(current)return current;
  const fresh={failures:0,cooldownUntil:0,lastError:null};
  health.set(endpoint,fresh);
  return fresh;
}

function markEndpointFailure(health,endpoint,error,{retryAfter=0,nowMs=Date.now()}={}){
  const current=endpointState(health,endpoint);
  const failures=Number(current.failures||0)+1;
  const backoff=Math.min(5*60000,30000*(2**Math.min(3,failures-1)));
  health.set(endpoint,{
    failures,
    cooldownUntil:nowMs+Math.max(30000,retryAfter,backoff),
    lastError:String(error?.message||error)
  });
}

function markEndpointSuccess(health,endpoint){
  health.set(endpoint,{failures:0,cooldownUntil:0,lastError:null});
}

export async function fetchOverpass(query,{
  fetchImpl=fetch,
  endpoints=OVERPASS_ENDPOINTS,
  timeoutMs=15000,
  health=ENDPOINT_HEALTH,
  now=()=>Date.now()
}={}){
  let lastError;
  const failures=[];
  const nowMs=now();
  const ordered=endpointOrder(endpoints);
  const available=ordered.filter(endpoint=>endpointState(health,endpoint).cooldownUntil<=nowMs);
  if(!available.length){
    const earliest=ordered
      .map(endpoint=>({endpoint,...endpointState(health,endpoint)}))
      .sort((a,b)=>a.cooldownUntil-b.cooldownUntil)[0];
    throw Object.assign(
      new Error(`All Overpass endpoints are cooling down after recent failures; next endpoint available ${new Date(earliest.cooldownUntil).toISOString()}`),
      {code:"OVERPASS_COOLDOWN"}
    );
  }

  for(const endpoint of available){
    const startedAt=recordAttempt(endpoint);
    try{
      const body=new URLSearchParams({data:query});
      const response=await fetchImpl(endpoint,{
        method:"POST",
        headers:{"Content-Type":"application/x-www-form-urlencoded","User-Agent":"Locale-discovery/1.1"},
        body,
        signal:AbortSignal.timeout(timeoutMs)
      });

      if(!response.ok){
        const error=new Error(`${endpoint} returned ${response.status}`);
        if(!retryableStatus(response.status))throw Object.assign(error,{nonRetryable:true});
        markEndpointFailure(health,endpoint,error,{
          retryAfter:retryAfterMs(response.headers),
          nowMs:now()
        });
        recordFailure(endpoint,error,startedAt);
        failures.push(`${endpoint}: HTTP ${response.status}`);
        lastError=error;
        continue;
      }

      const payload=await response.json();
      markEndpointSuccess(health,endpoint);
      recordSuccess(endpoint,startedAt);
      return payload;
    }catch(error){
      if(error?.nonRetryable){
        recordFailure(endpoint,error,startedAt);
        throw error;
      }
      markEndpointFailure(health,endpoint,error,{nowMs:now()});
      recordFailure(endpoint,error,startedAt);
      failures.push(`${endpoint}: ${error?.name||"Error"} ${error?.message||error}`);
      lastError=error;
    }
  }

  const message=failures.length
    ?`All Overpass endpoints failed: ${failures.join(" | ")}`
    :"All Overpass endpoints failed";
  throw Object.assign(new Error(message),{
    code:"OVERPASS_ALL_FAILED",
    cause:lastError
  });
}

export function candidateFromOverpassElement(row,region){
  const tags=row?.tags||{};
  const name=String(tags.name||"").trim();
  if(!name)return null;
  const website=normalizeUrl(tags.website||tags["contact:website"]);
  if(!website)return null;
  const lat=Number(row.lat??row.center?.lat),lng=Number(row.lon??row.center?.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;
  if(region?.center&&Number(region.ingestRadiusMiles)>0&&milesBetween(region.center,{lat,lng})>Number(region.ingestRadiusMiles))return null;
  const address=[
    [tags["addr:housenumber"],tags["addr:street"]].filter(Boolean).join(" "),
    tags["addr:city"],tags["addr:state"],tags["addr:postcode"]
  ].filter(Boolean).join(", ")||null;
  return {
    key:`${region.id}|osm|${row.type}|${row.id}`,
    regionId:region.id,
    discoveryMethod:"overpass",
    externalId:`${row.type}/${row.id}`,
    name,
    category:categoryFor(tags),
    website,
    socialUrl:normalizeUrl(tags["contact:instagram"]||tags.instagram||tags["contact:facebook"]||tags.facebook),
    address,
    lat,lng,
    priority:priorityFor(tags),
    monitorTier:"C",
    osmTags:{
      amenity:tags.amenity||null,
      tourism:tags.tourism||null,
      leisure:tags.leisure||null,
      craft:tags.craft||null
    }
  };
}

export async function discoverCellPlaces(region,cell){
  const payload=await fetchOverpass(buildCellOverpassQuery(cell));
  const rows=Array.isArray(payload?.elements)?payload.elements:[];
  const out=[];
  for(const row of rows){
    const candidate=candidateFromOverpassElement(row,region);
    if(candidate)out.push({...candidate,discoveryCellId:cell.id});
  }
  return [...new Map(out.map(item=>[item.key,item])).values()]
    .sort((a,b)=>b.priority-a.priority||a.name.localeCompare(b.name));
}
