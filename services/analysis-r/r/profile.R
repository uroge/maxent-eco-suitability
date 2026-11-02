profile_candidate_columns <- function(columns, candidates) {
  normalized <- tolower(gsub("[^a-z0-9]", "", columns))
  columns[normalized %in% candidates]
}

profile_crs <- function(value) {
  reference <- tryCatch(sf::st_crs(value), error = function(error) NULL)
  if (is.null(reference) || is.na(reference)) return(NULL)
  if (!is.na(reference$epsg)) return(sprintf("EPSG:%d", reference$epsg))
  substr(reference$wkt, 1L, 4096L)
}

profile_preview <- function(coordinates, crs = "EPSG:4326") {
  if (is.null(coordinates) || nrow(coordinates) == 0L) {
    return(list(type = "FeatureCollection", features = list()))
  }
  points <- sf::st_as_sf(
    data.frame(id = seq_len(nrow(coordinates)), x = coordinates[, 1L], y = coordinates[, 2L]),
    coords = c("x", "y"),
    crs = crs
  )
  points <- tryCatch(sf::st_transform(points, 4326), error = function(error) NULL)
  if (is.null(points)) return(NULL)
  if (nrow(points) > 500L) {
    points <- points[unique(round(seq(1, nrow(points), length.out = 500L))), , drop = FALSE]
  }
  values <- sf::st_coordinates(points)
  list(
    type = "FeatureCollection",
    features = lapply(seq_len(nrow(values)), function(index) list(
      type = "Feature",
      geometry = list(type = "Point", coordinates = unname(as.numeric(values[index, 1:2]))),
      properties = list()
    ))
  )
}

profile_tabular_source <- function(path, format, source = NULL) {
  table <- tryCatch(
    if (identical(format, "csv")) {
      read_delimited_occurrences(path, n_max = 501L)
    } else {
      readxl::read_excel(path, sheet = source, col_types = "text", n_max = 501L)
    },
    error = function(error) NULL
  )
  if (is.null(table) || ncol(table) > 100L) return(NULL)
  columns <- names(table)
  longitude <- profile_candidate_columns(columns, c("longitude", "lon", "lng", "long", "x"))
  latitude <- profile_candidate_columns(columns, c("latitude", "lat", "y"))
  species <- profile_candidate_columns(columns, c("species", "speciesname", "scientificname", "taxon"))
  coordinates <- NULL
  duplicates <- NULL
  if (length(longitude) == 1L && length(latitude) == 1L) {
    x <- suppressWarnings(as.numeric(table[[longitude[[1L]]]]))
    y <- suppressWarnings(as.numeric(table[[latitude[[1L]]]]))
    valid <- is.finite(x) & is.finite(y) & x >= -180 & x <= 180 & y >= -90 & y <= 90
    coordinates <- cbind(x[valid], y[valid])
    duplicates <- sum(duplicated(data.frame(x = coordinates[, 1L], y = coordinates[, 2L])))
  }
  list(
    source = source,
    columns = as.list(columns),
    longitudeCandidates = as.list(longitude),
    latitudeCandidates = as.list(latitude),
    speciesCandidates = as.list(species),
    recordCount = nrow(table),
    duplicateCoordinateCount = duplicates,
    crs = "EPSG:4326",
    geometryType = NULL,
    coordinates = coordinates
  )
}

profile_tabular_occurrence <- function(path, format) {
  sheets <- if (identical(format, "xlsx")) {
    tryCatch(as.list(readxl::excel_sheets(path)), error = function(error) NULL)
  } else {
    list()
  }
  if (is.null(sheets) || (identical(format, "xlsx") && length(sheets) == 0L)) return(NULL)
  sources <- if (identical(format, "csv")) {
    list(profile_tabular_source(path, format))
  } else {
    lapply(sheets, function(sheet) profile_tabular_source(path, format, sheet))
  }
  if (any(vapply(sources, is.null, logical(1)))) return(NULL)
  selected <- sources[[1L]]
  selected$layers <- sheets
  selected$sources <- lapply(sources, function(source) source[c(
    "source", "columns", "longitudeCandidates", "latitudeCandidates",
    "speciesCandidates", "recordCount", "geometryType"
  )])
  selected
}

profile_vector_occurrence <- function(path, format, files) {
  layers <- list()
  sources <- list()
  selected <- NULL
  mapping_ambiguous <- FALSE
  if (identical(format, "gpkg")) {
    metadata <- tryCatch(sf::st_layers(path), error = function(error) NULL)
    if (is.null(metadata)) return(NULL)
    layers <- as.list(metadata$name)
    point_layers <- metadata$name[!is.na(metadata$geomtype) & grepl("^POINT", metadata$geomtype, ignore.case = TRUE)]
    sources <- lapply(point_layers, function(layer) {
      candidate <- tryCatch(sf::st_read(path, layer = layer, quiet = TRUE), error = function(error) NULL)
      if (is.null(candidate)) return(NULL)
      columns <- setdiff(names(candidate), attr(candidate, "sf_column"))
      list(
        source = layer,
        columns = as.list(columns),
        longitudeCandidates = list(),
        latitudeCandidates = list(),
        speciesCandidates = as.list(profile_candidate_columns(columns, c("species", "speciesname", "scientificname", "taxon"))),
        recordCount = nrow(candidate),
        geometryType = as.character(unique(sf::st_geometry_type(candidate))[[1L]])
      )
    })
    sources <- Filter(Negate(is.null), sources)
    if (length(point_layers) > 0L) selected <- point_layers[[1L]]
    mapping_ambiguous <- length(point_layers) != 1L
  }
  if (identical(format, "shapefile")) {
    components <- vapply(files, function(file) if (is.null(file$component)) "" else file$component, character(1))
    shp_index <- which(components == "shp")
    if (length(shp_index) != 1L) return(NULL)
    path <- path[[shp_index]]
  }
  shape <- tryCatch(
    if (is.null(selected)) sf::st_read(path, quiet = TRUE) else sf::st_read(path, layer = selected, quiet = TRUE),
    error = function(error) NULL
  )
  if (is.null(shape) || any(sf::st_geometry_type(shape) != "POINT")) return(NULL)
  coordinates <- sf::st_coordinates(shape)[, 1:2, drop = FALSE]
  if (length(sources) == 0L) {
    columns <- setdiff(names(shape), attr(shape, "sf_column"))
    sources <- list(list(
      source = NULL,
      columns = as.list(columns),
      longitudeCandidates = list(),
      latitudeCandidates = list(),
      speciesCandidates = as.list(profile_candidate_columns(columns, c("species", "speciesname", "scientificname", "taxon"))),
      recordCount = nrow(shape),
      geometryType = as.character(unique(sf::st_geometry_type(shape))[[1L]])
    ))
  }
  list(
    columns = as.list(setdiff(names(shape), attr(shape, "sf_column"))),
    layers = layers,
    longitudeCandidates = list(),
    latitudeCandidates = list(),
    speciesCandidates = as.list(profile_candidate_columns(names(shape), c("species", "speciesname", "scientificname", "taxon"))),
    recordCount = nrow(shape),
    duplicateCoordinateCount = sum(duplicated(data.frame(x = coordinates[, 1L], y = coordinates[, 2L]))),
    crs = profile_crs(shape),
    mappingAmbiguous = mapping_ambiguous,
    sources = sources,
    coordinates = coordinates
  )
}

profile_raster <- function(dataset, path, reference = NULL) {
  raster <- tryCatch(terra::rast(path), error = function(error) NULL)
  if (is.null(raster)) return(NULL)
  extent <- as.vector(terra::ext(raster))
  resolution <- abs(terra::res(raster))
  nodata_values <- suppressWarnings(terra::NAflag(raster))
  nodata <- if (length(nodata_values) > 0L) nodata_values[[1L]] else NULL
  if (!is.null(nodata) && !is.finite(nodata)) nodata <- NULL
  list(
    metadata = list(
      datasetId = dataset$dataset$id,
      crs = profile_crs(terra::crs(raster)),
      bounds = unname(as.list(c(extent[[1L]], extent[[3L]], extent[[2L]], extent[[4L]]))),
      width = terra::ncol(raster),
      height = terra::nrow(raster),
      resolution = unname(as.list(resolution[1:2])),
      bandCount = terra::nlyr(raster),
      nodata = nodata,
      alignedToReference = is.null(reference) || isTRUE(terra::compareGeom(reference, raster, stopOnError = FALSE))
    ),
    raster = raster
  )
}

profile_occurrence_coverage <- function(coordinates, crs, rasters) {
  if (is.null(coordinates) || nrow(coordinates) == 0L || length(rasters) == 0L) {
    return(NULL)
  }
  points <- tryCatch(
    sf::st_as_sf(
      data.frame(x = coordinates[, 1L], y = coordinates[, 2L]),
      coords = c("x", "y"),
      crs = crs
    ),
    error = function(error) NULL
  )
  if (is.null(points)) return(NULL)
  covered <- rep(TRUE, nrow(points))
  for (raster in rasters) {
    projected <- tryCatch(
      sf::st_transform(points, sf::st_crs(terra::crs(raster))),
      error = function(error) NULL
    )
    if (is.null(projected)) return(NULL)
    values <- tryCatch(
      extract_raster_values(raster, sf::st_coordinates(projected))[[1L]],
      error = function(error) NULL
    )
    if (is.null(values)) return(NULL)
    covered <- covered & is.finite(values)
  }
  list(
    covered = sum(covered),
    total = length(covered),
    percent = 100 * mean(covered)
  )
}

profile_inputs <- function(request, capabilities, workspace, emit, capability_path = NULL) {
  manifest <- request$inputManifest
  files <- prepare_input_files(manifest, capabilities, workspace, emit, capability_path)
  occurrence_dataset <- Filter(function(dataset) identical(dataset$dataset$kind, "occurrence"), manifest$datasets)
  predictor_datasets <- Filter(function(dataset) identical(dataset$dataset$kind, "predictor"), manifest$datasets)
  occurrence <- NULL
  if (length(occurrence_dataset) == 1L) {
    dataset <- occurrence_dataset[[1L]]
    paths <- files[[dataset$dataset$id]]
    emit_event(emit, "parsing", 35L, "Profiling occurrence records.")
    occurrence <- if (dataset$dataset$format %in% c("csv", "xlsx")) {
      profile_tabular_occurrence(paths[[1L]], dataset$dataset$format)
    } else {
      profile_vector_occurrence(if (identical(dataset$dataset$format, "shapefile")) paths else paths[[1L]], dataset$dataset$format, dataset$files)
    }
  }
  emit_event(emit, "validating", 65L, "Inspecting predictor raster metadata.")
  rasters <- list()
  raster_objects <- list()
  reference <- NULL
  unreadable <- list()
  for (dataset in predictor_datasets) {
    profiled <- profile_raster(dataset, files[[dataset$dataset$id]][[1L]], reference)
    if (is.null(profiled) || is.null(profiled$metadata$crs)) {
      unreadable[[length(unreadable) + 1L]] <- dataset$dataset$id
    } else {
      if (is.null(reference)) reference <- profiled$raster
      rasters[[length(rasters) + 1L]] <- profiled$metadata
      raster_objects[[length(raster_objects) + 1L]] <- profiled$raster
    }
  }
  blockers <- list()
  warnings <- list("Exact duplicate coordinates are removed deterministically during execution.")
  checks <- list(
    list(id = "inputs.occurrence.present", label = "Occurrence dataset", status = if (length(occurrence_dataset) == 1L) "passed" else "blocked", message = if (length(occurrence_dataset) == 1L) "One occurrence dataset is attached." else "Exactly one occurrence dataset is required."),
    list(id = "inputs.predictors.present", label = "Predictor datasets", status = if (length(predictor_datasets) > 0L) "passed" else "blocked", message = sprintf("%d predictor dataset%s attached.", length(predictor_datasets), if (length(predictor_datasets) == 1L) "" else "s"))
  )
  if (is.null(occurrence)) {
    blockers[[length(blockers) + 1L]] <- "The occurrence dataset could not be profiled."
    checks[[length(checks) + 1L]] <- list(id = "occurrence.schema.readable", label = "Occurrence structure", status = "blocked", message = "The occurrence file or its point geometry could not be read.")
    occurrence <- list(columns = list(), layers = list(), longitudeCandidates = list(), latitudeCandidates = list(), speciesCandidates = list(), recordCount = NULL, duplicateCoordinateCount = NULL, crs = NULL, sources = list(), coordinates = NULL)
  } else {
    checks[[length(checks) + 1L]] <- list(id = "occurrence.schema.readable", label = "Occurrence structure", status = "passed", message = sprintf("%d occurrence records were detected.", occurrence$recordCount))
    over_limit <- occurrence$recordCount > 500L
    if (over_limit) blockers[[length(blockers) + 1L]] <- "Occurrence inputs are limited to 500 records."
    checks[[length(checks) + 1L]] <- list(id = "occurrence.records.limit", label = "Occurrence record limit", status = if (over_limit) "blocked" else "passed", message = if (over_limit) "The occurrence dataset contains more than 500 records." else sprintf("%d occurrence records are within the supported limit.", occurrence$recordCount))
    format <- occurrence_dataset[[1L]]$dataset$format
    ambiguous <- (format %in% c("csv", "xlsx") && (length(occurrence$longitudeCandidates) != 1L || length(occurrence$latitudeCandidates) != 1L)) || (identical(format, "xlsx") && length(occurrence$layers) != 1L) || (identical(format, "gpkg") && isTRUE(occurrence$mappingAmbiguous))
    if (ambiguous) blockers[[length(blockers) + 1L]] <- "Confirm the occurrence worksheet/layer and coordinate columns in Configuration."
    checks[[length(checks) + 1L]] <- list(id = "occurrence.mapping.candidates", label = "Occurrence mapping", status = if (ambiguous) "blocked" else "passed", message = if (ambiguous) "The occurrence mapping is ambiguous and must be confirmed." else "An unambiguous occurrence mapping was detected.")
    duplicate_count <- occurrence$duplicateCoordinateCount
    if (!is.null(duplicate_count) && duplicate_count > 0L) warnings[[length(warnings) + 1L]] <- sprintf("%d duplicate coordinate records will be removed automatically.", duplicate_count)
    checks[[length(checks) + 1L]] <- list(id = "occurrence.duplicates.detected", label = "Duplicate coordinates", status = if (!is.null(duplicate_count) && duplicate_count > 0L) "warning" else "passed", message = if (is.null(duplicate_count)) "Duplicates will be evaluated after mapping is confirmed." else sprintf("%d duplicate coordinate records were detected.", duplicate_count))
  }
  if (length(unreadable) > 0L) blockers[[length(blockers) + 1L]] <- "One or more predictor rasters could not be read or have no CRS."
  misaligned <- Filter(function(item) !isTRUE(item$alignedToReference), rasters)
  invalid_band_counts <- Filter(function(item) item$bandCount != 1L, rasters)
  if (length(misaligned) > 0L) blockers[[length(blockers) + 1L]] <- "Predictor rasters do not share an aligned grid."
  if (length(invalid_band_counts) > 0L) blockers[[length(blockers) + 1L]] <- "Each predictor must contain exactly one raster band."
  checks[[length(checks) + 1L]] <- list(id = "rasters.metadata.readable", label = "Raster metadata", status = if (length(unreadable) > 0L) "blocked" else "passed", message = if (length(unreadable) > 0L) "At least one raster is unreadable or lacks a CRS." else "Every predictor raster has readable spatial metadata.")
  checks[[length(checks) + 1L]] <- list(id = "rasters.band.count", label = "Raster bands", status = if (length(invalid_band_counts) > 0L) "blocked" else "passed", message = if (length(invalid_band_counts) > 0L) "At least one predictor contains more than one raster band." else "Every predictor contains exactly one raster band.")
  checks[[length(checks) + 1L]] <- list(id = "rasters.grid.alignment", label = "Raster alignment", status = if (length(misaligned) > 0L) "blocked" else "passed", message = if (length(misaligned) > 0L) "Predictor grids are not aligned." else "Predictor grids share the same geometry.")
  coverage <- profile_occurrence_coverage(
    occurrence$coordinates,
    if (is.null(occurrence$crs)) "EPSG:4326" else occurrence$crs,
    raster_objects
  )
  if (is.null(coverage)) {
    coverage_status <- "warning"
    coverage_message <- "Occurrence coverage will be calculated after the occurrence mapping is confirmed."
    warnings[[length(warnings) + 1L]] <- coverage_message
  } else if (coverage$covered < coverage$total) {
    coverage_status <- "warning"
    coverage_message <- sprintf("%d of %d occurrence records have values in every predictor raster (%.1f%%).", coverage$covered, coverage$total, coverage$percent)
    warnings[[length(warnings) + 1L]] <- coverage_message
  } else {
    coverage_status <- "passed"
    coverage_message <- sprintf("All %d profiled occurrence records have predictor coverage.", coverage$total)
  }
  checks[[length(checks) + 1L]] <- list(id = "rasters.occurrence.coverage", label = "Occurrence coverage", status = coverage_status, message = coverage_message)
  emit_event(emit, "validating", 90L, "Input profiling completed.")
  list(
    analysisId = request$analysisId,
    inputRevision = request$inputRevision,
    inputFingerprint = request$inputFingerprint,
    policyVersion = request$policyVersion,
    status = if (length(blockers) > 0L) "blocked" else "passed",
    progress = 100L,
    checks = checks,
    warnings = warnings,
    blockers = blockers,
    occurrence = occurrence[c("columns", "layers", "longitudeCandidates", "latitudeCandidates", "speciesCandidates", "recordCount", "duplicateCoordinateCount", "crs", "sources")],
    rasters = rasters,
    spatialPreview = profile_preview(occurrence$coordinates, if (is.null(occurrence$crs)) "EPSG:4326" else occurrence$crs),
    createdAt = request$createdAt,
    completedAt = format(Sys.time(), "%Y-%m-%dT%H:%M:%OS3Z", tz = "UTC")
  )
}

profile_failure_result <- function(request, failure_code) {
  message <- validation_failure_message(failure_code)
  list(
    analysisId = request$analysisId,
    inputRevision = request$inputRevision,
    inputFingerprint = request$inputFingerprint,
    policyVersion = request$policyVersion,
    status = "blocked",
    progress = 100L,
    checks = list(list(id = "inputs.scientific.profile", label = "Scientific input profile", status = "blocked", message = message)),
    warnings = list(),
    blockers = list(message),
    occurrence = list(columns = list(), layers = list(), longitudeCandidates = list(), latitudeCandidates = list(), speciesCandidates = list(), recordCount = NULL, duplicateCoordinateCount = NULL, crs = NULL, sources = list()),
    rasters = list(),
    spatialPreview = NULL,
    createdAt = request$createdAt,
    completedAt = format(Sys.time(), "%Y-%m-%dT%H:%M:%OS3Z", tz = "UTC")
  )
}

validation_failure_message <- function(code) {
  messages <- list(
    OCCURRENCE_SCHEMA_INVALID = "The configured occurrence columns or worksheet are invalid.",
    OCCURRENCE_GPKG_LAYER_AMBIGUOUS = "Select one occurrence GeoPackage layer.",
    OCCURRENCE_GPKG_LAYER_INVALID = "The configured GeoPackage layer is invalid.",
    OCCURRENCE_COORDINATES_INVALID = "Occurrence coordinates do not satisfy the selected policy.",
    OCCURRENCE_MINIMUM_NOT_MET = "Too few valid unique occurrence records remain.",
    OCCURRENCE_PARTITION_INVALID = "The selected evaluation method cannot partition the available records.",
    PREDICTOR_GRID_INCOMPATIBLE = "Selected predictor rasters do not share an aligned grid.",
    PREDICTOR_CRS_INCOMPATIBLE = "Occurrence and predictor coordinate reference systems are incompatible.",
    PREDICTOR_COVERAGE_INSUFFICIENT = "Predictor coverage is incomplete at occurrence locations.",
    OCCURRENCE_COVERAGE_THRESHOLD_NOT_MET = "Occurrence coverage is below the configured threshold.",
    BACKGROUND_CAPACITY_INSUFFICIENT = "The requested background-point count exceeds the usable predictor cells. Reduce the background-point count."
  )
  if (!is.null(messages[[code]])) messages[[code]] else sprintf("Scientific validation failed: %s.", code)
}

preflight_result <- function(request, validated = NULL, failure_code = NULL) {
  blocked <- !is.null(failure_code)
  message <- if (blocked) validation_failure_message(failure_code) else "The configured inputs passed authoritative scientific validation."
  warnings <- list()
  if (!is.null(validated) && validated$summary$deduplicatedOccurrences > 0L) warnings[[length(warnings) + 1L]] <- sprintf("%d duplicate coordinates will be removed automatically.", validated$summary$deduplicatedOccurrences)
  if (!is.null(validated) && validated$summary$uncoveredOccurrences > 0L) warnings[[length(warnings) + 1L]] <- sprintf("%d uncovered occurrences will be excluded by policy.", validated$summary$uncoveredOccurrences)
  list(
    analysisId = request$analysisId,
    inputRevision = request$inputRevision,
    configurationRevision = request$configurationRevision,
    inputFingerprint = request$inputFingerprint,
    configurationFingerprint = request$configurationFingerprint,
    policyVersion = request$policyVersion,
    status = if (blocked) "blocked" else "passed",
    progress = 100L,
    checks = list(
      list(id = "scientific.configuration.validation", label = "Scientific configuration", status = if (blocked) "blocked" else "passed", message = message),
      list(id = "occurrence.duplicates.authoritative", label = "Duplicate-coordinate policy", status = if (length(warnings) > 0L) "warning" else "passed", message = "Exact duplicate coordinates are removed deterministically.")
    ),
    warnings = warnings,
    blockers = if (blocked) list(message) else list(),
    createdAt = request$createdAt,
    completedAt = format(Sys.time(), "%Y-%m-%dT%H:%M:%OS3Z", tz = "UTC")
  )
}
