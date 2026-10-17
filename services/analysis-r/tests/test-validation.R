source("r/validate.R")
source("r/profile.R")

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

workspace <- tempfile("validation-")
dir.create(workspace)
on.exit(unlink(workspace, recursive = TRUE, force = TRUE), add = TRUE)
occurrences <- data.frame(
  species = rep("Lynx lynx", 10L),
  longitude = seq(10.1, 11, length.out = 10L),
  latitude = seq(44.1, 45, length.out = 10L)
)

csv_path <- file.path(workspace, "occurrences.csv")
utils::write.csv(occurrences, csv_path, row.names = FALSE)
csv_result <- read_occurrences(
  list(dataset = list(format = "csv")),
  list(csv_path),
  list(
    occurrence = list(
      format = "csv",
      longitudeColumn = "longitude",
      latitudeColumn = "latitude",
      speciesColumn = "species"
    )
  )
)
if (nrow(csv_result$coordinates) != 10L) stop("CSV occurrence parsing failed.")

write_minimal_xlsx <- function(path, rows) {
  root <- tempfile("xlsx-")
  dir.create(file.path(root, "_rels"), recursive = TRUE)
  dir.create(file.path(root, "xl", "_rels"), recursive = TRUE)
  dir.create(file.path(root, "xl", "worksheets"), recursive = TRUE)
  writeLines(
    c(
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
      '<Default Extension="xml" ContentType="application/xml"/>',
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
      '</Types>'
    ),
    file.path(root, "[Content_Types].xml")
  )
  writeLines(
    c(
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
      '</Relationships>'
    ),
    file.path(root, "_rels", ".rels")
  )
  writeLines(
    c(
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
      '<sheets><sheet name="Occurrences" sheetId="1" r:id="rId1"/></sheets>',
      '</workbook>'
    ),
    file.path(root, "xl", "workbook.xml")
  )
  writeLines(
    c(
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>',
      '</Relationships>'
    ),
    file.path(root, "xl", "_rels", "workbook.xml.rels")
  )
  headers <- paste0(
    '<row r="1"><c r="A1" t="inlineStr"><is><t>species</t></is></c>',
    '<c r="B1" t="inlineStr"><is><t>longitude</t></is></c>',
    '<c r="C1" t="inlineStr"><is><t>latitude</t></is></c></row>'
  )
  body <- vapply(seq_len(nrow(rows)), function(index) {
    row <- index + 1L
    sprintf(
      '<row r="%d"><c r="A%d" t="inlineStr"><is><t>%s</t></is></c><c r="B%d"><v>%s</v></c><c r="C%d"><v>%s</v></c></row>',
      row,
      row,
      rows$species[[index]],
      row,
      rows$longitude[[index]],
      row,
      rows$latitude[[index]]
    )
  }, character(1))
  writeLines(
    c(
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>',
      headers,
      body,
      '</sheetData></worksheet>'
    ),
    file.path(root, "xl", "worksheets", "sheet1.xml")
  )
  previous <- setwd(root)
  on.exit(setwd(previous), add = TRUE)
  status <- system2("zip", c("-q", "-r", shQuote(path), "."))
  if (status != 0L) stop("Unable to create XLSX fixture.")
}

xlsx_path <- file.path(workspace, "occurrences.xlsx")
write_minimal_xlsx(xlsx_path, occurrences)
xlsx_result <- read_occurrences(
  list(dataset = list(format = "xlsx")),
  list(xlsx_path),
  list(
    occurrence = list(
      format = "xlsx",
      worksheet = "Occurrences",
      longitudeColumn = "longitude",
      latitudeColumn = "latitude",
      speciesColumn = "species"
    )
  )
)
if (nrow(xlsx_result$coordinates) != 10L) stop("XLSX occurrence parsing failed.")

points <- sf::st_as_sf(
  occurrences,
  coords = c("longitude", "latitude"),
  crs = 4326
)
geojson_path <- file.path(workspace, "occurrences.geojson")
sf::st_write(points, geojson_path, quiet = TRUE)
geojson_result <- read_occurrences(
  list(dataset = list(format = "geojson")),
  list(geojson_path),
  list(occurrence = list(format = "geojson"))
)
if (nrow(geojson_result$coordinates) != 10L) stop("GeoJSON occurrence parsing failed.")

invalid_geojson_path <- file.path(workspace, "invalid-occurrences.geojson")
invalid_geojson <- sf::st_as_sf(
  data.frame(longitude = c(10, 200), latitude = c(44, 45)),
  coords = c("longitude", "latitude"),
  crs = 4326
)
sf::st_write(invalid_geojson, invalid_geojson_path, quiet = TRUE)
expect_code(
  read_occurrences(
    list(dataset = list(format = "geojson")),
    list(invalid_geojson_path),
    list(occurrence = list(format = "geojson"))
  ),
  "OCCURRENCE_COORDINATES_INVALID"
)
excluded_geojson <- read_occurrences(
  list(dataset = list(format = "geojson")),
  list(invalid_geojson_path),
  list(
    occurrence = list(format = "geojson"),
    inputValidation = list(
      coordinatePolicy = "exclude-invalid",
      coveragePolicy = "require-all",
      minimumCoveragePercent = 100L
    )
  )
)
if (
  nrow(excluded_geojson$coordinates) != 1L ||
    excluded_geojson$invalidCoordinateOccurrences != 1L
) {
  stop("Invalid GeoJSON coordinates were not excluded deterministically.", call. = FALSE)
}

shapefile_path <- file.path(workspace, "occurrences.shp")
sf::st_write(points, shapefile_path, quiet = TRUE)
shapefile_result <- read_occurrences(
  list(
    dataset = list(format = "shapefile"),
    files = list(list(component = "shp"))
  ),
  list(shapefile_path),
  list(occurrence = list(format = "shapefile"))
)
if (nrow(shapefile_result$coordinates) != 10L) stop("Shapefile occurrence parsing failed.")

gpkg_path <- file.path(workspace, "occurrences.gpkg")
sf::st_write(points, gpkg_path, layer = "occurrences", quiet = TRUE)
gpkg_result <- read_occurrences(
  list(dataset = list(format = "gpkg")),
  list(gpkg_path),
  list(occurrence = list(format = "gpkg", layer = "occurrences"))
)
if (nrow(gpkg_result$coordinates) != 10L) stop("GeoPackage occurrence parsing failed.")

sf::st_write(points, gpkg_path, layer = "additional_occurrences", quiet = TRUE)
expect_code(
  read_occurrences(
    list(dataset = list(format = "gpkg")),
    list(gpkg_path),
    list(occurrence = list(format = "gpkg"))
  ),
  "OCCURRENCE_GPKG_LAYER_AMBIGUOUS"
)

invalid_csv <- file.path(workspace, "invalid.csv")
utils::write.csv(
  data.frame(longitude = "not-a-coordinate", latitude = 45),
  invalid_csv,
  row.names = FALSE
)
expect_code(
  read_occurrences(
    list(dataset = list(format = "csv")),
    list(invalid_csv),
    list(
      occurrence = list(
        format = "csv",
        longitudeColumn = "longitude",
        latitudeColumn = "latitude"
      )
    )
  ),
  "OCCURRENCE_COORDINATES_INVALID"
)

excluded_coordinates <- read_occurrences(
  list(dataset = list(format = "csv")),
  list(invalid_csv),
  list(
    occurrence = list(
      format = "csv",
      longitudeColumn = "longitude",
      latitudeColumn = "latitude"
    ),
    inputValidation = list(
      coordinatePolicy = "exclude-invalid",
      coveragePolicy = "require-all",
      minimumCoveragePercent = 100L
    )
  )
)
if (
  nrow(excluded_coordinates$coordinates) != 0L ||
    excluded_coordinates$invalidCoordinateOccurrences != 1L
) {
  stop("Invalid coordinates were not excluded deterministically.", call. = FALSE)
}

raster_a <- terra::rast(nrows = 20L, ncols = 20L, xmin = 0, xmax = 20, ymin = 0, ymax = 20)
terra::values(raster_a) <- seq_len(terra::ncell(raster_a))
terra::crs(raster_a) <- "EPSG:4326"
raster_b <- raster_a
terra::values(raster_b) <- rep(1:4, length.out = terra::ncell(raster_b))
raster_a_path <- file.path(workspace, "continuous.tif")
raster_b_path <- file.path(workspace, "categorical.tif")
terra::writeRaster(raster_a, raster_a_path)
terra::writeRaster(raster_b, raster_b_path)
datasets <- list(
  continuous = list(
    dataset = list(format = "geotiff"),
    files = list(list(size = file.info(raster_a_path)$size))
  ),
  categorical = list(
    dataset = list(format = "geotiff"),
    files = list(list(size = file.info(raster_b_path)$size))
  )
)
files <- list(continuous = list(raster_a_path), categorical = list(raster_b_path))
predictor_configuration <- list(
  predictors = list(
    list(datasetId = "continuous", variableName = "temperature", type = "continuous"),
    list(datasetId = "categorical", variableName = "land_cover", type = "categorical")
  )
)
coordinates <- terra::xyFromCell(raster_a, c(1L, 2L, 3L, 4L, 5L))
validated <- validate_predictors(
  datasets,
  files,
  predictor_configuration,
  "EPSG:4326",
  coordinates
)
if (length(validated) != 2L) stop("Predictor validation failed.")

archive_source <- file.path(workspace, "archive-source.tif")
file.copy(raster_a_path, archive_source)
archive_path <- file.path(workspace, "continuous.zip")
previous <- setwd(workspace)
on.exit(setwd(previous), add = TRUE)
archive_status <- system2("zip", c("-q", archive_path, basename(archive_source)))
if (archive_status != 0L) stop("Unable to create GeoTIFF archive fixture.")
archive_raster <- extract_geotiff_archive(archive_path, workspace, 1L)
if (!file.exists(archive_raster)) stop("GeoTIFF archive extraction failed.")

coverage_raster <- raster_a
terra::values(coverage_raster)[[1L]] <- NA
coverage_path <- file.path(workspace, "coverage.tif")
terra::writeRaster(coverage_raster, coverage_path)
coverage_dataset <- list(
  continuous = list(
    dataset = list(format = "geotiff"),
    files = list(list(size = file.info(coverage_path)$size))
  )
)
expect_code(
  validate_predictors(
    coverage_dataset,
    list(continuous = list(coverage_path)),
    list(predictors = predictor_configuration$predictors[1L]),
    "EPSG:4326",
    coordinates
  ),
  "PREDICTOR_COVERAGE_INSUFFICIENT"
)
excluded_coverage <- validate_predictors(
  coverage_dataset,
  list(continuous = list(coverage_path)),
  list(
    predictors = predictor_configuration$predictors[1L],
    inputValidation = list(
      coordinatePolicy = "reject-all",
      coveragePolicy = "exclude-uncovered",
      minimumCoveragePercent = 80L
    )
  ),
  "EPSG:4326",
  coordinates
)
if (attr(excluded_coverage, "coverage_percent") != 80) {
  stop("Occurrence coverage percentage is incorrect.", call. = FALSE)
}
expect_code(
  validate_predictors(
    coverage_dataset,
    list(continuous = list(coverage_path)),
    list(
      predictors = predictor_configuration$predictors[1L],
      inputValidation = list(
        coordinatePolicy = "reject-all",
        coveragePolicy = "exclude-uncovered",
        minimumCoveragePercent = 81L
      )
    ),
    "EPSG:4326",
    coordinates
  ),
  "OCCURRENCE_COVERAGE_THRESHOLD_NOT_MET"
)

wrong_crs <- raster_a
terra::crs(wrong_crs) <- "EPSG:3857"
wrong_crs_path <- file.path(workspace, "wrong-crs.tif")
terra::writeRaster(wrong_crs, wrong_crs_path)
wrong_crs_dataset <- list(
  continuous = list(
    dataset = list(format = "geotiff"),
    files = list(list(size = file.info(wrong_crs_path)$size))
  )
)
expect_code(
  validate_predictors(
    wrong_crs_dataset,
    list(continuous = list(wrong_crs_path)),
    list(predictors = predictor_configuration$predictors[1L]),
    "EPSG:4326",
    coordinates
  ),
  "PREDICTOR_CRS_INCOMPATIBLE"
)

csv_profile <- profile_tabular_occurrence(csv_path, "csv")
if (
  csv_profile$recordCount != 10L ||
    !identical(csv_profile$longitudeCandidates[[1L]], "longitude") ||
    !identical(csv_profile$latitudeCandidates[[1L]], "latitude")
) {
  stop("CSV profiling did not detect the occurrence mapping.", call. = FALSE)
}

xlsx_profile <- profile_tabular_occurrence(xlsx_path, "xlsx")
if (xlsx_profile$layers[[1L]] != "Occurrences" || xlsx_profile$recordCount != 10L) {
  stop("XLSX profiling did not detect worksheets and records.", call. = FALSE)
}

geojson_profile <- profile_vector_occurrence(geojson_path, "geojson", list())
if (geojson_profile$recordCount != 10L || !identical(geojson_profile$crs, "EPSG:4326")) {
  stop("GeoJSON profiling did not detect point geometry and CRS.", call. = FALSE)
}

gpkg_profile <- profile_vector_occurrence(gpkg_path, "gpkg", list())
if (length(gpkg_profile$layers) != 2L) {
  stop("GeoPackage profiling did not enumerate layers.", call. = FALSE)
}

shape_files <- list(
  list(component = "shp"),
  list(component = "dbf"),
  list(component = "shx"),
  list(component = "prj")
)
shape_paths <- file.path(workspace, paste0("occurrences.", c("shp", "dbf", "shx", "prj")))
shape_profile <- profile_vector_occurrence(shape_paths, "shapefile", shape_files)
if (shape_profile$recordCount != 10L || is.null(shape_profile$crs)) {
  stop("Shapefile profiling did not inspect the component set.", call. = FALSE)
}

raster_profile <- profile_raster(
  list(dataset = list(id = "ds_0123456789abcdef0123456789abcdef")),
  raster_a_path
)
if (
  is.null(raster_profile) ||
    raster_profile$metadata$width != 20L ||
    raster_profile$metadata$height != 20L ||
    !isTRUE(raster_profile$metadata$alignedToReference)
) {
  stop("Raster profiling did not return grid metadata.", call. = FALSE)
}

profiled_coverage <- profile_occurrence_coverage(
  terra::xyFromCell(raster_a, c(1L, 2L, 3L)),
  "EPSG:4326",
  list(raster_a)
)
if (
  profiled_coverage$covered != 3L ||
    profiled_coverage$total != 3L ||
    profiled_coverage$percent != 100
) {
  stop("Input profiling did not calculate occurrence raster coverage.", call. = FALSE)
}

preview <- profile_preview(csv_profile$coordinates)
if (!identical(preview$type, "FeatureCollection") || length(preview$features) != 10L) {
  stop("Occurrence preview GeoJSON was not generated.", call. = FALSE)
}

passed_preflight <- preflight_result(
  list(
    analysisId = "an_0123456789abcdef0123456789abcdef",
    inputRevision = 1L,
    configurationRevision = 1L,
    inputFingerprint = "jcs-sha256-v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    configurationFingerprint = "jcs-sha256-v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    policyVersion = "2026-10-01",
    createdAt = "2026-10-17T12:00:00.000Z"
  ),
  validated = list(summary = list(deduplicatedOccurrences = 0L, uncoveredOccurrences = 0L))
)
if (
  !identical(passed_preflight$status, "passed") ||
    !identical(passed_preflight$checks[[1L]]$id, "scientific.configuration.validation")
) {
  stop("Preflight did not return a stable passed validation receipt.", call. = FALSE)
}

cat("Scientific validation tests passed.\n")
