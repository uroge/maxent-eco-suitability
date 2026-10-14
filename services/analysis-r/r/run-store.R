create_run_store <- function() {
  runs <- new.env(parent = emptyenv())
  workspace_root <- Sys.getenv("R_RUNTIME_WORKSPACE_ROOT", "/workspaces")
  dir.create(workspace_root, recursive = TRUE, showWarnings = FALSE)
  abandoned <- list.dirs(workspace_root, recursive = FALSE, full.names = TRUE)
  if (length(abandoned) > 0L) {
    unlink(abandoned, recursive = TRUE, force = TRUE)
  }

  safe_run_id <- function(run_id) {
    is.character(run_id) && grepl("^an_[a-z0-9]{32}\\.[1-9][0-9]*$", run_id)
  }
  semantic_request <- function(body) {
    list(
      runId = body$runId,
      analysisId = body$analysisId,
      jobId = body$jobId,
      attempt = body$attempt,
      configurationFingerprint = body$configurationFingerprint,
      inputFingerprint = body$inputFingerprint
    )
  }
  event <- function(run, stage, percent, message) {
    if (length(run$events) >= 1000L) {
      run$events <- run$events[(length(run$events) - 998L):length(run$events)]
    }
    run$sequence <- run$sequence + 1L
    run$events[[length(run$events) + 1L]] <- list(
      sequence = run$sequence,
      stage = stage,
      percent = as.integer(percent),
      message = substr(message, 1L, 256L)
    )
  }
  terminal <- function(run, state, code = NULL, summary = NULL) {
    run$state <- state
    run$failureCode <- code
    run$summary <- summary
    run$finishedAt <- Sys.time()
    if (dir.exists(run$workspace)) {
      unlink(run$workspace, recursive = TRUE, force = TRUE)
    }
  }
  poll_child <- function(run) {
    if (is.null(run$child)) return(invisible(NULL))
    diagnostics <- run$child$read_error_lines()
    if (length(diagnostics) > 0L) {
      run$diagnosticBytes <- min(8192L, run$diagnosticBytes + sum(nchar(diagnostics, type = "bytes")))
    }
    lines <- run$child$read_output_lines()
    for (line in lines) {
      if (nchar(line, type = "bytes") > 8192L) {
        terminal(run, "failed", "R_RUNTIME_PROTOCOL_INVALID")
        next
      }
      control <- tryCatch(jsonlite::fromJSON(line, simplifyVector = FALSE), error = function(error) NULL)
      if (is.null(control) || is.null(control$kind)) {
        terminal(run, "failed", "R_RUNTIME_PROTOCOL_INVALID")
      } else if (identical(control$kind, "event")) {
        event(run, control$stage, control$percent, control$message)
        run$state <- "running"
      } else if (identical(control$kind, "completed")) {
        event(run, "completed", 100L, "Scientific input validation completed.")
        terminal(run, "succeeded", summary = control$summary)
      } else if (identical(control$kind, "failed")) {
        terminal(run, "failed", control$code)
      } else {
        terminal(run, "failed", "R_RUNTIME_PROTOCOL_INVALID")
      }
    }
    if (!run$child$is_alive() && run$state %in% c("accepted", "running", "cancelling")) {
      terminal(run, "failed", "R_RUNTIME_UNAVAILABLE")
    }
  }
  start_child <- function(run) {
    if (is.null(run$capabilities) || !identical(run$state, "accepted")) return()
    dir.create(run$workspace, recursive = TRUE, showWarnings = FALSE, mode = "0700")
    request_file <- file.path(run$workspace, "request.json")
    capability_file <- file.path(run$workspace, "capabilities.json")
    jsonlite::write_json(run$request, request_file, auto_unbox = TRUE, null = "null")
    jsonlite::write_json(run$capabilities, capability_file, auto_unbox = TRUE, null = "null")
    run$child <- processx::process$new(
      "Rscript",
      c("scripts/validate-run.R", request_file, capability_file, run$workspace),
      stdout = "|",
      stderr = "|",
      cleanup_tree = TRUE,
      env = c(
        R_MAX_VSIZE = Sys.getenv("R_RUNTIME_CHILD_MEMORY_BYTES", "2147483648"),
        R_RUNTIME_WORKSPACE_QUOTA_BYTES = Sys.getenv("R_RUNTIME_WORKSPACE_QUOTA_BYTES", "6442450944")
      )
    )
    event(run, "accepted", 0L, "Scientific input validation accepted.")
  }
  find_run <- function(run_id) {
    if (!exists(run_id, envir = runs, inherits = FALSE)) return(NULL)
    get(run_id, envir = runs, inherits = FALSE)
  }

  list(
    create = function(body) {
      if (!safe_run_id(body$runId) || is.null(body$configurationFingerprint) || is.null(body$inputFingerprint)) {
        return(list(status = 400L, body = list(code = "R_RUNTIME_PROTOCOL_INVALID")))
      }
      existing <- find_run(body$runId)
      if (!is.null(existing)) {
        if (!identical(existing$semantic, semantic_request(body))) {
          return(list(status = 409L, body = list(code = "RUN_ID_CONFLICT")))
        }
        poll_child(existing)
        return(list(status = 202L, body = list(runId = body$runId, state = existing$state, eventSequence = existing$sequence)))
      }
      workspace <- file.path(workspace_root, body$runId)
      run <- new.env(parent = emptyenv())
      run$request <- body
      run$semantic <- semantic_request(body)
      run$state <- "accepted"
      run$sequence <- 0L
      run$events <- list()
      run$summary <- NULL
      run$failureCode <- NULL
      run$workspace <- workspace
      run$capabilities <- NULL
      run$child <- NULL
      run$diagnosticBytes <- 0L
      assign(body$runId, run, envir = runs)
      list(status = 202L, body = list(runId = body$runId, state = "accepted", eventSequence = 0L))
    },
    set_capabilities = function(run_id, body) {
      run <- find_run(run_id)
      if (is.null(run)) return(list(status = 404L, body = list(code = "R_RUNTIME_UNAVAILABLE")))
      if (is.null(body$capabilities) || length(body$capabilities) > 128L) {
        return(list(status = 400L, body = list(code = "R_RUNTIME_PROTOCOL_INVALID")))
      }
      run$capabilities <- body$capabilities
      start_child(run)
      list(status = 202L, body = list(runId = run_id, state = run$state, eventSequence = run$sequence))
    },
    events = function(run_id, after_sequence, limit) {
      run <- find_run(run_id)
      if (is.null(run)) return(list(status = 404L, body = list(code = "R_RUNTIME_UNAVAILABLE")))
      poll_child(run)
      after <- suppressWarnings(as.integer(after_sequence))
      page_size <- suppressWarnings(as.integer(limit))
      if (is.na(after) || after < 0L || is.na(page_size) || page_size < 1L || page_size > 100L) {
        return(list(status = 400L, body = list(code = "R_RUNTIME_PROTOCOL_INVALID")))
      }
      selected <- Filter(function(item) item$sequence > after, run$events)
      has_more <- length(selected) > page_size
      selected <- head(selected, page_size)
      next_sequence <- if (length(selected) == 0L) after else selected[[length(selected)]]$sequence
      list(status = 200L, body = list(events = selected, nextSequence = next_sequence, hasMore = has_more, state = run$state, summary = run$summary, failureCode = run$failureCode))
    },
    cancel = function(run_id) {
      run <- find_run(run_id)
      if (is.null(run)) return(list(status = 404L, body = list(code = "R_RUNTIME_UNAVAILABLE")))
      poll_child(run)
      if (run$state %in% c("succeeded", "failed", "cancelled")) {
        return(list(status = 200L, body = list(runId = run_id, state = run$state, eventSequence = run$sequence)))
      }
      run$state <- "cancelling"
      if (!is.null(run$child) && run$child$is_alive()) {
        run$child$signal(15L)
        deadline <- Sys.time() + 10
        while (run$child$is_alive() && Sys.time() < deadline) {
          Sys.sleep(0.1)
        }
        if (run$child$is_alive()) {
          run$child$kill()
        }
      }
      terminal(run, "cancelled")
      list(status = 202L, body = list(runId = run_id, state = run$state, eventSequence = run$sequence))
    }
  )
}
