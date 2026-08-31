# Platform Foundation

## Identity

Clerk is the only identity system. Enable open sign-up, mandatory verified email, and bot protection in the Clerk Dashboard. Configure the session claim `metadata.role` from `{{user.public_metadata.role}}`; only `admin` is privileged and every missing or malformed value is `user`.

Bootstrap the first administrator by setting the user's public metadata in the trusted Clerk Dashboard or Backend API. Never expose a client mutation for that metadata. Claims can take up to one token-refresh interval to propagate. For emergency removal, deactivate the Clerk user or session immediately.

The browser gets a Clerk token through its supported client API and sends `Authorization: Bearer <token>` to Nest. It never stores or logs the token, and retries once after a `401`.

## Operations

`/health/live` proves the process is running. `/health/ready` requires Redis and returns a versioned `DEPENDENCY_UNAVAILABLE` envelope on failure. `/metrics` is bearer-token protected and never cached. The worker listener is internal-only and must not be published by Docker or Caddy.

Rate limits are Redis-backed: anonymous traffic is keyed by normalized client IP; authenticated routes add Clerk user and IP limits. Redis failures fail closed for protected routes. No bearer tokens, emails, URLs, query strings, or request IDs become limiter keys or metric labels.

Production uses Caddy for TLS, redirects, timeouts, and forwarding headers. API containers are not publicly published. Set `TRUST_PROXY_CIDRS` only to Caddy's internal network; do not trust direct client forwarded headers.

## Required Production Variables

API requires `REDIS_URL`, Clerk keys, explicit HTTPS `CLERK_AUTHORIZED_PARTIES` and `API_CORS_ORIGINS`, `TRUST_PROXY_CIDRS`, and a random 32+ character `METRICS_TOKEN`. The worker requires its own `WORKER_METRICS_TOKEN`. Set `APP_ENV=production`; invalid or blank values prevent startup.

Shutdown handles `SIGTERM` and `SIGINT`: the service stops accepting work, closes listeners, and closes Redis. Investigate Clerk failures, Redis readiness failures, unexpected `401`/`429` growth, and metrics token failures using request IDs and redacted structured logs.
