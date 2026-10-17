source("r/validate.R")
source("r/profile.R")
source("r/model.R")
source("r/artifacts.R")

arguments <- commandArgs(trailingOnly = TRUE)
if (length(arguments) != 3L) stop("Expected request, input capabilities, and workspace paths.")

emit <- function(value) {
  cat(jsonlite::toJSON(value, auto_unbox = TRUE, null = "null"), "\n", sep = "")
  flush.console()
}

tryCatch({
  request <- jsonlite::read_json(arguments[[1L]], simplifyVector = FALSE)
  capabilities <- jsonlite::read_json(arguments[[2L]], simplifyVector = FALSE)
  mode <- request$mode
  if (identical(mode, "profile")) {
    result <- tryCatch(
      profile_inputs(request, capabilities, arguments[[3L]], emit, arguments[[2L]]),
      validation_error = function(error) profile_failure_result(request, error$code)
    )
    jsonlite::write_json(result, file.path(arguments[[3L]], "job-result.json"), auto_unbox = TRUE, null = "null")
    emit(list(kind = "completed", result = result))
    quit(save = "no", status = 0L)
  }
  validated <- tryCatch(
    validate_run(request, capabilities, arguments[[3L]], emit, arguments[[2L]]),
    validation_error = function(error) {
      if (identical(mode, "validate")) return(structure(list(code = error$code), class = "preflight_blocked"))
      stop(error)
    }
  )
  if (identical(mode, "validate")) {
    result <- if (inherits(validated, "preflight_blocked")) preflight_result(request, failure_code = validated$code) else preflight_result(request, validated = validated)
    jsonlite::write_json(result, file.path(arguments[[3L]], "job-result.json"), auto_unbox = TRUE, null = "null")
    emit(list(kind = "completed", result = result))
    quit(save = "no", status = 0L)
  }
  if (!identical(mode, "execute")) abort_validation("R_RUNTIME_PROTOCOL_INVALID")
  assert_workspace_quota(arguments[[3L]])
  execution <- execute_model(validated, arguments[[3L]], emit)
  assert_workspace_quota(arguments[[3L]])
  artifacts <- artifact_metadata(execution$outputDirectory)
  emit(list(
    kind = "artifacts-ready",
    artifacts = lapply(artifacts, function(artifact) artifact[c("kind", "size", "sha256")]),
    candidateCompletedAt = execution$candidateCompletedAt
  ))
  output_capabilities <- wait_for_output_capabilities(arguments[[3L]])
  emit_event(emit, "uploading-artifacts", 96L, "Uploading verified scientific artifacts.")
  artifacts <- upload_artifacts(
    execution$outputDirectory,
    output_capabilities,
    file.path(arguments[[3L]], "output-capabilities.json")
  )
  emit(list(
    kind = "completed",
    summary = execution$summary,
    artifacts = lapply(artifacts, function(artifact) artifact[c("kind", "size", "sha256")]),
    candidateCompletedAt = execution$candidateCompletedAt
  ))
}, validation_error = function(error) {
  emit(list(kind = "failed", code = error$code))
}, runtime_error = function(error) {
  emit(list(kind = "failed", code = error$code))
}, error = function(error) {
  message(conditionMessage(error))
  emit(list(kind = "failed", code = "R_RUNTIME_UNAVAILABLE"))
})
