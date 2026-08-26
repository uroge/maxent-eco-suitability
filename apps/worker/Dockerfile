FROM node:24.19-trixie-slim AS build
WORKDIR /app
COPY . .
RUN corepack enable \
    && pnpm install --frozen-lockfile \
    && pnpm --filter @ecosuitability/worker build \
    && pnpm --filter @ecosuitability/worker --prod deploy /deploy

FROM node:24.19-trixie-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /deploy ./
USER node
CMD ["node", "dist/main.js"]
