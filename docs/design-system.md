# Design System

## Architecture

`@ecosuitability/ui` owns shared semantic tokens and reusable application
primitives. The web application imports `@ecosuitability/ui/styles.css` once
from its global CSS and consumes components through the package root export.

Tokens have three layers:

1. Primitive variables define palettes, spacing, radii, shadows, motion, and
   stable visualization colors.
2. Semantic variables map those primitives to UI roles such as `background`,
   `surface`, `foreground`, `border`, `primary`, and status colors.
3. Components use semantic Tailwind utilities such as
   `bg-surface`, `text-muted-foreground`, `border-border`, `bg-primary`, and
   `ring-focus`.

Feature code must not introduce EcoSuitability-specific color values. Use
`font-mono` only for technical values such as identifiers, coordinates, and
filenames.

## Theme And Brand

The root HTML element owns theme state:

```html
<html data-brand="client-42" data-theme="light" data-appearance="system"></html>
```

`data-brand` selects a client theme; `data-theme` selects the resolved light or
dark tokens. An inline script applies the stored `light`, `dark`, or `system`
appearance before paint. System appearance continues to track operating-system
changes only when the stored mode is `system`.

`CLIENT_BRAND` is an optional build-time, server-only identifier. It accepts
any lowercase kebab-case slug; no registry exists in application code. When it
is absent or invalid, the neutral token theme applies and `data-brand` is
omitted.

```sh
# Deployment-selected identifier
CLIENT_BRAND=client-42
```

For Docker builds, provide `CLIENT_BRAND` as a build argument. It is not a
secret and must not be prefixed with `NEXT_PUBLIC_`. Browser-safe API settings
remain `NEXT_PUBLIC_*` values.

## Client Overrides

The shared package provides neutral default tokens only. A client deployment
may add a separate stylesheet with selectors such as
`[data-brand='client-42'][data-theme='light']` and
`[data-brand='client-42'][data-theme='dark']`, then set `CLIENT_BRAND` during
its image build. That stylesheet belongs to the deployment, not this repository
or a TypeScript registry. Verify contrast before release.

## Brand Identity

`BrandMark` is the canonical contour-based glyph. Its nested lines represent a
spatial suitability surface converging on a selected location. `BrandLockup`
combines that glyph with the product name and an optional descriptor;
`AnimatedBrandMark` uses exactly the same path geometry.

- Keep clear space around the mark equal to at least one quarter of its width.
- Use the default tone on normal application surfaces and the inverse tone on
  `hero` or similarly strong surfaces.
- Never redraw, rotate, stretch, or combine the glyph with leaf, house, or
  upload-arrow imagery.
- The loading animation traces each contour once, resolves the focal point,
  and then uses a subtle pulse. Reduced-motion mode displays the resolved mark
  immediately.

The generated favicon renders `BrandMark` directly with the neutral primary
palette. Runtime client-brand CSS does not affect browser icon rendering.

## Buttons

| Variant       | Intended use                                      | Surface requirement        |
| ------------- | ------------------------------------------------- | -------------------------- |
| `primary`     | Main action in a section                          | Normal application surface |
| `secondary`   | Supporting action with a filled neutral treatment | Normal application surface |
| `outline`     | Lower-emphasis bordered action                    | Normal application surface |
| `inverse`     | Action placed on `hero` or another strong surface | Inverse surface only       |
| `ghost`       | Low-emphasis toolbar or navigation action         | Normal application surface |
| `destructive` | Irreversible or high-risk action                  | Normal application surface |

All variants retain a 40px minimum target, visible keyboard focus, active and
disabled states, and the same semantics when composed with a link through
`asChild`. Feature code must not override button foreground or background
colors. Choose the appropriate variant instead.

Audit every variant in light and dark themes in its normal, hover, active,
focus-visible, and disabled states. Icon-only actions must use `IconButton` or
provide an equivalent accessible name.

## Authentication

The web application owns the product-specific `AuthShell`, while Clerk owns
the authentication state machine, validation, recovery, verification, SSO,
and CAPTCHA behavior. Clerk appearance is configured once at the root provider
and maps cards, fields, actions, links, messages, and disabled states to the
same semantic variables used by shared components.

Do not add per-route Clerk color overrides. Sign-in and sign-up must share the
same split editorial shell on desktop and the compact branded layout on mobile.
