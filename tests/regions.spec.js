import {readFileSync} from "node:fs";
import {test,expect} from "@playwright/test";

const leaflet=readFileSync("node_modules/leaflet/dist/leaflet.js","utf8");
const sample=[{
 id:"vegas-test:thanksgiving-1",sourceId:"ticketmaster",regionId:"las-vegas",
 title:"Thanksgiving Strip Concert",category:"music",venue:"The Venetian",
 start:"2026-11-26T19:30:00-08:00",end:null,
 lat:36.1213,lng:-115.1697,locationPrecision:"source",
 source:"Ticketmaster",url:"https://www.ticketmaster.com/",lastVerified:"2026-11-06T12:00:00Z"
}];
const boot=async page=>{
 await page.addInitScript({content:leaflet});
 await page.route("**/src/data/events/las-vegas.json*",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(sample)}));
 const tile=route=>route.fulfill({status:200,contentType:"image/svg+xml",body:"<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'/>"});
 await page.route("https://tile.openstreetmap.org/**",tile);
 await page.route("https://*.tile.openstreetmap.fr/**",tile);
};

test("Vegas deep link loads Strip areas and date-filtered events",async({page})=>{
 await boot(page);
 await page.goto("./?region=las-vegas&from=2026-11-25&to=2026-11-28");
 await expect(page.locator("#regionSelect")).toHaveValue("las-vegas");
 await expect(page.locator("#placeLabel")).toHaveText("Las Vegas Strip, NV");
 await expect(page.locator(".area-option").first()).toBeVisible({timeout:15000});
 await expect(page.locator(".event-row")).toHaveCount(1,{timeout:15000});
 await expect(page.locator("#dateSummary")).toContainText("Nov 25");
 await expect(page.locator("#dateSummary")).toContainText("Nov 28");
 const href=new URL(page.url());
 expect(href.searchParams.get("region")).toBe("las-vegas");
 expect(href.searchParams.get("from")).toBe("2026-11-25");
});

test("city selector swaps region-scoped areas without cross-city leakage",async({page})=>{
 await boot(page);
 await page.goto("./?region=las-vegas&from=2026-11-25&to=2026-11-28");
 await expect(page.locator(".area-option").first()).toBeVisible({timeout:15000});
 await page.locator("#regionSelect").selectOption("san-diego");
 await expect(page.locator("#placeLabel")).toHaveText("San Diego, CA");
 await expect(page.locator(".area-option").first()).toBeVisible({timeout:15000});
 await expect(page.locator("#areaControls")).not.toContainText("Resorts World / Fontainebleau");
 await page.locator("#regionSelect").selectOption("las-vegas");
 await expect(page.locator("#placeLabel")).toHaveText("Las Vegas Strip, NV");
 await expect(page.locator(".event-row")).toHaveCount(1,{timeout:15000});
});
