export const DISCOVERY_BUDGETS=Object.freeze({
  bootstrap:Object.freeze({
    probeLimit:12,
    probeConcurrency:2,
    overpassMinIntervalMinutes:360,
    areaSweeps:3,
    regionalCells:1,
    failedSweepRetryMinutes:60
  }),
  accelerated:Object.freeze({
    probeLimit:10,
    probeConcurrency:2,
    overpassMinIntervalMinutes:360,
    areaSweeps:3,
    regionalCells:1,
    failedSweepRetryMinutes:90
  }),
  convergence:Object.freeze({
    probeLimit:8,
    probeConcurrency:2,
    overpassMinIntervalMinutes:720,
    areaSweeps:2,
    regionalCells:1,
    failedSweepRetryMinutes:180
  }),
  maintenance:Object.freeze({
    probeLimit:6,
    probeConcurrency:2,
    overpassMinIntervalMinutes:1440,
    areaSweeps:1,
    regionalCells:1,
    failedSweepRetryMinutes:360
  })
});

const MODE_RANK={maintenance:0,convergence:1,accelerated:2,bootstrap:3};

const coverageRows=regionDashboard=>
  regionDashboard?.coverageAreas||regionDashboard?.neighborhoods||[];

export function discoveryProfileForRegion(regionDashboard,{configuredAreaCount=0}={}){
  const rows=coverageRows(regionDashboard);
  const measured=Number(regionDashboard?.coverageAreaAcceptance?.measured??rows.length??0);
  const passing=Number(regionDashboard?.coverageAreaAcceptance?.passing??rows.filter(row=>row?.acceptance?.pass).length??0);
  const passRate=measured>0?passing/measured:0;
  const severeGapCount=rows.filter(row=>!row?.acceptance?.pass&&Number(row?.gapScore||0)>=70).length;
  const mediumGapCount=rows.filter(row=>!row?.acceptance?.pass&&Number(row?.gapScore||0)>=45).length;

  if(!configuredAreaCount){
    return {
      mode:"unmeasured",
      configuredAreaCount:0,
      measured,
      passing,
      passRate,
      severeGapCount,
      mediumGapCount
    };
  }

  let mode="maintenance";
  if(passRate<0.70||severeGapCount>20)mode="bootstrap";
  else if(passRate<0.85||severeGapCount>10)mode="accelerated";
  else if(passRate<0.95||severeGapCount>0)mode="convergence";

  return {
    mode,
    configuredAreaCount,
    measured,
    passing,
    passRate,
    severeGapCount,
    mediumGapCount
  };
}

export function adaptiveDiscoveryPlan(coverageDashboard,coverageAreas,regionIds=[]){
  const profiles={};
  for(const regionId of regionIds){
    const configuredAreaCount=(coverageAreas||[]).filter(zone=>zone.regionId===regionId).length;
    profiles[regionId]=discoveryProfileForRegion(
      coverageDashboard?.regions?.[regionId]||{},
      {configuredAreaCount}
    );
  }

  const active=Object.values(profiles).filter(profile=>profile.mode!=="unmeasured");
  const mode=active.length
    ?active.sort((a,b)=>MODE_RANK[b.mode]-MODE_RANK[a.mode])[0].mode
    :"bootstrap";

  return {
    mode,
    budget:{...DISCOVERY_BUDGETS[mode]},
    profiles
  };
}

export function isOverpassDue(lastRunAt,minIntervalMinutes,nowMs=Date.now()){
  const last=Date.parse(lastRunAt||"")||0;
  if(!last)return true;
  return nowMs-last>=Number(minIntervalMinutes||0)*60000;
}
