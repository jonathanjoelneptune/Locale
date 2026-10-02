const LAT_MILES_PER_DEGREE=69.0;

const round=value=>Number(value.toFixed(5));
const distance=(x,y)=>Math.sqrt(x*x+y*y);

function gridConfig(region,phase){
  if(phase==="core")return {
    radiusMiles:Number(region.discoveryCoreRadiusMiles||15),
    spacingMiles:4.0,
    queryRadiusMiles:3.2
  };
  if(phase==="dining")return {
    radiusMiles:Number(region.discoveryDiningRadiusMiles||18),
    spacingMiles:7.5,
    queryRadiusMiles:5.2
  };
  if(phase==="outer")return {
    radiusMiles:Number(region.discoveryOuterRadiusMiles||region.ingestRadiusMiles||50),
    innerRadiusMiles:Number(region.discoveryRadiusMiles||30),
    spacingMiles:8.5,
    queryRadiusMiles:6.0
  };
  return {
    radiusMiles:Number(region.discoveryRadiusMiles||30),
    spacingMiles:7.0,
    queryRadiusMiles:5.0
  };
}

export function buildDiscoveryCells(region,phase="high"){
  const config=gridConfig(region,phase);
  const lngMilesPerDegree=LAT_MILES_PER_DEGREE*Math.cos(Number(region.center.lat)*Math.PI/180);
  const steps=Math.ceil(config.radiusMiles/config.spacingMiles);
  const cells=[];
  for(let row=-steps;row<=steps;row++){
    for(let col=-steps;col<=steps;col++){
      const northMiles=row*config.spacingMiles;
      const eastMiles=col*config.spacingMiles;
      const distanceMiles=distance(eastMiles,northMiles);
      if(distanceMiles>config.radiusMiles+config.queryRadiusMiles*.45)continue;
      if(config.innerRadiusMiles&&distanceMiles<Math.max(0,config.innerRadiusMiles-config.queryRadiusMiles*.6))continue;
      cells.push({
        id:`${phase}:${row}:${col}`,
        phase,
        row,col,
        lat:round(Number(region.center.lat)+northMiles/LAT_MILES_PER_DEGREE),
        lng:round(Number(region.center.lng)+eastMiles/lngMilesPerDegree),
        countryCode:region.countryCode||null,
        distanceMiles:Number(distanceMiles.toFixed(2)),
        queryRadiusMiles:config.queryRadiusMiles
      });
    }
  }
  return cells.sort((a,b)=>a.distanceMiles-b.distanceMiles||Math.abs(a.row)-Math.abs(b.row)||Math.abs(a.col)-Math.abs(b.col)||a.id.localeCompare(b.id));
}

export function discoveryCellSummary(region){
  const core=buildDiscoveryCells(region,"core");
  const high=buildDiscoveryCells(region,"high");
  const dining=buildDiscoveryCells(region,"dining");
  const outer=buildDiscoveryCells(region,"outer");
  return {core:core.length,high:high.length,dining:dining.length,outer:outer.length,total:core.length+high.length+dining.length+outer.length};
}
