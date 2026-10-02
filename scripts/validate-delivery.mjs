import {readFile} from "node:fs/promises";

const [pages,refresh,provider,index,buildSite,vercel]=await Promise.all([
  readFile(".github/workflows/pages.yml","utf8"),
  readFile(".github/workflows/refresh-events.yml","utf8"),
  readFile("src/providers/local.js","utf8"),
  readFile("index.html","utf8"),
  readFile("scripts/build-site.mjs","utf8"),
  readFile("vercel.json","utf8")
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

forbidText(refresh,"gh workflow run pages.yml","refresh-events.yml");
forbidText(refresh,"actions: write","refresh-events.yml");

requireText(provider,"raw.githubusercontent.com/jonathanjoelneptune/Locale/main/src/data/events.json","local provider");
requireText(provider,'const BUNDLED_EVENTS="./src/data/events.json"',"local provider");
requireText(provider,"for(const [url,timeout] of sources)","local provider");

requireText(index,'id="localeBoot"',"index.html");
requireText(index,'name="locale-shell" content="1"',"index.html");
requireText(index,"<noscript>","index.html");

requireText(pages,"Verify document shell stays available","pages.yml");
requireText(pages,"node scripts/build-site.mjs","pages.yml");
requireText(buildSite,'await writeFile(`${outDir}/404.html`,html)',"build-site.mjs");
requireText(buildSite,'await cp("diagnostics.html"', "build-site.mjs");
requireText(buildSite,'diagnostics.js?v=',"build-site.mjs");
requireText(vercel,'"outputDirectory": "dist"',"vercel.json");
requireText(vercel,'"Cache-Control"',"vercel.json");
requireText(vercel,'"ignoreCommand"',"vercel.json");
requireText(vercel,"src/data/discovery-queue.json","vercel.json");
requireText(vercel,"src/data/location-resolution-queue.json","vercel.json");
requireText(vercel,"src/data/coverage-dashboard.json","vercel.json");

if(failures.length){
  console.error("Locale delivery validation failed:");
  for(const failure of failures)console.error(" - "+failure);
  process.exit(1);
}
console.log("Locale delivery validation passed.");
