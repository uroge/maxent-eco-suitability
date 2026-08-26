# Web And UI Skill

Use this skill for changes under `apps/web` and `packages/ui`.

## Next.js

- Use Next.js App Router and TypeScript. Files that Next.js requires to use lowercase names keep their framework naming; reusable React component files use PascalCase.
- Keep server and client boundaries explicit. Add `'use client'` only for browser APIs, state, event handlers, or interactive primitives.
- Do not manually edit generated Next output. `next-env.d.ts` may be reformatted by Prettier after a Next command.

## Components

- Do not add shared components until an approved product design requires them. Then put one reusable component in each PascalCase file under `packages/ui/src/components`.
- Use this declaration style for local components:

```tsx
type ComponentNameProps = {};

export const ComponentName: React.FC<ComponentNameProps> = () => {
  return null;
};
```

- Use `interface ComponentNameProps extends ...` only when it extends native or Radix props and adds members; use a `type` intersection for an empty extension-only shape.
- React 19 accepts `ref` as a prop. Do not add `forwardRef`.
- Do not use inline prop types, anonymous component functions, or default component exports.
- Always wrap control-flow bodies in braces, even when they contain one statement.
- Keep local types, CVA variants, and implementation helpers private. Export only approved public components and intentional compound parts through `packages/ui/src/index.ts`.

## Styling And Accessibility

- Use semantic Tailwind utilities and tokens from `@ecosuitability/ui/styles.css`; never introduce feature-level raw color values.
- Preserve the visualization token names for map and chart colors.
- Use CVA for reusable variants and `cn` for class composition when the component layer is introduced.
- Use Radix Primitives for interaction, focus management, keyboard support, overlays, and ARIA behavior when interactive components are introduced. Do not use Radix Themes.
- `asChild` is a current supported Radix composition API. A component used with it must spread received props and accept `ref`.
- Maintain visible focus, accessible labels for icon-only controls, 40px minimum interactive controls, and disabled/invalid states.

## Themes

- The base stylesheet provides neutral semantic light and dark tokens using `data-theme`.
- `CLIENT_BRAND` only adds an optional `data-brand` attribute. It must never select from a hardcoded brand registry.
- Client token overrides are deployment-owned CSS selectors. Do not add client selectors to shared styles.

## Tests

- Add Vitest, jsdom, and Testing Library component coverage when components are introduced.
