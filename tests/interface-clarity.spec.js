import {test,expect} from "@playwright/test";

async function waitForLocale(page){
  await page.goto("./");
  await expect(page.locator("html")).toHaveClass(/locale-ready/,{timeout:15000});
  await expect(page.locator(".shell")).toBeVisible();
}

test("large desktop rails use more of the screen without overtaking the map",async({page})=>{
  await page.setViewportSize({width:1800,height:1000});
  await waitForLocale(page);
  const sizes=await page.evaluate(()=>{
    const rect=selector=>document.querySelector(selector)?.getBoundingClientRect();
    return {
      discovery:rect(".discovery-left")?.width||0,
      events:rect(".event-right")?.width||0,
      map:rect(".map-stage")?.width||0
    };
  });
  expect(sizes.discovery).toBeGreaterThanOrEqual(350);
  expect(sizes.events).toBeGreaterThanOrEqual(460);
  expect(sizes.map).toBeGreaterThan(sizes.discovery);
  expect(sizes.map).toBeGreaterThan(sizes.events);
});

test("area browser fills remaining vertical space and uses a custom selector",async({page})=>{
  await page.setViewportSize({width:1800,height:1000});
  await waitForLocale(page);
  await expect(page.locator(".area-check")).toHaveCount(0);
  await expect(page.locator(".area-select-indicator").first()).toBeVisible();

  const layout=await page.evaluate(()=>{
    const rect=selector=>document.querySelector(selector)?.getBoundingClientRect();
    const controls=rect(".discovery-controls");
    const areaControls=rect("#areaControls");
    const options=rect(".area-options");
    return {
      controlsHeight:controls?.height||0,
      areaControlsHeight:areaControls?.height||0,
      optionsHeight:options?.height||0,
      bottomGap:(areaControls&&options)?Math.abs(areaControls.bottom-options.bottom):999
    };
  });
  expect(layout.areaControlsHeight).toBeGreaterThan(180);
  expect(layout.optionsHeight).toBeGreaterThan(120);
  expect(layout.bottomGap).toBeLessThan(60);

  const first=page.locator(".area-option").first();
  const indicator=first.locator(".area-select-indicator");
  await first.click();
  await expect(first).toHaveAttribute("aria-selected","true");
  const dot=await indicator.locator("span").evaluate(el=>getComputedStyle(el).backgroundColor);
  expect(dot).not.toBe("rgba(0, 0, 0, 0)");
});

test("rails and event cards have explicit visual boundaries",async({page})=>{
  await page.setViewportSize({width:1800,height:1000});
  await waitForLocale(page);
  const metrics=await page.evaluate(()=>{
    const css=selector=>{
      const el=document.querySelector(selector);
      const style=el?getComputedStyle(el):null;
      return style?{
        background:style.backgroundColor,
        borderLeft:style.borderLeftWidth,
        borderRight:style.borderRightWidth,
        borderTop:style.borderTopWidth,
        boxShadow:style.boxShadow
      }:null;
    };
    return {
      left:css(".discovery-left"),
      right:css(".event-right"),
      row:css(".event-row")
    };
  });
  expect(metrics.left.borderRight).not.toBe("0px");
  expect(metrics.right.borderLeft).not.toBe("0px");
  if(metrics.row){
    expect(metrics.row.borderTop).not.toBe("0px");
    expect(metrics.row.background).not.toBe("rgba(0, 0, 0, 0)");
  }
});

test("map event labels allow two lines and use collision-aware placement",async({page})=>{
  await page.setViewportSize({width:1800,height:1000});
  await waitForLocale(page);

  const css=await (await page.request.get("./styles/readability.css")).text();
  const source=await (await page.request.get("./src/components/map.js")).text();
  expect(css).toContain("-webkit-line-clamp:2");
  expect(css).toContain(".event-pin-label.is-collision-hidden");
  expect(source).toContain("placementOffsets");
  expect(source).toContain("maxNudgePx");
  expect(source).toContain("occupiedMarkerBoxes");
  expect(source).toContain("nudged-event-marker");

  const label=page.locator(".event-pin-label").first();
  if(await label.count()){
    const style=await label.evaluate(el=>{
      const s=getComputedStyle(el);
      return {whiteSpace:s.whiteSpace,maxWidth:s.maxWidth,lineClamp:s.webkitLineClamp};
    });
    expect(style.whiteSpace).toBe("normal");
    expect(Number.parseFloat(style.maxWidth)).toBeGreaterThanOrEqual(180);
    expect(style.lineClamp).toBe("2");
  }
});

test("visible event labels do not overlap after dense-map placement",async({page})=>{
  await page.setViewportSize({width:1800,height:1000});
  await waitForLocale(page);
  const map=page.locator("#map");
  await map.evaluate(el=>el.__localeMap.setZoom(15,{animate:false}));
  await expect.poll(async()=>map.getAttribute("data-map-zoom")).toBe("15");

  const overlapCount=await page.evaluate(()=>{
    const mapRect=document.querySelector("#map").getBoundingClientRect();
    const labels=[...document.querySelectorAll(".event-pin-label")].filter(el=>{
      const style=getComputedStyle(el);
      if(style.visibility==="hidden"||Number(style.opacity)===0)return false;
      const r=el.getBoundingClientRect();
      return r.width>0&&r.height>0&&r.right>mapRect.left&&r.left<mapRect.right&&r.bottom>mapRect.top&&r.top<mapRect.bottom;
    }).map(el=>el.getBoundingClientRect());
    let overlaps=0;
    for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){
      const a=labels[i],b=labels[j];
      if(!(a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom))overlaps++;
    }
    return overlaps;
  });
  expect(overlapCount).toBe(0);
});

test("Locale exposes a browser tab icon",async({page})=>{
  await waitForLocale(page);
  const href=await page.locator('link[rel="icon"]').getAttribute("href");
  expect(href).toBe("./assets/favicon.svg");
  const response=await page.request.get("./assets/favicon.svg");
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain("<svg");
});
