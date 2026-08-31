FROM rocker/r-ver:4.4.3@sha256:aa952afb35853aaf5c67bd224aa969caf6ad49395d69cf19a586f1554ed3bd05
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
RUN useradd --create-home --shell /usr/sbin/nologin analysis
USER analysis
CMD ["Rscript", "scripts/healthcheck.R"]
