import {test,expect} from "@playwright/test";

async function waitForLocale(page){
  await page.goto("./");
  await expect(page.locator("html")).toHaveClass(/locale-ready/,{timeout:15000});
  await expect(page.locator(".shell")).toBeVisible();
}

test("Readability v1 raises the practical text floor on desktop",async({page})=>{
  await page.setViewportSize({width:1800,height:1000});
  await waitForLocale(page);

  const metrics=await page.evaluate(()=>{
    const px=value=>Number.parseFloat(value||"0");
    const style=selector=>{
      const element=document.querySelector(selector);
      return element?getComputedStyle(element):null;
    };
    const rect=selector=>document.querySelector(selector)?.getBoundingClientRect();
    return {
      discoveryWidth:rect(".discovery-left")?.width||0,
      eventsWidth:rect(".event-right")?.width||0,
      eventTitle:px(style(".event-title-line h2")?.fontSize),
      eventMeta:px(style(".event-meta")?.fontSize),
      eventHeight:rect(".event-row")?.height||0,
      resultsTitle:px(style(".results-head h1")?.fontSize),
      areaName:px(style(".area-option-copy strong")?.fontSize),
      search:px(style("#placeSearch")?.fontSize)
    };
  });

  expect(metrics.discoveryWidth).toBeGreaterThanOrEqual(309);
  expect(metrics.eventsWidth).toBeGreaterThanOrEqual(389);
  expect(metrics.eventTitle).toBeGreaterThanOrEqual(13);
  expect(metrics.eventMeta).toBeGreaterThanOrEqual(10);
  expect(metrics.eventHeight).toBeGreaterThanOrEqual(70);
  expect(metrics.resultsTitle).toBeGreaterThanOrEqual(15);
  expect(metrics.areaName).toBeGreaterThanOrEqual(11);
  expect(metrics.search).toBeGreaterThanOrEqual(11.5);
});

test("fallback event art no longer renders as repetitive thumbnail tiles",async({page})=>{
  await page.setViewportSize({width:1800,height:1000});
  await waitForLocale(page);

  const fallback=page.locator(".event-row:has(.event-thumb.is-fallback)").first();
  if(await fallback.count()){
    await expect(fallback.locator(".event-thumb.is-fallback")).toBeHidden();
    await expect(fallback).toHaveCSS("grid-template-columns",/./);
    const columns=await fallback.evaluate(el=>getComputedStyle(el).gridTemplateColumns);
    expect(columns.trim().split(/\s+/).length).toBe(1);
  }

  const source=await (await page.request.get("./styles/readability.css")).text();
  expect(source).toContain(".event-row:has(.event-thumb.is-fallback) .event-thumb");
  expect(source).toContain(".event-row .event-badge");
  expect(source).toContain("display:none!important");
});

test("real event images remain visible and larger",async({page})=>{
  await page.setViewportSize({width:1800,height:1000});
  await waitForLocale(page);

  const imageThumb=page.locator(".event-thumb.has-image").first();
  if(await imageThumb.count()){
    await expect(imageThumb).toBeVisible();
    const box=await imageThumb.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(60);
    expect(box.height).toBeGreaterThanOrEqual(58);
  }
});

test("Highlights and map labels use the more readable scale",async({page})=>{
  await page.setViewportSize({width:1800,height:1000});
  await waitForLocale(page);

  const metrics=await page.evaluate(()=>{
    const px=value=>Number.parseFloat(value||"0");
    const style=selector=>{
      const element=document.querySelector(selector);
      return element?getComputedStyle(element):null;
    };
    return {
      highlightTitle:px(style(".highlight-copy strong")?.fontSize),
      highlightMeta:px(style(".highlight-copy small")?.fontSize),
      mapEventLabel:px(style(".event-pin-label")?.fontSize),
      areaMapLabel:px(style(".area-map-label")?.fontSize)
    };
  });

  if(metrics.highlightTitle)expect(metrics.highlightTitle).toBeGreaterThanOrEqual(11);
  if(metrics.highlightMeta)expect(metrics.highlightMeta).toBeGreaterThanOrEqual(9);
  if(metrics.mapEventLabel)expect(metrics.mapEventLabel).toBeGreaterThanOrEqual(9);
  if(metrics.areaMapLabel)expect(metrics.areaMapLabel).toBeGreaterThanOrEqual(10);
});
