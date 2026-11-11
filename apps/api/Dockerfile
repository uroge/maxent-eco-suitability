# syntax=docker/dockerfile:1.19

FROM node:26.12-trixie-slim@sha256:94816674c62774da0d099a947bf4613b9e1972a2733abd0d0cd80e795f8411d0 AS build
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

FROM node:26.12-trixie-slim@sha256:94816674c62774da0d099a947bf4613b9e1972a2733abd0d0cd80e795f8411d0 AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --exclude=**/*.map --from=build /deploy ./
USER node
CMD ["node", "dist/main.js"]
