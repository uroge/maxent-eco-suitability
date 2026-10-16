source("r/api.R")

port <- as.integer(Sys.getenv("R_RUNTIME_PORT", "8080"))
api <- create_api()
api$run(host = "0.0.0.0", port = port)
