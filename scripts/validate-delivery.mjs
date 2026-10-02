import {readFile} from "node:fs/promises";

const [pages,refresh,discover,resolve,reconcile,watchdog,provider,index,buildSite,vercel,vercelIgnore]=await Promise.all([
  readFile(".github/workflows/pages.yml","utf8"),
  readFile(".github/workflows/refresh-events.yml","utf8"),
  readFile(".github/workflows/discover-sources.yml","utf8"),
  readFile(".github/workflows/resolve-locations.yml","utf8"),
  readFile(".github/workflows/reconcile-state.yml","utf8"),
  readFile(".github/workflows/living-watchdog.yml","utf8"),
  readFile("src/providers/local.js","utf8"),
  readFile("index.html","utf8"),
  readFile("scripts/build-site.mjs","utf8"),
  readFile("vercel.json","utf8"),
  readFile("scripts/vercel-ignore.mjs","utf8")
]);

const failures=[];
const requireText=(text,needle,label)=>{
  if(!text.includes(needle))failures.push(`${label}: missing ${needle}`);
};
const forbidText=(text,needle,label)=>{
  if(text.includes(needle))failures.push(`${label}: must not contain ${needle}`);
};

for(const file of [
  "src/data/events.json",
  "src/data/places.json",
  "src/data/organizers.json",
  "src/data/series.json",
  "src/data/entity-source-links.json",
  "src/data/coverage.json",
  "src/data/geocode-cache.json",
  "src/data/venue-geocode-cache.json"
]) requireText(pages,`- "${file}"`,"pages.yml");

for(const [label,text] of [
  ["refresh-events.yml",refresh],
  ["discover-sources.yml",discover],
  ["resolve-locations.yml",resolve]
]){
  forbidText(text,"src/data/coverage-dashboard.json",label);
  forbidText(text,"src/data/discovery-live.json",label);
  forbidText(text,"node scripts/build-coverage-dashboard.mjs",label);
}
requireText(refresh,"gh workflow run reconcile-state.yml --ref main","refresh-events.yml");
requireText(refresh,'cron: "11 * * * *"',"refresh-events.yml");
requireText(refresh,"src/data/reader-place-cache.json","refresh-events.yml");
requireText(discover,"gh workflow run reconcile-state.yml --ref main","discover-sources.yml");
requireText(discover,'cron: "7,37 * * * *"',"discover-sources.yml");
requireText(resolve,"gh workflow run reconcile-state.yml --ref main","resolve-locations.yml");
requireText(resolve,'cron: "29 * * * *"',"resolve-locations.yml");

requireText(reconcile,"node scripts/reconcile-state.mjs","reconcile-state.yml");
requireText(reconcile,'FILES="src/data/coverage-dashboard.json src/data/discovery-live.json src/data/system-health.json"',"reconcile-state.yml");
requireText(reconcile,"locale-state-reconcile","reconcile-state.yml");

requireText(watchdog,'cron: "6,21,36,51 * * * *"',"living-watchdog.yml");
requireText(watchdog,'workflow_run:',"living-watchdog.yml");
requireText(watchdog,'- "Refresh Locale events"',"living-watchdog.yml");
requireText(watchdog,'- "Reconcile Locale state"',"living-watchdog.yml");
requireText(watchdog,'- "Resolve Locale locations"',"living-watchdog.yml");
requireText(watchdog,'LOCATIONS_CATCHUP',"living-watchdog.yml");
requireText(watchdog,'lowestLocationRate<0.90',"living-watchdog.yml");
requireText(watchdog,"dueLocationCount>0","living-watchdog.yml");
requireText(watchdog,'LOCATION_DUE',"living-watchdog.yml");
requireText(watchdog,'recover "$DISCOVERY_STALE" "discover-sources.yml" "discovery"',"living-watchdog.yml");
requireText(watchdog,'recover "$RECONCILE_STALE" "reconcile-state.yml" "reconciliation"',"living-watchdog.yml");
requireText(watchdog,'recover "$EVENTS_STALE" "refresh-events.yml" "event refresh"',"living-watchdog.yml");
requireText(watchdog,'recover "true" "resolve-locations.yml" "location resolution"',"living-watchdog.yml");

requireText(provider,"raw.githubusercontent.com/jonathanjoelneptune/Locale/main/src/data/events.json","local provider");
requireText(provider,'const BUNDLED_EVENTS="./src/data/events.json"',"local provider");
requireText(provider,"for(const [url,timeout] of sources)","local provider");

requireText(index,'id="localeBoot"',"index.html");
requireText(index,'name="locale-shell" content="1"',"index.html");
requireText(index,"<noscript>","index.html");

requireText(pages,"Verify document shell stays available","pages.yml");
requireText(pages,"node scripts/build-site.mjs","pages.yml");
requireText(pages,"node scripts/reconcile-state.mjs","pages.yml");
requireText(buildSite,'await writeFile(`${outDir}/404.html`,html)',"build-site.mjs");
requireText(buildSite,'await cp("diagnostics.html"', "build-site.mjs");
requireText(buildSite,'diagnostics.js?v=',"build-site.mjs");
requireText(vercel,'"outputDirectory": "dist"',"vercel.json");
requireText(vercel,'"Cache-Control"',"vercel.json");
requireText(vercel,'"ignoreCommand": "node scripts/vercel-ignore.mjs"',"vercel.json");
requireText(vercelIgnore,"src/data/discovery-queue.json","vercel-ignore.mjs");
requireText(vercelIgnore,"src/data/location-resolution-queue.json","vercel-ignore.mjs");
requireText(vercelIgnore,"src/data/coverage-dashboard.json","vercel-ignore.mjs");
requireText(vercelIgnore,"src/data/system-health.json","vercel-ignore.mjs");

if(failures.length){
  console.error("Locale delivery validation failed:");
  for(const failure of failures)console.error(" - "+failure);
  process.exit(1);
}
console.log("Locale delivery validation passed.");
