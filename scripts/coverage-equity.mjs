const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,Number(value)||0));

export function coverageGroupProfiles(rows=[]){
  const groups={};
  for(const row of rows||[]){
    const key=row?.group||"other";
    const group=groups[key]||(groups[key]={
      group:key,areas:0,passing:0,zeroEventAreas:0,totalGap:0,totalEvents:0,totalVenues:0
    });
    group.areas++;
    if(row?.acceptance?.pass)group.passing++;
    if(Number(row?.preciseEventsNext28d||0)===0)group.zeroEventAreas++;
    group.totalGap+=Number(row?.gapScore||0);
    group.totalEvents+=Number(row?.preciseEventsNext28d||0);
    group.totalVenues+=Number(row?.uniqueVenuesNext28d||0);
  }
  for(const group of Object.values(groups)){
    group.passRate=group.areas?group.passing/group.areas:0;
    group.averageGapScore=group.areas?group.totalGap/group.areas:0;
    group.averageEvents=group.areas?group.totalEvents/group.areas:0;
    group.averageVenues=group.areas?group.totalVenues/group.areas:0;
    group.deficitScore=clamp(
      (1-group.passRate)*55+
      group.averageGapScore*.35+
      (group.zeroEventAreas/Math.max(1,group.areas))*10
    );
    delete group.totalGap;
    delete group.totalEvents;
    delete group.totalVenues;
  }
  return groups;
}

export function coverageEquitySummary(rows=[]){
  const groups=coverageGroupProfiles(rows);
  const values=Object.values(groups);
  const measured=(rows||[]).length;
  const passing=(rows||[]).filter(row=>row?.acceptance?.pass).length;
  const zeroEventAreas=(rows||[]).filter(row=>Number(row?.preciseEventsNext28d||0)===0).length;
  const passRates=values.map(group=>group.passRate);
  const gaps=values.map(group=>group.averageGapScore);
  const passRateSpread=passRates.length?Math.max(...passRates)-Math.min(...passRates):0;
  const gapSpread=gaps.length?Math.max(...gaps)-Math.min(...gaps):0;
  const metroPassRate=passing/Math.max(1,measured);
  const zeroEventRate=zeroEventAreas/Math.max(1,measured);
  const equityScore=clamp(
    metroPassRate*65+
    (1-passRateSpread)*20+
    (1-zeroEventRate)*15
  );
  return {
    measured,
    passing,
    metroPassRate:Number(metroPassRate.toFixed(3)),
    zeroEventAreas,
    zeroEventRate:Number(zeroEventRate.toFixed(3)),
    groupPassRateSpread:Number(passRateSpread.toFixed(3)),
    groupGapSpread:Number(gapSpread.toFixed(1)),
    equityScore:Number(equityScore.toFixed(1)),
    groups
  };
}

export function areaEquityPriority(row,zone,groupProfile){
  const gap=Number(row?.gapScore??50);
  const events=Number(row?.preciseEventsNext28d||0);
  const venues=Number(row?.uniqueVenuesNext28d||0);
  const zeroBoost=events===0?34:events<3?16:events<8?6:0;
  const groupDeficit=Number(groupProfile?.deficitScore||0);
  const saturationPenalty=Math.log1p(events)*4+Math.log1p(venues)*3;
  const passPenalty=row?.acceptance?.pass?55:0;
  return Number((
    gap*1.05+
    zeroBoost+
    groupDeficit*.55+
    Number(zone?.discoveryPriority||50)*.12-
    saturationPenalty-
    passPenalty
  ).toFixed(2));
}

export function selectCoverageBalancedCandidates(items,limit,{
  scoreFn=item=>Number(item?.priority||0),
  areaFn=item=>item?.coverageAreaId||"unmapped",
  groupFn=item=>item?.coverageGroup||"unmapped",
  hostFn
}={}){
  const max=Math.max(0,Math.floor(Number(limit||0)));
  const rows=(items||[]).map(item=>({
    item,
    score:Number(scoreFn(item)||0),
    area:String(areaFn(item)||"unmapped"),
    group:String(groupFn(item)||"unmapped"),
    host:hostFn?.(item)||null
  })).sort((a,b)=>b.score-a.score);

  const selected=[];
  const selectedItems=new Set;
  const selectedHosts=new Set;
  const selectedAreas=new Set;
  const areaCounts={};
  const groupCounts={};

  const eligible=row=>{
    if(selectedItems.has(row.item))return false;
    if(row.host&&selectedHosts.has(row.host))return false;
    return true;
  };
  const take=row=>{
    selected.push(row.item);
    selectedItems.add(row.item);
    if(row.host)selectedHosts.add(row.host);
    selectedAreas.add(row.area);
    areaCounts[row.area]=(areaCounts[row.area]||0)+1;
    groupCounts[row.group]=(groupCounts[row.group]||0)+1;
  };

  const groupQueues=new Map;
  for(const row of rows){
    if(!groupQueues.has(row.group))groupQueues.set(row.group,[]);
    groupQueues.get(row.group).push(row);
  }
  const groupOrder=[...groupQueues.keys()].sort((a,b)=>
    Number(groupQueues.get(b)?.[0]?.score||0)-Number(groupQueues.get(a)?.[0]?.score||0)
  );

  // First fill: round-robin across metro groups and never select the same area twice.
  let progress=true;
  while(selected.length<max&&progress){
    progress=false;
    for(const group of groupOrder){
      const queue=groupQueues.get(group)||[];
      const row=queue.find(candidate=>eligible(candidate)&&!selectedAreas.has(candidate.area));
      if(!row)continue;
      take(row);
      progress=true;
      if(selected.length>=max)break;
    }
  }

  // Second fill: allow a second candidate in an area, still favoring global score.
  for(const row of rows){
    if(selected.length>=max)break;
    if(!eligible(row)||Number(areaCounts[row.area]||0)>=2)continue;
    take(row);
  }

  // Final fill: only when there is no spatially diverse alternative.
  for(const row of rows){
    if(selected.length>=max)break;
    if(!eligible(row))continue;
    take(row);
  }

  return {selected,areaCounts,groupCounts};
}
