source("r/api.R")

assert_identical <- function(actual, expected, message) {
  if (!identical(actual, expected)) stop(message, call. = FALSE)
}

character_response <- new.env(parent = emptyenv())
character_body <- parse_body(
  list(postBody = '{"mode":"profile","inputRevision":2}'),
  character_response
)
assert_identical(character_body$mode, "profile", "A character request body was not parsed.")
assert_identical(character_body$inputRevision, 2L, "A character request number was not parsed.")

raw_response <- new.env(parent = emptyenv())
raw_body <- parse_body(
  list(postBody = charToRaw('{"mode":"validate"}')),
  raw_response
)
assert_identical(raw_body$mode, "validate", "A raw request body was not parsed.")

invalid_response <- new.env(parent = emptyenv())
invalid_body <- parse_body(list(postBody = "{"), invalid_response)
assert_identical(invalid_body, NULL, "Malformed JSON was accepted.")
assert_identical(invalid_response$status, 400L, "Malformed JSON did not return status 400.")

cat("R runtime API tests passed.\n")
