# syntax=docker/dockerfile:1.19

FROM node:26.8-trixie-slim@sha256:c0753125a3789977aefe869cbebccf70e3cfd7ea84ca48547458f02e4f1d7146 AS build
WORKDIR /app
COPY . .
RUN --mount=type=cache,id=ecosuitability-pnpm-store,target=/pnpm/store,sharing=locked \
    corepack enable \
    && pnpm config set store-dir /pnpm/store \
    && pnpm config set fetch-retries 5 \
    && pnpm config set fetch-timeout 120000 \
    && pnpm config set network-concurrency 8 \
    && pnpm install --frozen-lockfile \
    && pnpm --filter @ecosuitability/api build \
    && pnpm --filter @ecosuitability/api --prod deploy /deploy

FROM node:26.8-trixie-slim@sha256:c0753125a3789977aefe869cbebccf70e3cfd7ea84ca48547458f02e4f1d7146 AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --exclude=**/*.map --from=build /deploy ./
USER node
CMD ["node", "dist/main.js"]
