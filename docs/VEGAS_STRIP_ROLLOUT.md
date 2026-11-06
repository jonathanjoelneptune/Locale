# Las Vegas Strip regional rollout

Scope: the Las Vegas **Strip corridor only**, from the STRAT and SAHARA through Mandalay Bay, including Sphere and T-Mobile Arena. No Downtown Las Vegas, Summerlin, Henderson, or broader valley coverage. The region's event admission boundary is the curated polygon in `src/data/vegasStrip.js`. The same polygon clips neighborhood geometry in `src/data/areaGeometryRegions.js`, while ingestion and browser filtering independently enforce the scope.

## Initial experience

- Choose **Las Vegas Strip, NV** from the city dropdown, or open `/?region=las-vegas&from=2026-11-25&to=2026-11-28`.
- On first Vegas selection through November 28, 2026, the date range defaults to Wednesday November 25 through Saturday November 28, 2026. After that, it defaults to today.
- Region navigation updates map center, radius, event dataset, eight Strip areas, date range and URL; per-region area selection is stored independently. Saved event IDs remain shared.
- San Diego stays the default. Existing San Diego `locale-selected-areas` storage is respected for backward compatibility.

## Ingestion

- Ticketmaster is already national and runs once per configured U.S. region. For Vegas it scans a nearby radius, then only events with precise venue coordinates **inside** the Strip polygon survive canonical ingestion.
- Vegas official source IDs: `lv-zouk` (date-bearing event URLs); `lv-resorts-world`, `lv-wynn`, `lv-tmobile`, `lv-brooklyn-bowl` (existing date-verified calendar-links pipeline). A returned event must have a valid start date and a resolved precise venue inside the polygon. Calendar pages may return zero; this is not evidence of coverage.
- Venetian, Sphere, House of Blues, Vegas.com, Eventbrite, Discotech and NEON are cataloged but disabled pending a stable per-performance ingestion path. Never synthesize daily performances from a generic show/residency page.
- The hourly workflow writes `src/data/events/<region>.json` as well as the legacy combined `src/data/events.json`. The UI requests the selected region's snapshot first; it can fall back to the combined legacy file while regional files are being generated.
- Current ingestion operates on a rolling horizon (Ticketmaster 45 days; Zouk 60 days). Full historical backfill and perpetual date retention are deliberately out of scope for this rollout.

## Verification

Run `node --test scripts/vegas-strip.test.mjs` and the normal `validate.yml` suite. The Playwright `tests/vegas.spec.js` fixture checks direct-link initialization, event isolation, city switching, November date range, and neighborhood-selection persistence. Confirm the first scheduled `Refresh Locale events` job writes nonzero, date-verified Vegas records before treating the region as populated.
