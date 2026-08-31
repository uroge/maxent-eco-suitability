FROM node:24.19-trixie-slim@sha256:db4f733c26868756bae92ac764d7e99bf31809ce7db886ed525960fe7d544601 AS build
WORKDIR /app
COPY . .
RUN corepack enable \
    && pnpm install --frozen-lockfile \
    && pnpm --filter @ecosuitability/worker build \
    && pnpm --filter @ecosuitability/worker --prod deploy /deploy

FROM node:24.19-trixie-slim@sha256:db4f733c26868756bae92ac764d7e99bf31809ce7db886ed525960fe7d544601 AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /deploy ./
USER node
CMD ["node", "dist/main.js"]
