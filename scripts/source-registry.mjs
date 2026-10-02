export const SOURCES=[
  {id:"ticketmaster",name:"Ticketmaster",scope:"country",countries:["US"],adapter:"ticketmaster",sourceKind:"platform",acquisitionTier:"A",coverageLayer:"platform",discovery:"geographic",refreshHours:1},
  {id:"san-diego-city",name:"City of San Diego",scope:"local",regions:["san-diego"],adapter:"san-diego-city",sourceKind:"government",acquisitionTier:"A",coverageLayer:"citywide",ownerEntityKind:"organizer",ownerName:"City of San Diego",refreshHours:2},
  {id:"poway",name:"City of Poway",scope:"local",regions:["san-diego"],adapter:"poway",sourceKind:"government",ownerEntityKind:"organizer",ownerName:"City of Poway",refreshHours:6},
  {
    id:"ucsd",name:"UC San Diego",scope:"local",regions:["san-diego"],adapter:"localist",sourceKind:"college",enabled:false,excludedFromLocale:true,
    excludedReason:"College campus calendars are outside Locale scope",endpoint:"https://calendar.ucsd.edu",fallbackCenter:{lat:32.8801,lng:-117.2340},refreshHours:6
  },
  {
    id:"balboa-park",name:"Balboa Park",scope:"local",regions:["san-diego"],adapter:"tribe",sourceKind:"official",ownerEntityKind:"organizer",ownerName:"Balboa Park",minExpectedEvents:1,
    endpoint:"https://balboapark.org",fallbackCenter:{lat:32.7311,lng:-117.1467},refreshHours:6
  },
  {
    id:"sandiego-reader",name:"San Diego Reader",scope:"regional",regions:["san-diego"],adapter:"sandiego-reader-calendar",sourceKind:"aggregator",acquisitionTier:"A",coverageLayer:"regional",minExpectedEvents:1,
    endpoint:"https://www.sandiegoreader.com/events/",fallbackCenter:{lat:32.7157,lng:-117.1611},refreshHours:12
  },
  {
    id:"singhub-karaoke",name:"SingHUB",scope:"regional",regions:["san-diego"],adapter:"singhub-karaoke",sourceKind:"aggregator",acquisitionTier:"A",coverageLayer:"category",minExpectedEvents:1,
    endpoint:"https://singhub.app/find-karaoke?type=live",refreshHours:12
  },
  {
    id:"taco-tuesday-sd",name:"TacoTuesday.com San Diego",scope:"regional",regions:["san-diego"],adapter:"taco-tuesday",sourceKind:"aggregator",minExpectedEvents:1,
    endpoint:"https://tacotuesday.com/san-diego-taco-tuesday-the-best-taco-deals-every-tuesday/",refreshHours:24
  },
  {
    id:"north-park-noise",name:"North Park Noise",scope:"local",regions:["san-diego"],adapter:"tribe",sourceKind:"aggregator",minExpectedEvents:1,
    endpoint:"https://northparknoise.com",fallbackCenter:{lat:32.7470,lng:-117.1290},refreshHours:12
  },
  {
    id:"north-park-main-street",name:"North Park Main Street",scope:"local",regions:["san-diego"],adapter:"tribe",
    sourceKind:"neighborhood-aggregator",acquisitionTier:"B",coverageLayer:"neighborhood",
    ownerEntityKind:"organizer",ownerName:"North Park Main Street",minExpectedEvents:1,
    endpoint:"https://northparkmainstreet.com",fallbackCenter:{lat:32.7475,lng:-117.1297},refreshHours:3
  },
  {
    id:"liberty-station",name:"Liberty Station",scope:"local",regions:["san-diego"],adapter:"liberty-station",
    sourceKind:"neighborhood-aggregator",acquisitionTier:"B",coverageLayer:"district",
    ownerEntityKind:"organizer",ownerName:"Liberty Station",minExpectedEvents:1,
    endpoint:"https://libertystation.com/events/calendar",fallbackCenter:{lat:32.7390,lng:-117.2122},refreshHours:3
  },
  {
    id:"nova-sd",name:"NOVA SD",scope:"local",regions:["san-diego"],adapter:"nova",sourceKind:"official",ownerEntityKind:"place",ownerName:"NOVA SD",minExpectedEvents:1,refreshHours:6
  },
  {
    id:"spin-nightclub",name:"Spin Nightclub",scope:"local",regions:["san-diego"],adapter:"spin",sourceKind:"official",ownerEntityKind:"place",ownerName:"Spin Nightclub",minExpectedEvents:1,refreshHours:6
  },
  {
    id:"mic-drop-comedy",name:"Mic Drop Comedy",scope:"local",regions:["san-diego"],adapter:"micdrop",sourceKind:"official",ownerEntityKind:"place",ownerName:"Mic Drop Comedy",minExpectedEvents:1,refreshHours:6
  },
  {
    id:"comedy-store-la-jolla",name:"The Comedy Store La Jolla",scope:"local",regions:["san-diego"],adapter:"comedy-store",refreshHours:6,enabled:false,
    disabledReason:"Calendar is useful but automated fetches from GitHub Actions are blocked/intermittent; requires a stable adapter path"
  },
  {
    id:"usd",name:"University of San Diego",scope:"local",regions:["san-diego"],adapter:"usd",sourceKind:"college",refreshHours:6,enabled:false,excludedFromLocale:true,
    excludedReason:"College campus calendars are outside Locale scope",disabledReason:"Excluded from Locale scope"
  },
  {
    id:"sdsu-as",name:"SDSU Associated Students",scope:"local",regions:["san-diego"],adapter:"sdsu",sourceKind:"college",enabled:false,excludedFromLocale:true,
    excludedReason:"College campus calendars are outside Locale scope",refreshHours:6
  },
  {
    id:"sd-public-library",name:"San Diego Public Library",scope:"local",regions:["san-diego"],adapter:"sdpl",refreshHours:12,enabled:false,
    disabledReason:"Official MyLibrary calendar is visible publicly but automated GitHub Actions requests are blocked or return no parseable event payload"
  },
  {
    id:"san-diego-parks",name:"City of San Diego Parks & Recreation",scope:"local",regions:["san-diego"],adapter:"san-diego-parks",refreshHours:12,enabled:false,
    disabledReason:"Official calendar is public but event detail discovery remains incompatible with the automated ingestion response"
  },
  {
    id:"county-parks",name:"San Diego County Parks",scope:"regional",regions:["san-diego"],adapter:"ics",sourceKind:"government",ownerEntityKind:"organizer",ownerName:"San Diego County Parks",minExpectedEvents:1,
    endpoint:"https://tockify.com/api/feeds/ics/sdparkscalendar",fallbackCenter:{lat:32.85,lng:-117.05},refreshHours:12
  },
  {
    id:"sunset-trivia",name:"Sunset Trivia",scope:"regional",regions:["san-diego"],adapter:"sunset-trivia",sourceKind:"organizer",acquisitionTier:"A",coverageLayer:"category",ownerEntityKind:"organizer",ownerName:"Sunset Trivia",minExpectedEvents:1,refreshHours:6
  },
  {
    id:"til-two-club",name:"Til-Two Club",scope:"local",regions:["san-diego"],adapter:"tribe",sourceKind:"official",ownerEntityKind:"place",ownerName:"Til-Two Club",minExpectedEvents:1,
    endpoint:"https://www.tiltwoclub.com",fallbackCenter:{lat:32.7553,lng:-117.0928},refreshHours:6
  },
  {
    id:"uss-midway",name:"USS Midway Museum",scope:"local",regions:["san-diego"],adapter:"midway",sourceKind:"official",ownerEntityKind:"place",ownerName:"USS Midway Museum",minExpectedEvents:1,refreshHours:12
  },
  {
    id:"birch-aquarium",name:"Birch Aquarium at Scripps",scope:"local",regions:["san-diego"],adapter:"jsonld-crawl",
    endpoint:"https://aquarium.ucsd.edu/events/all",linkPattern:"/events/",fallbackCenter:{lat:32.8658,lng:-117.2505},refreshHours:12,enabled:false,
    disabledReason:"Generic structured crawl returned no canonical events; dedicated recurrence-aware adapter still needed"
  },
  {
    id:"sandiego-tourism",name:"San Diego Tourism Authority",scope:"local",regions:["san-diego"],adapter:"jsonld",
    endpoint:"https://www.sandiego.org/events-festivals",fallbackCenter:{lat:32.7157,lng:-117.1611},refreshHours:12,enabled:false,
    disabledReason:"403 from automated ingestion; keep as discovery candidate"
  },
  {
    id:"sandiego-family",name:"San Diego Family",scope:"regional",regions:["san-diego"],adapter:"sandiego-family",sourceKind:"aggregator",minExpectedEvents:1,
    endpoint:"https://www.sandiegofamily.com/things-to-do/events-calendar",fallbackCenter:{lat:32.7157,lng:-117.1611},refreshHours:12
  },
  {
    id:"eventbrite-san-diego",name:"Eventbrite San Diego",scope:"regional",regions:["san-diego"],adapter:"eventbrite",sourceKind:"platform",
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
