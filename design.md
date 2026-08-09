# Design — ZeroGravity

Locked design system for the frontend. Future UI work reads this file first.
Canonical tokens live in `frontend/tokens.css`.

## System

- **Genre** · atmospheric
- **Macrostructure** · Workbench (canvas-first instrument; globe is the product)
- **Theme** · Midnight
- **Axes** · dark / grotesk-sans / warm
- **Nav / footer** · N9 edge-aligned · Ft2 inline status

## Principles

- Dark cool-violet canvas with warm radial blooms — not glassmorphism, not neon HUD.
- Globe carries the page; panels are solid elevated surfaces (`paper-2`, `paper-3`).
- One warm amber accent family for UI chrome and globe data layer.
- Headings are roman sans (Syne). No gradient text. No decorative eyebrows.
- Telemetry uses tabular figures. Missing API values render as `—`, never invented numbers.
- Earth renders day/night via shader (`globeDayNight.js`) — not a single night texture.

## Typography

| Role | Face | Weight |
|------|------|--------|
| Display | Syne | 600 |
| Body | Figtree | 400–600 |

All UI copy and telemetry use Figtree. Numeric fields use `font-variant-numeric: tabular-nums` for column alignment.

## Tokens (canonical · `frontend/tokens.css`)

All UI and globe colors reference named tokens — no inline hex/oklch in components.
JS reads globe/type colors via `frontend/src/designTokens.js` (computed from CSS vars).

```css
:root {
  --color-paper:      oklch(13% 0.022 250);
  --color-paper-2:    oklch(17% 0.026 250);
  --color-accent:     oklch(72% 0.17 48);
  --color-ink:        oklch(93% 0.008 250);

  --color-type-station: oklch(72% 0.17 48);
  --color-type-visual:  oklch(68% 0.12 230);
  --color-globe-atmo:   oklch(62% 0.12 48);

  --font-display: "Syne", system-ui, sans-serif;
  --font-body:    "Figtree", system-ui, sans-serif;
}
```

Component classes use the `zg-` prefix in `frontend/src/index.css`.
Layout utilities: `zg-row`, `zg-icon-sm`, `zg-panel--flex`.

## CTA voice

- Primary · amber fill · `--radius-md` · sentence-case label
- Secondary · ghost on rule border · same radius

## Motion stance

- Live dot pulse only; no scroll reveals.
- `@media (prefers-reduced-motion: reduce)` collapses decorative motion.

## Provenance

- Hallmark redesign: `hallmark redesign frontend --mood atmospheric --theme Midnight`
- Prior theme: Lumen Night Foundry — superseded
