source("r/validate.R")

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
coordinates <- terra::xyFromCell(raster_a, c(1L, 2L, 3L, 4L))
validated <- validate_predictors(
  datasets,
  files,
  predictor_configuration,
  "EPSG:4326",
  coordinates
)
if (length(validated) != 2L) stop("Predictor validation failed.")

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

cat("Scientific validation tests passed.\n")
