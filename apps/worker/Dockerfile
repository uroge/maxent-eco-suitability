# syntax=docker/dockerfile:1.19

FROM node:24.19-trixie-slim@sha256:ab3eebe934147fee049b5eb83c570f68c849a13c930bdfa482de99fcdfa3b3de AS build
WORKDIR /app
COPY . .
RUN --mount=type=cache,id=ecosuitability-pnpm-store,target=/pnpm/store,sharing=locked \
    corepack enable \
    && pnpm config set store-dir /pnpm/store \
    && pnpm config set fetch-retries 5 \
    && pnpm config set fetch-timeout 120000 \
    && pnpm config set network-concurrency 8 \
    && pnpm install --frozen-lockfile \
    && pnpm exec turbo run build --filter=@ecosuitability/worker \
    && pnpm --filter @ecosuitability/worker --prod deploy /deploy

FROM node:24.19-trixie-slim@sha256:ab3eebe934147fee049b5eb83c570f68c849a13c930bdfa482de99fcdfa3b3de AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --exclude=**/*.map --from=build /deploy ./
USER node
CMD ["node", "dist/main.js"]
