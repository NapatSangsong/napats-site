# Learning Platform — Architecture Decision Records

## ADR-001: Zod v4 for validation

**Context:** The spec calls for Zod validation on all AI outputs and HTTP bodies.

**Decision:** Installed `zod@^4.3.6` (v4), the latest major version available.

**Consequences:** Zod v4 has a slightly different API surface than v3 (e.g., discriminated unions use `z.discriminatedUnion("type", [...])` syntax). Import path is `import { z } from "zod"` which works for both v3 and v4.

## ADR-002: Theme persistence via cookie (not Supabase)

**Context:** Theme preference needs to persist across page loads. Could store in Supabase `settings` table or in a cookie.

**Decision:** Use a non-HttpOnly cookie (`napats-learning-theme`) for theme preference. Read it in the layout loader (server-side) to avoid FOUC.

**Consequences:** Theme loads instantly on SSR without a Supabase roundtrip. The settings page can also write to Supabase for backup, but the cookie is the primary source. No security concern since theme is not sensitive data.

## ADR-003: Inline styles for design-precise components

**Context:** The design canvas specifies exact pixel values for fonts, spacing, and colors. Tailwind's utility classes don't always map 1:1 to these values (e.g., `fontSize: 88`, `letterSpacing: '-0.02em'`).

**Decision:** Use inline styles for layout-precise components (matching the design canvas prototypes), Tailwind for structural/responsive utilities.

**Consequences:** Design fidelity is pixel-perfect. Trade-off: inline styles are slightly harder to override and don't benefit from Tailwind's responsive prefixes. For responsive adjustments, we use Tailwind's `className` alongside `style`.

## ADR-004: Command Center Variation A (centered hero)

**Context:** The design provides two Command Center variations: A (centered hero) and B (editorial split with library index on right).

**Decision:** Ship Variation A as the default. The editorial spread (B) can be added as an option in Settings later.

**Consequences:** Simpler initial implementation. The compose input, model picker, and continue-learning strip are all in one column, which works better on mobile.
