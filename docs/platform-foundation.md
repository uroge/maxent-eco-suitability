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
R execution, or scientific result artifacts yet.

All analysis routes require a Clerk bearer token and use the authenticated Redis
rate-limit policies:

- `POST /v1/analyses` creates a `draft`. It requires a bounded
  `Idempotency-Key` header and accepts an optional `displayName`.
- `GET /v1/analyses/:analysisId` returns an analysis owned by the authenticated
  Clerk user. A resource owned by someone else returns `404` to prevent
  enumeration.
- `POST /v1/analyses/:analysisId/queue` requires an `Idempotency-Key` and creates
  a durable execution request for a `ready` analysis. It atomically moves the
  record to `queued` and persists an outbox record before BullMQ insertion.
- `POST /v1/analyses/:analysisId/cancel` requires an `Idempotency-Key` and is
  idempotent. It cancels preparation
  and queued work immediately; running work becomes `cancelling` until the
  worker cooperatively finalizes it as `cancelled`.

The lifecycle is `draft -> uploading -> ready -> queued -> running ->
succeeded | failed`, with `running -> cancelling -> cancelled`. `ready` means
exactly one occurrence dataset and at least one predictor dataset are
storage-verified, attached, and immutable. `queued` means a durable execution
request exists; a leased reconciler inserts the deterministic BullMQ job
(`jobId = analysisId`) and repairs undispatched outbox records after failures.
The worker reports progress, retries up to three total attempts with five-second
exponential backoff, and has global queue concurrency one. Input profiling,
configuration preflight, and model execution all call the private `analysis-r`
service through the same recoverable run protocol.
`analysis-r` has one replica, no public port, no Redis/Clerk/object-storage
credentials, a read-only root filesystem, a small control-only tmpfs, and a
dedicated disk-backed workspace volume. The worker passes only short-lived
signed GET capabilities for frozen input objects. The runtime uses
HMAC-authenticated requests and sequenced polling; it has no callback endpoint.
Profile and preflight results are persisted in the runtime workspace until the
worker stores and acknowledges them, so a runtime restart can recover the same
revision-bound semantic run.

Every durable mutation uses either its lifecycle-specific atomic Redis script
or the analysis-scoped operation ledger. The ledger binds the key to a
canonical operation/payload fingerprint, serializes concurrent execution with
a recoverable lease, stores the exact successful response for the analysis
TTL, and rejects reuse with different revisions or content. Profile and
preflight retries also reassert their deterministic BullMQ job IDs, closing the
state-written/job-not-enqueued crash window. Temporary signed URL issuance is
not a durable mutation and deliberately issues a fresh credential on retry.

The R runtime supports `profile`, `validate`, and `execute` modes. Profiling
inspects occurrence headers, worksheets/layers, coordinate candidates,
duplicates, CRS, predictor grids, nodata, and alignment and produces a bounded
WGS84 preview. Preflight and execution both call the same authoritative
`validate_run` implementation; execution repeats validation from the frozen
snapshot before fitting the model. Queueing is permitted only when the passed R
preflight matches the current input revision and fingerprint and configuration
revision and fingerprint.

Scientific validation enforces:
at most 500 occurrence records, 20 selected predictors, 5 GiB aggregate inputs,
2 GiB per predictor, 100 million cells per raster, and 500 million cells across
predictors. It rejects unsupported geometry, CRS/grid incompatibility, invalid
coverage, unsafe input complexity, and invalid partitions using stable safe
codes. Preflight converts scientific failures into actionable blockers while
runtime/protocol failures remain retryable infrastructure failures.

The R image is reproducible through `renv`; generate `services/analysis-r/renv.lock`
after changing `scripts/bootstrap-renv.R`, never by hand:

```sh
docker build --target bootstrap -t ecosuitability-analysis-r-bootstrap \
  -f services/analysis-r/Dockerfile services/analysis-r
docker run --rm --user "$(id -u):$(id -g)" \
  -v "$PWD/services/analysis-r:/opt/analysis-r" \
  ecosuitability-analysis-r-bootstrap Rscript scripts/bootstrap-renv.R
```

Record the resulting lockfile in Git. Local/prod deployments require a shared
random `R_RUNTIME_SHARED_SECRET` (32+ bytes), `R_RUNTIME_URL`, a 10-second HTTP
timeout, ten-minute run deadline, 15-minute input-capability expiry, a 6 GiB
workspace quota, and a 2 GiB child R memory limit. The deployed host must reserve
at least 20 GiB of workspace disk; 8 GiB Docker memory is recommended for the
full SeaweedFS/R integration suite.

`services/analysis-r/system-packages.txt` is the reviewed OS dependency manifest
for the pinned R package set. It covers the compiled geospatial stack (`sf`,
`s2`, and `terra`) and its CMake, GDAL, GEOS, PROJ, Abseil, Protobuf, OpenSSL,
and `pkg-config` dependencies. Update it deliberately when the R dependency
set changes, then verify a clean bootstrap build rather than adding packages in
response to an incidental runtime failure.

`draft`, `uploading`, and `ready` can become `cancelled` or `expired`.

Successful deterministic runs create a crash-safe provisional result record
before writing output. The worker verifies the size, content metadata, and
worker-generated SHA-256 of all nine scientific artifacts, then reads and
hashes every stored byte again while staging `ecosuitability-results.zip`.
That ZIP contains the nine files and a validated, non-recursive
`bundle-manifest.json` with their checksums and the frozen revisions,
fingerprints, and seed. The ZIP is verified and published as the tenth artifact
before the analysis atomically becomes `succeeded`. A failed publication is
retried by BullMQ using the same artifact IDs, keys, and completion timestamp;
when all scientific artifacts and map assets are already present, recovery
rebuilds only a missing ZIP rather than rerunning R. Result manifests are
available only to the owning user at `GET /v1/analyses/:analysisId/results`.
The download endpoint issues a fresh direct-storage URL with a maximum
five-minute lifetime bounded by result expiry, never returns storage keys, and
returns no signed URLs in the manifest response.

Input preparation has an explicit 48-hour deadline starting at creation. Queue
submission establishes a separate 48-hour processing deadline for `queued` and
`running` analyses. Successful publication establishes a new 48-hour result
deadline. A
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

Occurrence datasets accept CSV, XLSX, GeoJSON, GeoPackage (`.gpkg`), or an
explicit Shapefile set up to 100 MiB. A GeoPackage names one point layer when
it has more than one eligible layer and must declare a CRS. A Shapefile is
never a ZIP: `.shp`, `.shx`, and `.dbf` are required, `.prj` and `.cpg` are
optional, every component must share a basename, and unsupported sidecars are
rejected. Predictor datasets accept one TIFF or GeoTIFF up to 2 GiB, or a ZIP
up to 500 MiB containing exactly one root-level `.tif`/`.tiff`; extraction is
bounded to 2 GiB and a 100:1 expansion ratio. Files below 64 MiB use one signed
PUT; larger files use 16 MiB multipart parts and batches of at most 20 signed
URLs.

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

## Analysis Configuration And Immutable Submission

An analysis models exactly one species. Configuration `schemaVersion: 1` is a stable production contract: unsupported fields, boundary datasets, multi-species batches, automatic reprojection/resampling, and other model algorithms are rejected rather than ignored. A CSV or XLSX occurrence dataset uses exact WGS84 longitude and latitude columns; XLSX additionally names an exact worksheet. GeoJSON follows RFC 7946 WGS84 point semantics; GeoPackage and Shapefile occurrence layers must have a CRS, and a Shapefile requires `.shp`, `.shx`, `.dbf`, and `.prj` (with optional `.cpg`). No coordinate transformation or grid correction occurs.

Configuration requires a Unicode-NFC, whitespace-normalized `speciesName` and one or more selected attached GeoTIFF predictors. Predictor names are bounded ASCII identifiers and unique case-insensitively; each predictor explicitly declares whether it is continuous or categorical, and supplied order is preserved. The supported study area is the selected predictor intersection. Defaults are server-authoritative: strict coordinate and raster-coverage validation, 10,000 random background points without replacement, linear/quadratic/product/hinge feature classes, regularization multiplier `1`, and a 20% train/test split. Input validation may instead exclude invalid coordinates and/or uncovered occurrences; exclusion requires at least 80% to 100% retained predictor coverage. Validation is exactly one method: a train/test fraction of `0.1` to `0.5`, or k-fold cross-validation with two to ten folds. The execution seed is a required unsigned 32-bit integer.

`PUT /v1/analyses/:analysisId/configuration` accepts an exact `expectedRevision` and an `Idempotency-Key`. A missing configuration is revision zero; its first successful write is revision one. Every replacement with the current revision increments exactly once. Repeating the same request key and request fingerprint returns its original response; reusing the key for a different request returns `409`. `GET /v1/analyses/:analysisId/configuration` returns either editable configuration or the safe frozen submission after queueing, never storage keys, object URLs, ownership fields, or raw manifests.

The API materializes defaults and canonicalizes values before hashing them as `jcs-sha256-v1:<lowercase-sha256>` over canonical JSON. Feature classes are ordered by their fixed enum order; selected predictor order is preserved. Queueing snapshots the configuration, revision, configuration fingerprint, selected internal input manifest, input-manifest fingerprint, seed, queue time, and processing deadline in the same Redis transition that creates the durable outbox request. BullMQ receives only the analysis ID. Configuration editing ends at queueing; subsequent review reads the API's frozen snapshot.

The API validates configuration shape, bounds, references, ownership, and lifecycle permissions. The R execution service validates file contents and scientific compatibility: at least ten valid deduplicated coordinates after configured exclusions, meaningful partitions, predictor coverage and grids, categorical values, background capacity, and CRS equivalence. Tabular and GeoJSON occurrences require WGS84 predictors; GeoPackage and Shapefile CRS values must be equivalent to selected predictor CRS. Source species values, when mapped, must normalize case-insensitively to the configured species name.

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
