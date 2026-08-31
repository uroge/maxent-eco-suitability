# syntax=docker/dockerfile:1.19

FROM node:24.19-trixie-slim@sha256:db4f733c26868756bae92ac764d7e99bf31809ce7db886ed525960fe7d544601 AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG CLIENT_BRAND
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV CLIENT_BRAND=$CLIENT_BRAND
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile && pnpm --filter @ecosuitability/web build

FROM node:24.19-trixie-slim@sha256:db4f733c26868756bae92ac764d7e99bf31809ce7db886ed525960fe7d544601 AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app
COPY --exclude=**/*.map --from=build /app/apps/web/public ./apps/web/public
COPY --exclude=**/*.map --from=build /app/apps/web/.next/standalone ./
COPY --exclude=**/*.map --from=build /app/apps/web/.next/static ./apps/web/.next/static
USER node
CMD ["node", "apps/web/server.js"]
