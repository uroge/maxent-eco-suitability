source("r/validate.R")

arguments <- commandArgs(trailingOnly = TRUE)
if (length(arguments) != 3L) stop("Expected request, capabilities, and workspace paths.")

emit <- function(value) {
  cat(jsonlite::toJSON(value, auto_unbox = TRUE, null = "null"), "\n", sep = "")
  flush.console()
}

tryCatch({
  request <- jsonlite::read_json(arguments[[1L]], simplifyVector = FALSE)
  capabilities <- jsonlite::read_json(arguments[[2L]], simplifyVector = FALSE)
  summary <- validate_run(request, capabilities, arguments[[3L]], emit)
  emit(list(kind = "completed", summary = summary))
}, validation_error = function(error) {
  emit(list(kind = "failed", code = error$code))
}, error = function(error) {
  message(conditionMessage(error))
  emit(list(kind = "failed", code = "R_RUNTIME_UNAVAILABLE"))
})
