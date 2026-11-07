// Single authoritative Vegas Strip corridor: [longitude, latitude].
// Includes the STRAT/SAHARA through Mandalay Bay, Sphere, and T-Mobile Arena;
// deliberately excludes Downtown Las Vegas and the wider valley.
export const VEGAS_STRIP_RING=[
  [
    -115.1797,
    36.089
  ],
  [
    -115.168,
    36.089
  ],
  [
    -115.1635,
    36.101
  ],
  [
    -115.1535,
    36.117
  ],
  [
    -115.147,
    36.132
  ],
  [
    -115.145,
    36.148
  ],
  [
    -115.1685,
    36.1505
  ],
  [
    -115.1735,
    36.139
  ],
  [
    -115.1825,
    36.123
  ],
  [
    -115.1915,
    36.109
  ],
  [
    -115.189,
    36.099
  ],
  [
    -115.1797,
    36.089
  ]
];

export function isWithinVegasStrip({lat,lng}={}){
  const y=Number(lat),x=Number(lng);
  if(!Number.isFinite(y)||!Number.isFinite(x))return false;
  let inside=false;
  for(let i=0,j=VEGAS_STRIP_RING.length-1;i<VEGAS_STRIP_RING.length;j=i++){
    const [xi,yi]=VEGAS_STRIP_RING[i],[xj,yj]=VEGAS_STRIP_RING[j];
    const onSegment=Math.abs((x-xi)*(yj-yi)-(y-yi)*(xj-xi))<1e-9&&
      x>=Math.min(xi,xj)&&x<=Math.max(xi,xj)&&y>=Math.min(yi,yj)&&y<=Math.max(yi,yj);
    if(onSegment)return true;
    if((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
  }
  return inside;
}
