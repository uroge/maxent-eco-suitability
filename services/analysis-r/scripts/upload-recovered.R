source("r/validate.R")
source("r/model.R")
source("r/artifacts.R")

arguments <- commandArgs(trailingOnly = TRUE)
if (length(arguments) != 1L) stop("Expected a recovered workspace path.")
workspace <- arguments[[1L]]
output_directory <- file.path(workspace, "outputs")

emit <- function(value) {
  cat(jsonlite::toJSON(value, auto_unbox = TRUE, null = "null"), "\n", sep = "")
  flush.console()
}

tryCatch({
  execution_summary <- jsonlite::read_json(
    file.path(output_directory, "execution-summary.json"),
    simplifyVector = FALSE
  )
  capabilities <- jsonlite::read_json(
    file.path(workspace, "output-capabilities.json"),
    simplifyVector = FALSE
  )
  emit_event(emit, "uploading-artifacts", 96L, "Uploading recovered scientific artifacts.")
  artifacts <- upload_artifacts(
    output_directory,
    capabilities,
    file.path(workspace, "output-capabilities.json")
  )
  emit(list(
    kind = "completed",
    summary = execution_summary$validation,
    artifacts = lapply(artifacts, function(artifact) artifact[c("kind", "size", "sha256")]),
    candidateCompletedAt = execution_summary$completedAt
  ))
}, validation_error = function(error) {
  emit(list(kind = "failed", code = error$code))
}, runtime_error = function(error) {
  emit(list(kind = "failed", code = error$code))
}, error = function(error) {
  message(conditionMessage(error))
  emit(list(kind = "failed", code = "R_RUNTIME_UNAVAILABLE"))
})
