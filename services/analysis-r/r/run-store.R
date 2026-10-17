create_run_store <- function() {
  runs <- new.env(parent = emptyenv())
  workspace_root <- Sys.getenv("R_RUNTIME_WORKSPACE_ROOT", "/workspaces")
  dir.create(workspace_root, recursive = TRUE, showWarnings = FALSE)
  safe_run_id <- function(run_id) {
    is.character(run_id) && grepl("^an_[a-z0-9]{32}\\.(profile|validate|execute)\\.[0-9]+(\\.[0-9]+)?$", run_id)
  }
  semantic_request <- function(body) {
    list(
      runId = body$runId,
      analysisId = body$analysisId,
      jobId = body$jobId,
      mode = body$mode,
      inputRevision = body$inputRevision,
      configurationRevision = body$configurationRevision,
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
  persist_recovery <- function(run) {
    dir.create(run$workspace, recursive = TRUE, showWarnings = FALSE, mode = "0700")
    path <- file.path(run$workspace, "recovery.json")
    temporary <- paste0(path, ".tmp")
    jsonlite::write_json(
      list(generation = run$generation),
      temporary,
      auto_unbox = TRUE
    )
    if (!file.rename(temporary, path)) stop("Unable to persist run recovery state.")
  }
  terminal <- function(run, state, code = NULL, summary = NULL, artifacts = NULL, result = NULL) {
    run$state <- state
    run$failureCode <- code
    run$summary <- summary
    run$artifacts <- artifacts
    run$result <- result
    run$finishedAt <- Sys.time()
    if (state %in% c("failed", "cancelled") && dir.exists(run$workspace)) {
      unlink(run$workspace, recursive = TRUE, force = TRUE)
    }
  }
  stop_child <- function(run) {
    if (is.null(run$child) || !run$child$is_alive()) return(invisible(NULL))
    run$child$signal(15L)
    deadline <- Sys.time() + 2
    while (run$child$is_alive() && Sys.time() < deadline) {
      Sys.sleep(0.05)
    }
    if (run$child$is_alive()) run$child$kill()
  }
  workspace_bytes <- function(path) {
    if (!dir.exists(path)) return(0)
    files <- list.files(path, recursive = TRUE, full.names = TRUE, all.files = TRUE)
    if (length(files) == 0L) return(0)
    sum(file.info(files)$size, na.rm = TRUE)
  }
  poll_child <- function(run) {
    if (is.null(run$child)) return(invisible(NULL))
    if (!is.null(run$deadline) && Sys.time() > run$deadline && run$child$is_alive()) {
      stop_child(run)
      terminal(run, "failed", "R_RUNTIME_TIMEOUT")
      return(invisible(NULL))
    }
    quota <- as.numeric(Sys.getenv("R_RUNTIME_WORKSPACE_QUOTA_BYTES", "6442450944"))
    if (workspace_bytes(run$workspace) > quota) {
      stop_child(run)
      terminal(run, "failed", "INPUT_RESOURCE_LIMIT_EXCEEDED")
      return(invisible(NULL))
    }
    diagnostics <- run$child$read_error_lines()
    if (length(diagnostics) > 0L) {
      run$diagnosticBytes <- min(8192L, run$diagnosticBytes + sum(nchar(diagnostics, type = "bytes")))
    }
    lines <- run$child$read_output_lines()
    for (line in lines) {
      if (run$state %in% c("succeeded", "failed", "cancelled")) break
      if (nchar(line, type = "bytes") > 1024L * 1024L) {
        terminal(run, "failed", "R_RUNTIME_PROTOCOL_INVALID")
        next
      }
      control <- tryCatch(jsonlite::fromJSON(line, simplifyVector = FALSE), error = function(error) NULL)
      if (is.null(control) || is.null(control$kind)) {
        terminal(run, "failed", "R_RUNTIME_PROTOCOL_INVALID")
      } else if (identical(control$kind, "event")) {
        event(run, control$stage, control$percent, control$message)
        run$state <- "running"
      } else if (identical(control$kind, "artifacts-ready")) {
        if (
          !identical(run$request$mode, "execute") ||
          is.null(control$artifacts) ||
            length(control$artifacts) != 9L ||
            is.null(control$candidateCompletedAt)
        ) {
          terminal(run, "failed", "R_RUNTIME_PROTOCOL_INVALID")
        } else {
          run$artifacts <- control$artifacts
          run$candidateCompletedAt <- control$candidateCompletedAt
          run$state <- "awaiting-output-capabilities"
          persist_recovery(run)
          event(run, "writing-artifacts", 94L, "Scientific artifacts are ready for upload.")
        }
      } else if (identical(control$kind, "completed")) {
        event(run, "completed", 100L, if (identical(run$request$mode, "execute")) "Scientific model execution completed." else "Scientific validation job completed.")
        if (identical(run$request$mode, "execute")) {
          run$candidateCompletedAt <- control$candidateCompletedAt
          terminal(run, "succeeded", summary = control$summary, artifacts = control$artifacts)
        } else if (is.null(control$result)) {
          terminal(run, "failed", "R_RUNTIME_PROTOCOL_INVALID")
        } else {
          terminal(run, "succeeded", result = control$result)
        }
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
    run$deadline <- Sys.time() + as.numeric(Sys.getenv("R_RUNTIME_RUN_TIMEOUT_MS", "1800000")) / 1000
    persist_recovery(run)
    event(run, "accepted", 0L, sprintf("Scientific %s job accepted.", run$request$mode))
  }
  restore_run <- function(run_id) {
    if (!safe_run_id(run_id)) return(NULL)
    workspace <- file.path(workspace_root, run_id)
    request_file <- file.path(workspace, "request.json")
    if (!file.exists(request_file)) return(NULL)
    request <- tryCatch(
      jsonlite::read_json(request_file, simplifyVector = FALSE),
      error = function(error) NULL
    )
    if (is.null(request)) return(NULL)
    run <- new.env(parent = emptyenv())
    run$request <- request
    run$semantic <- semantic_request(request)
    run$state <- "accepted"
    recovery <- tryCatch(
      jsonlite::read_json(file.path(workspace, "recovery.json"), simplifyVector = TRUE),
      error = function(error) NULL
    )
    run$generation <- if (is.null(recovery$generation)) 2L else as.integer(recovery$generation) + 1L
    run$sequence <- 0L
    run$events <- list()
    run$summary <- NULL
    run$artifacts <- NULL
    run$result <- NULL
    run$candidateCompletedAt <- NULL
    run$failureCode <- NULL
    run$workspace <- workspace
    run$capabilities <- NULL
    run$child <- NULL
    run$diagnosticBytes <- 0L
    run$deadline <- NULL
    output_directory <- file.path(workspace, "outputs")
    definitions <- artifact_definitions()
    filenames <- vapply(definitions, `[[`, character(1), "filename")
    paths <- file.path(output_directory, filenames)
    result_path <- file.path(workspace, "job-result.json")
    if (!identical(request$mode, "execute") && file.exists(result_path)) {
      run$result <- tryCatch(jsonlite::read_json(result_path, simplifyVector = FALSE), error = function(error) NULL)
      if (!is.null(run$result)) run$state <- "succeeded"
    } else if (identical(request$mode, "execute") && all(file.exists(paths))) {
      kinds <- vapply(definitions, `[[`, character(1), "kind")
      run$artifacts <- lapply(seq_along(paths), function(index) {
        list(
          kind = kinds[[index]],
          size = as.numeric(file.info(paths[[index]])$size),
          sha256 = digest::digest(file = paths[[index]], algo = "sha256", serialize = FALSE)
        )
      })
      summary <- tryCatch(
        jsonlite::read_json(paths[[1L]], simplifyVector = FALSE),
        error = function(error) NULL
      )
      if (!is.null(summary$completedAt)) {
        run$candidateCompletedAt <- summary$completedAt
        run$state <- "awaiting-output-capabilities"
      }
    }
    if (identical(run$state, "accepted")) {
      unlink(output_directory, recursive = TRUE, force = TRUE)
      unlink(file.path(workspace, "output-capabilities.json"), force = TRUE)
    }
    assign(run_id, run, envir = runs)
    persist_recovery(run)
    event(run, "accepted", 0L, sprintf("Recovered scientific %s job after runtime restart.", request$mode))
    if (identical(run$state, "awaiting-output-capabilities")) {
      event(run, "writing-artifacts", 94L, "Recovered scientific artifacts are ready for upload.")
    }
    run
  }
  find_run <- function(run_id) {
    if (!exists(run_id, envir = runs, inherits = FALSE)) return(restore_run(run_id))
    get(run_id, envir = runs, inherits = FALSE)
  }

  list(
    create = function(body) {
      if (!safe_run_id(body$runId) || is.null(body$mode) || !(body$mode %in% c("profile", "validate", "execute")) || is.null(body$inputFingerprint) || (body$mode %in% c("validate", "execute") && is.null(body$configurationFingerprint))) {
        return(list(status = 400L, body = list(code = "R_RUNTIME_PROTOCOL_INVALID")))
      }
      existing <- find_run(body$runId)
      if (!is.null(existing)) {
        if (!identical(existing$semantic, semantic_request(body))) {
          return(list(status = 409L, body = list(code = "RUN_ID_CONFLICT")))
        }
        poll_child(existing)
        failure_code <- if (is.null(existing$failureCode)) "" else existing$failureCode
        retryable_failure <- (
          (identical(existing$state, "failed") && startsWith(failure_code, "R_RUNTIME_")) ||
            identical(existing$state, "cancelled")
        ) &&
          body$attempt > existing$request$attempt
        if (retryable_failure) {
          existing$request <- body
          existing$state <- "accepted"
          existing$generation <- existing$generation + 1L
          existing$sequence <- 0L
          existing$events <- list()
          existing$summary <- NULL
          existing$artifacts <- NULL
          existing$result <- NULL
          existing$candidateCompletedAt <- NULL
          existing$failureCode <- NULL
          existing$child <- NULL
          existing$deadline <- NULL
          unlink(file.path(existing$workspace, "job-result.json"), force = TRUE)
          event(existing, "accepted", 0L, "Retrying scientific execution after a runtime failure.")
        }
        return(list(status = 202L, body = list(runId = body$runId, state = existing$state, eventSequence = existing$sequence, generation = existing$generation)))
      }
      workspace <- file.path(workspace_root, body$runId)
      run <- new.env(parent = emptyenv())
      run$request <- body
      run$semantic <- semantic_request(body)
      run$state <- "accepted"
      run$generation <- 1L
      run$sequence <- 0L
      run$events <- list()
      run$summary <- NULL
      run$artifacts <- NULL
      run$result <- NULL
      run$candidateCompletedAt <- NULL
      run$failureCode <- NULL
      run$workspace <- workspace
      run$capabilities <- NULL
      run$child <- NULL
      run$diagnosticBytes <- 0L
      run$deadline <- NULL
      assign(body$runId, run, envir = runs)
      list(status = 202L, body = list(runId = body$runId, state = "accepted", eventSequence = 0L, generation = run$generation))
    },
    set_capabilities = function(run_id, body) {
      run <- find_run(run_id)
      if (is.null(run)) return(list(status = 404L, body = list(code = "R_RUNTIME_UNAVAILABLE")))
      if (is.null(body$capabilities) || length(body$capabilities) > 128L) {
        return(list(status = 400L, body = list(code = "R_RUNTIME_PROTOCOL_INVALID")))
      }
      run$capabilities <- body
      if (dir.exists(run$workspace) && !identical(run$state, "accepted")) {
        path <- file.path(run$workspace, "capabilities.json")
        temporary <- paste0(path, ".tmp")
        jsonlite::write_json(run$capabilities, temporary, auto_unbox = TRUE, null = "null")
        if (!file.rename(temporary, path)) {
          return(list(status = 503L, body = list(code = "R_RUNTIME_UNAVAILABLE")))
        }
      }
      start_child(run)
      list(status = 202L, body = list(runId = run_id, state = run$state, eventSequence = run$sequence))
    },
    set_output_capabilities = function(run_id, body) {
      run <- find_run(run_id)
      if (is.null(run)) return(list(status = 404L, body = list(code = "R_RUNTIME_UNAVAILABLE")))
      poll_child(run)
      if (!identical(run$request$mode, "execute") || !(run$state %in% c("awaiting-output-capabilities", "running")) || is.null(run$artifacts) || is.null(body$capabilities) || length(body$capabilities) != 9L) {
        return(list(status = 409L, body = list(code = "R_RUNTIME_PROTOCOL_INVALID")))
      }
      path <- file.path(run$workspace, "output-capabilities.json")
      temporary <- paste0(path, ".tmp")
      jsonlite::write_json(list(capabilities = body$capabilities), temporary, auto_unbox = TRUE, null = "null")
      if (!file.rename(temporary, path)) {
        return(list(status = 503L, body = list(code = "R_RUNTIME_UNAVAILABLE")))
      }
      if (is.null(run$child)) {
        run$child <- processx::process$new(
          "Rscript",
          c("scripts/upload-recovered.R", run$workspace),
          stdout = "|",
          stderr = "|",
          cleanup_tree = TRUE,
          env = c(
            R_MAX_VSIZE = Sys.getenv("R_RUNTIME_CHILD_MEMORY_BYTES", "2147483648"),
            R_RUNTIME_WORKSPACE_QUOTA_BYTES = Sys.getenv("R_RUNTIME_WORKSPACE_QUOTA_BYTES", "6442450944")
          )
        )
        run$deadline <- Sys.time() + as.numeric(Sys.getenv("R_RUNTIME_RUN_TIMEOUT_MS", "1800000")) / 1000
      }
      run$state <- "running"
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
      list(status = 200L, body = list(mode = run$request$mode, generation = run$generation, events = selected, nextSequence = next_sequence, hasMore = has_more, state = run$state, summary = run$summary, artifacts = run$artifacts, result = run$result, candidateCompletedAt = run$candidateCompletedAt, failureCode = run$failureCode))
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
        stop_child(run)
      }
      terminal(run, "cancelled")
      list(status = 202L, body = list(runId = run_id, state = run$state, eventSequence = run$sequence))
    },
    complete = function(run_id) {
      run <- find_run(run_id)
      if (is.null(run)) return(list(status = 404L, body = list(code = "R_RUNTIME_UNAVAILABLE")))
      if (!identical(run$state, "succeeded")) {
        return(list(status = 409L, body = list(code = "R_RUNTIME_PROTOCOL_INVALID")))
      }
      if (dir.exists(run$workspace)) unlink(run$workspace, recursive = TRUE, force = TRUE)
      rm(list = run_id, envir = runs)
      list(status = 200L, body = list(runId = run_id, state = "completed"))
    }
  )
}
