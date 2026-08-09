# Design — ZeroGravity

Locked design system for the frontend. Future UI work reads this file first.
Canonical tokens live in `frontend/tokens.css`.

## System

- **Genre** · atmospheric
- **Macrostructure** · Workbench (canvas-first instrument; globe is the product)
- **Theme** · Terminal
- **Axes** · dark / mono / phosphor-yellow-green (~127°)
- **Nav / footer** · N9 edge-aligned (terminal voice) · Ft4 dense colophon

## Principles

- Near-black canvas, phosphor-green ink — console telemetry, not neon HUD, not glassmorphism.
- Globe carries the page; panels are flat bordered panes (`paper-2`), no gradient fills.
- One phosphor accent family for UI chrome and globe data layer.
- All UI type is roman mono (JetBrains Mono). No gradient text. No decorative eyebrows.
- Telemetry uses tabular figures. Missing API values render as `—`, never invented numbers.
- Earth renders day/night via shader (`globeDayNight.js`) — not a single night texture.
- Nav reads as product title + single sync action — `Zero Gravity · norad telemetry` + `[ sync ]`. No CLI flags in header.

## Typography

| Role | Face | Weight |
|------|------|--------|
| Display | JetBrains Mono | 500 |
| Body | JetBrains Mono | 400–500 |
| Mono | JetBrains Mono | 400–500 |

All UI copy and telemetry use JetBrains Mono. Numeric fields use `font-variant-numeric: tabular-nums`.

## Tokens (canonical · `frontend/tokens.css`)

All UI and globe colors reference named tokens — no inline hex/oklch in components.
JS reads globe/type colors via `frontend/src/designTokens.js` (computed from CSS vars).

```css
:root {
  /* Tune phosphor here — all UI + globe chrome follows */
  --hue-phosphor: 127;
  --chroma-phosphor: 0.24;

  --color-paper:      oklch(10% 0.018 var(--hue-phosphor));
  --color-paper-2:    oklch(13% 0.022 var(--hue-phosphor));
  --color-accent:     oklch(79% var(--chroma-phosphor) var(--hue-phosphor));
  --color-ink:        oklch(88% 0.045 var(--hue-phosphor));

  --color-type-station: oklch(79% var(--chroma-phosphor) var(--hue-phosphor));
  --color-type-visual:  oklch(72% 0.14 200);
  --color-globe-atmo:   oklch(56% 0.14 var(--hue-phosphor));

  --font-display: "JetBrains Mono", ui-monospace, monospace;
  --font-body:    "JetBrains Mono", ui-monospace, monospace;
}
```

Component classes use the `zg-` prefix in `frontend/src/index.css`.
Layout utilities: `zg-row`, `zg-icon-sm`, `zg-panel--flex`.

## CTA voice

- Primary · phosphor fill · `--radius-sm` · `[ label ]` or `--flag` syntax
- Secondary · ghost on rule border · same radius

## Motion stance

- Live dot pulse · nav caret blink (reduced-motion: solid)
- No scroll reveals.
- `@media (prefers-reduced-motion: reduce)` collapses decorative motion.

## Provenance

- Hallmark redesign: `hallmark redesign frontend --mood terminal`
- Prior theme: Midnight — superseded
