source("r/validate.R")
source("r/model.R")

assert_equal <- function(actual, expected, message) {
  if (!isTRUE(all.equal(actual, expected, tolerance = 1e-10))) {
    stop(message, call. = FALSE)
  }
}

expect_code <- function(expression, code) {
  observed <- tryCatch(
    {
      force(expression)
      NULL
    },
    validation_error = function(error) error$code
  )
  if (!identical(observed, code)) {
    stop(sprintf("Expected %s but observed %s.", code, observed), call. = FALSE)
  }
}

assert_equal(auc(c(0.8, 0.9), c(0.1, 0.2)), 1, "AUC calculation is incorrect.")
threshold <- threshold_metrics(c(0.8, 0.9), c(0.1, 0.2))
assert_equal(threshold$sensitivity, 1, "Threshold sensitivity is incorrect.")
assert_equal(threshold$specificity, 1, "Threshold specificity is incorrect.")

train_test_a <- partition_indices(
  20L,
  list(method = "train-test-split", testFraction = 0.2),
  42L
)
train_test_b <- partition_indices(
  20L,
  list(method = "train-test-split", testFraction = 0.2),
  42L
)
assert_equal(train_test_a, train_test_b, "Train/test partitioning is not deterministic.")
folds <- partition_indices(20L, list(method = "k-fold", folds = 5L), 42L)
if (length(folds) != 5L || any(vapply(folds, function(fold) length(fold$test), integer(1)) != 4L)) {
  stop("K-fold assignment is invalid.", call. = FALSE)
}

continuous <- terra::rast(nrows = 40L, ncols = 40L, xmin = 0, xmax = 40, ymin = 0, ymax = 40)
terra::values(continuous) <- seq_len(terra::ncell(continuous)) / terra::ncell(continuous)
terra::crs(continuous) <- "EPSG:4326"
categorical <- continuous
terra::values(categorical) <- rep(1:4, length.out = terra::ncell(categorical))
names(continuous) <- "temperature"
names(categorical) <- "land_cover"
stack <- c(continuous, categorical)
predictors <- list(
  list(variableName = "temperature", type = "continuous"),
  list(variableName = "land_cover", type = "categorical")
)
sample_a <- scan_study_area(stack, predictors, 200L, 42L)
sample_b <- scan_study_area(stack, predictors, 200L, 42L)
assert_equal(sample_a$cells, sample_b$cells, "Background sampling is not deterministic.")
assert_equal(sample_a$ranges[[1L]], c(1 / 1600, 1), "Continuous study-area range is wrong.")
assert_equal(sample_a$categories[[2L]], 1:4, "Categorical study-area levels are wrong.")
expect_code(scan_study_area(stack, predictors, 2000L, 42L), "BACKGROUND_CAPACITY_INSUFFICIENT")

categorical_invalid <- categorical
terra::values(categorical_invalid)[[1L]] <- 1.5
expect_code(
  scan_study_area(c(continuous, categorical_invalid), predictors, 100L, 42L),
  "PREDICTOR_CATEGORICAL_INVALID"
)

configuration <- list(
  speciesName = "Lynx lynx",
  predictors = list(
    list(variableName = "temperature", type = "continuous")
  ),
  background = list(pointCount = 200L),
  model = list(featureClasses = c("linear", "quadratic"), regularizationMultiplier = 1),
  validation = list(method = "k-fold", folds = 5L),
  seed = 42L
)
presence_cells <- seq(50L, 1550L, length.out = 20L)
coordinates <- terra::xyFromCell(continuous, as.integer(presence_cells))
validated <- list(
  summary = list(
    acceptedOccurrences = 20L,
    deduplicatedOccurrences = 0L,
    selectedPredictors = 1L,
    validatedAt = "2026-09-02T12:00:00.000Z"
  ),
  coordinates = coordinates,
  occurrenceCrs = "EPSG:4326",
  rasters = list(continuous),
  configuration = configuration,
  configurationFingerprint = paste(rep("a", 64L), collapse = ""),
  inputFingerprint = paste(rep("b", 64L), collapse = "")
)
events <- list()
emit <- function(value) events[[length(events) + 1L]] <<- value
workspace_a <- tempfile("model-a-")
workspace_b <- tempfile("model-b-")
dir.create(workspace_a)
dir.create(workspace_b)
on.exit(unlink(c(workspace_a, workspace_b), recursive = TRUE, force = TRUE), add = TRUE)
fixed_completed_at <- "2026-09-02T12:30:00.000Z"
result_a <- execute_model(validated, workspace_a, emit, fixed_completed_at)
result_b <- execute_model(validated, workspace_b, function(value) NULL, fixed_completed_at)

expected_files <- c(
  "execution-summary.json",
  "metrics.json",
  "variable-importance.json",
  "response-curves.json",
  "suitability.tif",
  "suitability-threshold.tif",
  "occurrences.geojson",
  "background.geojson",
  "run.log.txt"
)
if (!all(file.exists(file.path(result_a$outputDirectory, expected_files)))) {
  stop("The model did not generate the complete artifact set.", call. = FALSE)
}
for (filename in expected_files) {
  hash_a <- digest::digest(
    file = file.path(result_a$outputDirectory, filename),
    algo = "sha256",
    serialize = FALSE
  )
  hash_b <- digest::digest(
    file = file.path(result_b$outputDirectory, filename),
    algo = "sha256",
    serialize = FALSE
  )
  assert_equal(hash_a, hash_b, sprintf("Artifact %s is not deterministic.", filename))
}

metrics <- jsonlite::read_json(
  file.path(result_a$outputDirectory, "metrics.json"),
  simplifyVector = TRUE
)
if (!is.finite(metrics$auc) || metrics$auc < 0 || metrics$auc > 1) {
  stop("Model AUC is invalid.", call. = FALSE)
}
if (metrics$aucStandardDeviation < 0 || metrics$folds != 5L) {
  stop("K-fold aggregate metrics are invalid.", call. = FALSE)
}
summary <- jsonlite::read_json(
  file.path(result_a$outputDirectory, "execution-summary.json"),
  simplifyVector = TRUE
)
if (
  !identical(summary$placeholder, FALSE) ||
    !identical(summary$scientificModelExecuted, TRUE) ||
    !identical(summary$configurationFingerprint, validated$configurationFingerprint) ||
    !identical(summary$inputFingerprint, validated$inputFingerprint)
) {
  stop("Execution summary provenance is incomplete.", call. = FALSE)
}

cat("Scientific model tests passed.\n")
