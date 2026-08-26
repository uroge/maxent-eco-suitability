# EcoSuitability — Plan

## Goal

EcoSuitability is a web GIS application for environmental and species suitability analysis.

The user uploads occurrence/environmental data, configures a model, the backend runs an R-based analysis using `maxnet`, and the user receives:

- interactive GIS layers
- model statistics
- response curves
- variable importance
- downloadable analysis artifacts

The codebase should be production-ready from the start, while the initial infrastructure is sized for a single user and can run cheaply. It is a `pnpm` workspace managed with Turborepo.

There is **no SQL database** in the initial architecture.

---

# Final Architecture

```text
Next.js Web App
      │
      ▼
Fastify API
      │
      ├── Redis / BullMQ
      │
      └── Cloudflare R2
              │
              ▼
      Analysis Worker
              │
              ▼
              R
              │
      ┌───────┼────────┐
      ▼       ▼        ▼
   maxnet    terra      sf
```

For the initial deployment, the API, worker, and R runtime may run on the same server/container.

They should still remain separate modules/processes in the codebase.

---

# Main Responsibilities

## Next.js Web App

Responsible for:

```text
file uploads
analysis configuration
job progress
result dashboard
GIS map
charts
downloads
errors/warnings
```

Recommended:

```text
Next.js (App Router)
TypeScript
TanStack Query
MapLibre GL
Recharts
```

Use Next.js for pages, routing, server-rendered shell/metadata, and the browser UI. MapLibre, file selection, charts, and job polling are client components.

Do not run queue jobs, R, or geospatial processing in Next.js route handlers or server actions. The API and worker remain independent deployable services.

---

# API

The Fastify API acts as the orchestrator. Fastify keeps the initial service smaller than NestJS while retaining a clear path to modules, plugins, schema validation, and structured logging.

It does not perform scientific calculations itself.

Responsibilities:

```text
receive upload requests
validate request metadata
generate analysis ID
upload input files to R2
store temporary job state in Redis
enqueue BullMQ job
return job ID
report job progress
return result metadata
generate signed download URLs
handle cancellation/errors
```

Example endpoint:

```http
POST /analyses
```

Response:

```json
{
  "analysisId": "an_abc123",
  "status": "queued"
}
```

---

# Redis

Redis is used only for temporary runtime state.

It stores:

```text
analysis status
progress
current stage
job errors
result location
timestamps
```

Example:

```text
analysis:an_abc123

status = training
progress = 48
stage = maxent_training
```

Every analysis key should have a TTL.

Example:

```text
24–72 hours
```

After expiration, the state disappears automatically.

---

# BullMQ

BullMQ handles asynchronous execution.

Flow:

```text
API
  ↓
BullMQ
  ↓
Analysis Worker
```

Responsibilities:

```text
queueing
retries
timeouts
progress
failed jobs
cancellation
concurrency
```

For one user, initial worker concurrency can simply be:

```text
1
```

This still keeps the architecture ready for more workers later.

---

# Cloudflare R2

Use R2 for temporary scientific files.

Store:

```text
input Excel/CSV
GeoTIFF layers
GeoJSON
analysis configuration
result JSON
suitability raster
response-curve data
generated reports
```

Example:

```text
analyses/an_abc123/

├── input/
│   ├── occurrences.xlsx
│   ├── temperature.tif
│   ├── rainfall.tif
│   └── elevation.tif
│
├── config/
│   └── analysis.json
│
└── output/
    ├── result.json
    ├── suitability.tif
    ├── occurrences.geojson
    ├── variable-importance.json
    ├── response-curves.json
    └── report.xlsx
```

Configure lifecycle deletion so analysis artifacts disappear automatically after the retention period.

---

# Analysis Worker

The worker is responsible for running scientific jobs.

Responsibilities:

```text
receive queued job
download input files from R2
create isolated local workspace
start R
read R progress events
upload outputs to R2
update Redis
clean local files
```

Example local workspace:

```text
/work/an_abc123/

├── input/
├── config.json
├── output/
└── logs/
```

When complete:

```text
upload output
delete /work/an_abc123
```

---

# R Analysis Service

R is the scientific calculation engine. Its source and reproducible package environment live in `services/analysis-r`.

Recommended structure:

```text
services/analysis-r/r/

├── main.R

├── ingestion/
│   ├── read-input.R
│   └── validate-input.R

├── preprocessing/
│   ├── prepare-data.R
│   ├── spatial-validation.R
│   └── background-points.R

├── models/
│   └── maxnet-model.R

├── evaluation/
│   ├── auc.R
│   ├── thresholds.R
│   ├── variable-importance.R
│   └── response-curves.R

├── spatial/
│   ├── extract-environment.R
│   ├── raster-prediction.R
│   └── suitability-map.R

└── export/
    ├── export-json.R
    ├── export-geojson.R
    ├── export-geotiff.R
    └── export-report.R
```

---

# `main.R`

`main.R` is the R entry point.

The worker runs:

```bash
Rscript /opt/analysis-r/r/main.R \
  --input /work/an_abc123/input \
  --config /work/an_abc123/config.json \
  --output /work/an_abc123/output
```

`main.R` orchestrates:

```text
read input
   ↓
validate
   ↓
prepare data
   ↓
generate background points
   ↓
train MaxEnt
   ↓
evaluate
   ↓
predict
   ↓
generate GIS outputs
   ↓
export results
```

Conceptually:

```r
data <- read_input()

validate_input(data)

prepared <- prepare_data(data)

model <- train_maxnet(prepared)

evaluation <- evaluate_model(model, prepared)

prediction <- predict_raster(model, prepared)

export_results(
  model,
  evaluation,
  prediction
)
```

---

# MaxEnt

Use:

```r
library(maxnet)
```

Architecture:

```text
R
 ↓
maxnet
 ↓
MaxEnt-style model
```

There is no npm MaxEnt package involved.

The worker machine/container must contain:

```text
R
maxnet
terra
sf
GDAL
PROJ
GEOS
required R packages
```

---

# GIS Processing

Use:

```text
terra
sf
```

`terra`:

```text
GeoTIFFs
environmental rasters
prediction rasters
resampling
alignment
raster extraction
```

`sf`:

```text
species points
GeoJSON
vector data
polygons
spatial transformations
```

---

# User Inputs

Primary occurrence input:

```text
.xlsx
.csv
```

Example:

```text
species | latitude | longitude
Oak     | 45.26    | 19.84
Oak     | 45.27    | 19.82
```

Environmental predictors may be:

```text
temperature
rainfall
wind
elevation
vegetation
humidity
soil
```

These can come from:

```text
columns inside the uploaded dataset
```

or separate GIS layers such as:

```text
temperature.tif
rainfall.tif
wind.tif
elevation.tif
```

Supported formats may include:

```text
.xlsx
.csv
.geojson
.gpkg
.tif
.tiff
.zip
```

---

# Analysis Configuration

The Next.js app sends configuration together with the job.

Example:

```json
{
  "model": "maxnet",

  "coordinates": {
    "latitude": "latitude",
    "longitude": "longitude"
  },

  "predictors": ["temperature", "rainfall", "elevation", "wind"],

  "settings": {
    "regularizationMultiplier": 1,
    "testPercentage": 20,
    "replicates": 5
  }
}
```

Store this temporarily in R2:

```text
analyses/an_abc123/config/analysis.json
```

---

# Validation

Validation happens at two levels.

## Backend validation

Checks:

```text
allowed file types
file sizes
missing configuration
required request fields
upload count
```

## R validation

Checks scientific correctness:

```text
required columns
latitude/longitude ranges
missing values
duplicate occurrences
CRS
raster extent
resolution
alignment
NoData
points outside environmental extent
```

Example structured error:

```json
{
  "type": "DATA_VALIDATION_ERROR",
  "code": "POINT_OUTSIDE_RASTER",
  "message": "14 occurrence points fall outside environmental raster extent."
}
```

---

# Analysis Pipeline

```text
Occurrence data
       +
Environmental data
       │
       ▼
Validation
       │
       ▼
Spatial preparation
       │
       ▼
Environmental extraction
       │
       ▼
Presence/background preparation
       │
       ▼
Training setup
       │
       ▼
MaxEnt training
       │
       ▼
Model evaluation
       │
       ▼
Raster prediction
       │
       ▼
GIS/statistical export
```

---

# Progress Reporting

R writes progress as machine-readable JSON lines.

Example:

```json
{"stage":"validation","progress":10}
{"stage":"preprocessing","progress":25}
{"stage":"training","progress":45}
{"stage":"evaluation","progress":60}
{"stage":"prediction","progress":80}
{"stage":"export","progress":95}
```

The worker reads those lines and updates Redis.

The Next.js client polls:

```http
GET /analyses/an_abc123/status
```

Response:

```json
{
  "status": "running",
  "stage": "training",
  "progress": 45
}
```

Possible states:

```text
queued
validating
preprocessing
training
evaluating
predicting
exporting
completed
failed
cancelled
```

---

# R Output

The main machine-readable output is:

```text
result.json
```

Example:

```json
{
  "model": {
    "type": "maxnet",
    "auc": 0.89,
    "threshold": 0.54
  },

  "variables": [
    {
      "name": "temperature",
      "importance": 42
    },
    {
      "name": "rainfall",
      "importance": 31
    },
    {
      "name": "elevation",
      "importance": 18
    }
  ],

  "artifacts": {
    "occurrences": "occurrences.geojson",
    "suitability": "suitability.tif",
    "responseCurves": "response-curves.json",
    "report": "report.xlsx"
  }
}
```

The worker uploads everything to R2 and marks the Redis job completed.

---

# Web Results

The Next.js client requests:

```http
GET /analyses/an_abc123/results
```

The backend returns:

```text
model statistics
artifact metadata
signed URLs
chart data
GIS layer information
```

---

# GIS Dashboard

Use MapLibre GL.

Suggested layer control:

```text
Base map

Analysis
☑ Habitat suitability
☑ Species occurrences
☐ Background points
☐ Suitable habitat

Environment
☐ Temperature
☐ Rainfall
☐ Wind
☐ Elevation
☐ Vegetation
```

The main predicted result is:

```text
suitability.tif
```

Each raster cell contains a suitability score such as:

```text
0.0 → low suitability
1.0 → high suitability
```

---

# Statistical Dashboard

Show:

```text
AUC
threshold
model type
number of observations
number of predictors
```

Variable importance:

```text
Temperature       42%
Rainfall          31%
Elevation         18%
Wind               9%
```

Response curves:

```text
temperature → suitability
rainfall → suitability
elevation → suitability
wind → suitability
```

---

# Downloadable Outputs

Provide:

```text
result.json
analysis-report.xlsx
occurrences.geojson
suitability.tif
response-curves.json
```

Use short-lived signed R2 URLs.

---

# Temporary Retention

The application does not maintain permanent analysis history.

Example lifecycle:

```text
analysis starts
    ↓
files stored in R2
    ↓
analysis completes
    ↓
results available for 24–72 hours
    ↓
Redis state expires
    ↓
R2 lifecycle removes files
```

Redis TTL and R2 lifecycle should use matching retention windows.

---

# Monorepo Structure

```text
eco-suitability/

├── apps/
│
│   ├── web/
│   │   ├── app/
│   │   │   ├── page.tsx
│   │   │   └── analyses/[analysisId]/page.tsx
│   │   ├── components/
│   │   ├── features/
│   │   │   ├── upload/
│   │   │   ├── analysis/
│   │   │   ├── results/
│   │   │   └── maps/
│   │   └── lib/
│   │       └── api-client.ts
│
│   ├── api/
│   │   └── src/
│   │       ├── analysis/
│   │       │   ├── analysis.routes.ts
│   │       │   ├── analysis.service.ts
│   │       │   ├── analysis-status.service.ts
│   │       │   └── analysis.repository.ts
│   │       ├── uploads/
│   │       ├── queue/
│   │       ├── storage/
│   │       ├── plugins/
│   │       └── server.ts
│
│   └── worker/
│       ├── src/
│       │   ├── worker.ts
│       │   ├── r-runner.ts
│       │   ├── workspace.ts
│       │   ├── progress-parser.ts
│       │   └── storage.ts
├── packages/
│   ├── contracts/
│   │   └── src/
│   │       ├── analyses.ts
│   │       ├── errors.ts
│   │       └── index.ts
│   ├── geo-utils/
│   │   └── src/
│   ├── ui/
│   │   └── src/
│   └── config/
│       ├── eslint/
│       └── typescript/
│
├── infrastructure/
│   └── docker/
│
├── services/
│   └── analysis-r/
│       ├── r/
│       │   └── main.R
│       ├── renv.lock
│       └── Dockerfile
│
├── tests/
└── docs/

pnpm-workspace.yaml
turbo.json
package.json
```

`packages/contracts` is the source of truth for API request/response schemas. Define each contract with Zod and infer TypeScript types from the schema. The API validates the schema at its boundary; the web app uses the same schema for form validation and typed API calls.

Share only pure, environment-neutral code:

```text
contracts: Zod schemas, DTOs, error codes, job states
geo-utils: browser/Node-safe coordinate and GeoJSON helpers
ui: optional reusable presentational components
config: shared ESLint and TypeScript configuration
```

Do not put Redis, R2, environment variables, queue code, filesystem access, or R orchestration in a shared package.

## Workspace Tooling

Use:

```text
pnpm workspaces: dependency installation and workspace linking
Turborepo: cached build, lint, typecheck, test, and development tasks
Docker Compose: local Redis, MinIO, API, worker, and R runtime
```

Example root scripts:

```text
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

Turborepo should declare task dependencies so an app build first builds its internal packages. Remote cache is optional at first; enable it in CI when build time becomes material.

---

# Local Development

Use Docker Compose.

Services:

```text
web
api
worker
redis
minio
```

Use MinIO locally because it is S3-compatible.

Local:

```text
MinIO
```

Production:

```text
Cloudflare R2
```

The storage adapter should use the same S3-compatible interface.

---

# Initial Production Deployment

For one user:

```text
Frontend hosting
      ↓
Single small server/container
├── Fastify API
├── BullMQ worker
└── R runtime
      │
      ├── Upstash/Redis
      └── Cloudflare R2
```

This keeps infrastructure cheap while preserving clean service boundaries.

The API and worker may run as separate Node processes inside the same deployed machine.

---

# Future Scaling

No application rewrite should be required to move from:

```text
1 server
1 worker
```

to:

```text
API server

worker 1
worker 2
worker 3
```

because jobs already communicate through Redis/BullMQ and files already live in object storage.

Scaling is therefore primarily an infrastructure change.

---

# Security

Implement:

```text
file-size limits
MIME/type validation
allowed extensions
archive extraction limits
path traversal prevention
rate limiting
worker execution timeout
RAM/CPU limits
isolated workspaces
signed result URLs
```

Never execute uploaded R code or shell commands.

Only validated data and configuration may reach the R pipeline.

---

# Observability

Use structured logging.

Include:

```text
analysisId
jobId
stage
progress
duration
error type
```

Recommended:

```text
Sentry
OpenTelemetry
```

Add Prometheus/Grafana when infrastructure size justifies it.

---

# Testing

## Frontend

```text
upload flow
analysis configuration
progress states
errors
MapLibre layers
result charts
downloads
```

## Backend

```text
upload validation
R2 integration
Redis/BullMQ integration
status endpoints
signed URLs
cancellation
error mapping
```

## Worker

```text
workspace isolation
R process execution
timeout handling
progress parsing
output validation
cleanup
```

## R

```text
input parsing
coordinate validation
raster validation
data preparation
MaxEnt training
predictions
evaluation metrics
exports
```

Use fixed scientific datasets as regression fixtures.

---

# Final End-to-End Flow

```text
1. User uploads data

2. Next.js sends:
   POST /analyses

3. API:
   generates analysisId
   validates request
   uploads files to R2
   stores config
   initializes Redis status
   queues BullMQ job

4. Next.js receives analysisId

5. Worker receives job

6. Worker downloads files

7. Worker executes:
   Rscript main.R

8. R:
   validates
   preprocesses
   trains MaxEnt
   evaluates model
   predicts suitability
   generates GIS artifacts
   exports JSON/GeoJSON/GeoTIFF/report

9. Worker uploads results to R2

10. Worker marks Redis state completed

11. Next.js sees completion

12. Next.js requests results

13. Backend returns:
    metrics
    chart data
    GIS layer URLs
    download URLs

14. User explores map and statistics

15. After retention period:
    Redis expires
    R2 files are deleted
```

---

# Final Technology Ownership

```text
Next.js
→ web interface, routing, and server-rendered shell

MapLibre
→ GIS visualization

Fastify API
→ API/orchestration

Redis
→ temporary analysis state

BullMQ
→ asynchronous job execution

Cloudflare R2
→ scientific file storage

Analysis Worker
→ job execution

R
→ scientific processing

maxnet
→ MaxEnt model

terra
→ raster GIS processing

sf
→ vector GIS processing
```

No SQL database is part of this architecture.
