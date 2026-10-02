import {buildCoverageDashboard} from "./build-coverage-dashboard.mjs";
import {buildDiscoveryLive} from "./build-discovery-live.mjs";
import {buildSystemHealth} from "./build-system-health.mjs";

await buildCoverageDashboard();
await buildDiscoveryLive();
await buildSystemHealth();
console.log("Locale derived state reconciled.");
