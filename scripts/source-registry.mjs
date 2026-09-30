export const SOURCES=[
  {id:"ticketmaster",name:"Ticketmaster",scope:"country",countries:["US"],adapter:"ticketmaster",discovery:"geographic",refreshHours:6},
  {id:"san-diego-city",name:"City of San Diego",scope:"local",regions:["san-diego"],adapter:"san-diego-city",refreshHours:6},
  {id:"poway",name:"City of Poway",scope:"local",regions:["san-diego"],adapter:"poway",refreshHours:6},
  {
    id:"ucsd",name:"UC San Diego",scope:"local",regions:["san-diego"],adapter:"localist",minExpectedEvents:1,
    endpoint:"https://calendar.ucsd.edu",fallbackCenter:{lat:32.8801,lng:-117.2340},refreshHours:6
  },
  {
    id:"balboa-park",name:"Balboa Park",scope:"local",regions:["san-diego"],adapter:"tribe",minExpectedEvents:1,
    endpoint:"https://balboapark.org",fallbackCenter:{lat:32.7311,lng:-117.1467},refreshHours:6
  },
  {
    id:"sandiego-reader",name:"San Diego Reader",scope:"regional",regions:["san-diego"],adapter:"rss-detail",minExpectedEvents:1,
    endpoint:"https://www.sandiegoreader.com/rss/events/",fallbackCenter:{lat:32.7157,lng:-117.1611},refreshHours:6
  },
  {
    id:"nova-sd",name:"NOVA SD",scope:"local",regions:["san-diego"],adapter:"nova",minExpectedEvents:1,refreshHours:6
  },
  {
    id:"spin-nightclub",name:"Spin Nightclub",scope:"local",regions:["san-diego"],adapter:"spin",minExpectedEvents:1,refreshHours:6
  },
  {
    id:"mic-drop-comedy",name:"Mic Drop Comedy",scope:"local",regions:["san-diego"],adapter:"micdrop",minExpectedEvents:1,refreshHours:6
  },
  {
    id:"comedy-store-la-jolla",name:"The Comedy Store La Jolla",scope:"local",regions:["san-diego"],adapter:"comedy-store",refreshHours:6,enabled:false,
    disabledReason:"Calendar is useful but automated fetches from GitHub Actions are blocked/intermittent; requires a stable adapter path"
  },
  {
    id:"usd",name:"University of San Diego",scope:"local",regions:["san-diego"],adapter:"usd",minExpectedEvents:1,refreshHours:6
  },
  {
    id:"sdsu-as",name:"SDSU Associated Students",scope:"local",regions:["san-diego"],adapter:"sdsu",minExpectedEvents:1,refreshHours:6
  },
  {
    id:"sd-public-library",name:"San Diego Public Library",scope:"local",regions:["san-diego"],adapter:"sdpl",minExpectedEvents:1,refreshHours:12
  },
  {
    id:"san-diego-parks",name:"City of San Diego Parks & Recreation",scope:"local",regions:["san-diego"],adapter:"san-diego-parks",minExpectedEvents:1,refreshHours:12
  },
  {
    id:"county-parks",name:"San Diego County Parks",scope:"regional",regions:["san-diego"],adapter:"ics",minExpectedEvents:1,
    endpoint:"https://tockify.com/api/feeds/ics/sdparkscalendar",fallbackCenter:{lat:32.85,lng:-117.05},refreshHours:12
  },
  {
    id:"til-two-club",name:"Til-Two Club",scope:"local",regions:["san-diego"],adapter:"tribe",minExpectedEvents:1,
    endpoint:"https://www.tiltwoclub.com",fallbackCenter:{lat:32.7553,lng:-117.0928},refreshHours:6
  },
  {
    id:"uss-midway",name:"USS Midway Museum",scope:"local",regions:["san-diego"],adapter:"tribe",minExpectedEvents:1,
    endpoint:"https://www.midway.org",fallbackCenter:{lat:32.7137,lng:-117.1751},refreshHours:12
  },
  {
    id:"birch-aquarium",name:"Birch Aquarium at Scripps",scope:"local",regions:["san-diego"],adapter:"jsonld-crawl",minExpectedEvents:1,
    endpoint:"https://aquarium.ucsd.edu/events/all",linkPattern:"/events/",fallbackCenter:{lat:32.8658,lng:-117.2505},refreshHours:12
  },
  {
    id:"sandiego-tourism",name:"San Diego Tourism Authority",scope:"local",regions:["san-diego"],adapter:"jsonld",
    endpoint:"https://www.sandiego.org/events-festivals",fallbackCenter:{lat:32.7157,lng:-117.1611},refreshHours:12,enabled:false,
    disabledReason:"403 from automated ingestion; keep as discovery candidate"
  },
  {
    id:"sandiego-family",name:"San Diego Family",scope:"regional",regions:["san-diego"],adapter:"sandiego-family",minExpectedEvents:1,
    endpoint:"https://www.sandiegofamily.com/things-to-do/events-calendar",fallbackCenter:{lat:32.7157,lng:-117.1611},refreshHours:12
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
