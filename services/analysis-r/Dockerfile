FROM rocker/r-ver:latest
RUN apt-get update && apt-get install -y --no-install-recommends gdal-bin libgdal-dev libgeos-dev libproj-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/analysis-r
COPY r ./r
COPY scripts ./scripts
CMD ["Rscript", "scripts/healthcheck.R"]
