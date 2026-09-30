import {DEFAULT_REGION_ID,getRegion,regionLabel} from "./data/regions.js";

const defaultRegion=getRegion(DEFAULT_REGION_ID);

export const CONFIG={
  defaultRegionId:DEFAULT_REGION_ID,
  defaultCenter:{...defaultRegion.center},
  defaultPlaceLabel:regionLabel(defaultRegion),
  defaultRadiusMiles:defaultRegion.defaultRadiusMiles,
  maxRadiusMiles:75,
  defaultZoom:11,
  locale:defaultRegion.locale,
  timeZone:defaultRegion.timeZone,
  currency:defaultRegion.currency
};
