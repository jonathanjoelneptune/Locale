import {readFile} from "node:fs/promises";

const dashboard=JSON.parse(await readFile("src/data/coverage-dashboard.json","utf8"));
const strict=process.argv.includes("--strict")||process.env.LOCALE_COVERAGE_STRICT==="1";
let gaps=0,measured=0;

for(const [regionId,region] of Object.entries(dashboard.regions||{})){
  const rows=region.coverageAreas||region.neighborhoods||[];
  if(!rows.length)continue;
  console.log(`\n${region.name||regionId} area coverage:`);
  for(const row of rows){
    measured++;
    const pass=!!row.acceptance?.pass;
    if(!pass)gaps++;
    console.log(
      ` ${pass?"PASS":"GAP "}  ${row.name.padEnd(18)} `+
      `Fri/Sat avg ${String(row.fridaySaturdayNightAverage).padStart(4)} / ${row.targets.fridaySaturdayNightAverage}, `+
      `recurring ${String(row.recurringLocalOccurrences30d).padStart(3)} / ${row.targets.recurringLocalOccurrences30d}, `+
      `${row.uniqueVenuesNext28d} venues`
    );
  }
}
console.log(`\nArea acceptance: ${measured-gaps}/${measured} passing.`);
if(strict&&gaps){
  console.error(`${gaps} area coverage target${gaps===1?"":"s"} not met.`);
  process.exit(1);
}
