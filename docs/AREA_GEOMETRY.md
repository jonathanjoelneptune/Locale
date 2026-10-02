# Area geometry architecture

Locale treats geography as a reusable data layer instead of map-specific UI state.

## Layers

1. `src/data/areaGeometry.js` builds a GeoJSON FeatureCollection for a region from Locale's canonical coverage inventory. Each feature carries stable IDs, labels, aliases, hierarchy metadata, display priority, bounding box, and geometry provenance.
2. `src/services/areas.js` owns geometry operations such as point-in-polygon membership, spatial indexing, event-to-area annotation, counts, and lookups. It has no Leaflet dependency.
3. `src/components/areaFilter.js` renders the multi-select area browser.
4. `src/components/map.js` only renders area features supplied to it and reports area clicks. It does not own the area catalog or event membership logic.
5. `src/services/events.js` consumes derived `event.areaIds` when explicit areas are selected. Radius filtering resumes automatically when no areas are selected.

## Geometry precision

The initial San Diego dataset uses the existing coverage-zone centers to generate a non-overlapping nearest-center polygon tessellation for all 188 configured areas. Adjacent display areas share edges instead of overlapping. These polygons are still approximate and are explicitly marked as such. Any feature can later be replaced with an authoritative Polygon or MultiPolygon without changing the map, event filtering, or area selector.

This keeps the front-end usable now while preserving a clean path to official neighborhood, city, county, or third-party boundary datasets as Locale expands beyond San Diego.
