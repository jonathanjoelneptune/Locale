import {areaGeometryConstraints} from "./areaGeometryRegions.js";
import {
  closePolygonRing,
  geometryOuterRings,
  intersectPolygonRings,
  pointInPolygonRing,
  polygonRingArea,
  ringsToGeometry,
  subtractPolygonRing
} from "../services/polygonGeometry.js";

export const AREA_GEOMETRY_SCHEMA_VERSION=3;

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

const closeRing=ring=>{
  if(!ring.length)return ring;
  const first=ring[0],last=ring[ring.length-1];
  if(first[0]===last[0]&&first[1]===last[1])return ring;
  return [...ring,[...first]];
};

function makeProjector(zones){
  const referenceLat=zones.reduce((sum,zone)=>sum+Number(zone.lat),0)/Math.max(1,zones.length);
  const scaleX=Math.cos(referenceLat*Math.PI/180);
  return {
    project:({lat,lng})=>({x:Number(lng)*scaleX,y:Number(lat)}),
    unproject:({x,y})=>[x/scaleX,y]
  };
}

function clipHalfPlane(polygon,a,b,c){
  if(!polygon.length)return [];
  const inside=point=>(a*point.x+b*point.y)<=c+1e-12;
  const intersect=(start,end)=>{
    const dx=end.x-start.x,dy=end.y-start.y;
    const denominator=a*dx+b*dy;
    if(Math.abs(denominator)<1e-15)return {...start};
    const t=(c-a*start.x-b*start.y)/denominator;
    return {x:start.x+t*dx,y:start.y+t*dy};
  };
  const output=[];
  for(let i=0;i<polygon.length;i++){
    const current=polygon[i],previous=polygon[(i+polygon.length-1)%polygon.length];
    const currentInside=inside(current),previousInside=inside(previous);
    if(currentInside){
      if(!previousInside)output.push(intersect(previous,current));
      output.push(current);
    }else if(previousInside){
      output.push(intersect(previous,current));
    }
  }
  return output;
}

function partitionEnvelope(points){
  const xs=points.map(point=>point.x),ys=points.map(point=>point.y);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const width=Math.max(.02,maxX-minX),height=Math.max(.02,maxY-minY);
  const padX=Math.max(.018,width*.035),padY=Math.max(.018,height*.035);
  return [
    {x:minX-padX,y:minY-padY},
    {x:maxX+padX,y:minY-padY},
    {x:maxX+padX,y:maxY+padY},
    {x:minX-padX,y:maxY+padY}
  ];
}

function voronoiGeometry(zones){
  const projector=makeProjector(zones);
  const seeds=zones.map(zone=>({
    id:zone.id,
    ...projector.project({lat:Number(zone.lat),lng:Number(zone.lng)})
  }));
  const envelope=partitionEnvelope(seeds);
  const polygons=new Map;

  for(const seed of seeds){
    let polygon=envelope.map(point=>({...point}));
    for(const other of seeds){
      if(other.id===seed.id)continue;
      const dx=other.x-seed.x,dy=other.y-seed.y;
      if(Math.abs(dx)+Math.abs(dy)<1e-12)continue;
      const c=(other.x*other.x+other.y*other.y-seed.x*seed.x-seed.y*seed.y)/2;
      polygon=clipHalfPlane(polygon,dx,dy,c);
      if(!polygon.length)break;
    }
    const ring=closeRing(polygon.map(projector.unproject));
    polygons.set(seed.id,{type:"Polygon",coordinates:[ring]});
  }

  return polygons;
}

function clipGeometryToRing(geometry,clipRing){
  const clipped=[];
  geometryOuterRings(geometry).forEach(ring=>{
    clipped.push(...intersectPolygonRings(ring,clipRing));
  });
  return ringsToGeometry(clipped);
}

function subtractRingFromGeometry(geometry,clipRing){
  const remaining=[];
  geometryOuterRings(geometry).forEach(ring=>{
    remaining.push(...subtractPolygonRing(ring,clipRing));
  });
  return ringsToGeometry(remaining);
}

function applyRegionalConstraints(generated,regionId){
  const constraints=areaGeometryConstraints(regionId);
  if(!constraints?.landMask?.length){
    return {
      geometries:generated,
      sources:new Map([...generated.keys()].map(id=>[id,"coverage-voronoi"])),
      policy:null
    };
  }

  const landRing=closePolygonRing(constraints.landMask);
  const geometries=new Map;
  const sources=new Map;
  generated.forEach((geometry,id)=>{
    geometries.set(id,clipGeometryToRing(geometry,landRing));
    sources.set(id,"land-clipped-voronoi");
  });

  Object.entries(constraints.overrides||{}).forEach(([overrideId,override])=>{
    const maskRing=closePolygonRing(override.mask||[]);
    const overrideRings=intersectPolygonRings(maskRing,landRing);
    if(!overrideRings.length)return;

    for(const [id,geometry] of geometries){
      if(id===overrideId)continue;
      let next=geometry;
      overrideRings.forEach(ring=>{
        next=subtractRingFromGeometry(next,ring);
      });
      geometries.set(id,next);
    }

    geometries.set(overrideId,ringsToGeometry(overrideRings));
    sources.set(overrideId,override.source||"curated-area-override");
  });

  return {
    geometries,
    sources,
    policy:{
      source:constraints.source,
      waterClipping:"Generated area cells are clipped to a regional land mask before event membership and map rendering.",
      overrides:Object.keys(constraints.overrides||{})
    }
  };
}

function geometryContainsPoint(geometry,point){
  return geometryOuterRings(geometry).some(ring=>pointInPolygonRing(point,ring));
}

function ringCentroid(ring){
  const points=closePolygonRing(ring);
  let twiceArea=0,cx=0,cy=0;
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1];
    const cross=a[0]*b[1]-b[0]*a[1];
    twiceArea+=cross;
    cx+=(a[0]+b[0])*cross;
    cy+=(a[1]+b[1])*cross;
  }
  if(Math.abs(twiceArea)<1e-12)return points[0]||null;
  return [cx/(3*twiceArea),cy/(3*twiceArea)];
}

function labelPointFor(zone,geometry){
  const seed=[Number(zone.lng),Number(zone.lat)];
  if(geometryContainsPoint(geometry,seed))return {lat:seed[1],lng:seed[0]};

  const rings=geometryOuterRings(geometry);
  const ring=[...rings].sort((a,b)=>Math.abs(polygonRingArea(b))-Math.abs(polygonRingArea(a)))[0];
  if(!ring?.length)return {lat:seed[1],lng:seed[0]};

  const centroid=ringCentroid(ring);
  if(centroid&&pointInPolygonRing(centroid,ring))return {lat:centroid[1],lng:centroid[0]};

  const fallback=ring[Math.floor((ring.length-1)/2)]||ring[0];
  return {lat:fallback[1],lng:fallback[0]};
}

export async function loadAreaGeometry({regionId="san-diego"}={}){
  const [allZones,catalog]=await Promise.all([fetchJson(COVERAGE_ZONES_URL),fetchJson(GEOGRAPHY_CATALOG_URL)]);
  const zones=allZones.filter(zone=>zone.regionId===regionId);
  const catalogIndex=buildCatalogIndex(catalog);
  const generated=voronoiGeometry(zones);
  const resolved=applyRegionalConstraints(generated,regionId);

  const features=zones
    .map(zone=>{
      const entries=catalogIndex.get(zone.id)||[];
      const geometry=resolved.geometries.get(zone.id)||generated.get(zone.id);
      const source=resolved.sources.get(zone.id)||"coverage-voronoi";
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
          labelPoint:labelPointFor(zone,geometry),
          displayPriority:Number(zone.discoveryPriority||50),
          radiusMiles:Number(zone.radiusMiles||1),
          geometrySource:source,
          geometryAccuracy:resolved.policy?"approximate-land-aware":"approximate-partition",
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
      source:resolved.policy?.source||"Locale coverage-zone centers",
      accuracy:resolved.policy?"approximate-land-aware":"approximate-partition",
      topology:resolved.policy?"non-overlapping land-clipped tessellation with curated overrides":"non-overlapping nearest-center tessellation",
      waterClipping:resolved.policy?.waterClipping||null,
      overrides:resolved.policy?.overrides||[],
      replacementContract:"A feature may be replaced by an authoritative Polygon or MultiPolygon without changing map or event-filter consumers."
    },
    features
  };
}

export const areaFeatureName=feature=>feature?.properties?.name||feature?.id||"Area";
