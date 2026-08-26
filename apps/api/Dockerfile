FROM node:24-alpine AS build
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile && pnpm --filter @ecosuitability/api build
CMD ["node", "apps/api/dist/main.js"]
