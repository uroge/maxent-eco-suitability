runtime_library <- "/opt/analysis-r/runtime-library"

if (!dir.exists(runtime_library)) {
  stop("The R runtime package library is unavailable.", call. = FALSE)
}

.libPaths(c(runtime_library, .libPaths()))
