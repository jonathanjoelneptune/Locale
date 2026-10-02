import test from "node:test";
import assert from "node:assert/strict";
import {
  likelyStreetAddress,
  parseCensusPoint,
  parsePhotonPoint,
  geocodeVenueUncached,
  VENUE_GEOCODER_VERSION
} from "./venue-geocode.mjs";

const region={
  id:"san-diego",
  name:"San Diego",
  administrativeArea:"CA",
  countryCode:"US",
  center:{lat:32.7157,lng:-117.1611},
  ingestRadiusMiles:50
};

test("geocoder version invalidates prior negative-cache generation",()=>{
  assert.ok(VENUE_GEOCODER_VERSION>=2);
});

test("street-address detection separates Census-compatible addresses from venue names",()=>{
  assert.equal(likelyStreetAddress("123 Main St, San Diego, CA"),true);
  assert.equal(likelyStreetAddress("Alpine Library, San Diego County, CA"),false);
});

test("Census and Photon provider parsers normalize coordinates",()=>{
  assert.deepEqual(parseCensusPoint({
    result:{addressMatches:[{matchedAddress:"123 Main St, San Diego, CA",coordinates:{x:-117.1,y:32.7}}]}
  }),{lat:32.7,lng:-117.1,displayName:"123 Main St, San Diego, CA",provider:"census"});

  const photon=parsePhotonPoint({
    features:[{geometry:{coordinates:[-117.12,32.74]},properties:{name:"Example Venue",city:"San Diego",state:"California",country:"United States"}}]
  });
  assert.equal(photon.lat,32.74);
  assert.equal(photon.lng,-117.12);
  assert.equal(photon.provider,"photon");
  assert.match(photon.displayName,/Example Venue/);
});

test("venue geocoder fails over from Photon to Nominatim",async()=>{
  const calls=[];
  const fetchImpl=async input=>{
    const url=String(input);
    calls.push(url);
    if(url.startsWith("https://photon.komoot.io/"))return {ok:false,status:503,json:async()=>({})};
    if(url.startsWith("https://nominatim.openstreetmap.org/"))return {
      ok:true,status:200,
      json:async()=>[{lat:"32.741",lon:"-117.129",display_name:"Example Venue, San Diego, California"}]
    };
    throw new Error("unexpected geocoder "+url);
  };
  const point=await geocodeVenueUncached("Example Venue, North Park, San Diego",{...region},{fetchImpl});
  assert.equal(point.provider,"nominatim");
  assert.equal(point.lat,32.741);
  assert.equal(calls.length,2);
});
