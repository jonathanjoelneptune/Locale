const ENDPOINTS=[
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

const relevantTags=[
  ["amenity","nightclub"],["amenity","bar"],["amenity","pub"],["amenity","music_venue"],
  ["amenity","theatre"],["amenity","cinema"],["amenity","arts_centre"],["amenity","community_centre"],
  ["amenity","restaurant"],["amenity","cafe"],
  ["tourism","museum"],["tourism","gallery"],["tourism","attraction"],
  ["leisure","stadium"],["craft","brewery"]
];

const priorityFor=tags=>{
  if(tags.amenity==="music_venue"||tags.amenity==="nightclub")return 100;
  if(["theatre","arts_centre","bar","pub"].includes(tags.amenity)||tags.craft==="brewery")return 92;
  if(["cinema","community_centre"].includes(tags.amenity))return 82;
  if(["museum","gallery","attraction"].includes(tags.tourism)||tags.leisure==="stadium")return 76;
  if(tags.amenity==="restaurant")return 62;
  if(tags.amenity==="cafe")return 48;
  return 40;
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
  if(tags.tourism)return tags.tourism;
  if(tags.leisure==="stadium")return "stadium";
  return tags.amenity||"place";
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

export function buildOverpassQuery(region){
  const radius=Math.round(Math.min(Number(region.discoveryRadiusMiles||region.ingestRadiusMiles||35),50)*1609.344);
  const {lat,lng}=region.center;
  const selectors=[];
  for(const [key,value] of relevantTags){
    for(const websiteKey of ["website","contact:website"]){
      selectors.push(`nwr(around:${radius},${lat},${lng})["name"]["${websiteKey}"]["${key}"="${value}"];`);
    }
  }
  return `[out:json][timeout:45];(${selectors.join("")});out center tags;`;
}

async function fetchOverpass(query){
  let lastError;
  for(const endpoint of ENDPOINTS){
    try{
      const body=new URLSearchParams({data:query});
      const response=await fetch(endpoint,{
        method:"POST",
        headers:{"Content-Type":"application/x-www-form-urlencoded","User-Agent":"Locale-discovery/1.0"},
        body,
        signal:AbortSignal.timeout(55000)
      });
      if(!response.ok)throw new Error(`${endpoint} returned ${response.status}`);
      return await response.json();
    }catch(error){lastError=error}
  }
  throw lastError||new Error("All Overpass endpoints failed");
}

export function candidateFromOverpassElement(row,region){
  const tags=row?.tags||{};
  const name=String(tags.name||"").trim();
  if(!name)return null;
  const website=normalizeUrl(tags.website||tags["contact:website"]);
  if(!website)return null;
  const lat=Number(row.lat??row.center?.lat),lng=Number(row.lon??row.center?.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;
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

export async function discoverRegionalPlaces(region){
  const payload=await fetchOverpass(buildOverpassQuery(region));
  const rows=Array.isArray(payload?.elements)?payload.elements:[];
  const out=[];
  for(const row of rows){
    const candidate=candidateFromOverpassElement(row,region);
    if(candidate)out.push(candidate);
  }
  return [...new Map(out.map(item=>[item.key,item])).values()]
    .sort((a,b)=>b.priority-a.priority||a.name.localeCompare(b.name));
}
