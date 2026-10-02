const ENDPOINTS=[
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

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

export function buildCellOverpassQuery(cell){
  const radius=Math.round(Number(cell.queryRadiusMiles||5)*1609.344);
  const {lat,lng}=cell;
  if(cell.phase==="dining"){
    return `[out:json][timeout:20];(
      nwr(around:${radius},${lat},${lng})["name"]["website"]["amenity"~"^(restaurant|cafe)$"];
      nwr(around:${radius},${lat},${lng})["name"]["contact:website"]["amenity"~"^(restaurant|cafe)$"];
      nwr(around:${radius},${lat},${lng})["name"]["website"]["tourism"="hotel"];
      nwr(around:${radius},${lat},${lng})["name"]["contact:website"]["tourism"="hotel"];
    );out center tags;`;
  }
  return `[out:json][timeout:20];(
    nwr(around:${radius},${lat},${lng})["name"]["website"]["amenity"~"^(nightclub|bar|pub|music_venue|theatre|cinema|arts_centre|community_centre|events_venue|conference_centre|casino|marketplace|library)$"];
    nwr(around:${radius},${lat},${lng})["name"]["contact:website"]["amenity"~"^(nightclub|bar|pub|music_venue|theatre|cinema|arts_centre|community_centre|events_venue|conference_centre|casino|marketplace|library)$"];
    nwr(around:${radius},${lat},${lng})["name"]["website"]["tourism"~"^(museum|gallery|attraction|zoo|theme_park)$"];
    nwr(around:${radius},${lat},${lng})["name"]["contact:website"]["tourism"~"^(museum|gallery|attraction|zoo|theme_park)$"];
    nwr(around:${radius},${lat},${lng})["name"]["website"]["leisure"~"^(stadium|sports_centre|bowling_alley)$"];
    nwr(around:${radius},${lat},${lng})["name"]["contact:website"]["leisure"~"^(stadium|sports_centre|bowling_alley)$"];
    nwr(around:${radius},${lat},${lng})["name"]["website"]["craft"="brewery"];
    nwr(around:${radius},${lat},${lng})["name"]["contact:website"]["craft"="brewery"];
  );out center tags;`;
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
        signal:AbortSignal.timeout(28000)
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
