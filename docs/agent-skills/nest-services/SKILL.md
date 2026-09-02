# Nest Services Skill

Use this skill for changes under `apps/api` and `apps/worker`.

## Architecture

- API and worker are independent NestJS applications. Do not enable Nest's internal monorepo mode.
- The API is the only public HTTP service. The worker uses `NestFactory.createApplicationContext` and must not expose HTTP routes.
- Keep feature behavior out of scaffold changes. Queue processing, uploads, object storage adapters, R orchestration, and analysis endpoints are feature work.
- Always wrap control-flow bodies in braces, even when they contain one statement.
- Search both services before introducing a helper. Reuse `@ecosuitability/runtime-utils` for shared Node-only primitives instead of copying them between API and worker.
- Keep shared utilities stateless and framework-independent. Nest modules, Redis repositories, lifecycle coordinators, and feature services remain application-owned unless they have a stable cross-service contract.

## Environment And Startup

- Validate environment variables with Zod during Nest startup.
- API local environment: `apps/api/.env`; worker local environment: `apps/worker/.env`.
- The API requires `PORT` and `REDIS_URL`; the worker requires `REDIS_URL`.
- Keep `dev` mapped to `pnpm start:dev` so root `pnpm dev` starts both services through Turbo.
- Use `withTimeout` from `@ecosuitability/runtime-utils` for bounded external or Redis operations. Use its request-ID, bearer-token, and Lua-loading helpers rather than reimplementing those security-sensitive details.

## TypeScript Build Output

- Keep `rootDir` as `./src` and `outDir` as `./dist`.
- Keep `tsBuildInfoFile` inside `dist`. Nest deletes that directory before building; putting incremental metadata there prevents stale caches from omitting emitted files.
- Verify a Nest build emits `dist/main.js` and every imported source module before relying on watch mode.

## HTTP API Baseline

- Keep structured startup and error behavior, Helmet, configuration validation, and strict TypeScript enabled.
- Add security middleware appropriate to a public API as an endpoint is introduced. Do not add feature-specific middleware prematurely.
