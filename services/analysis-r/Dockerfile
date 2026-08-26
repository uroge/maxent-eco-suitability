FROM rocker/r-ver:4.4.3
RUN apt-get update && apt-get install -y --no-install-recommends \
    gdal-bin \
    libgdal-dev \
    libgeos-dev \
    libproj-dev \
    libudunits2-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/analysis-r
COPY renv.lock ./renv.lock
RUN Rscript -e "install.packages('renv', repos = 'https://cloud.r-project.org')" \
    && Rscript -e "renv::restore(prompt = FALSE)"
COPY r ./r
COPY scripts ./scripts
CMD ["Rscript", "scripts/healthcheck.R"]
