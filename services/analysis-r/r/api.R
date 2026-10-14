source("r/auth.R")
source("r/run-store.R")

create_api <- function() {
  store <- create_run_store()
  api <- plumber::pr()
  api$addEndpoint("GET", "/health/live", function() list(status = "ok"))
  api$addEndpoint("GET", "/health/ready", function() list(status = "ok"))
  api$addFilter("authenticate", function(req, res) {
    if (startsWith(req$PATH_INFO, "/health/")) {
      return(plumber::forward())
    }
    verify_request(req, res)
  })
  api$addEndpoint("POST", "/v1/runs", function(req, res) {
    body <- parse_body(req, res)
    if (is.null(body)) return(NULL)
    result <- store$create(body)
    res$status <- result$status
    result$body
  })
  api$addEndpoint("PUT", "/v1/runs/<runId>/input-capabilities", function(req, res, runId) {
    body <- parse_body(req, res)
    if (is.null(body)) return(NULL)
    result <- store$set_capabilities(runId, body)
    res$status <- result$status
    result$body
  })
  api$addEndpoint("GET", "/v1/runs/<runId>/events", function(res, runId, afterSequence = "0", limit = "100") {
    result <- store$events(runId, afterSequence, limit)
    res$status <- result$status
    result$body
  })
  api$addEndpoint("DELETE", "/v1/runs/<runId>", function(res, runId) {
    result <- store$cancel(runId)
    res$status <- result$status
    result$body
  })
  api
}

parse_body <- function(req, res) {
  raw <- req$postBody
  if (is.null(raw) || length(raw) > 1024L * 1024L) {
    res$status <- 400L
    return(NULL)
  }
  tryCatch(jsonlite::fromJSON(rawToChar(raw), simplifyVector = FALSE), error = function(error) {
    res$status <- 400L
    NULL
  })
}
