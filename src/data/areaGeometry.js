export const AREA_GEOMETRY_SCHEMA_VERSION=1;

const COVERAGE_ZONES_URL=new URL("./coverage-zones.json",import.meta.url);
const GEOGRAPHY_CATALOG_URL=new URL("./geography-catalog.json",import.meta.url);

export const AREA_GROUP_LABELS={
  "central-core":"Central San Diego",
  "central-west":"Central / Coastal",
  "east-county":"East County",
  "north-central":"North Central",
  "north-county-coast":"North County Coast",
  "north-county-inland":"North County Inland",
  "north-inland":"North Inland",
  "south-bay":"South Bay",
  "uptown-midcity":"Uptown / Mid-City"
};

const JURISDICTION_TYPES={
  "incorporated-city":"city",
  "community-planning-area":"district",
  "city-neighborhood":"neighborhood",
  "census-designated-place":"community",
  "unincorporated-locality":"community",
  "tribal-area":"district"
};

const COMMON_ALIASES={
  "pacific-beach":["PB"],
  "university-city":["UTC","University Towne Centre"],
  "gaslamp":["Gaslamp","Gaslamp Quarter"],
  "downtown":["Downtown San Diego"],
  "east-village":["East Village San Diego"],
  "kearny-mesa":["Kearny Mesa San Diego"],
  "la-jolla":["La Jolla San Diego"],
  "barrio-logan":["Barrio Logan San Diego"],
  "ocean-beach":["OB"],
  "mission-beach":["Mission Beach San Diego"]
};

const milesToLatitudeDegrees=miles=>miles/69.0;
const milesToLongitudeDegrees=(miles,lat)=>miles/(69.172*Math.max(.2,Math.cos(lat*Math.PI/180)));

function circlePolygon(lat,lng,radiusMiles,steps=36){
  const ring=[];
  for(let i=0;i<=steps;i++){
    const angle=(Math.PI*2*i)/steps;
    ring.push([
      lng+Math.cos(angle)*milesToLongitudeDegrees(radiusMiles,lat),
      lat+Math.sin(angle)*milesToLatitudeDegrees(radiusMiles)
    ]);
  }
  return {type:"Polygon",coordinates:[ring]};
}

function geometryBounds(geometry){
  const points=[];
  const collect=value=>{
    if(!Array.isArray(value))return;
    if(value.length>=2&&Number.isFinite(Number(value[0]))&&Number.isFinite(Number(value[1]))){
      points.push([Number(value[0]),Number(value[1])]);
      return;
    }
    value.forEach(collect);
  };
  collect(geometry?.coordinates);
  if(!points.length)return null;
  const lngs=points.map(([lng])=>lng),lats=points.map(([,lat])=>lat);
  return [Math.min(...lngs),Math.min(...lats),Math.max(...lngs),Math.max(...lats)];
}

function buildCatalogIndex(catalog){
  const index=new Map;
  const add=(entry,source)=>{
    if(!entry?.coverageZoneId)return;
    if(!index.has(entry.coverageZoneId))index.set(entry.coverageZoneId,[]);
    index.get(entry.coverageZoneId).push({...entry,source});
  };
  Object.entries(catalog||{}).forEach(([source,value])=>{
    if(Array.isArray(value))value.forEach(entry=>add(entry,source));
  });
  return index;
}

function bestAreaType(entries=[]){
  const order=["incorporated-city","community-planning-area","city-neighborhood","census-designated-place","unincorporated-locality","tribal-area"];
  for(const jurisdiction of order){
    if(entries.some(entry=>entry.jurisdiction===jurisdiction))return JURISDICTION_TYPES[jurisdiction];
  }
  return "coverage-area";
}

function aliasesFor(zone,entries=[]){
  const aliases=new Set(COMMON_ALIASES[zone.id]||[]);
  entries.forEach(entry=>{
    if(entry.name&&entry.name!==zone.name)aliases.add(entry.name);
  });
  return [...aliases];
}

async function fetchJson(url){
  const response=await fetch(url,{cache:"no-store"});
  if(!response.ok)throw new Error(`Unable to load area geometry source: ${response.status}`);
  return response.json();
}

export async function loadAreaGeometry({regionId="san-diego"}={}){
  const [zones,catalog]=await Promise.all([fetchJson(COVERAGE_ZONES_URL),fetchJson(GEOGRAPHY_CATALOG_URL)]);
  const catalogIndex=buildCatalogIndex(catalog);
  const features=zones
    .filter(zone=>zone.regionId===regionId)
    .map(zone=>{
      const entries=catalogIndex.get(zone.id)||[];
      const geometry=circlePolygon(Number(zone.lat),Number(zone.lng),Number(zone.radiusMiles||1));
      return {
        type:"Feature",
        id:zone.id,
        properties:{
          id:zone.id,
          name:zone.name,
          regionId:zone.regionId,
          parentAreaId:zone.regionId,
          group:zone.group||"other",
          groupLabel:AREA_GROUP_LABELS[zone.group]||zone.group||"Other",
          areaType:bestAreaType(entries),
          coverageClass:zone.coverageClass||"mixed",
          aliases:aliasesFor(zone,entries),
          labelPoint:{lat:Number(zone.lat),lng:Number(zone.lng)},
          displayPriority:Number(zone.discoveryPriority||50),
          radiusMiles:Number(zone.radiusMiles||1),
          geometrySource:"coverage-radius",
          geometryAccuracy:"approximate",
          bbox:geometryBounds(geometry)
        },
        geometry
      };
    })
    .sort((a,b)=>b.properties.displayPriority-a.properties.displayPriority||a.properties.name.localeCompare(b.properties.name));

  return {
    type:"FeatureCollection",
    schemaVersion:AREA_GEOMETRY_SCHEMA_VERSION,
    regionId,
    geometryPolicy:{
      source:"Locale coverage zones",
      accuracy:"approximate",
      replacementContract:"A feature may be replaced by an authoritative Polygon or MultiPolygon without changing map or event-filter consumers."
    },
    features
  };
}

export const areaFeatureName=feature=>feature?.properties?.name||feature?.id||"Area";
