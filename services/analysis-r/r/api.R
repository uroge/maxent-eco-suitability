source("r/auth.R")
source("r/artifacts.R")
source("r/run-store.R")

create_api <- function() {
  store <- create_run_store()
  api <- plumber::pr()
  api$setSerializer(plumber::serializer_json(auto_unbox = TRUE, null = "null"))
  api$handle("GET", "/health/live", function() list(status = "ok"))
  api$handle("GET", "/health/ready", function() list(status = "ok"))
  api$filter("authenticate", function(req, res) {
    if (startsWith(req$PATH_INFO, "/health/")) {
      return(plumber::forward())
    }
    verify_request(req, res)
  })
  api$handle("POST", "/v1/runs", function(req, res) {
    body <- parse_body(req, res)
    if (is.null(body)) return(NULL)
    result <- store$create(body)
    res$status <- result$status
    result$body
  })
  api$handle("PUT", "/v1/runs/<runId>/input-capabilities", function(req, res, runId) {
    body <- parse_body(req, res)
    if (is.null(body)) return(NULL)
    result <- store$set_capabilities(runId, body)
    res$status <- result$status
    result$body
  })
  api$handle("PUT", "/v1/runs/<runId>/output-capabilities", function(req, res, runId) {
    body <- parse_body(req, res)
    if (is.null(body)) return(NULL)
    result <- store$set_output_capabilities(runId, body)
    res$status <- result$status
    result$body
  })
  api$handle("GET", "/v1/runs/<runId>/events", function(res, runId, afterSequence = "0", limit = "100") {
    result <- store$events(runId, afterSequence, limit)
    res$status <- result$status
    result$body
  })
  api$handle("DELETE", "/v1/runs/<runId>", function(res, runId) {
    result <- store$cancel(runId)
    res$status <- result$status
    result$body
  })
  api$handle("POST", "/v1/runs/<runId>/complete", function(res, runId) {
    result <- store$complete(runId)
    res$status <- result$status
    result$body
  })
  api
}

parse_body <- function(req, res) {
  raw <- req$postBody
  body <- if (is.raw(raw)) {
    rawToChar(raw)
  } else if (is.character(raw) && length(raw) == 1L) {
    raw[[1L]]
  } else {
    NULL
  }
  if (is.null(body) || nchar(body, type = "bytes") > 1024L * 1024L) {
    res$status <- 400L
    return(NULL)
  }
  tryCatch(jsonlite::fromJSON(body, simplifyVector = FALSE), error = function(error) {
    res$status <- 400L
    NULL
  })
}
