const DEFAULT_CELL_DEGREES=.08;

const coordinatesOf=geometry=>{
  const out=[];
  const walk=value=>{
    if(!Array.isArray(value))return;
    if(value.length>=2&&Number.isFinite(Number(value[0]))&&Number.isFinite(Number(value[1]))){
      out.push([Number(value[0]),Number(value[1])]);
      return;
    }
    value.forEach(walk);
  };
  walk(geometry?.coordinates);
  return out;
};

const boundsOf=feature=>{
  const explicit=feature?.properties?.bbox;
  if(Array.isArray(explicit)&&explicit.length===4)return explicit.map(Number);
  const points=coordinatesOf(feature?.geometry);
  if(!points.length)return null;
  const lngs=points.map(([lng])=>lng),lats=points.map(([,lat])=>lat);
  return [Math.min(...lngs),Math.min(...lats),Math.max(...lngs),Math.max(...lats)];
};

function pointInRing([lng,lat],ring=[]){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const [xi,yi]=ring[i]||[],[xj,yj]=ring[j]||[];
    if(!Number.isFinite(xi)||!Number.isFinite(yi)||!Number.isFinite(xj)||!Number.isFinite(yj))continue;
    const intersects=((yi>lat)!==(yj>lat))&&(lng<(xj-xi)*(lat-yi)/((yj-yi)||Number.EPSILON)+xi);
    if(intersects)inside=!inside;
  }
  return inside;
}

function pointInPolygon(point,rings=[]){
  if(!rings.length||!pointInRing(point,rings[0]))return false;
  for(let i=1;i<rings.length;i++)if(pointInRing(point,rings[i]))return false;
  return true;
}

export function pointInArea(feature,point){
  const lat=Number(point?.lat),lng=Number(point?.lng);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||!feature?.geometry)return false;
  const bbox=boundsOf(feature);
  if(bbox&&(lng<bbox[0]||lat<bbox[1]||lng>bbox[2]||lat>bbox[3]))return false;
  const geometry=feature.geometry;
  if(geometry.type==="Polygon")return pointInPolygon([lng,lat],geometry.coordinates);
  if(geometry.type==="MultiPolygon")return geometry.coordinates.some(polygon=>pointInPolygon([lng,lat],polygon));
  return false;
}

const cellKey=(lat,lng,size)=>`${Math.floor(lat/size)}:${Math.floor(lng/size)}`;

export function createAreaSpatialIndex(featureCollection,{cellDegrees=DEFAULT_CELL_DEGREES}={}){
  const features=featureCollection?.features||[];
  const cells=new Map;
  const byId=new Map(features.map(feature=>[feature.properties?.id||feature.id,feature]));

  for(const feature of features){
    const bbox=boundsOf(feature);
    if(!bbox)continue;
    const [west,south,east,north]=bbox;
    const y0=Math.floor(south/cellDegrees),y1=Math.floor(north/cellDegrees);
    const x0=Math.floor(west/cellDegrees),x1=Math.floor(east/cellDegrees);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const key=`${y}:${x}`;
      if(!cells.has(key))cells.set(key,[]);
      cells.get(key).push(feature);
    }
  }

  return {
    features,
    byId,
    candidates(point){
      const lat=Number(point?.lat),lng=Number(point?.lng);
      if(!Number.isFinite(lat)||!Number.isFinite(lng))return [];
      return cells.get(cellKey(lat,lng,cellDegrees))||[];
    },
    areasForPoint(point){
      return this.candidates(point).filter(feature=>pointInArea(feature,point));
    }
  };
}

export function annotateEventsWithAreas(events,featureCollection,{isEligible=()=>true}={}){
  const index=createAreaSpatialIndex(featureCollection);
  return (events||[]).map(event=>{
    const areaIds=isEligible(event)
      ?index.areasForPoint(event).map(feature=>feature.properties?.id||feature.id).filter(Boolean)
      :[];
    return {...event,areaIds};
  });
}

export function eventMatchesSelectedAreas(event,selectedAreaIds){
  const selected=selectedAreaIds instanceof Set?selectedAreaIds:new Set(selectedAreaIds||[]);
  if(!selected.size)return true;
  return (event?.areaIds||[]).some(id=>selected.has(id));
}

export function countEventsByArea(events,{predicate=()=>true}={}){
  const counts=new Map;
  for(const event of events||[]){
    if(!predicate(event))continue;
    for(const id of event.areaIds||[])counts.set(id,(counts.get(id)||0)+1);
  }
  return counts;
}

export function createAreaLookup(featureCollection){
  return new Map((featureCollection?.features||[]).map(feature=>[feature.properties?.id||feature.id,feature]));
}

export function selectedAreaNames(selectedAreaIds,lookup){
  const ids=selectedAreaIds instanceof Set?[...selectedAreaIds]:[...(selectedAreaIds||[])];
  return ids.map(id=>lookup?.get(id)?.properties?.name||id);
}
