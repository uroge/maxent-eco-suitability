# Result artifacts and bundles

A successful analysis publishes exactly ten downloadable artifacts. Nine are scientific outputs and the tenth is the convenience ZIP. The shared contracts define the authoritative kind, filename, and content type for every entry.

| Kind                           | Filename                     | Purpose                                                 |
| ------------------------------ | ---------------------------- | ------------------------------------------------------- |
| `execution-summary`            | `execution-summary.json`     | Frozen validation and execution summary                 |
| `metrics`                      | `metrics.json`               | Evaluation runs, pooled ROC, AUC, and threshold metrics |
| `variable-importance`          | `variable-importance.json`   | Predictor importance and contribution                   |
| `response-curves`              | `response-curves.json`       | Predictor response-curve values                         |
| `suitability-raster`           | `suitability.tif`            | Continuous suitability COG                              |
| `suitability-threshold-raster` | `suitability-threshold.tif`  | Threshold classification COG                            |
| `occurrences`                  | `occurrences.geojson`        | Validated occurrence points                             |
| `background`                   | `background.geojson`         | Generated background points                             |
| `run-log`                      | `run.log.txt`                | Analysis stage log                                      |
| `result-bundle`                | `ecosuitability-results.zip` | The nine scientific files and `bundle-manifest.json`    |

## Integrity and reproducibility

The worker assigns deterministic artifact IDs and object keys for an analysis attempt. It checks uploaded object metadata, then reads every scientific object and verifies its exact byte count and SHA-256 while staging the ZIP. A mismatch prevents publication. The ZIP itself is hashed, uploaded, verified like every other artifact, and only then included in the result manifest.

`bundle-manifest.json` uses schema version 1 and records the analysis ID, completion time, frozen input and configuration revisions, their canonical fingerprints, the random seed, and the metadata and checksum for each of the nine scientific artifacts. It never lists or embeds `ecosuitability-results.zip`, so bundle construction cannot recurse.

The public result manifest contains the same reproducibility block and all ten sanitized artifact entries. Storage keys remain backend-only.

## Failure recovery and retention

Provisional publication state is persisted before output upload. A retry reuses the original IDs, keys, and completion timestamp. If all scientific artifacts and map assets exist but the ZIP is missing, the worker verifies the stored files and rebuilds only the ZIP; it does not rerun the scientific model. An uploaded ZIP is deleted if appending it to lifecycle state fails, preventing an untracked object.

Successful publication starts the result's 48-hour retention window in Redis. Cleanup includes all ten manifest entries, so the bundle expires and is deleted with the scientific artifacts. The owning user can request a fresh signed URL for any artifact until result expiry. Each URL lasts at most five minutes and is never cached or stored in the manifest.
