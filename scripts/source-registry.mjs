export const SOURCES=[
  {id:"ticketmaster",name:"Ticketmaster",scope:"country",countries:["US"],adapter:"ticketmaster",sourceKind:"platform",acquisitionTier:"A",coverageLayer:"platform",discovery:"geographic",refreshHours:1},
  {id:"san-diego-city",name:"City of San Diego",scope:"local",regions:["san-diego"],adapter:"san-diego-city",sourceKind:"government",acquisitionTier:"A",coverageLayer:"citywide",ownerEntityKind:"organizer",ownerName:"City of San Diego",refreshHours:2},
  {
    id:"sd-county-library",name:"San Diego County Library Events",scope:"regional",regions:["san-diego"],adapter:"sd-county-library",
    sourceKind:"government",acquisitionTier:"A",coverageLayer:"regional-public",ownerEntityKind:"organizer",ownerName:"San Diego County Library",minExpectedEvents:10,
    endpoint:"https://sdcl.bibliocommons.com/v2/events",fallbackCenter:{lat:32.85,lng:-117.05},refreshHours:2
  },
  {
    id:"sd-museum-council",name:"San Diego Museum Council",scope:"regional",regions:["san-diego"],adapter:"sd-museum-council",
    sourceKind:"aggregator",acquisitionTier:"A",coverageLayer:"category",ownerEntityKind:"organizer",ownerName:"San Diego Museum Council",minExpectedEvents:1,
    endpoint:"https://sandiegomuseumcouncil.org/events/",fallbackCenter:{lat:32.7311,lng:-117.1467},refreshHours:3
  },
  {
    id:"sandiego-reader-happy-hours",name:"San Diego Reader Happy Hours",scope:"regional",regions:["san-diego"],adapter:"sandiego-reader-happy-hours",
    sourceKind:"aggregator",acquisitionTier:"A",coverageLayer:"deals",ownerEntityKind:"organizer",ownerName:"San Diego Reader",minExpectedEvents:20,
    endpoint:"https://www.sandiegoreader.com/specials/tuesday/",fallbackCenter:{lat:32.7157,lng:-117.1611},refreshHours:12
  },
  {
    id:"casbah-presents",name:"Casbah Presents",scope:"regional",regions:["san-diego"],adapter:"casbah-presents",
    sourceKind:"promoter",acquisitionTier:"A",coverageLayer:"music-umbrella",ownerEntityKind:"organizer",ownerName:"Casbah Presents",minExpectedEvents:5,
    endpoint:"https://www.casbahmusic.com/calendar/",fallbackCenter:{lat:32.7157,lng:-117.1611},refreshHours:3
  },
  {
    id:"san-diego-convention-center",name:"San Diego Convention Center",scope:"local",regions:["san-diego"],adapter:"convention-center",
    sourceKind:"official",acquisitionTier:"A",coverageLayer:"venue-umbrella",ownerEntityKind:"place",ownerName:"San Diego Convention Center",minExpectedEvents:1,
    endpoint:"https://www.visitsandiego.com/calendar",fallbackCenter:{lat:32.7068,lng:-117.1624},refreshHours:6
  },
  {
    id:"del-mar-fairgrounds",name:"Del Mar Fairgrounds",scope:"local",regions:["san-diego"],adapter:"del-mar-fairgrounds",
    sourceKind:"official",acquisitionTier:"A",coverageLayer:"venue-umbrella",ownerEntityKind:"organizer",ownerName:"Del Mar Fairgrounds",minExpectedEvents:1,
    endpoint:"https://www.delmarfairgrounds.com/events",fallbackCenter:{lat:32.9736,lng:-117.2618},refreshHours:3
  },
  {id:"poway",name:"City of Poway",scope:"local",regions:["san-diego"],adapter:"poway",sourceKind:"government",ownerEntityKind:"organizer",ownerName:"City of Poway",refreshHours:6},
  {
    id:"santee-calendar",name:"City of Santee Calendar",scope:"local",regions:["san-diego"],adapter:"santee-calendar",
    sourceKind:"government",acquisitionTier:"B",coverageLayer:"municipality",ownerEntityKind:"organizer",ownerName:"City of Santee",minExpectedEvents:1,
    endpoint:"https://www.cityofsanteeca.gov/calendar/events",fallbackCenter:{lat:32.8384,lng:-116.9739},refreshHours:6
  },
  {
    id:"escondido-calendar",name:"City of Escondido Calendar",scope:"local",regions:["san-diego"],adapter:"multi-ics",
    sourceKind:"government",acquisitionTier:"B",coverageLayer:"municipality",ownerEntityKind:"organizer",ownerName:"City of Escondido",
    endpoints:["https://escondido.gov/common/modules/iCalendar/iCalendar.aspx?catID=14&feed=calendar"],fallbackCenter:{lat:33.1192,lng:-117.0864},refreshHours:6
  },
  {
    id:"imperial-beach-calendar",name:"City of Imperial Beach Calendar",scope:"local",regions:["san-diego"],adapter:"multi-ics",
    sourceKind:"government",acquisitionTier:"B",coverageLayer:"municipality",ownerEntityKind:"organizer",ownerName:"City of Imperial Beach",minExpectedEvents:1,
    endpoints:[
      "https://www.imperialbeachca.gov/common/modules/iCalendar/iCalendar.aspx?catID=38&feed=calendar",
      "https://www.imperialbeachca.gov/common/modules/iCalendar/iCalendar.aspx?catID=30&feed=calendar",
      "https://www.imperialbeachca.gov/common/modules/iCalendar/iCalendar.aspx?catID=26&feed=calendar",
      "https://www.imperialbeachca.gov/common/modules/iCalendar/iCalendar.aspx?catID=32&feed=calendar"
    ],fallbackCenter:{lat:32.5839,lng:-117.1131},refreshHours:6
  },
  {
    id:"coronado-calendar",name:"City of Coronado Calendar",scope:"local",regions:["san-diego"],adapter:"multi-ics",
    sourceKind:"government",acquisitionTier:"B",coverageLayer:"municipality",ownerEntityKind:"organizer",ownerName:"City of Coronado",minExpectedEvents:1,
    endpoints:[
      "https://www.coronado.ca.us/common/modules/iCalendar/iCalendar.aspx?catID=31&feed=calendar",
      "https://www.coronado.ca.us/common/modules/iCalendar/iCalendar.aspx?catID=14&feed=calendar",
      "https://www.coronado.ca.us/common/modules/iCalendar/iCalendar.aspx?catID=24&feed=calendar",
      "https://www.coronado.ca.us/common/modules/iCalendar/iCalendar.aspx?catID=26&feed=calendar"
    ],fallbackCenter:{lat:32.6859,lng:-117.1831},refreshHours:6
  },
  {
    id:"del-mar-calendar",name:"City of Del Mar Community Calendar",scope:"local",regions:["san-diego"],adapter:"multi-ics",
    sourceKind:"government",acquisitionTier:"B",coverageLayer:"municipality",ownerEntityKind:"organizer",ownerName:"City of Del Mar",minExpectedEvents:1,
    endpoints:["https://www.delmar.ca.us/common/modules/iCalendar/iCalendar.aspx?catID=24&feed=calendar"],fallbackCenter:{lat:32.9595,lng:-117.2653},refreshHours:6
  },
  {
    id:"la-mesa-calendar",name:"City of La Mesa Community Calendars",scope:"local",regions:["san-diego"],adapter:"multi-ics",
    sourceKind:"government",acquisitionTier:"B",coverageLayer:"municipality",ownerEntityKind:"organizer",ownerName:"City of La Mesa",minExpectedEvents:1,
    endpoints:[
      "https://www.cityoflamesa.gov/common/modules/iCalendar/iCalendar.aspx?catID=34&feed=calendar",
      "https://www.cityoflamesa.gov/common/modules/iCalendar/iCalendar.aspx?catID=15&feed=calendar",
      "https://www.cityoflamesa.gov/common/modules/iCalendar/iCalendar.aspx?catID=35&feed=calendar"
    ],fallbackCenter:{lat:32.7678,lng:-117.0231},refreshHours:6
  },
  {
    id:"liberty-station-classes",name:"Liberty Station Classes",scope:"local",regions:["san-diego"],adapter:"liberty-station",
    sourceKind:"district-aggregator",acquisitionTier:"B",coverageLayer:"classes",ownerEntityKind:"organizer",ownerName:"Liberty Station",minExpectedEvents:1,
    endpoint:"https://libertystation.com/events/classes",fallbackCenter:{lat:32.7390,lng:-117.2122},maxLinks:100,refreshHours:6
  },
  {
    id:"national-city-calendar",name:"National City Calendar of Events",scope:"local",regions:["san-diego"],adapter:"granicus-calendar",
    sourceKind:"government",acquisitionTier:"B",coverageLayer:"municipality",ownerEntityKind:"organizer",ownerName:"City of National City",minExpectedEvents:5,
    endpoints:["https://www.nationalcityca.gov/services/advanced-components/calendar-list/-sortn-EDate/-toggle-next30days/-sortd-asc"],
    cityName:"National City",fallbackCenter:{lat:32.6781,lng:-117.0992},maxPages:8,maxDetails:120,enabled:false,
    disabledReason:"Dedicated Granicus endpoint returns HTTP 403 from GitHub Actions; retain adapter for a future stable fetch path",
    locationHints:[
      {match:"(?:Library|Storytime|TCG Tuesdays|Gamer's World|Lego Club|Coding|u-Tool-ize|Book Club|Craft Night Out|Chronicles of Yarnia|Stay & Play|Yoga @ The Library|Mission: STEAM)",venue:"National City Public Library",address:"1401 National City Blvd, National City, CA 91950",query:"1401 National City Blvd, National City, CA 91950"},
      {match:"Casa de Salud",venue:"Casa de Salud",address:"1408 Harding Avenue, National City, CA 91950",query:"1408 Harding Avenue, National City, CA 91950"},
      {match:"FAB |Feeling Fit|Walking Club|Crochet Club",venue:"Kimball Senior Center",address:"1221 D Avenue, National City, CA 91950",query:"1221 D Avenue, National City, CA 91950"},
      {match:"Community Market",venue:"Kimball Park",address:"E 12th St, National City, CA 91950",query:"Kimball Park, National City, CA"}
    ],refreshHours:6
  },
  {
    id:"chula-vista-calendar",name:"City of Chula Vista Calendar",scope:"local",regions:["san-diego"],adapter:"granicus-calendar",
    sourceKind:"government",acquisitionTier:"B",coverageLayer:"municipality",ownerEntityKind:"organizer",ownerName:"City of Chula Vista",minExpectedEvents:3,
    endpoints:[
      "https://www.chulavistaca.gov/residents/advanced-components/list-detail-pages/calendar/-sortn-EDate/-toggle-next30days/-sortd-asc",
      "https://www.chulavistaca.gov/residents/cultural-arts/events/-sortn-EDate/-toggle-next30days/-sortd-asc"
    ],
    cityName:"Chula Vista",fallbackCenter:{lat:32.6401,lng:-117.0842},maxPages:8,maxDetails:120,enabled:false,
    disabledReason:"Dedicated Granicus endpoints return HTTP 403 from GitHub Actions; retain adapter for a future stable fetch path",
    locationHints:[
      {match:"^CIVIC:",venue:"Civic Center Branch Library",address:"365 F Street, Chula Vista, CA 91910",query:"365 F Street, Chula Vista, CA 91910"},
      {match:"^SOUTH:",venue:"South Chula Vista Branch Library",address:"389 Orange Avenue, Chula Vista, CA 91911",query:"389 Orange Avenue, Chula Vista, CA 91911"},
      {match:"^OTAY:",venue:"Otay Ranch Branch Library",address:"2015 Birch Road Suite 1103, Chula Vista, CA 91915",query:"2015 Birch Road Suite 1103, Chula Vista, CA 91915"}
    ],refreshHours:6
  },
  {
    id:"san-marcos-calendar",name:"City of San Marcos Calendar",scope:"local",regions:["san-diego"],adapter:"san-marcos-calendar",
    sourceKind:"government",acquisitionTier:"B",coverageLayer:"municipality",ownerEntityKind:"organizer",ownerName:"City of San Marcos",minExpectedEvents:1,
    endpoint:"https://www.sanmarcosca.gov/Meetings-Events",fallbackCenter:{lat:33.1434,lng:-117.1661},maxDetails:60,refreshHours:6
  },
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
