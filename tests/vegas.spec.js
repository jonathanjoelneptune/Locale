import {test,expect} from "@playwright/test";

const vegasFixture=[{
  id:"lv-test-2026-11-27",regionId:"las-vegas",sourceId:"lv-zouk",
  title:"Thanksgiving Strip Test Show",category:"nightlife",start:"2026-11-27T21:00:00-08:00",
  venue:"Zouk Nightclub",lat:36.1334,lng:-115.165,locationPrecision:"source",
  source:"Zouk",url:"https://zoukgrouplv.com/events/",priceStatus:"unknown",timeZone:"America/Los_Angeles"
}];

test("Las Vegas selector changes city, dates, mapped areas and events without leaking city data",async({page})=>{
  await page.route("**/src/data/events/las-vegas.json",route=>route.fulfill({
    status:200,contentType:"application/json",body:JSON.stringify(vegasFixture)
  }));
  await page.goto("./?region=las-vegas&from=2026-11-25&to=2026-11-28");
  await expect(page.locator("#regionSelect")).toHaveValue("las-vegas");
  await expect(page.locator("#placeLabel")).toContainText("Las Vegas Strip");
  await expect(page.locator(".area-option")).toHaveCount(8,{timeout:15000});
  await expect(page.locator(".event-row")).toContainText("Thanksgiving Strip Test Show");
  await expect(page.locator("#dateSummary")).toContainText("Nov 25");
  await expect(page.locator("#dateSummary")).toContainText("Nov 28");

  const vegasArea=page.locator('[data-area-id="lv-resorts-world"]');
  await vegasArea.click();
  await expect(vegasArea).toHaveAttribute("aria-selected","true");
  await page.locator("#regionSelect").selectOption("san-diego");
  await expect(page.locator("#placeLabel")).toContainText("San Diego");
  await expect(page.locator('[data-area-id="lv-resorts-world"]')).toHaveCount(0);
  await expect(page.locator(".event-row").filter({hasText:"Thanksgiving Strip Test Show"})).toHaveCount(0);
  await page.locator("#regionSelect").selectOption("las-vegas");
  await expect(page.locator(".event-row")).toContainText("Thanksgiving Strip Test Show");
  await expect(page.locator('[data-area-id="lv-resorts-world"]')).toHaveAttribute("aria-selected","true");
  await expect(page).toHaveURL(/region=las-vegas/);
});
