port <- Sys.getenv("R_RUNTIME_PORT", "8080")
url <- sprintf("http://127.0.0.1:%s/health/live", port)

response <- tryCatch(curl::curl_fetch_memory(url), error = function(error) NULL)
if (is.null(response) || response$status_code != 200L) {
  quit(status = 1L)
}
