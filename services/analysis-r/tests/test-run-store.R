source("r/artifacts.R")
source("r/run-store.R")

assert_identical <- function(actual, expected, message) {
  if (!identical(actual, expected)) stop(message, call. = FALSE)
}

workspace_root <- tempfile("run-store-")
dir.create(workspace_root)
on.exit(unlink(workspace_root, recursive = TRUE, force = TRUE), add = TRUE)
Sys.setenv(R_RUNTIME_WORKSPACE_ROOT = workspace_root)

run_id <- "an_0123456789abcdef0123456789abcdef.execute.1"
workspace <- file.path(workspace_root, run_id)
output_directory <- file.path(workspace, "outputs")
dir.create(output_directory, recursive = TRUE)

request <- list(
  runId = run_id,
  mode = "execute",
  analysisId = "an_0123456789abcdef0123456789abcdef",
  jobId = "an_0123456789abcdef0123456789abcdef",
  attempt = 1L,
  inputRevision = 1L,
  configurationRevision = 1L,
  configurationFingerprint = paste0("jcs-sha256-v1:", paste(rep("a", 64L), collapse = "")),
  inputFingerprint = paste0("jcs-sha256-v1:", paste(rep("b", 64L), collapse = ""))
)
jsonlite::write_json(
  request,
  file.path(workspace, "request.json"),
  auto_unbox = TRUE
)
jsonlite::write_json(
  list(generation = 1L),
  file.path(workspace, "recovery.json"),
  auto_unbox = TRUE
)

completed_at <- "2026-09-02T12:30:00.000Z"
for (definition in artifact_definitions()) {
  path <- file.path(output_directory, definition$filename)
  if (identical(definition$kind, "execution-summary")) {
    jsonlite::write_json(
      list(
        completedAt = completed_at,
        validation = list(
          acceptedOccurrences = 10L,
          deduplicatedOccurrences = 0L,
          selectedPredictors = 1L,
          validatedAt = "2026-09-02T12:00:00.000Z"
        )
      ),
      path,
      auto_unbox = TRUE
    )
  } else {
    writeLines(definition$kind, path)
  }
}

store <- create_run_store()
recovered <- store$create(request)
assert_identical(recovered$status, 202L, "Recovered run was not accepted.")
assert_identical(recovered$body$generation, 2L, "Recovery generation was not advanced.")
assert_identical(
  recovered$body$state,
  "awaiting-output-capabilities",
  "Completed artifacts were not recovered."
)

events <- store$events(run_id, 0L, 100L)
assert_identical(events$status, 200L, "Recovered events were unavailable.")
assert_identical(events$body$generation, 2L, "Recovered event generation is incorrect.")
assert_identical(length(events$body$artifacts), 9L, "Recovered artifact metadata is incomplete.")
assert_identical(
  events$body$candidateCompletedAt,
  completed_at,
  "Recovered completion timestamp is incorrect."
)

conflict <- request
conflict$inputFingerprint <- paste0("jcs-sha256-v1:", paste(rep("c", 64L), collapse = ""))
conflicted <- store$create(conflict)
assert_identical(conflicted$status, 409L, "Semantic run identity conflict was accepted.")
assert_identical(conflicted$body$code, "RUN_ID_CONFLICT", "Conflict code is incorrect.")

profile_run_id <- "an_1123456789abcdef0123456789abcdef.profile.4"
profile_workspace <- file.path(workspace_root, profile_run_id)
dir.create(profile_workspace, recursive = TRUE)
profile_request <- list(
  runId = profile_run_id,
  mode = "profile",
  analysisId = "an_1123456789abcdef0123456789abcdef",
  jobId = "profile-job",
  attempt = 1L,
  inputRevision = 4L,
  inputFingerprint = paste0("jcs-sha256-v1:", paste(rep("d", 64L), collapse = ""))
)
profile_result <- list(
  analysisId = profile_request$analysisId,
  inputRevision = 4L,
  inputFingerprint = profile_request$inputFingerprint,
  status = "passed"
)
jsonlite::write_json(profile_request, file.path(profile_workspace, "request.json"), auto_unbox = TRUE)
jsonlite::write_json(profile_result, file.path(profile_workspace, "job-result.json"), auto_unbox = TRUE)
profile_recovered <- store$create(profile_request)
assert_identical(profile_recovered$body$state, "succeeded", "Profile result was not recovered.")
profile_events <- store$events(profile_run_id, 0L, 100L)
assert_identical(profile_events$body$mode, "profile", "Recovered profile mode is incorrect.")
assert_identical(profile_events$body$result$status, "passed", "Recovered profile result is missing.")

cat("R runtime recovery tests passed.\n")
