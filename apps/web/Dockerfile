FROM node:24-alpine AS build
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile && pnpm --filter @ecosuitability/web build
CMD ["pnpm", "--filter", "@ecosuitability/web", "start"]
