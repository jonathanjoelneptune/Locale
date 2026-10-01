export const DEFAULT_REGION_ID="san-diego";

export const REGIONS={
  "san-diego":{
    id:"san-diego",
    name:"San Diego",
    administrativeArea:"CA",
    countryCode:"US",
    center:{lat:32.7157,lng:-117.1611},
    defaultRadiusMiles:15,
    ingestRadiusMiles:50,
    discoveryRadiusMiles:35,
    discoveryDiningRadiusMiles:20,
    timeZone:"America/Los_Angeles",
    locale:"en-US",
    currency:"USD"
  },
  "chicago":{
    id:"chicago",
    name:"Chicago",
    administrativeArea:"IL",
    countryCode:"US",
    center:{lat:41.8781,lng:-87.6298},
    defaultRadiusMiles:15,
    ingestRadiusMiles:50,
    discoveryRadiusMiles:30,
    discoveryDiningRadiusMiles:18,
    timeZone:"America/Chicago",
    locale:"en-US",
    currency:"USD"
  }
};

export const regionList=Object.values(REGIONS);
export const getRegion=id=>REGIONS[id]||REGIONS[DEFAULT_REGION_ID];
export const regionLabel=region=>[region?.name,region?.administrativeArea,region?.countryCode&&region.countryCode!=="US"?region.countryCode:null].filter(Boolean).join(", ");
