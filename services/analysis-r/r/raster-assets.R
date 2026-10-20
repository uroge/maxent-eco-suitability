normalized_raster_unit <- function(raster) {
  value <- tryCatch(as.character(terra::units(raster)), error = function(error) "")
  value <- if (length(value) == 0L) "" else tolower(trimws(value[[1L]]))
  if (value %in% c("m", "metre", "metres", "meter", "meters")) "metre" else NULL
}

raster_value_summary <- function(raster) {
  finite <- tryCatch(
    as.numeric(terra::global(is.finite(raster), "sum", na.rm = TRUE)[[1L]]),
    error = function(error) NA_real_
  )
  valid <- tryCatch(
    as.numeric(terra::global(!is.na(raster), "sum", na.rm = TRUE)[[1L]]),
    error = function(error) NA_real_
  )
  extrema <- tryCatch(
    as.numeric(terra::global(raster, c("min", "max"), na.rm = TRUE)[1L, ]),
    error = function(error) c(NA_real_, NA_real_)
  )
  list(
    finite = finite,
    valid = valid,
    minimum = extrema[[1L]],
    maximum = extrema[[2L]],
    allFinite = is.finite(finite) && is.finite(valid) && finite > 0 && finite == valid
  )
}

gdal_cog_info <- function(path) {
  output <- tryCatch(
    system2("gdalinfo", c("-json", path), stdout = TRUE, stderr = TRUE),
    error = function(error) character()
  )
  status <- attr(output, "status")
  if (length(output) == 0L || (!is.null(status) && status != 0L)) {
    abort_model("MODEL_ARTIFACT_GENERATION_FAILED")
  }
  tryCatch(
    jsonlite::fromJSON(paste(output, collapse = "\n"), simplifyVector = FALSE),
    error = function(error) abort_model("MODEL_ARTIFACT_GENERATION_FAILED")
  )
}

verify_cog <- function(path, minimum = -Inf, maximum = Inf) {
  info <- gdal_cog_info(path)
  raster <- tryCatch(terra::rast(path), error = function(error) NULL)
  if (is.null(raster) || terra::nlyr(raster) != 1L) {
    abort_model("MODEL_ARTIFACT_GENERATION_FAILED")
  }
  band <- info$bands[[1L]]
  image_structure <- info$metadata$IMAGE_STRUCTURE
  crs <- terra::crs(raster)
  extent <- as.vector(terra::ext(raster))
  resolution <- terra::res(raster)
  values <- raster_value_summary(raster)
  overview_count <- length(band$overviews %||% list())
  nodata <- suppressWarnings(as.numeric(band$noDataValue %||% NA_real_))
  compression <- as.character(image_structure$COMPRESSION %||% "")
  layout <- as.character(image_structure$LAYOUT %||% "")
  if (
    !identical(layout, "COG") || overview_count < 1L || compression == "" ||
      !is.finite(nodata) || identical(crs, "") || length(extent) != 4L ||
      any(!is.finite(extent)) || length(resolution) != 2L ||
      any(!is.finite(resolution)) || any(resolution <= 0) ||
      !values$allFinite || values$minimum < minimum || values$maximum > maximum
  ) {
    abort_model("MODEL_ARTIFACT_GENERATION_FAILED")
  }
  list(
    cog = TRUE,
    overviewCount = overview_count,
    compression = compression,
    nodata = nodata,
    crs = crs,
    bounds = unname(as.list(extent[c(1L, 3L, 2L, 4L)])),
    resolution = unname(as.list(resolution)),
    width = terra::ncol(raster),
    height = terra::nrow(raster),
    dataType = as.character(terra::datatype(raster)[[1L]]),
    finiteValueCount = as.integer(values$finite),
    minimum = values$minimum,
    maximum = values$maximum
  )
}

write_verified_cog <- function(raster, path, datatype, nodata, resampling, minimum = -Inf, maximum = Inf) {
  directory <- dirname(path)
  overview_count <- max(
    1L,
    as.integer(ceiling(log2(max(terra::ncol(raster), terra::nrow(raster)) / 256)))
  )
  dir.create(directory, recursive = TRUE, showWarnings = FALSE, mode = "0700")
  source <- tempfile("cog-source-", tmpdir = directory, fileext = ".tif")
  on.exit(unlink(source, force = TRUE), add = TRUE)
  tryCatch(
    terra::writeRaster(
      raster,
      source,
      overwrite = TRUE,
      datatype = if (identical(datatype, "Float32")) "FLT4S" else "INT1U",
      NAflag = nodata,
      gdal = c("COMPRESS=DEFLATE", "TILED=YES")
    ),
    error = function(error) abort_model("MODEL_ARTIFACT_GENERATION_FAILED")
  )
  unlink(path, force = TRUE)
  result <- tryCatch(
    system2(
      "gdal_translate",
      c(
        "-q", "-of", "COG", "-ot", datatype,
        "-a_nodata", as.character(nodata),
        "-co", "COMPRESS=DEFLATE",
        "-co", paste0("OVERVIEW_COUNT=", overview_count),
        "-co", paste0("RESAMPLING=", resampling),
        source, path
      ),
      stdout = TRUE,
      stderr = TRUE
    ),
    error = function(error) structure(character(), status = 1L)
  )
  status <- attr(result, "status")
  if ((!is.null(status) && status != 0L) || !file.exists(path)) {
    abort_model("MODEL_ARTIFACT_GENERATION_FAILED")
  }
  verify_cog(path, minimum, maximum)
}

dem_validation <- function(source, receipt) {
  data_type <- as.character(terra::datatype(source)[[1L]])
  data_type_valid <- data_type %in% c(
    "INT1U", "INT1S", "INT2U", "INT2S", "INT4U", "INT4S", "FLT4S", "FLT8S"
  )
  unit <- normalized_raster_unit(source)
  resolution_valid <- all(is.finite(terra::res(source))) && all(terra::res(source) > 0)
  values <- raster_value_summary(source)
  finite_values_valid <- isTRUE(values$allFinite)
  range_valid <- finite_values_valid && values$minimum >= -10000 && values$maximum <= 1667721.5
  crs_transformable <- tryCatch({
    bounds <- unlist(receipt$bounds, use.names = FALSE)
    corners <- sf::st_sfc(
      sf::st_multipoint(matrix(
        c(
          bounds[[1L]], bounds[[2L]],
          bounds[[1L]], bounds[[4L]],
          bounds[[3L]], bounds[[2L]],
          bounds[[3L]], bounds[[4L]]
        ),
        ncol = 2L,
        byrow = TRUE
      )),
      crs = terra::crs(source)
    )
    transformed <- sf::st_transform(corners, 4326)
    all(is.finite(sf::st_coordinates(transformed)))
  }, error = function(error) FALSE)
  reason <- if (!data_type_valid) {
    "The selected raster has an unsupported elevation data type."
  } else if (is.null(unit)) {
    "The selected raster does not declare elevation units in metres."
  } else if (!crs_transformable) {
    "The selected raster CRS cannot be transformed for terrain rendering."
  } else if (!resolution_valid) {
    "The selected raster has an invalid resolution."
  } else if (!finite_values_valid) {
    "The selected raster contains non-finite elevation values."
  } else if (!range_valid) {
    "The selected raster exceeds the supported TerrainRGB elevation range."
  } else {
    NULL
  }
  list(
    eligible = is.null(reason),
    reason = reason,
    sourceDataType = data_type,
    dataTypeValid = data_type_valid,
    unit = unit,
    crsTransformable = crs_transformable,
    resolutionValid = resolution_valid,
    finiteValuesValid = finite_values_valid,
    rangeValid = range_valid
  )
}

create_predictor_map_assets <- function(validated, workspace) {
  directory <- file.path(workspace, "map-assets")
  terrain_dataset <- validated$configuration$visualization$terrain$datasetId %||% NULL
  assets <- lapply(seq_along(validated$configuration$predictors), function(index) {
    predictor <- validated$configuration$predictors[[index]]
    source <- validated$rasters[[index]]
    filename <- paste0(predictor$datasetId, ".tif")
    path <- file.path(directory, filename)
    receipt <- write_verified_cog(
      source,
      path,
      "Float32",
      -3.4e38,
      if (identical(predictor$type, "categorical")) "NEAREST" else "AVERAGE"
    )
    dem <- if (identical(terrain_dataset, predictor$datasetId) && identical(predictor$type, "continuous")) {
      dem_validation(source, receipt)
    } else {
      NULL
    }
    list(
      datasetId = predictor$datasetId,
      filename = filename,
      size = as.numeric(file.info(path)$size),
      sha256 = digest::digest(file = path, algo = "sha256", serialize = FALSE),
      raster = receipt,
      dem = dem
    )
  })
  jsonlite::write_json(assets, file.path(workspace, "map-assets.json"), auto_unbox = TRUE, null = "null")
  assets
}
