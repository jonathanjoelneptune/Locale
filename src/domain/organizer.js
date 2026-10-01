export const ORGANIZER_CONTRACT_VERSION=1;

export function normalizeOrganizer(organizer={}){
  return {
    id:organizer.id||null,
    regionId:organizer.regionId||null,
    name:organizer.name||"",
    monitorTier:"D",
    sourceIds:Array.isArray(organizer.sourceIds)?organizer.sourceIds:[],
    sourceCount:Number(organizer.sourceCount)||0,
    eventCount:Number(organizer.eventCount)||0,
    firstEventAt:organizer.firstEventAt||null,
    lastEventAt:organizer.lastEventAt||null,
    lastVerified:organizer.lastVerified||null,
    discoveredBy:organizer.discoveredBy||"source-registry"
  };
}
