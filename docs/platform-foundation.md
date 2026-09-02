# Platform Foundation

## Identity

Clerk is the only identity system. Enable open sign-up, mandatory verified email, and bot protection in the Clerk Dashboard. Configure the session claim `metadata.role` from `{{user.public_metadata.role}}`; only `admin` is privileged and every missing or malformed value is `user`.

Bootstrap the first administrator by setting the user's public metadata in the trusted Clerk Dashboard or Backend API. Never expose a client mutation for that metadata. Claims can take up to one token-refresh interval to propagate. For emergency removal, deactivate the Clerk user or session immediately.

The browser gets a Clerk token through its supported client API and sends `Authorization: Bearer <token>` to Nest. It never stores or logs the token, and retries once after a `401`.

## Operations

`/health/live` proves the process is running. `/health/ready` requires Redis and returns a versioned `DEPENDENCY_UNAVAILABLE` envelope on failure. `/metrics` is bearer-token protected, serves the Prometheus content type, and is never cached. The worker listener is internal-only and must not be published by Docker or Caddy.

Operational routes are version-neutral: `/health/live`, `/health/ready`, and `/metrics`. Future product controllers default to URI version `v1`, for example `/v1/analyses`. The non-production OpenAPI UI remains at `/docs`.

## Analysis Lifecycle Foundation

The API provides a Redis-only analysis resource with durable input staging and
a deterministic BullMQ execution baseline. It has no scientific configuration,
R execution, or result artifacts yet.

All analysis routes require a Clerk bearer token and use the authenticated Redis
rate-limit policies:

- `POST /v1/analyses` creates a `draft`. It requires a bounded
  `Idempotency-Key` header and accepts an optional `displayName`.
- `GET /v1/analyses/:analysisId` returns an analysis owned by the authenticated
  Clerk user. A resource owned by someone else returns `404` to prevent
  enumeration.
- `POST /v1/analyses/:analysisId/queue` creates a durable execution request for
  a `ready` analysis. It atomically moves the record to `queued` and persists
  an outbox record before BullMQ insertion.
- `POST /v1/analyses/:analysisId/cancel` is idempotent. It cancels preparation
  and queued work immediately; running work becomes `cancelling` until the
  worker cooperatively finalizes it as `cancelled`.

The lifecycle is `draft -> uploading -> ready -> queued -> running ->
succeeded | failed`, with `running -> cancelling -> cancelled`. `ready` means
exactly one occurrence dataset and at least one predictor dataset are
storage-verified, attached, and immutable. `queued` means a durable execution
request exists; a leased reconciler inserts the deterministic BullMQ job
(`jobId = analysisId`) and repairs undispatched outbox records after failures.
The current worker runs four deterministic no-op stages, reports progress,
retries up to three total attempts with five-second exponential backoff, and has
global queue concurrency one. A future configuration phase will validate
execution settings before queue submission; a future R phase replaces only the
no-op executor. `draft`, `uploading`, and `ready` can become `cancelled` or
`expired`.

Analysis state has an explicit 48-hour `expiresAt`, starting at creation. A
Redis sorted-set reconciliation sweep creates an independent cleanup record
before replacing a due analysis with an `expired` tombstone for one hour.
Cleanup records retain internal object references and retry storage deletion;
they do not depend on Redis key expiry or keyspace notifications. Expiry removes
the owner-scoped idempotency mapping.

Run Redis-backed integration tests with Docker available:

```sh
RUN_REDIS_INTEGRATION=true pnpm --filter @ecosuitability/api test
```

Without Docker, the same suite skips Testcontainers tests and still runs unit
and contract coverage.

The Docker-backed API suite starts the real Nest application in production mode
with Redis and a fake Clerk verifier. It checks CORS allowlisting and preflight,
Helmet headers, request IDs, 1 MiB and malformed JSON errors, versioned routes,
safe `401`/`404`/validation envelopes, metrics authorization, production
absence of `/docs`, and liveness/readiness behavior after Redis loss. Container
CI additionally verifies private production ports, non-root/read-only runtime
configuration, dropped capabilities, secret-free image history, and no source
maps in final images.

Rate limits are Redis-backed: anonymous traffic is keyed by normalized client IP; authenticated routes add Clerk user and IP limits. Redis failures fail closed for protected routes. No bearer tokens, emails, URLs, query strings, or request IDs become limiter keys or metric labels.

Production uses Caddy for TLS, redirects, timeouts, and forwarding headers. Caddy replaces client-supplied forwarded headers before proxying. API containers are not publicly published. The production Compose network gives Caddy `172.30.0.2`; API trusts only `172.30.0.2/32`. Broad proxy CIDRs are rejected in production.

Redis is durable control-plane storage. Self-managed production Redis requires
AOF persistence, `appendfsync everysec`, and `maxmemory-policy noeviction`.
The API validates those settings with `REDIS_DURABILITY_MODE=required`. Managed
providers use `REDIS_DURABILITY_MODE=managed`; verify equivalent durability and
no-eviction configuration with the provider before deployment.

The API accepts JSON bodies up to `MAX_JSON_BODY_BYTES` (default `1048576`). This is intentionally a control-plane limit: scientific files use direct object-storage uploads, not API request bodies. SeaweedFS supplies authenticated S3-compatible local storage; production uses a private Cloudflare R2 bucket. HTTP header, request, and keep-alive timeouts are explicitly configured and validated.

## Direct Input Storage

Datasets begin as temporary Redis upload sessions. The first session atomically
moves an owned analysis from `draft` to `uploading`; sessions expire after one
hour. Exactly one occurrence dataset may be created, while one or more
predictor datasets are allowed. `POST /v1/analyses/:analysisId/upload-datasets` requires an
`Idempotency-Key`; it creates a `collecting` dataset. Files are registered one
at a time, uploaded directly to storage through signed URLs, verified by the
API, and then the dataset is attached as `ready`. Attachment stores an internal
manifest with storage keys, normalized names, sizes, declared SHA-256 values,
and `client-declared` verification state. Browser checksums, filenames, and
MIME types are declarations, not proof; a future worker may mark checksums
`worker-verified`. `POST /v1/analyses/:analysisId/inputs/complete` changes
`uploading` to `ready` only after one occurrence and at least one predictor are
attached. Aborting a dataset, or its expiry sweep, aborts unfinished multipart
uploads and deletes uploaded objects.

Occurrence datasets accept CSV, XLSX, GeoJSON, or an explicit Shapefile set up
to 100 MiB. A Shapefile is never a ZIP: `.shp`, `.shx`, and `.dbf` are
required, `.prj` and `.cpg` are optional, every component must share a basename,
and unsupported sidecars are rejected. Predictor datasets accept one TIFF or
GeoTIFF up to 2 GiB. Files below 64 MiB use one signed PUT; larger files use
16 MiB multipart parts and batches of at most 20 signed URLs.

Local development uses SeaweedFS with a bucket created and CORS configured by
the API for `STORAGE_CORS_ORIGINS`. Production uses a private R2 bucket and does
not mutate bucket configuration at runtime. Configure R2 CORS for exact web
origins, `PUT` and `HEAD`, `content-type` and `x-amz-*` request headers, and
exposed `ETag` and checksum headers. Use a least-privilege R2 key and lifecycle
rules to remove incomplete multipart uploads and the `analyses/` prefix after
three days as a cleanup safety net.

The `R2 Smoke` workflow is manual only and uses the protected `r2-staging`
environment. Configure `R2_S3_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, and `R2_CORS_ORIGINS` as environment secrets. It writes
randomized single and multipart objects, verifies them, and removes them.

## Required Production Variables

API requires `REDIS_URL`, Clerk keys, explicit HTTPS `CLERK_AUTHORIZED_PARTIES` and `API_CORS_ORIGINS`, `TRUST_PROXY_CIDRS`, and a random 32+ character `METRICS_TOKEN`. The worker requires its own `WORKER_METRICS_TOKEN`. Set `APP_ENV=production`; invalid or blank values prevent startup.

Shutdown handles `SIGTERM` and `SIGINT`: readiness becomes unhealthy, the API rejects new requests, and the worker pauses BullMQ intake before both services wait up to `SHUTDOWN_TIMEOUT_MS` for active work. A worker drain timeout does not mark an unfinished analysis failed; BullMQ retains it for recovery or retry. A drain timeout fails shutdown rather than silently terminating active work. Investigate Clerk failures, Redis readiness failures, unexpected `401`/`429` growth, and metrics token failures using request IDs and redacted structured logs.

Workers pause new work during shutdown and never mark an unfinished analysis as
failed merely because the process stops. Every attempt has an
`ANALYSIS_EXECUTION_TIMEOUT_MS` AbortController. Timeouts are retryable until
the final attempt. Cancellation always wins over success, timeout, and retry;
cleanup records remain independent from BullMQ job retention.

## Delivery Checks

CI uses immutable GitHub Action revisions, dependency review, CodeQL, container configuration/secret scanning, and image vulnerability reporting. Runtime images are digest-pinned, use the non-root `node` user, and production containers use read-only filesystems with dropped Linux capabilities. Browser source maps remain disabled in the Next.js build; server-side source maps are not publicly served. SBOM and provenance attestations are intentionally deferred until images are pushed to a registry.

Browser smoke tests require a dedicated Clerk development instance. Add its values as GitHub repository secrets named `CLERK_TEST_PUBLISHABLE_KEY` and `CLERK_TEST_SECRET_KEY`. These must be test-instance keys (`pk_test_...` and `sk_test_...`), never production keys. Configure that Clerk instance to permit `http://127.0.0.1:3000` and `http://localhost:3000` for CI browser requests. Without both secrets, CI uses an inert format-valid key for build/type checks and skips browser smoke coverage.
