FROM node:24-alpine AS build
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile && pnpm --filter @ecosuitability/worker build
CMD ["node", "apps/worker/dist/main.js"]
