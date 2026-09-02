# Monorepo And Delivery Skill

Use this skill for root tooling, workspace configuration, Docker, CI, generators, and shared packages.

## Workspace Rules

- Turborepo is the only monorepo task runner. Keep package boundaries explicit and use workspace dependencies for shared packages.
- Every workspace package has its own `package.json` by design. pnpm manages one shared dependency store and links declared workspace dependencies.
- Do not add dependencies to the root unless they are repository-wide tooling. Add runtime dependencies to the workspace that executes them.
- Keep Turbo tasks cacheable unless persistent or inherently side-effectful. Development tasks must be `persistent` and non-cacheable.

## Quality Gates

- Prettier is the formatter and ESLint flat config is the linter. Do not add conflicting formatting rules.
- Maintain `pnpm check` as format check, lint, typecheck, and tests.
- Preserve CI's deterministic `pnpm install --frozen-lockfile`, Node 24.19, and Playwright browser installation.
- Do not add commit-message enforcement; commitlint is intentionally absent.

## Docker And Infrastructure

- Docker containers receive configuration through environment variables only. Do not commit secrets.
- Local Compose provides Redis and SeaweedFS as temporary state/object storage. No SQL service belongs in Compose.
- Keep health checks and the named SeaweedFS data volume intact.
- Keep web Docker build arguments aligned with `apps/web/.env.example`; `CLIENT_BRAND` is optional and build-time only.

## Shared Packages

- `contracts` owns transport-independent Zod schemas, inferred DTOs, status values, and typed errors.
- `geo-utils` remains pure, browser/Node-safe, and free of DOM, filesystem, network, or framework dependencies.
- `config` owns reusable configuration only. Use ESM `.mjs` where a consumer such as Vitest/Vite must load configuration directly in Node.
