export const SOURCES=[
 {id:"ticketmaster",name:"Ticketmaster",scope:"national",countries:["US"],adapter:"ticketmaster",discovery:"geographic",refreshHours:6},
 {id:"san-diego-city",name:"City of San Diego",scope:"local",regions:["san-diego"],adapter:"san-diego-city",refreshHours:6},
 {id:"poway",name:"City of Poway",scope:"local",regions:["san-diego"],adapter:"poway",refreshHours:6}
];
export const sourcesForRegion=(regionId,country="US")=>SOURCES.filter(s=>s.scope==="national"?s.countries?.includes(country):s.regions?.includes(regionId));
