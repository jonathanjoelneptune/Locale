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
    id:"sandiego-reader",name:"San Diego Reader",scope:"regional",regions:["san-diego"],adapter:"rss-detail",
    endpoint:"https://www.sandiegoreader.com/rss/events/",fallbackCenter:{lat:32.7157,lng:-117.1611},refreshHours:6
  },
  {
    id:"nova-sd",name:"NOVA SD",scope:"local",regions:["san-diego"],adapter:"nova",refreshHours:6
  },
  {
    id:"spin-nightclub",name:"Spin Nightclub",scope:"local",regions:["san-diego"],adapter:"jsonld-crawl",
    endpoint:"https://spinnightclub.com/",linkPattern:"/event",fallbackCenter:{lat:32.7423,lng:-117.1836},refreshHours:6
  },
  {
    id:"sandiego-tourism",name:"San Diego Tourism Authority",scope:"local",regions:["san-diego"],adapter:"jsonld",
    endpoint:"https://www.sandiego.org/events-festivals",fallbackCenter:{lat:32.7157,lng:-117.1611},refreshHours:12,enabled:false,
    disabledReason:"403 from automated ingestion; keep as discovery candidate"
  },
  {
    id:"sandiego-family",name:"San Diego Family",scope:"regional",regions:["san-diego"],adapter:"jsonld",
    endpoint:"https://www.sandiegofamily.com/things-to-do/events-calendar",fallbackCenter:{lat:32.7157,lng:-117.1611},refreshHours:12,enabled:false,
    disabledReason:"No collection-level structured events exposed; needs a dedicated adapter"
  },
  {
    id:"eventbrite-san-diego",name:"Eventbrite San Diego",scope:"regional",regions:["san-diego"],adapter:"eventbrite",
    endpoint:"https://www.eventbrite.com/d/ca--san-diego/events/",refreshHours:6,enabled:false,
    disabledReason:"Needs a stable/authorized ingestion path; do not scrape brittle search HTML"
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
