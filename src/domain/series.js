export const SERIES_CONTRACT_VERSION=1;
export const SERIES_STATUSES=new Set(["candidate","confirmed"]);

export function normalizeSeries(series={}){
  return {
    id:series.id||null,
    regionId:series.regionId||null,
    name:series.name||"",
    venueId:series.venueId||null,
    organizerId:series.organizerId||null,
    status:SERIES_STATUSES.has(series.status)?series.status:"candidate",
    recurrence:series.recurrence||{kind:"observed",interval:null,byDay:null,rrule:null},
    occurrenceCount:Number(series.occurrenceCount)||0,
    firstStart:series.firstStart||null,
    lastStart:series.lastStart||null,
    sourceIds:Array.isArray(series.sourceIds)?series.sourceIds:[],
    lastVerified:series.lastVerified||null
  };
}
