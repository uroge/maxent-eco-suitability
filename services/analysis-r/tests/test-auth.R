source("r/auth.R")

assert_identical <- function(actual, expected, message) {
  if (!identical(actual, expected)) stop(message, call. = FALSE)
}

path <- "/v1/runs/an_0123456789abcdef0123456789abcdef.profile.1/events"

assert_identical(
  request_path(list(PATH_INFO = path, QUERY_STRING = "")),
  path,
  "An empty query string changed the authenticated request path."
)
assert_identical(
  request_path(list(PATH_INFO = path, QUERY_STRING = "afterSequence=0&limit=100")),
  paste0(path, "?afterSequence=0&limit=100"),
  "A query string without a prefix was not normalized."
)
assert_identical(
  request_path(list(PATH_INFO = path, QUERY_STRING = "?afterSequence=0&limit=100")),
  paste0(path, "?afterSequence=0&limit=100"),
  "A prefixed query string gained a second question mark."
)

cat("R runtime authentication tests passed.\n")
