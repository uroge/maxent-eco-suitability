project <- "/opt/analysis-r"
bootstrap_library <- file.path(project, "renv", "library")

dir.create(bootstrap_library, recursive = TRUE, showWarnings = FALSE)
.libPaths(c(bootstrap_library, .libPaths()))

packages <- c(
  "class",
  "KernSmooth",
  "plumber",
  "processx",
  "jsonlite",
  "maxnet",
  "glmnet",
  "curl",
  "readr",
  "readxl",
  "sf",
  "terra",
  "stringi",
  "digest",
  "openssl"
)

# Bootstrap uses R's standard serial installer in a project-owned library. The
# DESCRIPTION file is the authoritative runtime dependency manifest.
utils::install.packages(
  packages,
  lib = bootstrap_library,
  dependencies = c("Depends", "Imports", "LinkingTo"),
  repos = "https://cloud.r-project.org",
  Ncpus = 1L
)

lockfile <- file.path(project, "renv.lock.next")
unlink(lockfile)

renv::snapshot(
  project = project,
  library = bootstrap_library,
  type = "explicit",
  lockfile = lockfile,
  prompt = FALSE,
  force = TRUE
)

if (!file.rename(lockfile, file.path(project, "renv.lock"))) {
  stop("Unable to replace the generated renv.lock.", call. = FALSE)
}
