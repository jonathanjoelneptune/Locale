# Area geometry architecture

Locale treats geography as a reusable data layer instead of map-specific UI state.

## Layers

1. `src/data/areaGeometry.js` builds a GeoJSON FeatureCollection for a region from Locale's canonical coverage inventory, applies regional land constraints, and resolves curated/authoritative overrides. Each feature carries stable IDs, labels, aliases, hierarchy metadata, display priority, bounding box, and geometry provenance.
2. `src/data/areaGeometryRegions.js` contains region-specific geometry constraints such as land masks and curated overrides. `src/services/polygonGeometry.js` contains reusable polygon intersection/subtraction helpers. `src/services/areas.js` owns point-in-polygon membership, spatial indexing, event-to-area annotation, counts, and lookups. None of these layers depend on Leaflet.
3. `src/components/areaFilter.js` renders the multi-select area browser.
4. `src/components/map.js` only renders resolved area features supplied to it and reports area clicks. It does not own the area catalog, coastline rules, or event membership logic.
5. `src/services/events.js` consumes derived `event.areaIds` when explicit areas are selected. Radius filtering resumes automatically when no areas are selected.

## Geometry precision

The San Diego resolver starts with the existing coverage-zone centers to generate a non-overlapping nearest-center tessellation for all 188 configured areas. It then clips those cells to a simplified GSHHS land mask so coastal cells do not continue into the Pacific or major bay water. Curated overrides run after clipping; Coronado currently uses an override that owns North Island, Coronado, and the Silver Strand corridor rather than inheriting a nearest-center wedge. The same resolved geometry drives both event membership and map rendering.

These shapes remain approximate and are explicitly marked as land-aware approximations. Any feature can later be replaced with an authoritative Polygon or MultiPolygon without changing the map, event filtering, or area selector. This keeps the front-end usable now while preserving a clean path to official neighborhood, city, county, or third-party boundary datasets as Locale expands beyond San Diego.
