export const REGIONS={
  "san-diego":{id:"san-diego",name:"San Diego",state:"CA",country:"US",center:{lat:32.7157,lng:-117.1611},defaultRadiusMiles:15,ingestRadiusMiles:50,timeZone:"America/Los_Angeles"},
  "chicago":{id:"chicago",name:"Chicago",state:"IL",country:"US",center:{lat:41.8781,lng:-87.6298},defaultRadiusMiles:15,ingestRadiusMiles:50,timeZone:"America/Chicago"}
};
export const regionList=Object.values(REGIONS);
export const getRegion=id=>REGIONS[id]||REGIONS["san-diego"];
