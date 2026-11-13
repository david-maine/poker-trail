# App typography

`src/lib/typography.ts` owns font families, the text size scale, reusable text roles,
and responsive event/leaderboard metrics. `src/lib/theme.ts` owns the colour palette.
All five font assets load in `app/_layout.tsx` for player, organiser, and admin routes.

| Role | Font | Base size |
| --- | --- | --- |
| Headings / titles | Roboto Slab ExtraBold | 18 / 20 |
| Body | Roboto Slab Regular | 14 |
| Caption / label | Roboto Slab Regular / SemiBold | 12 |
| Input | Roboto Slab Regular | 16 |
| Button | Roboto Slab Bold | 14 |
| Detail | Montserrat Medium Italic | 12, responsive minimum 10 |
| Capacity price | Roboto Slab Bold | 22 |

Spread a `TEXT_STYLE` role into a component's StyleSheet, then apply layout and colour
overrides. Use `FONT_SIZE` and `textMetrics()` for a deliberate variant. Keep native
font scaling enabled. Use the actual font family for a weight, with `fontWeight: '400'`;
numeric bold on a preweighted font can cause synthetic bolding or platform differences.

Event codes keep their bold bordered treatment, smaller join captions, and shared
metadata sizing on list and detail pages. Responsive brand artwork, registration
controls, and player tabs retain their own proportions via `landingTypography.ts`
and the shared responsive helpers. Avoid adding screen-specific font-name strings
or new size literals when an existing role fits.
