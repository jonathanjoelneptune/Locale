import {execFileSync} from "node:child_process";

const previous=process.env.VERCEL_GIT_PREVIOUS_SHA;
if(!previous){
  console.log("No previous Vercel SHA; build required.");
  process.exit(1);
}

let files=[];
try{
  files=execFileSync("git",["diff","--name-only",previous,"HEAD"],{encoding:"utf8"})
    .split("\n").map(value=>value.trim()).filter(Boolean);
}catch{
  console.log("Could not calculate Vercel diff; build required.");
  process.exit(1);
}

const backgroundOnly=new Set([
  "src/data/discovery-queue.json",
  "src/data/discovered-sources.json",
  "src/data/discovery-state.json",
  "src/data/discovery-coverage.json",
  "src/data/discovery-live.json",
  "src/data/location-resolution-queue.json",
  "src/data/location-resolution-coverage.json",
  "src/data/venue-geocode-cache.json",
  "src/data/coverage-dashboard.json"
]);

if(files.length&&files.every(file=>backgroundOnly.has(file))){
  console.log("Only background discovery/location diagnostics changed; skip Vercel build.");
  process.exit(0);
}

console.log("Production-relevant files changed; build required.");
process.exit(1);
