abort_model <- function(code) {
  stop(structure(
    list(message = code, call = NULL, code = code),
    class = c("validation_error", "error", "condition")
  ))
}

feature_codes <- function(classes) {
  codes <- c(linear = "l", quadratic = "q", product = "p", hinge = "h", threshold = "t")
  paste0(unname(codes[classes]), collapse = "")
}

auc <- function(presence, background) {
  if (
    length(presence) == 0L ||
      length(background) == 0L ||
      any(!is.finite(presence)) ||
      any(!is.finite(background))
  ) {
    abort_model("MODEL_EVALUATION_FAILED")
  }
  ranks <- rank(c(presence, background), ties.method = "average")
  (sum(ranks[seq_along(presence)]) - length(presence) * (length(presence) + 1) / 2) /
    (length(presence) * length(background))
}

threshold_metrics <- function(presence, background) {
  if (
    length(presence) == 0L ||
      length(background) == 0L ||
      any(!is.finite(presence)) ||
      any(!is.finite(background))
  ) {
    abort_model("MODEL_THRESHOLD_INVALID")
  }
  values <- sort(unique(c(presence, background)))
  scores <- vapply(values, function(value) {
    mean(presence >= value) + mean(background < value)
  }, numeric(1))
  best <- which(scores == max(scores))[[1L]]
  threshold <- values[[best]]
  list(
    threshold = threshold,
    sensitivity = mean(presence >= threshold),
    specificity = mean(background < threshold),
    truePositive = sum(presence >= threshold),
    falseNegative = sum(presence < threshold),
    trueNegative = sum(background < threshold),
    falsePositive = sum(background >= threshold)
  )
}

partition_indices <- function(count, validation, seed) {
  set.seed(seed)
  shuffled <- sample.int(count)
  if (identical(validation$method, "train-test-split")) {
    evaluation <- floor(count * validation$testFraction)
    return(list(list(
      train = shuffled[(evaluation + 1L):count],
      test = shuffled[seq_len(evaluation)]
    )))
  }
  folds <- split(shuffled, rep(seq_len(validation$folds), length.out = count))
  lapply(seq_along(folds), function(index) {
    list(train = setdiff(shuffled, folds[[index]]), test = folds[[index]])
  })
}

scan_study_area <- function(stack, predictors, count, seed) {
  set.seed(seed)
  block_plan <- terra::blocks(stack)
  predictor_count <- terra::nlyr(stack)
  categorical <- vapply(
    predictors,
    function(predictor) identical(predictor$type, "categorical"),
    logical(1)
  )
  ranges <- lapply(seq_len(predictor_count), function(index) c(Inf, -Inf))
  categories <- lapply(seq_len(predictor_count), function(index) numeric())
  reservoir_cells <- numeric()
  reservoir_values <- matrix(numeric(), nrow = 0L, ncol = predictor_count)
  reservoir_priorities <- numeric()
  valid_cells <- 0

  terra::readStart(stack)
  on.exit(terra::readStop(stack), add = TRUE)
  for (block_index in seq_len(block_plan$n)) {
    values <- terra::readValues(
      stack,
      row = block_plan$row[[block_index]],
      nrows = block_plan$nrows[[block_index]],
      mat = TRUE
    )
    if (is.null(dim(values))) {
      values <- matrix(values, ncol = predictor_count)
    }
    valid <- rowSums(is.finite(values)) == predictor_count
    if (!any(valid)) {
      next
    }
    block_values <- values[valid, , drop = FALSE]
    offsets <- which(valid)
    block_cells <-
      (block_plan$row[[block_index]] - 1) * terra::ncol(stack) + offsets

    for (index in seq_len(predictor_count)) {
      column <- block_values[, index]
      if (categorical[[index]]) {
        if (any(column != floor(column))) {
          abort_model("PREDICTOR_CATEGORICAL_INVALID")
        }
        categories[[index]] <- sort(unique(c(categories[[index]], column)))
        if (length(categories[[index]]) > 256L) {
          abort_model("PREDICTOR_CATEGORICAL_INVALID")
        }
      } else {
        ranges[[index]][[1L]] <- min(ranges[[index]][[1L]], min(column))
        ranges[[index]][[2L]] <- max(ranges[[index]][[2L]], max(column))
      }
    }

    valid_cells <- valid_cells + nrow(block_values)
    candidates_cells <- c(reservoir_cells, block_cells)
    candidates_values <- rbind(reservoir_values, block_values)
    candidates_priorities <- c(reservoir_priorities, stats::runif(nrow(block_values)))
    keep_count <- min(count, length(candidates_cells))
    keep <- order(candidates_priorities, method = "radix")[seq_len(keep_count)]
    reservoir_cells <- candidates_cells[keep]
    reservoir_values <- candidates_values[keep, , drop = FALSE]
    reservoir_priorities <- candidates_priorities[keep]
  }
  if (valid_cells < count || nrow(reservoir_values) != count) {
    abort_model("BACKGROUND_CAPACITY_INSUFFICIENT")
  }
  if (any(categorical & vapply(categories, length, integer(1)) < 2L)) {
    abort_model("PREDICTOR_CATEGORICAL_INVALID")
  }
  names(ranges) <- vapply(predictors, function(predictor) predictor$variableName, character(1))
  names(categories) <- names(ranges)
  colnames(reservoir_values) <- names(ranges)
  list(
    cells = reservoir_cells,
    values = as.data.frame(reservoir_values),
    validCells = valid_cells,
    ranges = ranges,
    categories = categories,
    categorical = categorical
  )
}

prepare_predictors <- function(values, study_area) {
  prepared <- as.data.frame(values, stringsAsFactors = FALSE)
  for (index in which(study_area$categorical)) {
    prepared[[index]] <- factor(
      prepared[[index]],
      levels = study_area$categories[[index]]
    )
  }
  prepared
}

fit_model <- function(presence, background, configuration, study_area) {
  values <- prepare_predictors(rbind(presence, background), study_area)
  labels <- c(rep.int(1L, nrow(presence)), rep.int(0L, nrow(background)))
  formula <- maxnet::maxnet.formula(
    labels,
    values,
    classes = feature_codes(configuration$model$featureClasses)
  )
  model <- tryCatch(
    maxnet::maxnet(
      labels,
      values,
      f = formula,
      regmult = configuration$model$regularizationMultiplier,
      addsamplestobackground = FALSE
    ),
    error = function(error) NULL
  )
  if (is.null(model)) {
    abort_model("MODEL_TRAINING_FAILED")
  }
  model
}

predict_values <- function(model, values, study_area, failure_code = "MODEL_EVALUATION_FAILED") {
  predictions <- tryCatch(
    suppressWarnings(as.numeric(stats::predict(
      model,
      prepare_predictors(values, study_area),
      type = "cloglog"
    ))),
    error = function(error) NULL
  )
  if (is.null(predictions) || any(!is.finite(predictions))) {
    abort_model(failure_code)
  }
  predictions
}

evaluate_partitions <- function(presence, background, configuration, study_area) {
  partitions <- partition_indices(
    nrow(presence),
    configuration$validation,
    configuration$seed
  )
  evaluations <- lapply(seq_along(partitions), function(index) {
    partition <- partitions[[index]]
    model <- fit_model(
      presence[partition$train, , drop = FALSE],
      background,
      configuration,
      study_area
    )
    presence_predictions <- predict_values(
      model,
      presence[partition$test, , drop = FALSE],
      study_area
    )
    background_predictions <- predict_values(model, background, study_area)
    list(
      fold = index,
      model = model,
      presencePredictions = presence_predictions,
      backgroundPredictions = background_predictions,
      auc = auc(presence_predictions, background_predictions)
    )
  })
  auc_values <- vapply(evaluations, function(evaluation) evaluation$auc, numeric(1))
  list(
    evaluations = evaluations,
    auc = mean(auc_values),
    aucStandardDeviation = if (length(auc_values) > 1L) stats::sd(auc_values) else 0,
    threshold = threshold_metrics(
      unlist(lapply(evaluations, function(evaluation) evaluation$presencePredictions)),
      unlist(lapply(evaluations, function(evaluation) evaluation$backgroundPredictions))
    )
  )
}

permutation_importance <- function(evaluation, presence, background, study_area, seed) {
  test_values <- rbind(presence, background)
  labels <- c(rep.int(1L, nrow(presence)), rep.int(0L, nrow(background)))
  baseline <- evaluation$auc
  vapply(seq_len(ncol(test_values)), function(index) {
    set.seed(seed + evaluation$fold * 1000L + index)
    permuted <- test_values
    permuted[, index] <- sample(permuted[, index])
    predictions <- predict_values(evaluation$model, permuted, study_area)
    permuted_auc <- auc(predictions[labels == 1L], predictions[labels == 0L])
    max(0, baseline - permuted_auc)
  }, numeric(1))
}

predict_raster_values <- function(model, data, study_area) {
  predict_values(model, data, study_area, "MODEL_PROJECTION_FAILED")
}

response_curves <- function(model, background, configuration, study_area) {
  baseline <- lapply(seq_len(ncol(background)), function(index) {
    if (study_area$categorical[[index]]) {
      frequencies <- table(background[[index]])
      return(as.numeric(names(frequencies)[which.max(frequencies)]))
    }
    stats::median(background[[index]])
  })
  names(baseline) <- names(background)
  lapply(seq_along(configuration$predictors), function(index) {
    predictor <- configuration$predictors[[index]]
    grid <- if (study_area$categorical[[index]]) {
      study_area$categories[[index]]
    } else {
      seq(
        study_area$ranges[[index]][[1L]],
        study_area$ranges[[index]][[2L]],
        length.out = 100L
      )
    }
    values <- as.data.frame(
      lapply(baseline, function(value) rep(value, length(grid))),
      stringsAsFactors = FALSE
    )
    values[[index]] <- grid
    list(
      variable = predictor$variableName,
      type = predictor$type,
      values = as.numeric(grid),
      suitability = predict_values(
        model,
        values,
        study_area,
        "MODEL_ARTIFACT_GENERATION_FAILED"
      )
    )
  })
}

native_versions <- function() {
  external <- sf::sf_extSoftVersion()
  list(
    R = as.character(getRversion()),
    maxnet = as.character(utils::packageVersion("maxnet")),
    glmnet = as.character(utils::packageVersion("glmnet")),
    terra = as.character(utils::packageVersion("terra")),
    sf = as.character(utils::packageVersion("sf")),
    GDAL = unname(external[["GDAL"]]),
    GEOS = unname(external[["GEOS"]]),
    PROJ = unname(external[["PROJ"]])
  )
}

write_json_artifact <- function(value, path) {
  tryCatch(
    jsonlite::write_json(value, path, auto_unbox = TRUE, pretty = FALSE, null = "null"),
    error = function(error) abort_model("MODEL_ARTIFACT_GENERATION_FAILED")
  )
}

execute_model <- function(validated, workspace, emit, candidate_completed_at = NULL) {
  configuration <- validated$configuration
  stack <- terra::rast(validated$rasters)
  predictor_names <- vapply(
    configuration$predictors,
    function(predictor) predictor$variableName,
    character(1)
  )
  names(stack) <- predictor_names

  emit_event(emit, "sampling-background", 64L, "Streaming valid cells and sampling deterministic background points.")
  study_area <- scan_study_area(
    stack,
    configuration$predictors,
    configuration$background$pointCount,
    configuration$seed
  )
  background <- study_area$values
  names(background) <- predictor_names
  presence <- extract_raster_values(stack, validated$coordinates)
  names(presence) <- predictor_names
  if (any(!is.finite(as.matrix(presence)))) {
    abort_model("PREDICTOR_COVERAGE_INSUFFICIENT")
  }

  emit_event(emit, "training", 70L, "Fitting deterministic evaluation models.")
  evaluation <- evaluate_partitions(
    presence,
    background,
    configuration,
    study_area
  )
  final_model <- fit_model(presence, background, configuration, study_area)

  emit_event(emit, "evaluating", 78L, "Calculating evaluation metrics and permutation importance.")
  importance_by_fold <- lapply(seq_along(evaluation$evaluations), function(index) {
    partition <- partition_indices(
      nrow(presence),
      configuration$validation,
      configuration$seed
    )[[index]]
    permutation_importance(
      evaluation$evaluations[[index]],
      presence[partition$test, , drop = FALSE],
      background,
      study_area,
      configuration$seed
    )
  })
  importance_values <- rowMeans(do.call(cbind, importance_by_fold))
  importance_total <- sum(importance_values)
  importance <- lapply(seq_along(predictor_names), function(index) {
    list(
      variable = predictor_names[[index]],
      importance = importance_values[[index]],
      percent = if (importance_total > 0) 100 * importance_values[[index]] / importance_total else 0
    )
  })
  metrics <- list(
    schemaVersion = 1L,
    method = configuration$validation$method,
    folds = length(evaluation$evaluations),
    auc = evaluation$auc,
    aucStandardDeviation = evaluation$aucStandardDeviation,
    threshold = evaluation$threshold
  )

  output_directory <- file.path(workspace, "outputs")
  dir.create(output_directory, recursive = TRUE, showWarnings = FALSE, mode = "0700")
  emit_event(emit, "projecting", 84L, "Projecting block-based cloglog suitability rasters.")
  suitability_path <- file.path(output_directory, "suitability.tif")
  suitability <- tryCatch(
    terra::predict(
      stack,
      final_model,
      fun = predict_raster_values,
      study_area = study_area,
      filename = suitability_path,
      overwrite = TRUE,
      wopt = list(datatype = "FLT4S", gdal = c("COMPRESS=DEFLATE"))
    ),
    error = function(error) NULL
  )
  if (is.null(suitability)) {
    abort_model("MODEL_PROJECTION_FAILED")
  }
  threshold_path <- file.path(output_directory, "suitability-threshold.tif")
  thresholded <- tryCatch(
    terra::ifel(
      suitability >= evaluation$threshold$threshold,
      1L,
      0L,
      filename = threshold_path,
      overwrite = TRUE,
      wopt = list(datatype = "INT1U", gdal = c("COMPRESS=DEFLATE"))
    ),
    error = function(error) NULL
  )
  if (is.null(thresholded)) {
    abort_model("MODEL_PROJECTION_FAILED")
  }

  emit_event(emit, "writing-artifacts", 92L, "Writing versioned scientific artifacts.")
  curves <- list(
    schemaVersion = 1L,
    curves = response_curves(final_model, background, configuration, study_area)
  )
  write_json_artifact(metrics, file.path(output_directory, "metrics.json"))
  write_json_artifact(
    list(schemaVersion = 1L, variables = importance),
    file.path(output_directory, "variable-importance.json")
  )
  write_json_artifact(curves, file.path(output_directory, "response-curves.json"))

  occurrence <- sf::st_as_sf(
    data.frame(
      species = configuration$speciesName,
      x = validated$coordinates[, 1L],
      y = validated$coordinates[, 2L]
    ),
    coords = c("x", "y"),
    crs = validated$occurrenceCrs
  )
  background_xy <- terra::xyFromCell(stack, study_area$cells)
  background_points <- sf::st_as_sf(
    data.frame(x = background_xy[, 1L], y = background_xy[, 2L]),
    coords = c("x", "y"),
    crs = terra::crs(stack)
  )
  tryCatch({
    sf::st_write(
      occurrence,
      file.path(output_directory, "occurrences.geojson"),
      quiet = TRUE,
      delete_dsn = TRUE
    )
    sf::st_write(
      background_points,
      file.path(output_directory, "background.geojson"),
      quiet = TRUE,
      delete_dsn = TRUE
    )
  }, error = function(error) abort_model("MODEL_ARTIFACT_GENERATION_FAILED"))

  if (is.null(candidate_completed_at)) {
    candidate_completed_at <- format(
      Sys.time(),
      "%Y-%m-%dT%H:%M:%OS3Z",
      tz = "UTC"
    )
  }
  runtime_versions <- tryCatch(
    native_versions(),
    error = function(error) abort_model("MODEL_ARTIFACT_GENERATION_FAILED")
  )
  write_json_artifact(
    list(
      schemaVersion = 1L,
      placeholder = FALSE,
      scientificModelExecuted = TRUE,
      completedAt = candidate_completed_at,
      configurationFingerprint = validated$configurationFingerprint,
      inputFingerprint = validated$inputFingerprint,
      validation = validated$summary,
      evaluationMethod = configuration$validation$method,
      threshold = evaluation$threshold$threshold,
      runtime = runtime_versions,
      artifactSchemaVersion = 1L
    ),
    file.path(output_directory, "execution-summary.json")
  )
  tryCatch(
    writeLines(
      c(
        "downloading",
        "parsing",
        "validating",
        "sampling-background",
        "training",
        "evaluating",
        "projecting",
        "writing-artifacts",
        sprintf("completed:%s", candidate_completed_at)
      ),
      file.path(output_directory, "run.log.txt")
    ),
    error = function(error) abort_model("MODEL_ARTIFACT_GENERATION_FAILED")
  )
  list(
    summary = validated$summary,
    outputDirectory = output_directory,
    candidateCompletedAt = candidate_completed_at
  )
}
