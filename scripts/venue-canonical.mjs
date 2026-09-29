const VENUES=[
  {key:"petco-park",aliases:["petco park"],name:"PETCO Park",lat:32.7076,lng:-117.1570},
  {key:"snapdragon-stadium",aliases:["snapdragon stadium"],name:"Snapdragon Stadium",lat:32.7841,lng:-117.1225},
  {key:"rady-shell",aliases:["the rady shell at jacobs park","rady shell at jacobs park","rady shell"],name:"The Rady Shell at Jacobs Park",lat:32.7049,lng:-117.1653},
  {key:"observatory-north-park",aliases:["the observatory north park","observatory north park"],name:"The Observatory North Park",lat:32.7542,lng:-117.1305}
];
const norm=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
export function canonicalizeVenue(event){
  const value=norm(event.venue);
  const hit=VENUES.find(v=>v.aliases.some(a=>value===norm(a)));
  return hit?{...event,venue:hit.name,lat:hit.lat,lng:hit.lng,venueKey:hit.key}:event;
}
