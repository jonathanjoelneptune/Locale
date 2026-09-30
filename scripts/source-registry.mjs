export const SOURCES=[
  {id:"ticketmaster",name:"Ticketmaster",scope:"country",countries:["US"],adapter:"ticketmaster",discovery:"geographic",refreshHours:6},
  {id:"san-diego-city",name:"City of San Diego",scope:"local",regions:["san-diego"],adapter:"san-diego-city",refreshHours:6},
  {id:"poway",name:"City of Poway",scope:"local",regions:["san-diego"],adapter:"poway",refreshHours:6},
  {
    id:"ucsd",name:"UC San Diego",scope:"local",regions:["san-diego"],adapter:"localist",
    endpoint:"https://calendar.ucsd.edu",fallbackCenter:{lat:32.8801,lng:-117.2340},refreshHours:6
  },
  {
    id:"balboa-park",name:"Balboa Park",scope:"local",regions:["san-diego"],adapter:"tribe",
    endpoint:"https://balboapark.org",fallbackCenter:{lat:32.7311,lng:-117.1467},refreshHours:6
  },
  {
    id:"sandiego-tourism",name:"San Diego Tourism Authority",scope:"local",regions:["san-diego"],adapter:"jsonld",
    endpoint:"https://www.sandiego.org/events-festivals",fallbackCenter:{lat:32.7157,lng:-117.1611},refreshHours:12
  },
  {
    id:"sandiego-reader",name:"San Diego Reader",scope:"regional",regions:["san-diego"],adapter:"jsonld",
    endpoint:"https://www.sandiegoreader.com/events/search/",fallbackCenter:{lat:32.7157,lng:-117.1611},refreshHours:6
  },
  {
    id:"sandiego-family",name:"San Diego Family",scope:"regional",regions:["san-diego"],adapter:"jsonld",
    endpoint:"https://www.sandiegofamily.com/things-to-do/events-calendar",fallbackCenter:{lat:32.7157,lng:-117.1611},refreshHours:12
  },
  {
    id:"nova-sd",name:"NOVA SD",scope:"local",regions:["san-diego"],adapter:"tribe",
    endpoint:"https://novasd.com",fallbackCenter:{lat:32.7108,lng:-117.1596},refreshHours:6
  },
  {
    id:"spin-nightclub",name:"Spin Nightclub",scope:"local",regions:["san-diego"],adapter:"tribe",
    endpoint:"https://spinnightclub.com",fallbackCenter:{lat:32.7423,lng:-117.1836},refreshHours:6
  }
];

export function sourceCoversRegion(source,region){
  if(!source||!region||source.enabled===false)return false;
  if(source.scope==="global")return true;
  if(source.scope==="country")return source.countries?.includes(region.countryCode)||false;
  if(source.scope==="regional"||source.scope==="local")return source.regions?.includes(region.id)||false;
  return false;
}

export const sourcesForRegion=region=>SOURCES.filter(source=>sourceCoversRegion(source,region));
