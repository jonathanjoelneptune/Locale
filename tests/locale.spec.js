import {readFileSync} from "node:fs";
import { test, expect } from "@playwright/test";

const leafletSource=readFileSync("node_modules/leaflet/dist/leaflet.js","utf8");
const configuredCoverageAreas=JSON.parse(readFileSync("src/data/coverage-zones.json","utf8"));
const configuredSanDiegoAreaCount=configuredCoverageAreas.filter(area=>area.regionId==="san-diego").length;
const mockLeaflet=async page=>{
  await page.addInitScript({content:leafletSource});
  const tile=(route,label,color)=>route.fulfill({
    status:200,
    contentType:"image/svg+xml",
    body:`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="${color}"/><text x="16" y="32" font-size="18" fill="white">${label}</text></svg>`
  });
  await page.route("https://tile.openstreetmap.org/**",route=>tile(route,"standard","#758b94"));
  await page.route("https://*.tile.openstreetmap.fr/**",route=>tile(route,"humanitarian","#b77a63"));
  await page.route("https://server.arcgisonline.com/**",route=>tile(route,"satellite","#354b3d"));
};

const addDaysKey=(key,days)=>{
  const [year,month,day]=key.split("-").map(Number);
  const date=new Date(year,month-1,day+days);
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");
};

const selectNext7Days=async page=>{
  await page.locator("#dateModeRange").click();
  await page.locator("#dateSummary").click();
  const start=await page.locator(".calendar-day.selected").first().getAttribute("data-date");
  const end=addDaysKey(start,6);
  await page.locator(`[data-date="${start}"]`).first().click();
  await page.locator(`[data-date="${end}"]`).first().click();
};

const waitForLocale=async page=>{
  await mockLeaflet(page);
  await page.goto("./");
  await page.waitForSelector("#sidebar",{timeout:15000});
  await page.waitForFunction(()=>document.querySelector(".event-row")||document.querySelector(".empty"),null,{timeout:15000});
  if(!(await page.locator(".event-row").count()))await selectNext7Days(page);
  await page.waitForSelector(".event-row",{timeout:15000});
  await page.waitForFunction(()=>window.L&&document.querySelector("#map")?.__localeMap,{timeout:15000});
  await expect(page.locator("#splash")).toBeHidden({timeout:5000});
};

test("critical Locale interactions",async({page})=>{
  await waitForLocale(page);

  const heart=page.locator("[data-save-event]").first();
  const id=await heart.getAttribute("data-save-event");
  const before=await heart.getAttribute("aria-pressed");
  const beforeHeartImage=await heart.screenshot();
  await heart.click();
  const updatedHeart=page.locator(`[data-save-event="${id}"]`);
  const expectedSaved=before!=="true";
  await expect(updatedHeart).toHaveAttribute("aria-pressed",String(expectedSaved));
  await expect(updatedHeart.locator(".save-heart")).toHaveText(expectedSaved?"♥":"♡");
  const afterHeartImage=await updatedHeart.screenshot();
  expect(Buffer.compare(beforeHeartImage,afterHeartImage)).not.toBe(0);

  await page.reload();
  await page.waitForSelector(".event-row");
  const persistedHeart=page.locator(`[data-save-event="${id}"]`);
  await expect(persistedHeart).toHaveAttribute("aria-pressed",String(expectedSaved));
  await expect(persistedHeart.locator(".save-heart")).toHaveText(expectedSaved?"♥":"♡");

  const style=page.locator("#mapStyle");
  const map=page.locator("#map");
  const basemapUrls=()=>map.evaluate(el=>{
    const urls=[];
    el.__localeMap.eachLayer(layer=>{if(layer?.options?.localeBasemap)urls.push(layer._url)});
    return urls;
  });
  const visibleTileSrc=()=>page.locator(".leaflet-tile-pane img.leaflet-tile").first().getAttribute("src");

  await style.selectOption("humanitarian");
  await expect(style).toHaveValue("humanitarian");
  await expect(map).toHaveAttribute("data-map-style","humanitarian");
  await expect.poll(basemapUrls).toEqual(["https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"]);
  await expect.poll(visibleTileSrc,{timeout:5000}).toContain("tile.openstreetmap.fr/hot");

  await style.selectOption("satellite");
  await expect(style).toHaveValue("satellite");
  await expect(map).toHaveAttribute("data-map-style","satellite");
  await expect.poll(basemapUrls).toEqual(["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"]);
  await expect.poll(visibleTileSrc,{timeout:5000}).toContain("arcgisonline.com");

  await style.selectOption("standard");
  await expect(style).toHaveValue("standard");
  await expect(map).toHaveAttribute("data-map-style","standard");
  await expect.poll(basemapUrls).toEqual(["https://tile.openstreetmap.org/{z}/{x}/{y}.png"]);
  await expect.poll(visibleTileSrc,{timeout:5000}).toContain("tile.openstreetmap.org");

  await page.locator(".event-row").first().click();
  await expect(page.locator(".event-row.selected")).toHaveCount(1);

  await page.locator("#resultsToggle").click();
  await expect(page.locator(".shell")).toHaveClass(/results-collapsed/);
  await page.locator("#resultsToggle").click();
  await expect(page.locator(".shell")).not.toHaveClass(/results-collapsed/);

  const dateBefore=await page.locator("#dateSummary span").textContent();
  await page.locator('[data-date-shift="1"]').click();
  await expect(page.locator("#dateSummary span")).not.toHaveText(dateBefore);
  await page.locator('[data-date-shift="-1"]').click();
  await selectNext7Days(page);
  await expect(page.locator("#dateModeRange")).toHaveClass(/active/);
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

test("application shell survives event snapshot failure",async({page})=>{
  await mockLeaflet(page);
  await page.route("**/src/data/events.json*",route=>route.abort());
  await page.goto("./");
  await page.waitForSelector("#sidebar",{timeout:15000});
  await expect(page.locator(".shell")).toBeVisible();
  await expect(page.locator("#splash")).toBeHidden({timeout:6000});
  await expect(page.locator("#sidebar")).toBeVisible();
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


test("zoom regrouping records an animated cluster transition",async({page})=>{
  await waitForLocale(page);
  await selectNext7Days(page);
  const map=page.locator("#map");
  const before=Number(await map.getAttribute("data-cluster-motion-count")||0);
  await map.evaluate(el=>el.__localeMap.setZoom(Math.max(8,el.__localeMap.getZoom()-2),{animate:false}));
  await expect.poll(async()=>Number(await map.getAttribute("data-cluster-motion-count")||0),{timeout:1500}).toBeGreaterThan(before);
});

test("event groups fully expand at street-level zoom",async({page})=>{
  await waitForLocale(page);
  await selectNext7Days(page);
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


test("save and basemap controls keep the simple architecture",async({page})=>{
  const appSource=await (await page.request.get("./src/app.js")).text();
  const mapSource=await (await page.request.get("./src/components/map.js")).text();
  const cardSource=await (await page.request.get("./src/components/eventCard.js")).text();
  const cssSource=await (await page.request.get("./styles/app.css")).text();

  expect(appSource).toContain("renderSidebarFromState");
  expect(appSource).toContain("DateControls(state)");
  expect(appSource).toContain("hoverEvent(row.dataset.eventId,true)");
  expect(appSource).toContain('id="resultsToggle"');
  expect(appSource).toContain('id="discoveryToggle"');
  expect(appSource).toContain("discovery-left");
  expect(appSource).toContain("event-right");
  expect(appSource).toContain("results-right");
  expect(appSource).toContain("event-filters");
  expect(appSource).toContain("results-collapsed");
  expect(appSource).toContain("discovery-collapsed");
  expect(appSource).not.toContain("unified-panel");
  expect(appSource).not.toContain("railToggle");
  expect(appSource).not.toContain("syncSaveButton");
  expect(appSource).not.toContain("toggleSaved(");

  expect(mapSource).toContain("base.setUrl(styles[name])");
  expect(mapSource).not.toContain("baseLayers");
  expect(mapSource).not.toContain("locale-basemap-");

  expect(cardSource).toContain('class="save-heart"');
  expect(cardSource).not.toContain("heart-glyph");
  expect(cssSource).not.toContain("heart-glyph");
  expect(cssSource).not.toContain("heart-on");
  expect(cssSource).not.toContain("heart-off");
  expect(cssSource).toContain("transform:rotate(-45deg) scale(1.34)");
  expect(cssSource).toContain(".quick-date-presets");
});

test("production smoke @smoke",async({page})=>{
  await page.goto("./");
  await page.waitForSelector("#sidebar",{timeout:15000});
  await page.waitForFunction(()=>document.querySelector(".event-row")||document.querySelector(".empty"),null,{timeout:15000});
  await expect(page.locator("#sidebar")).toBeVisible();
  await expect(page.locator("#sidebar .cards")).toBeVisible();

  const rows=page.locator(".event-row");
  if(await rows.count()){
    const firstRow=rows.first();
    const href=await firstRow.locator(".event-action").getAttribute("href");
    expect(href).toMatch(/^https?:\/\//);

    const heart=firstRow.locator("[data-save-event]");
    const id=await heart.getAttribute("data-save-event");
    const before=await heart.getAttribute("aria-pressed");
    await heart.click();
    const updated=page.locator(`[data-save-event="${id}"]`);
    await expect(updated.locator(".save-heart")).toHaveText(before==="true"?"♡":"♥");
  }

  await page.waitForFunction(()=>window.L&&document.querySelector("#map")?.__localeMap,{timeout:15000});
  const style=page.locator("#mapStyle");
  await style.selectOption("satellite");
  const urls=await page.locator("#map").evaluate(el=>{
    const result=[];
    el.__localeMap.eachLayer(layer=>{if(layer?.options?.localeBasemap)result.push(layer._url)});
    return result;
  });
  expect(urls).toEqual(["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"]);
});


test("manual map navigation scopes results to the visible viewport",async({page})=>{
  await waitForLocale(page);
  await selectNext7Days(page);
  await expect(page.locator(".results-head h1")).toContainText("Events Nearby");

  const map=page.locator("#map");
  const before=await page.locator(".event-row").count();
  await map.dispatchEvent("wheel");
  await map.evaluate(el=>{
    const current=el.__localeMap.getZoom();
    el.__localeMap.setZoom(Math.min(current+1,17),{animate:false});
  });

  await expect(page.locator("#showAllNearby")).toBeVisible({timeout:5000});
  await expect(page.locator(".results-head h1")).toContainText("Events in Map View");
  await expect(page.locator(".results-head p")).toContainText("Current visible map area");

  const inView=await page.locator(".event-row").count();
  expect(inView).toBeLessThanOrEqual(before);

  await page.locator("#showAllNearby").click();
  await expect(page.locator("#showAllNearby")).toHaveCount(0);
  await expect(page.locator(".results-head h1")).toContainText("Events Nearby");
  await expect.poll(async()=>page.locator(".event-row").count()).toBe(before);
});


test("event rail stays compact and highlights remain well formed when collapsed",async({page})=>{
  await waitForLocale(page);
  await selectNext7Days(page);

  const firstRow=page.locator(".event-row").first();
  await expect(firstRow).toBeVisible();
  const rowBox=await firstRow.boundingBox();
  expect(rowBox?.height||999).toBeLessThanOrEqual(64);

  await page.locator("#resultsToggle").click();
  await expect(page.locator(".shell")).toHaveClass(/results-collapsed/);

  const highlight=page.locator(".highlight-card").first();
  if(await highlight.count()){
    const box=await highlight.boundingBox();
    expect(box?.width||0).toBeGreaterThanOrEqual(200);
    expect(box?.height||0).toBeGreaterThanOrEqual(60);
    await expect(highlight.locator(".highlight-copy")).toBeVisible();
  }
});


test("premium event surfaces keep dense cards and intentional fallbacks",async({page})=>{
  await waitForLocale(page);
  await selectNext7Days(page);

  const row=page.locator(".event-row").first();
  await expect(row).toHaveClass(/event-surface/);
  const rowBox=await row.boundingBox();
  expect(rowBox?.height||999).toBeLessThanOrEqual(68);

  const fallback=page.locator(".event-thumb.is-fallback").first();
  if(await fallback.count()){
    await expect(fallback.locator(".category-art-symbol")).toBeVisible();
    await expect(fallback.locator("small")).toBeVisible();
  }

  await page.locator("#resultsToggle").click();
  const highlight=page.locator(".highlight-card").first();
  if(await highlight.count()){
    await expect(highlight).toHaveClass(/event-surface/);
    const box=await highlight.boundingBox();
    expect(box?.width||999).toBeLessThanOrEqual(225);
  }

  const mapSource=await (await page.request.get("./src/components/map.js")).text();
  expect(mapSource).toContain("event-map-popup popup-");
  expect(mapSource).toContain('e.image?"has-image":"no-image"');
  expect(mapSource).toContain('category-art-symbol');
});


test("dual rails keep search left and event filters with events right",async({page})=>{
  await waitForLocale(page);
  await expect(page.locator(".discovery-left")).toBeVisible();
  await expect(page.locator(".event-right")).toBeVisible();
  await expect(page.locator(".results-right")).toBeVisible();

  const discoveryBox=await page.locator(".discovery-left").boundingBox();
  const mapBox=await page.locator(".map-stage").boundingBox();
  const eventsBox=await page.locator(".event-right").boundingBox();
  expect(discoveryBox.x).toBeLessThan(mapBox.x);
  expect(eventsBox.x).toBeGreaterThan(mapBox.x);

  await expect(page.locator(".event-right .category-pill")).toHaveCount(10);
  await expect(page.locator(".discovery-left .category-pill")).toHaveCount(0);
  const categoriesBox=await page.locator(".event-right .category-pills").boundingBox();
  expect(categoriesBox.height).toBeLessThanOrEqual(60);

  const initial=await page.locator("#dateSummary span").textContent();
  await page.locator('[data-date-shift="1"]').click();
  await expect(page.locator("#dateSummary span")).not.toHaveText(initial);
  await page.locator('[data-date-shift="-1"]').click();

  await selectNext7Days(page);
  await expect(page.locator("#dateModeRange")).toHaveClass(/active/);

  await page.locator("#discoveryToggle").click();
  await expect(page.locator(".shell")).toHaveClass(/discovery-collapsed/);
  await expect(page.locator(".event-right")).toBeVisible();
  await page.locator("#discoveryToggle").click();
  await expect(page.locator(".shell")).not.toHaveClass(/discovery-collapsed/);

  const music=page.locator('[data-category="music"]');
  await music.click();
  await expect(music).toHaveAttribute("aria-pressed","true");
  const visibleCategories=await page.locator(".event-badge").allTextContents();
  expect(visibleCategories.every(value=>value.trim().toLowerCase()==="music")).toBe(true);
  await page.locator("#clearCategory").click();

  const highlights=page.locator(".compact-highlights");
  if(await highlights.count()){
    const box=await highlights.boundingBox();
    expect(box.height).toBeLessThanOrEqual(130);
    await expect(highlights.locator(".highlight-title-row")).toBeVisible();
  }
});

test("quick date shortcuts coexist with explicit calendar controls",async({page})=>{
  await waitForLocale(page);
  const presets=page.locator("[data-date-preset]");
  await expect(presets).toHaveCount(7);

  await page.locator('[data-date-preset="tonight"]').click();
  await expect(page.locator('[data-date-preset="tonight"]')).toHaveClass(/active/);

  await page.locator('[data-date-preset="tomorrow"]').click();
  await expect(page.locator('[data-date-preset="tomorrow"]')).toHaveClass(/active/);

  await page.locator('[data-date-preset="weekend"]').click();
  await expect(page.locator("#dateModeRange")).toHaveClass(/active/);

  await page.locator("#dateSummary").click();
  await expect(page.locator(".calendar-popover")).toHaveClass(/open/);
  const selected=page.locator(".calendar-day.selected").first();
  await selected.click();
  await expect(page.locator('[data-date-preset].active')).toHaveCount(0);
});

test("hovering an event row pulses its map marker",async({page})=>{
  await waitForLocale(page);
  const row=page.locator('.event-row[data-mappable="true"]').first();
  await expect(row).toBeVisible();
  await row.hover();
  await expect(page.locator(".event-pin.hover-pulse")).toHaveCount(1);
  await page.locator(".results-head").hover();
  await expect(page.locator(".event-pin.hover-pulse")).toHaveCount(0);
});

test("heart visibly changes immediately without changing tabs",async({page})=>{
  await waitForLocale(page);
  const heart=page.locator("[data-save-event]").first();
  const id=await heart.getAttribute("data-save-event");
  const before=await heart.getAttribute("aria-pressed");
  const beforeImage=await heart.screenshot();

  await heart.click();

  const updated=page.locator(`[data-save-event="${id}"]`);
  const expectedSaved=before!=="true";
  await expect(updated).toHaveAttribute("aria-pressed",String(expectedSaved));
  await expect(updated.locator(".save-heart")).toHaveText(expectedSaved?"♥":"♡");
  await expect(updated.locator(".save-heart")).toBeVisible();

  const afterImage=await updated.screenshot();
  expect(Buffer.compare(beforeImage,afterImage)).not.toBe(0);
});

test("map style changes one visible Leaflet tile layer",async({page})=>{
  await waitForLocale(page);
  const style=page.locator("#mapStyle");
  const map=page.locator("#map");
  const layerState=()=>map.evaluate(el=>{
    const layers=[];
    el.__localeMap.eachLayer(layer=>{
      if(layer?.options?.localeBasemap)layers.push({url:layer._url});
    });
    return layers;
  });
  const visibleTiles=()=>page.locator(".leaflet-tile-pane img.leaflet-tile");
  const standardImage=await map.screenshot();

  await style.selectOption("satellite");
  await expect.poll(layerState).toEqual([{url:"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"}]);
  await expect.poll(async()=>visibleTiles().evaluateAll(imgs=>imgs.length>0&&imgs.every(img=>img.src.includes("arcgisonline.com"))),{timeout:5000}).toBe(true);
  const satelliteImage=await map.screenshot();
  expect(Buffer.compare(standardImage,satelliteImage)).not.toBe(0);

  await style.selectOption("humanitarian");
  await expect.poll(layerState).toEqual([{url:"https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"}]);
  await expect.poll(async()=>visibleTiles().evaluateAll(imgs=>imgs.length>0&&imgs.every(img=>img.src.includes("tile.openstreetmap.fr/hot"))),{timeout:5000}).toBe(true);
  const humanitarianImage=await map.screenshot();
  expect(Buffer.compare(satelliteImage,humanitarianImage)).not.toBe(0);
});


test("coverage diagnostics renders comprehensive area and discovery metrics",async({page})=>{
  await page.goto("./diagnostics.html");
  await expect(page.locator("h1")).toHaveText("Operations & Coverage Diagnostics");
  await expect(page.locator("#regionSelect option")).toHaveCount(2);
  await expect(page.locator("#summaryCards .summary-card")).toHaveCount(6);
  await page.locator("#regionSelect").selectOption("san-diego");
  await expect(page.locator("#neighborhoodRows tr")).toHaveCount(configuredSanDiegoAreaCount);
  await expect(page.locator("#areaGroupSelect option").first()).toHaveText("All areas");
  await expect(page.locator("#areaGroupSelect option")).toHaveCount(10);
  await expect(page.locator("#discoveryFunnel .metric-row")).toHaveCount(10);
});


test("diagnostics exposes live discovery operations console",async({page})=>{
  await page.goto("./diagnostics.html");
  await expect(page.locator("#summaryCards .summary-card")).toHaveCount(6,{timeout:10000});
  await expect(page.locator("#workerStatus")).toContainText("No live Actions status available");
  await expect(page.locator("#adaptiveControl")).toContainText(/BOOTSTRAP|ACCELERATED|CONVERGENCE|MAINTENANCE|UNMEASURED/i);
  await expect(page.locator("#systemHealth")).toContainText(/HEALTHY|STALE|System health/i);
  await expect(page.locator("#queueThroughput")).toContainText("Candidates");
  await expect(page.locator("#latestRun")).toContainText("Probed");
  await expect(page.locator("#overpassHealth")).toBeVisible();
  await expect(page.locator("#probeRows")).toBeVisible();
  await expect(page.locator("#runHistoryRows")).toBeVisible();
  await expect(page.locator("#areaSweepRows")).toBeVisible();
  await expect(page.locator("#cellRows")).toBeVisible();
  await expect(page.locator("#neighborhoodRows tr")).toHaveCount(configuredSanDiegoAreaCount);
});


test("area geometry is reusable, land-aware, and independent of Leaflet",async({page})=>{
  await page.goto("./");
  const result=await page.evaluate(async()=>{
    const data=await import("./src/data/areaGeometry.js");
    const service=await import("./src/services/areas.js");
    const collection=await data.loadAreaGeometry({regionId:"san-diego"});
    const northPark=collection.features.find(feature=>feature.properties.id==="north-park");
    const coronado=collection.features.find(feature=>feature.properties.id==="coronado");
    const index=service.createAreaSpatialIndex(collection);
    const northParkMemberships=index.areasForPoint(northPark.properties.labelPoint).map(feature=>feature.properties.id);
    const oceanMemberships=index.areasForPoint({lat:32.80,lng:-117.36}).map(feature=>feature.properties.id);
    const coronadoNorth=index.areasForPoint({lat:32.699,lng:-117.205}).map(feature=>feature.properties.id);
    const coronadoCore=index.areasForPoint({lat:32.6859,lng:-117.1831}).map(feature=>feature.properties.id);
    return {
      schemaVersion:collection.schemaVersion,
      count:collection.features.length,
      northParkGeometry:northPark.geometry.type,
      northParkSource:northPark.properties.geometrySource,
      northParkFound:northParkMemberships.includes("north-park"),
      coronadoSource:coronado.properties.geometrySource,
      oceanMemberships,
      coronadoNorth,
      coronadoCore,
      waterClipping:collection.geometryPolicy.waterClipping
    };
  });
  expect(result.schemaVersion).toBe(3);
  expect(result.count).toBe(configuredSanDiegoAreaCount);
  expect(["Polygon","MultiPolygon"]).toContain(result.northParkGeometry);
  expect(result.northParkSource).toBe("land-clipped-voronoi");
  expect(result.northParkFound).toBe(true);
  expect(result.coronadoSource).toContain("Coronado");
  expect(result.oceanMemberships).toEqual([]);
  expect(result.coronadoNorth).toContain("coronado");
  expect(result.coronadoCore).toContain("coronado");
  expect(result.waterClipping).toContain("land mask");

  const mapSource=await (await page.request.get("./src/components/map.js")).text();
  const dataSource=await (await page.request.get("./src/data/areaGeometry.js")).text();
  const regionSource=await (await page.request.get("./src/data/areaGeometryRegions.js")).text();
  const polygonSource=await (await page.request.get("./src/services/polygonGeometry.js")).text();
  const serviceSource=await (await page.request.get("./src/services/areas.js")).text();
  expect(mapSource).not.toContain("coverage-zones.json");
  expect(mapSource).not.toContain("geography-catalog.json");
  expect(dataSource).toContain("applyRegionalConstraints");
  expect(regionSource).toContain("landMask");
  expect(regionSource).toContain("coronado");
  expect(polygonSource).toContain("intersectPolygonRings");
  expect(polygonSource).toContain("subtractPolygonRing");
  expect(serviceSource).toContain("createAreaSpatialIndex");
  expect(serviceSource).toContain("pointInArea");
});

test("users can multi-select areas and see the same scope on the map and results",async({page})=>{
  await waitForLocale(page);
  await expect(page.locator("#areaSearch")).toBeVisible();

  await page.locator("#areaSearch").fill("North Park");
  await page.locator('[data-area-id="north-park"]').click();

  await expect(page.locator(".radius-panel")).toHaveClass(/area-mode/);
  await expect(page.locator("#clearAreaSelectionMap")).toBeVisible();
  await expect(page.locator("#map")).toHaveAttribute("data-selected-area-count","1");
  await expect(page.locator(".selected-area-boundary")).toHaveCount(1);
  await expect(page.locator('.area-chip[data-remove-area="north-park"]')).toBeVisible();
  await expect(page.locator(".area-result-bar")).toContainText("North Park");
  await expect(page.locator(".results-head h1")).toContainText("Events in Selected Areas");

  await page.locator("#areaSearch").fill("Hillcrest");
  await page.locator('[data-area-id="hillcrest"]').click();

  await expect(page.locator("#map")).toHaveAttribute("data-selected-area-count","2");
  await expect(page.locator(".selected-area-boundary")).toHaveCount(2);
  await expect(page.locator('.area-chip[data-remove-area="north-park"]')).toBeVisible();
  await expect(page.locator('.area-chip[data-remove-area="hillcrest"]')).toBeVisible();
  await expect(page.locator(".area-result-bar")).toContainText("North Park");
  await expect(page.locator(".area-result-bar")).toContainText("Hillcrest");

  await page.locator("#clearAreaSelectionMap").click();
  await expect(page.locator("#map")).toHaveAttribute("data-selected-area-count","0");
  await expect(page.locator(".radius-panel")).not.toHaveClass(/area-mode/);
  await expect(page.locator("#clearAreaSelectionMap")).toBeHidden();
});

test("clicking a visible neighborhood label on the map selects and focuses that area",async({page})=>{
  await waitForLocale(page);
  const map=page.locator("#map");
  await map.evaluate(el=>el.__localeMap.setView([32.7475,-117.1297],12,{animate:false}));
  const label=page.locator(".area-map-label").first();
  await expect(label).toBeVisible({timeout:5000});
  const id=await label.getAttribute("data-area-label");
  expect(id).toBeTruthy();
  // Event pins intentionally have pointer priority when they overlap an area label.
  // Dispatch directly to the rendered label to verify its selection/focus handler independently.
  await label.dispatchEvent("click");
  await expect(map).toHaveAttribute("data-selected-area-count","1");
  await expect(page.locator(`.area-chip[data-remove-area="${id}"]`)).toBeVisible();
});


test("neighborhood polygons stay land-aware and labels read as map typography",async({page})=>{
  await waitForLocale(page);
  const layout=await page.evaluate(()=>{
    const date=document.querySelector("#dateControls");
    const areas=document.querySelector("#areaControls");
    const label=document.querySelector(".area-map-label");
    const style=label?getComputedStyle(label):null;
    return {
      dateBeforeAreas:!!(date.compareDocumentPosition(areas)&Node.DOCUMENT_POSITION_FOLLOWING),
      boundaryCount:Number(document.querySelector("#map")?.dataset.areaBoundaryCount||0),
      labelCount:Number(document.querySelector("#map")?.dataset.areaLabelCount||0),
      labelBackground:style?.backgroundColor||"",
      labelBorderWidth:style?.borderTopWidth||"",
      labelTransform:style?.textTransform||""
    };
  });
  expect(layout.dateBeforeAreas).toBe(true);
  expect(layout.boundaryCount).toBeGreaterThan(0);
  expect(layout.labelCount).toBeLessThanOrEqual(layout.boundaryCount);
  expect(layout.labelBackground).toBe("rgba(0, 0, 0, 0)");
  expect(layout.labelBorderWidth).toBe("0px");
  expect(layout.labelTransform).toBe("uppercase");

  const source=await (await page.request.get("./src/data/areaGeometry.js")).text();
  const mapSource=await (await page.request.get("./src/components/map.js")).text();
  const css=await (await page.request.get("./styles/app.css")).text();
  expect(source).toContain("land-clipped-voronoi");
  expect(source).toContain("clipHalfPlane");
  expect(source).not.toContain("circlePolygon");
  expect(mapSource).toContain("AREA_COLORS");
  expect(mapSource).toContain("occupied.some");
  expect(css).toContain("text-transform:uppercase");
  expect(css).toContain("text-shadow:-1px -1px");
});


test("Design System v1 tokens and hierarchy are active",async({page})=>{
  await page.setViewportSize({width:1600,height:900});
  await waitForLocale(page);
  await expect(page.locator(".shell")).toHaveClass(/ds-v1/);

  const tokenSource=await (await page.request.get("./styles/base.css")).text();
  expect(tokenSource).toContain("--surface-1");
  expect(tokenSource).toContain("--border-subtle");
  expect(tokenSource).toContain("--radius-md");
  expect(tokenSource).toContain("--motion-base");
  expect(tokenSource).toContain("prefers-reduced-motion");

  const geometry=await page.evaluate(()=>{
    const box=selector=>document.querySelector(selector)?.getBoundingClientRect();
    const discovery=box(".discovery-left");
    const map=box(".map-stage");
    const events=box(".event-right");
    const row=document.querySelector(".event-row");
    const rowStyle=row?getComputedStyle(row):null;
    return {
      discoveryWidth:discovery?.width||0,
      mapWidth:map?.width||0,
      eventWidth:events?.width||0,
      rowRadius:rowStyle?.borderRadius||"",
      rowHeight:row?.getBoundingClientRect().height||0
    };
  });
  expect(geometry.mapWidth).toBeGreaterThan(geometry.discoveryWidth);
  expect(geometry.mapWidth).toBeGreaterThan(geometry.eventWidth);
  if(geometry.rowHeight){
    expect(geometry.rowHeight).toBeLessThanOrEqual(64);
    expect(geometry.rowRadius).not.toBe("0px");
  }
});

test("event selection persists across rail renders and focuses the map",async({page})=>{
  await waitForLocale(page);
  await selectNext7Days(page);
  const row=page.locator('.event-row[data-mappable="true"]').first();
  await expect(row).toBeVisible();
  const id=await row.getAttribute("data-event-id");
  await row.click();

  await expect(page.locator(`[data-event-id="${id}"]`)).toHaveAttribute("aria-selected","true");
  await expect(page.locator("#map")).toHaveClass(/has-selected-event/);
  await expect(page.locator(".event-pin.selected-pin")).toHaveCount(1);

  const heart=page.locator(`[data-event-id="${id}"] [data-save-event]`);
  await heart.click();
  await expect(page.locator(`[data-event-id="${id}"]`)).toHaveAttribute("aria-selected","true");
  await expect(page.locator(".event-pin.selected-pin")).toHaveCount(1);

  await page.locator("#map").click({position:{x:20,y:120}});
  await expect(page.locator("#map")).not.toHaveClass(/has-selected-event/);
});

test("map density hides low-priority single-event labels until interaction",async({page})=>{
  await waitForLocale(page);
  await selectNext7Days(page);
  const map=page.locator("#map");
  await map.evaluate(el=>el.__localeMap.setZoom(11,{animate:false}));
  await expect.poll(async()=>map.getAttribute("data-map-zoom")).toBe("11");

  const hidden=page.locator(".event-pin-label.is-density-hidden");
  if(await hidden.count()){
    await expect(hidden.first()).toHaveCSS("visibility","hidden");
  }

  const mapSource=await (await page.request.get("./src/components/map.js")).text();
  expect(mapSource).toContain("count>1||zoom>=13");
  expect(mapSource).toContain("has-selected-event");
});

test("Design System v1 keeps the stacked mobile layout usable",async({page})=>{
  await page.setViewportSize({width:600,height:900});
  await waitForLocale(page);
  const boxes=await page.evaluate(()=>{
    const rect=selector=>document.querySelector(selector)?.getBoundingClientRect();
    return {
      discovery:rect(".discovery-left"),
      map:rect(".map-stage"),
      events:rect(".event-right")
    };
  });
  expect(boxes.discovery.width).toBeGreaterThan(500);
  expect(boxes.map.width).toBeGreaterThan(500);
  expect(boxes.events.width).toBeGreaterThan(500);
  expect(boxes.map.top).toBeGreaterThanOrEqual(boxes.discovery.bottom-2);
  expect(boxes.events.top).toBeGreaterThanOrEqual(boxes.map.bottom-2);
  const toggles=page.locator(".edge-toggle");
  await expect(toggles).toHaveCount(2);
  await expect(toggles.nth(0)).toBeHidden();
  await expect(toggles.nth(1)).toBeHidden();
});
