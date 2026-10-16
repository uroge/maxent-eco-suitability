nonce_cache <- new.env(parent = emptyenv())

constant_time_equal <- function(left, right) {
  left_raw <- charToRaw(left)
  right_raw <- charToRaw(right)
  if (length(left_raw) != length(right_raw)) return(FALSE)
  difference <- 0L
  for (index in seq_along(left_raw)) {
    difference <- bitwOr(difference, bitwXor(as.integer(left_raw[index]), as.integer(right_raw[index])))
  }
  identical(difference, 0L)
}

request_path <- function(req) {
  if (is.null(req$QUERY_STRING) || identical(req$QUERY_STRING, "")) return(req$PATH_INFO)
  paste0(req$PATH_INFO, "?", req$QUERY_STRING)
}

verify_request <- function(req, res) {
  timestamp <- req$HTTP_X_RUN_TIMESTAMP
  nonce <- req$HTTP_X_RUN_NONCE
  hash <- req$HTTP_X_RUN_BODY_SHA256
  signature <- req$HTTP_X_RUN_SIGNATURE
  invalid <- any(vapply(list(timestamp, nonce, hash, signature), is.null, logical(1))) ||
    nchar(timestamp) > 16L || nchar(nonce) > 128L || nchar(hash) != 64L || nchar(signature) != 64L
  if (invalid || is.na(suppressWarnings(as.numeric(timestamp))) || abs(as.numeric(Sys.time()) * 1000 - as.numeric(timestamp)) > 60000) {
    res$status <- 401L
    return(list(code = "R_RUNTIME_PROTOCOL_INVALID"))
  }
  if (exists(nonce, envir = nonce_cache, inherits = FALSE)) {
    res$status <- 401L
    return(list(code = "R_RUNTIME_PROTOCOL_INVALID"))
  }
  raw <- req$postBody
  actual_hash <- digest::digest(if (is.null(raw)) raw() else raw, algo = "sha256", serialize = FALSE)
  secret <- Sys.getenv("R_RUNTIME_SHARED_SECRET", "")
  if (nchar(secret) < 32L || !constant_time_equal(tolower(hash), actual_hash)) {
    res$status <- 401L
    return(list(code = "R_RUNTIME_PROTOCOL_INVALID"))
  }
  derived <- digest::hmac(secret, "ecosuitability-r-runtime-v1", algo = "sha256", serialize = FALSE, raw = TRUE)
  canonical <- paste("v1", req$REQUEST_METHOD, request_path(req), timestamp, nonce, tolower(hash), sep = "\n")
  expected <- digest::hmac(derived, canonical, algo = "sha256", serialize = FALSE)
  if (!constant_time_equal(tolower(signature), expected)) {
    res$status <- 401L
    return(list(code = "R_RUNTIME_PROTOCOL_INVALID"))
  }
  assign(nonce, as.numeric(Sys.time()), envir = nonce_cache)
  keys <- ls(nonce_cache)
  expired <- vapply(keys, function(key) as.numeric(Sys.time()) - get(key, nonce_cache) > 60, logical(1))
  if (any(expired)) {
    rm(list = keys[expired], envir = nonce_cache)
  }
  keys <- ls(nonce_cache)
  if (length(keys) > 4096L) {
    rm(list = keys[seq_len(length(keys) - 4096L)], envir = nonce_cache)
  }
  plumber::forward()
}
