# syntax=docker/dockerfile:1.7
FROM rocker/r-ver:4.6.1@sha256:4e6e6696ff54a86625c7f80046478e67014a2184e942b85eeff43db7b992d93e AS base

COPY system-packages.txt /tmp/system-packages.txt

RUN apt-get update \
    && grep -Ev '^(#|$)' /tmp/system-packages.txt \
      | xargs apt-get install -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* /tmp/system-packages.txt

WORKDIR /opt/analysis-r

RUN Rscript -e "install.packages('renv', repos = 'https://cloud.r-project.org')"

FROM base AS bootstrap

COPY DESCRIPTION ./DESCRIPTION
COPY renv.lock ./renv.lock
COPY renv ./renv
COPY scripts/bootstrap-renv.R ./scripts/bootstrap-renv.R

CMD ["Rscript", "--vanilla", "scripts/bootstrap-renv.R"]

FROM base AS runtime

COPY DESCRIPTION ./DESCRIPTION
COPY renv.lock ./renv.lock
COPY renv ./renv
RUN --mount=type=cache,target=/root/.cache/R/renv \
    Rscript -e "renv::restore(project = '/opt/analysis-r', library = '/opt/analysis-r/runtime-library', prompt = FALSE)"
RUN Rscript -e "library <- '/opt/analysis-r/runtime-library'; .libPaths(c(library, .libPaths())); required <- c('plumber', 'processx', 'jsonlite', 'curl', 'readr', 'readxl', 'sf', 'terra', 'stringi', 'digest', 'openssl'); missing <- required[!vapply(required, requireNamespace, logical(1), quietly = TRUE)]; if (length(missing)) stop(paste('Missing runtime packages:', paste(missing, collapse = ', ')))"

COPY r ./r
COPY scripts ./scripts
COPY .Rprofile ./.Rprofile

RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin analysis \
    && mkdir -p /workspaces /run/analysis-r \
    && chown -R analysis:analysis /workspaces /run/analysis-r \
    && chmod -R a-w /opt/analysis-r/runtime-library

ENV TMPDIR=/run/analysis-r

USER analysis

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD ["Rscript", "scripts/healthcheck.R"]

CMD ["Rscript", "scripts/server.R"]
