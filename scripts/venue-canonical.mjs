const VENUES=[
  {key:"petco-park",aliases:["petco park"],name:"PETCO Park",lat:32.7076,lng:-117.1570},
  {key:"snapdragon-stadium",aliases:["snapdragon stadium"],name:"Snapdragon Stadium",lat:32.7841,lng:-117.1225},
  {key:"rady-shell",aliases:["the rady shell at jacobs park","rady shell at jacobs park","rady shell"],name:"The Rady Shell at Jacobs Park",lat:32.7049,lng:-117.1653},
  {key:"observatory-north-park",aliases:["the observatory north park","observatory north park"],name:"The Observatory North Park",lat:32.7542,lng:-117.1305},
  {key:"liberty-station",aliases:["liberty station","liberty station san diego"],name:"Liberty Station",lat:32.7353,lng:-117.2130},
  {key:"seaport-village",aliases:["seaport village"],name:"Seaport Village",lat:32.7090,lng:-117.1707},
  {key:"belmont-park",aliases:["belmont park"],name:"Belmont Park",lat:32.7706,lng:-117.2519},
  {key:"bates-nut-farm",aliases:["bates nut farm"],name:"Bates Nut Farm",lat:33.2102,lng:-117.0164},
  {key:"balboa-theatre",aliases:["balboa theatre","balboa theater"],name:"Balboa Theatre",lat:32.7144,lng:-117.1610},
  {key:"old-town-san-diego",aliases:["old town san diego","old town san diego state historic park"],name:"Old Town San Diego",lat:32.7548,lng:-117.1971},
  {key:"uss-midway",aliases:["uss midway museum","uss midway"],name:"USS Midway Museum",lat:32.7137,lng:-117.1751},
  {key:"birch-aquarium",aliases:["birch aquarium","birch aquarium at scripps"],name:"Birch Aquarium at Scripps",lat:32.8658,lng:-117.2505},
  {key:"mic-drop-comedy",aliases:["mic drop comedy"],name:"Mic Drop Comedy",lat:32.8325,lng:-117.1371},
  {key:"til-two-club",aliases:["til-two club","tiltwo club"],name:"Til-Two Club",lat:32.7553,lng:-117.0928}
];
const norm=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
export function canonicalizeVenue(event){
  const value=norm(event.venue);
  const hit=VENUES.find(v=>v.aliases.some(a=>value===norm(a)));
  return hit?{...event,venue:hit.name,lat:hit.lat,lng:hit.lng,venueKey:hit.key,locationPrecision:"venue-canonical"}:event;
}
