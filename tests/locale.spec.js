import {readFileSync} from "node:fs";
import { test, expect } from "@playwright/test";

const leafletSource=readFileSync("node_modules/leaflet/dist/leaflet.js","utf8");
const mockLeaflet=async page=>{
  await page.addInitScript({content:leafletSource});
  await page.route("https://tile.openstreetmap.org/**",route=>route.abort());
  await page.route("https://*.tile.openstreetmap.fr/**",route=>route.abort());
  await page.route("https://server.arcgisonline.com/**",route=>route.abort());
};

const waitForLocale=async page=>{
  await mockLeaflet(page);
  await page.goto("./");
  await page.waitForSelector("#sidebar",{timeout:15000});
  await page.waitForFunction(()=>document.querySelector(".event-row")||document.querySelector(".empty"),null,{timeout:15000});
  if(!(await page.locator(".event-row").count())){
    const seven=page.locator('[data-window="7days"]');
    if(await seven.count())await seven.click();
  }
  await page.waitForSelector(".event-row",{timeout:15000});
  await page.waitForFunction(()=>window.L&&document.querySelector("#map")?.__localeMap,{timeout:15000});
  await expect(page.locator("#splash")).toBeHidden({timeout:5000});
};

test("critical Locale interactions",async({page})=>{
  await waitForLocale(page);

  const heart=page.locator("[data-save-event]").first();
  const id=await heart.getAttribute("data-save-event");
  const before=await heart.getAttribute("aria-pressed");
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed",before==="true"?"false":"true");
  await expect(heart).toHaveClass(before==="true"?/^(?!.*is-saved)/:/is-saved/);
  const visibleHeart=before==="true"?heart.locator(".heart-off"):heart.locator(".heart-on");
  await expect(visibleHeart).toBeVisible();
  await page.reload(); await page.waitForSelector(".event-row");
  await expect(page.locator(`[data-save-event="${id}"]`)).toHaveAttribute("aria-pressed",before==="true"?"false":"true");

  const style=page.locator("#mapStyle");
  const map=page.locator("#map");
  const tileTemplate=()=>map.getAttribute("data-map-tile-template");
  await style.selectOption("humanitarian");
  await expect(style).toHaveValue("humanitarian");
  await expect(map).toHaveAttribute("data-map-style","humanitarian");
  await expect.poll(tileTemplate).toContain("tile.openstreetmap.fr/hot");
  await style.selectOption("satellite");
  await expect(style).toHaveValue("satellite");
  await expect(map).toHaveAttribute("data-map-style","satellite");
  await expect.poll(tileTemplate).toContain("arcgisonline.com");
  await style.selectOption("standard");
  await expect(style).toHaveValue("standard");
  await expect(map).toHaveAttribute("data-map-style","standard");
  await expect.poll(tileTemplate).toContain("tile.openstreetmap.org");

  await page.locator(".event-row").first().click();
  await expect(page.locator(".event-row.selected")).toHaveCount(1);

  await page.locator("#resultsToggle").click();
  await expect(page.locator(".shell")).toHaveClass(/results-collapsed/);
  await page.locator("#resultsToggle").click();
  await expect(page.locator(".shell")).not.toHaveClass(/results-collapsed/);

  await page.locator("#discoveryToggle").click();
  await expect(page.locator(".shell")).toHaveClass(/discovery-collapsed/);
  await page.locator("#discoveryToggle").click();
  await expect(page.locator(".shell")).not.toHaveClass(/discovery-collapsed/);

  await page.locator('[data-window="7days"]').click();
  await expect(page.locator('[data-window="7days"]')).toHaveClass(/active|selected/);
  const cluster=page.locator(".event-stack").first();
  if(await cluster.count()){
    await cluster.click();
    await expect(page.locator("#clearVenueFilter")).toBeVisible();
    await page.locator("#map").evaluate(el=>el.dispatchEvent(new MouseEvent("click",{bubbles:true,clientX:innerWidth*.5,clientY:innerHeight*.4})));
    await expect(page.locator("#clearVenueFilter")).toHaveCount(0);
  }
});

test("production-critical controls exist and links are valid",async({page})=>{
  await waitForLocale(page);
  await expect(page.locator("#mapStyle")).toBeVisible();
  await expect(page.locator("#radius")).toBeVisible();
  await expect(page.locator("#useMapCenter")).toBeVisible();
  const hrefs=await page.locator(".event-action").evaluateAll(as=>as.map(a=>a.href));
  for(const href of hrefs.slice(0,20)) expect(href).toMatch(/^https?:\/\//);
});

test("canonical geography drives browser defaults",async({page})=>{
  await page.goto("./src/data/regions.js");
  const regions=await page.textContent("body");
  expect(regions).toContain('DEFAULT_REGION_ID="san-diego"');
  expect(regions).toContain('"chicago"');
  expect(regions).toContain('countryCode:"US"');

  await page.goto("./src/config.js");
  const config=await page.textContent("body");
  expect(config).toMatch(/from "\.\/data\/regions\.js(?:\?v=[^"]+)?";/);
  expect(config).not.toContain("32.7157");
});

test("canonical event contract is deployed",async({page})=>{
  await page.goto("./src/domain/event.js");
  const body=await page.textContent("body");
  expect(body).toContain("EVENT_CONTRACT_VERSION=1");
  expect(body).toContain("canonicalEventId");
  expect(body).toContain("sources:");
});

test("event list remains usable when map library fails",async({page})=>{
  await page.route("https://cdn.jsdelivr.net/**",route=>route.abort());
  await page.route("https://unpkg.com/**",route=>route.abort());
  await page.goto("./");
  await page.waitForSelector("#sidebar",{timeout:15000});
  await page.waitForFunction(()=>document.querySelector(".event-row")||document.querySelector(".empty"),null,{timeout:15000});
  await expect(page.locator("#sidebar")).toBeVisible();
  await expect(page.locator("#map .map-error")).toBeVisible({timeout:5000});
});


test("static bootstrap remains visible if the application module cannot load",async({page})=>{
  await page.route("**/src/app.js*",route=>route.abort());
  await page.goto("./");
  await expect(page.locator("#localeBoot")).toBeVisible();
  await expect(page.locator("#localeBoot span")).toContainText("could not finish loading",{timeout:6000});
  await expect(page.locator("#localeBoot button")).toBeVisible();
});


test("event groups fully expand at street-level zoom",async({page})=>{
  await waitForLocale(page);
  await page.locator('[data-window="7days"]').click();
  const map=page.locator("#map");
  await map.evaluate(el=>el.__localeMap.setZoom(17,{animate:false}));
  await expect.poll(async()=>Number(await map.getAttribute("data-map-zoom")||0),{timeout:3000}).toBeGreaterThanOrEqual(17);
  await expect.poll(async()=>page.locator(".event-stack").count(),{timeout:5000}).toBe(0);
  await expect(page.locator(".event-pin").first()).toBeVisible();
});


test("approximate event locations do not masquerade as exact distances",async({page})=>{
  await page.goto("./");
  const result=await page.evaluate(async()=>{
    const {filterEvents,hasPreciseLocation}=await import("./src/services/events.js");
    const now=new Date();
    const start=new Date(now.getTime()+60*60*1000).toISOString();
    const base={id:"test",title:"Approximate event",venue:"San Diego, CA",category:"community",start,lat:32.7157,lng:-117.1611};
    const approximate={...base,locationPrecision:"city-only"};
    const exact={...base,id:"exact",locationPrecision:"venue-geocoded"};
    const state={center:{lat:32.7157,lng:-117.1611},radius:15,category:"all",window:"7days"};
    const filtered=filterEvents([approximate,exact],state);
    return {
      approximatePrecise:hasPreciseLocation(approximate),
      exactPrecise:hasPreciseLocation(exact),
      approximateDistance:filtered.find(event=>event.id==="test")?.distance,
      exactDistance:filtered.find(event=>event.id==="exact")?.distance
    };
  });
  expect(result.approximatePrecise).toBe(false);
  expect(result.exactPrecise).toBe(true);
  expect(result.approximateDistance).toBeNull();
  expect(result.exactDistance).toBe(0);
});


test("production smoke @smoke",async({page})=>{
  await page.goto("./");
  await page.waitForSelector("#sidebar",{timeout:15000});
  await page.waitForFunction(()=>document.querySelector(".event-row")||document.querySelector(".empty"),null,{timeout:15000});
  await expect(page.locator("#sidebar")).toBeVisible();
  await expect(page.locator("#sidebar .cards")).toBeVisible();
  const rows=page.locator(".event-row");
  if(await rows.count()){
    const href=await rows.first().locator(".event-action").getAttribute("href");
    expect(href).toMatch(/^https?:\/\//);
  }
});
