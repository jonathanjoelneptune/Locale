const EPS=1e-9;

const almostEqual=(a,b)=>Math.abs(a-b)<=EPS;
const samePoint=(a,b)=>almostEqual(a[0],b[0])&&almostEqual(a[1],b[1]);
const cross=(ax,ay,bx,by)=>ax*by-ay*bx;

export function closePolygonRing(ring=[]){
  const clean=ring
    .filter(point=>Array.isArray(point)&&Number.isFinite(Number(point[0]))&&Number.isFinite(Number(point[1])))
    .map(([x,y])=>[Number(x),Number(y)]);
  if(clean.length<3)return [];
  if(!samePoint(clean[0],clean[clean.length-1]))clean.push([...clean[0]]);
  return clean;
}

const openRing=ring=>{
  const closed=closePolygonRing(ring);
  if(closed.length&&samePoint(closed[0],closed[closed.length-1]))closed.pop();
  return closed;
};

function pointOnSegment(point,a,b){
  const [px,py]=point,[ax,ay]=a,[bx,by]=b;
  const area=Math.abs(cross(px-ax,py-ay,bx-ax,by-ay));
  if(area>EPS*10)return false;
  return px>=Math.min(ax,bx)-EPS&&px<=Math.max(ax,bx)+EPS&&py>=Math.min(ay,by)-EPS&&py<=Math.max(ay,by)+EPS;
}

export function pointInPolygonRing(point,ring=[]){
  const polygon=openRing(ring);
  if(polygon.length<3)return false;
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[j],b=polygon[i];
    if(pointOnSegment(point,a,b))return true;
    const intersects=((a[1]>point[1])!==(b[1]>point[1]))&&
      (point[0]<(b[0]-a[0])*(point[1]-a[1])/((b[1]-a[1])||Number.EPSILON)+a[0]);
    if(intersects)inside=!inside;
  }
  return inside;
}

function segmentIntersection(a,b,c,d){
  const rx=b[0]-a[0],ry=b[1]-a[1];
  const sx=d[0]-c[0],sy=d[1]-c[1];
  const denominator=cross(rx,ry,sx,sy);
  if(Math.abs(denominator)<EPS)return null;
  const qpx=c[0]-a[0],qpy=c[1]-a[1];
  const t=cross(qpx,qpy,sx,sy)/denominator;
  const u=cross(qpx,qpy,rx,ry)/denominator;
  if(t<-EPS||t>1+EPS||u<-EPS||u>1+EPS)return null;
  const clamped=Math.max(0,Math.min(1,t));
  return {
    t:clamped,
    point:[a[0]+rx*clamped,a[1]+ry*clamped]
  };
}

function splitRingEdges(ring,otherRing){
  const polygon=openRing(ring),other=openRing(otherRing);
  const pieces=[];
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length];
    const cuts=[0,1];
    for(let j=0;j<other.length;j++){
      const hit=segmentIntersection(a,b,other[j],other[(j+1)%other.length]);
      if(hit)cuts.push(hit.t);
    }
    cuts.sort((x,y)=>x-y);
    const unique=cuts.filter((value,index)=>index===0||Math.abs(value-cuts[index-1])>EPS*10);
    for(let j=0;j<unique.length-1;j++){
      const t0=unique[j],t1=unique[j+1];
      if(t1-t0<EPS*10)continue;
      const p0=[a[0]+(b[0]-a[0])*t0,a[1]+(b[1]-a[1])*t0];
      const p1=[a[0]+(b[0]-a[0])*t1,a[1]+(b[1]-a[1])*t1];
      const mid=[(p0[0]+p1[0])/2,(p0[1]+p1[1])/2];
      pieces.push({a:p0,b:p1,mid});
    }
  }
  return pieces;
}

const coordKey=point=>`${Math.round(point[0]*1e8)}:${Math.round(point[1]*1e8)}`;

function traceLoops(segments){
  const adjacency=new Map;
  segments.forEach((segment,index)=>{
    for(const point of [segment.a,segment.b]){
      const key=coordKey(point);
      if(!adjacency.has(key))adjacency.set(key,[]);
      adjacency.get(key).push(index);
    }
  });

  const unused=new Set(segments.map((_,index)=>index));
  const loops=[];
  while(unused.size){
    const firstIndex=unused.values().next().value;
    const first=segments[firstIndex];
    unused.delete(firstIndex);
    const start=[...first.a];
    let previous=[...first.a];
    let current=[...first.b];
    const ring=[start,current];
    let guard=0;

    while(!samePoint(current,start)&&guard++<segments.length*3){
      const candidates=(adjacency.get(coordKey(current))||[]).filter(index=>unused.has(index));
      if(!candidates.length)break;

      let chosen=candidates[0];
      if(candidates.length>1){
        const inAngle=Math.atan2(current[1]-previous[1],current[0]-previous[0]);
        chosen=candidates
          .map(index=>{
            const segment=segments[index];
            const next=samePoint(segment.a,current)?segment.b:segment.a;
            let turn=Math.atan2(next[1]-current[1],next[0]-current[0])-inAngle;
            while(turn<=-Math.PI)turn+=Math.PI*2;
            while(turn>Math.PI)turn-=Math.PI*2;
            return {index,score:Math.abs(turn)};
          })
          .sort((a,b)=>a.score-b.score)[0].index;
      }

      unused.delete(chosen);
      const segment=segments[chosen];
      const next=samePoint(segment.a,current)?segment.b:segment.a;
      previous=current;
      current=[...next];
      ring.push(current);
    }

    if(samePoint(current,start)&&ring.length>=4){
      ring[ring.length-1]=[...start];
      loops.push(ring);
    }
  }
  return loops;
}

export function polygonRingArea(ring=[]){
  const polygon=openRing(ring);
  let area=0;
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length];
    area+=a[0]*b[1]-b[0]*a[1];
  }
  return area/2;
}

function cleanLoops(loops){
  return loops
    .map(closePolygonRing)
    .filter(ring=>ring.length>=4&&Math.abs(polygonRingArea(ring))>1e-10);
}

export function intersectPolygonRings(subjectRing,clipRing){
  const subject=openRing(subjectRing),clip=openRing(clipRing);
  if(subject.length<3||clip.length<3)return [];

  const segments=[];
  splitRingEdges(subject,clip).forEach(piece=>{
    if(pointInPolygonRing(piece.mid,clip))segments.push({a:piece.a,b:piece.b});
  });
  splitRingEdges(clip,subject).forEach(piece=>{
    if(pointInPolygonRing(piece.mid,subject))segments.push({a:piece.a,b:piece.b});
  });

  return cleanLoops(traceLoops(segments));
}

export function subtractPolygonRing(subjectRing,clipRing){
  const subject=openRing(subjectRing),clip=openRing(clipRing);
  if(subject.length<3)return [];
  if(clip.length<3)return [closePolygonRing(subject)];

  const segments=[];
  splitRingEdges(subject,clip).forEach(piece=>{
    if(!pointInPolygonRing(piece.mid,clip))segments.push({a:piece.a,b:piece.b});
  });
  splitRingEdges(clip,subject).forEach(piece=>{
    if(pointInPolygonRing(piece.mid,subject))segments.push({a:piece.b,b:piece.a});
  });

  return cleanLoops(traceLoops(segments));
}

export function geometryOuterRings(geometry){
  if(!geometry)return [];
  if(geometry.type==="Polygon")return geometry.coordinates?.[0]?[geometry.coordinates[0]]:[];
  if(geometry.type==="MultiPolygon")return (geometry.coordinates||[]).map(polygon=>polygon?.[0]).filter(Boolean);
  return [];
}

export function ringsToGeometry(rings=[]){
  const clean=cleanLoops(rings);
  if(!clean.length)return {type:"MultiPolygon",coordinates:[]};
  if(clean.length===1)return {type:"Polygon",coordinates:[clean[0]]};
  return {type:"MultiPolygon",coordinates:clean.map(ring=>[ring])};
}
