runtime_error <- function(code) {
  stop(structure(
    list(message = code, call = NULL, code = code),
    class = c("runtime_error", "error", "condition")
  ))
}

artifact_definitions <- function() {
  list(
    list(kind = "execution-summary", filename = "execution-summary.json"),
    list(kind = "metrics", filename = "metrics.json"),
    list(kind = "variable-importance", filename = "variable-importance.json"),
    list(kind = "response-curves", filename = "response-curves.json"),
    list(kind = "suitability-raster", filename = "suitability.tif"),
    list(kind = "suitability-threshold-raster", filename = "suitability-threshold.tif"),
    list(kind = "occurrences", filename = "occurrences.geojson"),
    list(kind = "background", filename = "background.geojson"),
    list(kind = "run-log", filename = "run.log.txt")
  )
}

artifact_metadata <- function(output_directory) {
  lapply(artifact_definitions(), function(definition) {
    path <- file.path(output_directory, definition$filename)
    if (!file.exists(path)) abort_model("MODEL_ARTIFACT_GENERATION_FAILED")
    list(
      kind = definition$kind,
      filename = definition$filename,
      size = as.numeric(file.info(path)$size),
      sha256 = digest::digest(file = path, algo = "sha256", serialize = FALSE)
    )
  })
}

assert_workspace_quota <- function(workspace) {
  quota <- suppressWarnings(as.numeric(Sys.getenv(
    "R_RUNTIME_WORKSPACE_QUOTA_BYTES",
    "6442450944"
  )))
  paths <- list.files(workspace, recursive = TRUE, full.names = TRUE, all.files = TRUE)
  bytes <- if (length(paths) == 0L) 0 else sum(file.info(paths)$size, na.rm = TRUE)
  if (!is.finite(quota) || bytes > quota) {
    abort_validation("INPUT_RESOURCE_LIMIT_EXCEEDED")
  }
}

wait_for_output_capabilities <- function(workspace) {
  path <- file.path(workspace, "output-capabilities.json")
  deadline <- Sys.time() + 15 * 60
  while (Sys.time() < deadline) {
    if (file.exists(path)) return(jsonlite::read_json(path, simplifyVector = FALSE))
    Sys.sleep(0.25)
  }
  runtime_error("R_RUNTIME_TIMEOUT")
}

upload_artifacts <- function(output_directory, capabilities, capability_path = NULL) {
  if (is.null(capabilities$capabilities) || length(capabilities$capabilities) != 9L) {
    runtime_error("R_RUNTIME_PROTOCOL_INVALID")
  }
  by_kind <- setNames(
    capabilities$capabilities,
    vapply(capabilities$capabilities, `[[`, character(1), "kind")
  )
  if (length(unique(names(by_kind))) != 9L) runtime_error("R_RUNTIME_PROTOCOL_INVALID")
  metadata <- artifact_metadata(output_directory)
  for (artifact in metadata) {
    if (!is.null(capability_path)) {
      capabilities <- jsonlite::read_json(capability_path, simplifyVector = FALSE)
      by_kind <- setNames(
        capabilities$capabilities,
        vapply(capabilities$capabilities, `[[`, character(1), "kind")
      )
    }
    capability <- by_kind[[artifact$kind]]
    if (
      is.null(capability) ||
        !isTRUE(all.equal(as.numeric(capability$size), artifact$size)) ||
        !identical(tolower(capability$sha256), tolower(artifact$sha256)) ||
        !identical(capability$filename, artifact$filename)
    ) {
      runtime_error("R_RUNTIME_PROTOCOL_INVALID")
    }
    response <- curl::curl_upload(
      file.path(output_directory, artifact$filename),
      capability$url,
      handle = curl::new_handle(
        customrequest = "PUT",
        httpheader = c(
          "Content-Type" = capability$contentType,
          "Content-Disposition" = capability$contentDisposition,
          "x-amz-meta-sha256" = artifact$sha256
        )
      )
    )
    if (response$status_code < 200L || response$status_code >= 300L) {
      runtime_error("R_RUNTIME_UNAVAILABLE")
    }
  }
  metadata
}
