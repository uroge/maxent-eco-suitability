# syntax=docker/dockerfile:1.19

FROM node:26.13-trixie-slim@sha256:e4db4c914bf8ad241bd24804fc25d272d89bad97e68cdc8a1414862790a02c39 AS build
WORKDIR /app
COPY . .
RUN --mount=type=cache,id=ecosuitability-pnpm-store,target=/pnpm/store,sharing=locked \
    corepack enable \
    && pnpm config set store-dir /pnpm/store \
    && pnpm config set fetch-retries 5 \
    && pnpm config set fetch-timeout 120000 \
    && pnpm config set network-concurrency 8 \
    && pnpm install --frozen-lockfile \
    && pnpm exec turbo run build --filter=@ecosuitability/api \
    && pnpm --filter @ecosuitability/api --prod deploy /deploy

FROM node:26.13-trixie-slim@sha256:e4db4c914bf8ad241bd24804fc25d272d89bad97e68cdc8a1414862790a02c39 AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --exclude=**/*.map --from=build /deploy ./
USER node
CMD ["node", "dist/main.js"]
