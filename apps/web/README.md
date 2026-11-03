# EcoSuitability Web

The web workspace is the authenticated Next.js 16 interface for creating, running, and exploring temporary habitat-suitability analyses. Scientific work remains in the API, worker, and R runtime; the web application orchestrates their HTTP contracts and renders results.

## Requirements

- Node `>=24 <25`
- The pnpm version pinned in the root `package.json`
- A Clerk development instance
- The EcoSuitability API and its supporting services for normal development

Install dependencies from the repository root:

```sh
pnpm install
```

Copy the application-local environment template and supply Clerk keys from the same development instance:

```sh
cp apps/web/.env.example apps/web/.env.local
```

`NEXT_PUBLIC_API_URL` is embedded in browser bundles. `API_INTERNAL_URL` is used only by Next.js server rendering and may use a private service address. Do not place secrets in `NEXT_PUBLIC_*` variables or create a root `.env` file.

## Development

For the complete local application, start infrastructure and the Turborepo development tasks from the repository root:

```sh
pnpm docker:infra
pnpm dev
```

The browser application is available at `http://localhost:3000` by default.

The authenticated workflow is:

1. `/analyses/new` creates an idempotent temporary draft.
2. Setup routes upload data, profile inputs, save configuration, and run authoritative preflight.
3. `/run` polls queued and active execution, and supports cancellation.
4. Result routes expose the overview, authenticated MapLibre layers, diagnostics, and short-lived downloads.

The “Try example dataset” action uses the checked-in synthetic occurrence and GeoTIFF fixtures but follows the normal direct-upload and profiling flow.

## Validation

Run focused web checks from the repository root:

```sh
pnpm --filter @ecosuitability/web lint
pnpm --filter @ecosuitability/web typecheck
pnpm --filter @ecosuitability/web test
pnpm --filter @ecosuitability/web build
```

Shared UI primitives have their own checks:

```sh
pnpm --filter @ecosuitability/ui lint
pnpm --filter @ecosuitability/ui typecheck
pnpm --filter @ecosuitability/ui test
```

The public Playwright smoke test runs with the root `pnpm test:e2e` command. The deterministic authenticated contract suite uses a local API stub instead of Redis, object storage, the worker, R, or the tile service:

```sh
pnpm --filter @ecosuitability/web test:e2e:contract
```

It requires these CI or shell-provided values and never commits them:

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
E2E_CLERK_USER_EMAIL
E2E_CLERK_USER_PASSWORD
```

The contract suite uses Clerk’s Playwright testing support to authenticate the test user. Use a dedicated Clerk test account with no production access.
