FROM rocker/r-ver:4.6.1@sha256:a5df0ae591422cc1733e97da03a9f4eff4cf172e40895225959aa93bb7ff7517
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
