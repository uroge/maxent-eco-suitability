source("r/validate.R")
source("r/raster-assets.R")

assert_true <- function(value, message) {
  if (!isTRUE(value)) stop(message, call. = FALSE)
}

workspace <- tempfile("raster-assets-")
dir.create(workspace)
on.exit(unlink(workspace, recursive = TRUE, force = TRUE), add = TRUE)

fixture <- terra::rast(nrows = 64L, ncols = 64L, xmin = -2, xmax = 2, ymin = 48, ymax = 52)
terra::values(fixture) <- seq(0, 1000, length.out = terra::ncell(fixture))
terra::values(fixture)[[1L]] <- NA_real_
terra::crs(fixture) <- "EPSG:4326"
terra::units(fixture) <- "metre"
fixture_source <- file.path(workspace, "fixture-source.tif")
terra::writeRaster(fixture, fixture_source, datatype = "FLT4S", NAflag = -9999, overwrite = TRUE)
fixture <- terra::rast(fixture_source)

predictor_path <- file.path(workspace, "predictor.tif")
predictor <- write_verified_cog(fixture, predictor_path, "Float32", -9999, "AVERAGE")
assert_true(predictor$cog, "Predictor output is not a COG.")
assert_true(predictor$overviewCount >= 1L, "Predictor COG has no overview.")
assert_true(nzchar(predictor$compression), "Predictor COG has no compression.")
assert_true(is.finite(predictor$nodata), "Predictor COG has no nodata value.")
assert_true(length(predictor$bounds) == 4L, "Predictor COG has invalid bounds.")

suitability <- fixture
terra::values(suitability) <- seq(0, 1, length.out = terra::ncell(suitability))
suitability_receipt <- write_verified_cog(
  suitability,
  file.path(workspace, "suitability.tif"),
  "Float32",
  -9999,
  "AVERAGE",
  0,
  1
)
assert_true(suitability_receipt$maximum <= 1, "Suitability range was not validated.")

threshold <- terra::ifel(suitability >= 0.5, 1L, 0L)
threshold_receipt <- write_verified_cog(
  threshold,
  file.path(workspace, "threshold.tif"),
  "Byte",
  255,
  "NEAREST",
  0,
  1
)
assert_true(threshold_receipt$dataType == "INT1U", "Threshold data type is invalid.")

dem <- dem_validation(fixture, predictor)
assert_true(dem$eligible, "A valid metre DEM was rejected.")
assert_true(dem$dataTypeValid, "A supported DEM data type was rejected.")
assert_true(dem$resolutionValid, "A valid DEM resolution was rejected.")

missing_crs <- fixture
terra::crs(missing_crs) <- ""
invalid_crs <- dem_validation(missing_crs, predictor)
assert_true(!invalid_crs$eligible && !invalid_crs$crsTransformable, "A DEM without a CRS was accepted.")
terra::crs(fixture) <- "EPSG:4326"

terra::units(fixture) <- "feet"
invalid_unit <- dem_validation(fixture, predictor)
assert_true(!invalid_unit$eligible && is.null(invalid_unit$unit), "A non-metre DEM was accepted.")

terra::units(fixture) <- "metre"
terra::values(fixture)[[2L]] <- Inf
invalid_values <- dem_validation(fixture, predictor)
assert_true(!invalid_values$eligible && !invalid_values$finiteValuesValid, "A DEM containing infinity was accepted.")

terra::values(fixture)[[2L]] <- 2000000
invalid_range <- dem_validation(fixture, predictor)
assert_true(!invalid_range$eligible && !invalid_range$rangeValid, "An out-of-range DEM was accepted.")

cat("Raster asset tests passed.\n")
