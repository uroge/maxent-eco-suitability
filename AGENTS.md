# EcoSuitability Agent Guide

## Read First

- Read `README.md`, `EcoSuitability-Plan.md`, and the nearest scoped skill before changing code.
- Preserve existing user changes. Do not reset, overwrite, or reformat unrelated files.
- This is a `pnpm` and Turborepo workspace. Use Node `>=24 <25` and the pinned pnpm version in the root `package.json`; never use npm or Yarn.
- Use `pnpm` root scripts and `pnpm --filter <workspace>` for targeted work. Do not add a root `.env` file.

## Repository Boundaries

- `apps/web`: Next.js 16 App Router frontend.
- `apps/api`: independent NestJS HTTP API.
- `apps/worker`: independent NestJS application context for background jobs; it has no HTTP routes.
- `packages/ui`: source-only shared UI token stylesheet.
- `packages/contracts`: shared Zod contracts and application types.
- `packages/geo-utils`: browser/Node-safe pure helpers only.
- `packages/config`: shared TypeScript, ESLint, and Vitest configuration.
- `services/analysis-r`: isolated R service scaffolding.
- `infrastructure/docker`: local Redis and MinIO only. Never add a SQL database unless the plan is explicitly changed.

## General Code Rules

- TypeScript is strict. Do not suppress compiler, lint, or build errors.
- Prefer named exports. Default exports are reserved for framework-required Next.js files and config files requiring them.
- Use `type` for aliases, data shapes, and intersections. Use `interface` only when it extends a base type and declares additional members.
- Keep declarations separated by a blank line.
- Always use braces for `if`, `else`, `for`, `while`, and similar control-flow bodies, including one-line returns or calls.
- Keep files focused. One reusable component per PascalCase component file; do not recreate aggregate component files.
- Validate only the scope changed, then run broader checks when practical.

## Environment And Branding

- Keep environment templates next to their applications. Local secrets belong in ignored `.env` or `.env.local` files, never source control.
- `NEXT_PUBLIC_*` is browser-visible. All other variables are server-only.
- `CLIENT_BRAND` is an optional deployment build argument, not a registry entry. Never hardcode client names in app TypeScript or shared UI CSS.
- The shared UI token stylesheet is brand-neutral. Client-specific semantic-token overrides belong to deployment-owned CSS outside this repository.

## Local Commands

```sh
pnpm install
pnpm dev
pnpm check
pnpm build
pnpm test:e2e
pnpm docker:up
pnpm docker:down
```

`pnpm dev` starts web, API, and worker. Start Redis and MinIO separately for host-based development:

```sh
docker compose --env-file infrastructure/docker/.env.local \
  -f infrastructure/docker/compose.yaml up redis minio
```

## Validation

- Formatting: `pnpm format:check`.
- Workspace checks: `pnpm check`.
- UI-only checks: `pnpm --filter @ecosuitability/ui lint`, `typecheck`, and `test`.
- Nest build checks: `pnpm --filter @ecosuitability/api build` and `pnpm --filter @ecosuitability/worker build`.
- Web route/build checks: `pnpm --filter @ecosuitability/web build`.
- Playwright browsers are installed separately with `pnpm exec playwright install chromium` when needed.

## Scoped Skills

- Web and UI work: `docs/agent-skills/web-ui/SKILL.md`
- API and worker work: `docs/agent-skills/nest-services/SKILL.md`
- Workspace, tooling, Docker, and CI work: `docs/agent-skills/monorepo/SKILL.md`
