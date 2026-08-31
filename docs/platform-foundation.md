# Platform Foundation

## Identity

Clerk is the only identity system. Enable open sign-up, mandatory verified email, and bot protection in the Clerk Dashboard. Configure the session claim `metadata.role` from `{{user.public_metadata.role}}`; only `admin` is privileged and every missing or malformed value is `user`.

Bootstrap the first administrator by setting the user's public metadata in the trusted Clerk Dashboard or Backend API. Never expose a client mutation for that metadata. Claims can take up to one token-refresh interval to propagate. For emergency removal, deactivate the Clerk user or session immediately.

The browser gets a Clerk token through its supported client API and sends `Authorization: Bearer <token>` to Nest. It never stores or logs the token, and retries once after a `401`.

## Operations

`/health/live` proves the process is running. `/health/ready` requires Redis and returns a versioned `DEPENDENCY_UNAVAILABLE` envelope on failure. `/metrics` is bearer-token protected, serves the Prometheus content type, and is never cached. The worker listener is internal-only and must not be published by Docker or Caddy.

Operational routes are version-neutral: `/health/live`, `/health/ready`, and `/metrics`. Future product controllers default to URI version `v1`, for example `/v1/analyses`. The non-production OpenAPI UI remains at `/docs`.

## Analysis Lifecycle Foundation

The API now provides the first Redis-only analysis resource. It is intentionally
limited to draft management: it has no uploads, object storage, queue, worker
job, R execution, or artifacts.

All analysis routes require a Clerk bearer token and use the authenticated Redis
rate-limit policies:

- `POST /v1/analyses` creates a `draft`. It requires a bounded
  `Idempotency-Key` header and accepts an optional `displayName`.
- `GET /v1/analyses/:analysisId` returns an analysis owned by the authenticated
  Clerk user. A resource owned by someone else returns `404` to prevent
  enumeration.
- `POST /v1/analyses/:analysisId/cancel` cancels a draft and is idempotent for
  an already-cancelled draft.

The internal lifecycle is `draft -> uploading -> queued -> running ->
succeeded | failed | cancelled | expired`. Only creation and draft cancellation
are public in this phase. Upload, queue, execution, success, and failure
transitions are internal service operations until their supporting systems are
implemented.

Analysis state lives only in Redis for 48 hours. An expiry sweep changes due
records to an `expired` tombstone for one additional hour, then Redis removes
the record. Expiry also removes the owner-scoped idempotency mapping. The same
idempotency key and equivalent request replay the original analysis; reuse with
a different request returns the standard `409 CONFLICT` error envelope.

Run Redis-backed integration tests with Docker available:

```sh
RUN_REDIS_INTEGRATION=true pnpm --filter @ecosuitability/api test
```

Without Docker, the same suite skips Testcontainers tests and still runs unit
and contract coverage.

Rate limits are Redis-backed: anonymous traffic is keyed by normalized client IP; authenticated routes add Clerk user and IP limits. Redis failures fail closed for protected routes. No bearer tokens, emails, URLs, query strings, or request IDs become limiter keys or metric labels.

Production uses Caddy for TLS, redirects, timeouts, and forwarding headers. Caddy replaces client-supplied forwarded headers before proxying. API containers are not publicly published. The production Compose network gives Caddy `172.30.0.2`; API trusts only `172.30.0.2/32`. Broad proxy CIDRs are rejected in production.

The API accepts JSON bodies up to `MAX_JSON_BODY_BYTES` (default `1048576`). This is intentionally a control-plane limit: future scientific files must use direct object-storage uploads, not API request bodies. HTTP header, request, and keep-alive timeouts are explicitly configured and validated.

## Required Production Variables

API requires `REDIS_URL`, Clerk keys, explicit HTTPS `CLERK_AUTHORIZED_PARTIES` and `API_CORS_ORIGINS`, `TRUST_PROXY_CIDRS`, and a random 32+ character `METRICS_TOKEN`. The worker requires its own `WORKER_METRICS_TOKEN`. Set `APP_ENV=production`; invalid or blank values prevent startup.

Shutdown handles `SIGTERM` and `SIGINT`: readiness becomes unhealthy, the service rejects new work, waits up to `SHUTDOWN_TIMEOUT_MS` for active requests, then closes listeners and Redis. A drain timeout fails shutdown rather than silently terminating active work. Investigate Clerk failures, Redis readiness failures, unexpected `401`/`429` growth, and metrics token failures using request IDs and redacted structured logs.

## Delivery Checks

CI uses immutable GitHub Action revisions, dependency review, CodeQL, container configuration/secret scanning, and image vulnerability reporting. Runtime images are digest-pinned, use the non-root `node` user, and production containers use read-only filesystems with dropped Linux capabilities. Browser source maps remain disabled in the Next.js build; server-side source maps are not publicly served. SBOM and provenance attestations are intentionally deferred until images are pushed to a registry.

Browser smoke tests require a dedicated Clerk development instance. Add its values as GitHub repository secrets named `CLERK_TEST_PUBLISHABLE_KEY` and `CLERK_TEST_SECRET_KEY`. These must be test-instance keys (`pk_test_...` and `sk_test_...`), never production keys. Configure that Clerk instance to permit `http://127.0.0.1:3000` and `http://localhost:3000` for CI browser requests. Without both secrets, CI uses an inert format-valid key for build/type checks and skips browser smoke coverage.
