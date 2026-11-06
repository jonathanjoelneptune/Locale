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
    discoveryCoreRadiusMiles:15,
    discoveryRadiusMiles:35,
    discoveryOuterRadiusMiles:50,
    discoveryDiningRadiusMiles:20,
    discoveryPriority:100,
    timeZone:"America/Los_Angeles",
    locale:"en-US",
    currency:"USD"
  },
  "las-vegas":{
    id:"las-vegas",
    name:"Las Vegas Strip",
    administrativeArea:"NV",
    countryCode:"US",
    center:{lat:36.1114,lng:-115.1728},
    defaultRadiusMiles:5,
    ingestRadiusMiles:8,
    discoveryCoreRadiusMiles:3,
    discoveryRadiusMiles:6,
    discoveryOuterRadiusMiles:8,
    discoveryDiningRadiusMiles:5,
    discoveryPriority:95,
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
    discoveryCoreRadiusMiles:14,
    discoveryRadiusMiles:30,
    discoveryDiningRadiusMiles:18,
    discoveryPriority:80,
    timeZone:"America/Chicago",
    locale:"en-US",
    currency:"USD"
  }
};

export const regionList=Object.values(REGIONS);
export const getRegion=id=>REGIONS[id]||REGIONS[DEFAULT_REGION_ID];
export const regionLabel=region=>[region?.name,region?.administrativeArea,region?.countryCode&&region.countryCode!=="US"?region.countryCode:null].filter(Boolean).join(", ");
