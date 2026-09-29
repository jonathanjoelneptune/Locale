import { test, expect } from "@playwright/test";

const waitForLocale=async page=>{
  await page.goto("/");
  await page.waitForSelector(".event-row",{timeout:15000});
  await page.waitForFunction(()=>window.L&&document.querySelector(".leaflet-locale-basemap-pane img.leaflet-tile"));
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
  const tileSrc=()=>page.locator(".leaflet-locale-basemap-pane img.leaflet-tile").first().getAttribute("src");
  await style.selectOption("humanitarian");
  await expect(style).toHaveValue("humanitarian");
  await expect(map).toHaveAttribute("data-map-style","humanitarian");
  await expect.poll(tileSrc).toContain("tile.openstreetmap.fr/hot");
  await style.selectOption("satellite");
  await expect(style).toHaveValue("satellite");
  await expect(map).toHaveAttribute("data-map-style","satellite");
  await expect.poll(tileSrc).toContain("arcgisonline.com");
  await style.selectOption("standard");
  await expect(style).toHaveValue("standard");
  await expect(map).toHaveAttribute("data-map-style","standard");
  await expect.poll(tileSrc).toContain("tile.openstreetmap.org");

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
    const box=await page.locator("#map").boundingBox();
    await page.mouse.click(box.x+box.width*.55,box.y+box.height*.35);
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
