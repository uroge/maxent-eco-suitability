# syntax=docker/dockerfile:1.19

FROM node:24.19-trixie-slim@sha256:ab3eebe934147fee049b5eb83c570f68c849a13c930bdfa482de99fcdfa3b3de AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG CLIENT_BRAND
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV CLIENT_BRAND=$CLIENT_BRAND
COPY . .
RUN --mount=type=cache,id=ecosuitability-pnpm-store,target=/pnpm/store,sharing=locked \
    corepack enable \
    && pnpm config set store-dir /pnpm/store \
    && pnpm config set fetch-retries 5 \
    && pnpm config set fetch-timeout 120000 \
    && pnpm config set network-concurrency 8 \
    && pnpm install --frozen-lockfile \
    && pnpm exec turbo run build --filter=@ecosuitability/web

FROM node:24.19-trixie-slim@sha256:ab3eebe934147fee049b5eb83c570f68c849a13c930bdfa482de99fcdfa3b3de AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app
COPY --exclude=**/*.map --from=build /app/apps/web/public ./apps/web/public
COPY --exclude=**/*.map --from=build /app/apps/web/.next/standalone ./
COPY --exclude=**/*.map --from=build /app/apps/web/.next/static ./apps/web/.next/static
USER node
CMD ["node", "apps/web/server.js"]
