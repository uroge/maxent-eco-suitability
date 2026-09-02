# syntax=docker/dockerfile:1.19

FROM node:24.19-trixie-slim@sha256:db4f733c26868756bae92ac764d7e99bf31809ce7db886ed525960fe7d544601 AS build
WORKDIR /app
COPY . .
RUN --mount=type=cache,id=ecosuitability-pnpm-store,target=/pnpm/store,sharing=locked \
    corepack enable \
    && pnpm config set store-dir /pnpm/store \
    && pnpm config set fetch-retries 5 \
    && pnpm config set fetch-timeout 120000 \
    && pnpm config set network-concurrency 8 \
    && pnpm install --frozen-lockfile \
    && pnpm --filter @ecosuitability/worker build \
    && pnpm --filter @ecosuitability/worker --prod deploy /deploy

FROM node:24.19-trixie-slim@sha256:db4f733c26868756bae92ac764d7e99bf31809ce7db886ed525960fe7d544601 AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --exclude=**/*.map --from=build /deploy ./
USER node
CMD ["node", "dist/main.js"]
