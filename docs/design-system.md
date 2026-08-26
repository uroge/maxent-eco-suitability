# Design System

## Architecture

`@ecosuitability/ui` currently owns the shared token stylesheet only. The web
application imports `@ecosuitability/ui/styles.css` once from its global CSS.

Tokens have three layers:

1. Primitive variables define palettes, spacing, radii, shadows, motion, and
   stable visualization colors.
2. Semantic variables map those primitives to UI roles such as `background`,
   `surface`, `foreground`, `border`, `primary`, and status colors.
3. Future components must use semantic Tailwind utilities such as
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

## Future Components

Components will be implemented from the approved product design. They must use
semantic tokens, preserve visible focus and keyboard accessibility, and meet
WCAG AA contrast requirements. Do not add a generic component library or
showcase before that design work begins.
