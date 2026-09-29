# Locale

A live local-awareness map for discovering what is happening around you.

## V1
- Interactive map and adjustable search radius
- Today / Tonight / Tomorrow / Weekend / date browsing
- Event category filters
- Map/list views and event detail cards
- Modular provider architecture for live event sources
- GitHub Pages deployment

The app is intentionally build-free for easy editing in GitHub: native JavaScript modules, CSS modules by responsibility, and Leaflet/OpenStreetMap.

## Structure
- `index.html` — app shell
- `src/app.js` — orchestration
- `src/components/` — UI modules
- `src/services/` — filtering, geo, provider aggregation
- `src/providers/` — event source adapters
- `src/data/` — local/bootstrap data
- `styles/` — modular styling
- `.github/workflows/` — deployment

## Data providers
Provider adapters return the common Locale event schema. Add APIs or feeds without changing the map/UI. API keys should never be committed to this public repository; production providers that require secrets should run through a serverless/backend proxy.
