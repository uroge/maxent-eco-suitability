abort_validation <- function(code) {
  stop(structure(list(message = code, call = NULL, code = code), class = c("validation_error", "error", "condition")))
}

normalize_coordinate <- function(value) {
  numeric_value <- suppressWarnings(as.numeric(value))
  if (!is.finite(numeric_value)) abort_validation("OCCURRENCE_COORDINATES_INVALID")
  if (identical(numeric_value, -0)) 0 else numeric_value
}

normalize_species <- function(value) {
  stringi::stri_trans_nfc(gsub("\\s+", " ", trimws(value)))
}

emit_event <- function(emit, stage, percent, message) {
  emit(list(kind = "event", stage = stage, percent = percent, message = message))
}

extract_raster_values <- function(raster, coordinates) {
  extracted <- as.data.frame(terra::extract(raster, coordinates))
  layer_count <- terra::nlyr(raster)
  if (ncol(extracted) == layer_count + 1L && identical(names(extracted)[[1L]], "ID")) {
    extracted <- extracted[, -1L, drop = FALSE]
  }
  if (ncol(extracted) != layer_count) abort_validation("PREDICTOR_VALUES_INVALID")
  extracted
}

capability_map <- function(capabilities) {
  entries <- capabilities$capabilities
  if (is.null(entries) || length(entries) == 0L || length(entries) > 128L) abort_validation("R_RUNTIME_PROTOCOL_INVALID")
  keys <- vapply(entries, function(item) item$storageKey, character(1))
  urls <- vapply(entries, function(item) item$url, character(1))
  if (anyDuplicated(keys) || any(!startsWith(urls, "http"))) abort_validation("R_RUNTIME_PROTOCOL_INVALID")
  stats::setNames(urls, keys)
}

download_file <- function(file, urls, workspace, index, failure_code) {
  url <- urls[[file$storageKey]]
  if (is.null(url)) abort_validation("R_RUNTIME_PROTOCOL_INVALID")
  target <- file.path(workspace, sprintf("input-%03d", index))
  result <- tryCatch({
    curl::curl_download(url, target, quiet = TRUE)
    target
  }, error = function(error) NULL)
  if (is.null(result) || !file.exists(result)) abort_validation(failure_code)
  if (file.info(result)$size != file$size) abort_validation(failure_code)
  if (
    is.null(file$declaredSha256) ||
      !identical(
        tolower(digest::digest(file = result, algo = "sha256", serialize = FALSE)),
        tolower(file$declaredSha256)
      )
  ) {
    abort_validation(failure_code)
  }
  target
}

read_occurrences <- function(dataset, files, configuration) {
  format <- dataset$dataset$format
  occurrence <- configuration$occurrence
  if (!identical(format, occurrence$format)) abort_validation("OCCURRENCE_FORMAT_INVALID")
  if (identical(format, "csv")) {
    table <- tryCatch(readr::read_csv(files[[1L]], col_types = readr::cols(.default = readr::col_character()), progress = FALSE), error = function(error) NULL)
    if (is.null(table)) abort_validation("OCCURRENCE_FILE_UNREADABLE")
    if (ncol(table) > 100L || nrow(table) > 500L) abort_validation("INPUT_RESOURCE_LIMIT_EXCEEDED")
    longitude <- occurrence$longitudeColumn
    latitude <- occurrence$latitudeColumn
    species <- occurrence$speciesColumn
  } else if (identical(format, "xlsx")) {
    sheets <- tryCatch(readxl::excel_sheets(files[[1L]]), error = function(error) NULL)
    if (is.null(sheets) || length(sheets) > 20L || !(occurrence$worksheet %in% sheets)) abort_validation("OCCURRENCE_SCHEMA_INVALID")
    table <- tryCatch(readxl::read_excel(files[[1L]], sheet = occurrence$worksheet, col_types = "text"), error = function(error) NULL)
    if (is.null(table) || nrow(table) > 500L || ncol(table) > 100L || nrow(table) * ncol(table) > 50000L) abort_validation("INPUT_RESOURCE_LIMIT_EXCEEDED")
    longitude <- occurrence$longitudeColumn
    latitude <- occurrence$latitudeColumn
    species <- occurrence$speciesColumn
  } else if (identical(format, "geojson")) {
    shape <- tryCatch(sf::st_read(files[[1L]], quiet = TRUE), error = function(error) NULL)
    if (is.null(shape)) abort_validation("OCCURRENCE_FILE_UNREADABLE")
    if (nrow(shape) > 500L || any(sf::st_geometry_type(shape) != "POINT")) abort_validation("OCCURRENCE_GEOMETRY_INVALID")
    coordinates <- sf::st_coordinates(shape)
    if (ncol(coordinates) != 2L) abort_validation("OCCURRENCE_GEOMETRY_INVALID")
    shape_crs <- sf::st_crs(shape)
    if (is.na(shape_crs)) {
      shape_crs <- sf::st_crs(4326)
    }
    return(list(coordinates = coordinates, crs = shape_crs$wkt, species = NULL))
  } else if (identical(format, "shapefile")) {
    shp <- files[[which(vapply(dataset$files, function(file) identical(file$component, "shp"), logical(1)))]]
    shape <- tryCatch(sf::st_read(shp, quiet = TRUE), error = function(error) NULL)
    if (is.null(shape) || is.na(sf::st_crs(shape)$wkt)) abort_validation("OCCURRENCE_CRS_MISSING")
    if (nrow(shape) > 500L || any(sf::st_geometry_type(shape) != "POINT")) abort_validation("OCCURRENCE_GEOMETRY_INVALID")
    return(list(coordinates = sf::st_coordinates(shape), crs = sf::st_crs(shape)$wkt, species = NULL))
  } else {
    abort_validation("OCCURRENCE_FORMAT_INVALID")
  }
  names <- names(table)
  if (!(longitude %in% names) || !(latitude %in% names)) abort_validation("OCCURRENCE_SCHEMA_INVALID")
  if (any(nchar(unlist(table), type = "bytes") > 4096L, na.rm = TRUE)) abort_validation("INPUT_RESOURCE_LIMIT_EXCEEDED")
  species_values <- if (!is.null(species)) table[[species]] else NULL
  if (!is.null(species_values) && !(species %in% names)) abort_validation("OCCURRENCE_SCHEMA_INVALID")
  coordinates <- cbind(vapply(table[[longitude]], normalize_coordinate, numeric(1)), vapply(table[[latitude]], normalize_coordinate, numeric(1)))
  if (any(coordinates[, 1L] < -180 | coordinates[, 1L] > 180 | coordinates[, 2L] < -90 | coordinates[, 2L] > 90)) abort_validation("OCCURRENCE_COORDINATES_INVALID")
  list(coordinates = coordinates, crs = "EPSG:4326", species = species_values)
}

validate_predictors <- function(datasets, files_by_dataset, configuration, occurrence_crs, coordinates) {
  predictors <- configuration$predictors
  if (length(predictors) > 20L) abort_validation("INPUT_RESOURCE_LIMIT_EXCEEDED")
  raster_list <- list()
  for (predictor in predictors) {
    dataset <- datasets[[predictor$datasetId]]
    if (is.null(dataset) || !identical(dataset$dataset$format, "geotiff")) abort_validation("PREDICTOR_FILE_UNREADABLE")
    if (dataset$files[[1L]]$size > 2 * 1024^3) abort_validation("INPUT_RESOURCE_LIMIT_EXCEEDED")
    path <- files_by_dataset[[predictor$datasetId]][[1L]]
    raster <- tryCatch(terra::rast(path), error = function(error) NULL)
    if (is.null(raster)) abort_validation("PREDICTOR_GEOTIFF_INVALID")
    if (terra::nlyr(raster) != 1L) abort_validation("PREDICTOR_LAYER_COUNT_INVALID")
    if (terra::ncell(raster) > 100000000L) abort_validation("INPUT_RESOURCE_LIMIT_EXCEEDED")
    if (identical(terra::crs(raster), "")) abort_validation("PREDICTOR_CRS_INCOMPATIBLE")
    if (length(raster_list) > 0L && !terra::compareGeom(raster_list[[1L]], raster, stopOnError = FALSE)) abort_validation("PREDICTOR_GRID_INCOMPATIBLE")
    raster_crs <- sf::st_crs(terra::crs(raster))
    occurrence_reference <- sf::st_crs(occurrence_crs)
    if (is.na(raster_crs) || is.na(occurrence_reference) || !isTRUE(raster_crs == occurrence_reference)) {
      abort_validation("PREDICTOR_CRS_INCOMPATIBLE")
    }
    values <- extract_raster_values(raster, coordinates)[[1L]]
    if (any(!is.finite(values))) abort_validation("PREDICTOR_COVERAGE_INSUFFICIENT")
    if (identical(predictor$type, "categorical")) {
      if (any(values != floor(values)) || length(unique(values)) < 2L || length(unique(values)) > 256L) abort_validation("PREDICTOR_CATEGORICAL_INVALID")
    }
    raster_list[[length(raster_list) + 1L]] <- raster
  }
  if (sum(vapply(raster_list, terra::ncell, numeric(1))) > 500000000L) abort_validation("INPUT_RESOURCE_LIMIT_EXCEEDED")
  raster_list
}

validate_run <- function(request, capabilities, workspace, emit, capability_path = NULL) {
  configuration <- request$configuration
  manifest <- request$inputManifest
  if (is.null(configuration) || is.null(manifest$datasets)) abort_validation("R_RUNTIME_PROTOCOL_INVALID")
  urls <- capability_map(capabilities)
  all_files <- unlist(lapply(manifest$datasets, function(dataset) dataset$files), recursive = FALSE)
  aggregate_size <- sum(vapply(all_files, function(file) file$size, numeric(1)))
  if (aggregate_size > 5 * 1024^3) abort_validation("INPUT_RESOURCE_LIMIT_EXCEEDED")
  emit_event(emit, "downloading", 10L, "Downloading immutable input files.")
  files_by_dataset <- list()
  cursor <- 0L
  for (dataset in manifest$datasets) {
    paths <- list()
    failure_code <- if (identical(dataset$dataset$kind, "occurrence")) "OCCURRENCE_FILE_UNREADABLE" else "PREDICTOR_FILE_UNREADABLE"
    for (file in dataset$files) {
      if (!is.null(capability_path)) {
        refreshed <- tryCatch(
          jsonlite::read_json(capability_path, simplifyVector = FALSE),
          error = function(error) NULL
        )
        if (!is.null(refreshed)) urls <- capability_map(refreshed)
      }
      cursor <- cursor + 1L
      paths[[length(paths) + 1L]] <- download_file(file, urls, workspace, cursor, failure_code)
    }
    files_by_dataset[[dataset$dataset$id]] <- paths
  }
  occurrence <- Filter(function(dataset) identical(dataset$dataset$kind, "occurrence"), manifest$datasets)
  if (length(occurrence) != 1L) abort_validation("OCCURRENCE_FORMAT_INVALID")
  emit_event(emit, "parsing", 35L, "Parsing occurrence records.")
  records <- read_occurrences(occurrence[[1L]], files_by_dataset[[occurrence[[1L]]$dataset$id]], configuration)
  if (!is.null(records$species)) {
    expected <- tolower(normalize_species(configuration$speciesName))
    observed <- vapply(records$species, function(value) tolower(normalize_species(value)), character(1))
    if (any(observed != "" & observed != expected)) abort_validation("OCCURRENCE_SPECIES_INVALID")
  }
  unique_rows <- !duplicated(data.frame(x = records$coordinates[, 1L], y = records$coordinates[, 2L]))
  coordinates <- records$coordinates[unique_rows, , drop = FALSE]
  if (nrow(coordinates) < 10L) abort_validation("OCCURRENCE_MINIMUM_NOT_MET")
  if (identical(configuration$validation$method, "train-test-split")) {
    evaluation <- floor(nrow(coordinates) * configuration$validation$testFraction)
    if (evaluation < 2L || nrow(coordinates) - evaluation < 2L) abort_validation("OCCURRENCE_PARTITION_INVALID")
  } else if (nrow(coordinates) < 2L * configuration$validation$folds) {
    abort_validation("OCCURRENCE_PARTITION_INVALID")
  }
  emit_event(emit, "validating", 60L, "Validating selected predictor rasters.")
  datasets <- stats::setNames(manifest$datasets, vapply(manifest$datasets, function(dataset) dataset$dataset$id, character(1)))
  rasters <- validate_predictors(datasets, files_by_dataset, configuration, records$crs, coordinates)
  emit_event(emit, "validating", 90L, "Scientific input validation completed.")
  list(
    summary = list(acceptedOccurrences = nrow(coordinates), deduplicatedOccurrences = sum(!unique_rows), selectedPredictors = length(configuration$predictors), validatedAt = format(Sys.time(), "%Y-%m-%dT%H:%M:%OS3Z", tz = "UTC")),
    coordinates = coordinates,
    occurrenceCrs = records$crs,
    rasters = rasters,
    configuration = configuration,
    configurationFingerprint = request$configurationFingerprint,
    inputFingerprint = request$inputFingerprint
  )
}
