# Locale Design System v1

Locale Design System v1 is the front-end contract for visual hierarchy, density, interaction, and responsive behavior.

## Visual hierarchy

Locale uses three visual layers:

1. **Map and geography** are the spatial canvas. Neighborhood fills, borders, and labels stay muted so they establish context without competing with events.
2. **Events** are the primary content. Pins, selected event cards, map popups, and Highlights receive the strongest contrast and interaction emphasis.
3. **Chrome and controls** are deliberately quiet. Rails use translucent neutral surfaces, subtle borders, and low elevation so the map remains the hero.

## Tokens

The canonical tokens live in `styles/base.css`.

- Color: `--text-*`, `--surface-*`, `--border-*`, `--accent*`
- Shape: `--radius-xs/sm/md/lg/pill`
- Spacing: `--space-1` through `--space-6`
- Elevation: `--shadow-xs/sm/md/focus`
- Motion: `--motion-fast/base/slow`, `--ease-standard`
- Type: `--type-micro` through `--type-title`

New UI should use these tokens instead of adding one-off colors, radii, shadows, or transition timings.

## Selection contract

Event selection is a shared application state, not a component-local effect.

- `state.selectedEventId` is the source of truth.
- The event rail persists the selected card through re-renders.
- Highlights mirror the same selected event.
- The map emphasizes the selected marker and lowers unrelated marker prominence.
- Clicking empty map space clears selection without clearing neighborhood filters.

## Map density

Single-event text labels are hidden at wide and medium zoom levels and become visible at zoom 13+. Cluster labels remain visible. Hovering or selecting an event reveals its label regardless of zoom.

This keeps the map readable while preserving direct access to event identity.

## Responsive behavior

- **Wide desktop (1650px+)**: slightly wider rails while protecting a large map canvas.
- **Standard desktop/tablet landscape (851–1649px)**: fluid dual rails with the map consuming remaining width.
- **Compact tablet (851–1180px)**: narrower rails and reduced event-card chrome.
- **Mobile/tablet portrait (850px and below)**: stacked search, map, and event regions with full-width surfaces.
- **Small mobile (560px and below)**: event-type filters become two columns and event metadata stacks.

## Motion

Motion is restrained and communicates state:

- hover/selection: 120–170 ms
- drawer/layout transitions: about 220–240 ms
- map camera motion remains controlled by Leaflet

`prefers-reduced-motion` disables nonessential animation.

## Component rules

Event rail cards, Highlights, map popups, filter controls, chips, and detail dialogs should share the tokenized surface language. Event-category colors are reserved for event meaning. Geography uses its own muted palette and neutral labels.
