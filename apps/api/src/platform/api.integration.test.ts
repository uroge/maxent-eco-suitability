import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { StartedTestContainer } from 'testcontainers';
import { GenericContainer } from 'testcontainers';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { configureApiApplication } from '../configure-api-application';
import { AUTHENTICATION_VERIFIER } from './auth/authentication-verifier';
import { ApiException } from './errors/api.exception';
import { StorageService } from '../storage/storage.service';

const integrationEnabled = process.env.RUN_REDIS_INTEGRATION === 'true';

const productionOrigin = 'https://web.example.test';

const principal = {
  userId: 'user_123',
  sessionId: 'sess_123',
  role: 'user' as const,
};

describe.runIf(integrationEnabled)('API platform HTTP contracts', () => {
  let container: StartedTestContainer;
  let app: NestExpressApplication;

  beforeAll(async () => {
    container = await new GenericContainer('redis:8-alpine')
      .withExposedPorts(6379)
      .start();
    Object.assign(process.env, {
      APP_ENV: 'production',
      PORT: '3001',
      MAX_JSON_BODY_BYTES: '1048576',
      HTTP_HEADERS_TIMEOUT_MS: '15000',
      HTTP_REQUEST_TIMEOUT_MS: '30000',
      HTTP_KEEP_ALIVE_TIMEOUT_MS: '5000',
      REDIS_URL: `redis://${container.getHost()}:${container.getMappedPort(6379)}`,
      REDIS_DURABILITY_MODE: 'managed',
      STORAGE_PROVIDER: 'r2',
      STORAGE_INTERNAL_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
      STORAGE_PRESIGN_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
      STORAGE_BUCKET: 'ecosuitability',
      STORAGE_REGION: 'auto',
      STORAGE_ACCESS_KEY_ID: 'test-storage-access-key',
      STORAGE_SECRET_ACCESS_KEY:
        'test-storage-secret-key-with-sufficient-length',
      STORAGE_FORCE_PATH_STYLE: 'false',
      STORAGE_CORS_ORIGINS: productionOrigin,
      CLERK_SECRET_KEY: 'sk_test_platform_contract',
      CLERK_PUBLISHABLE_KEY: 'pk_test_platform_contract',
      CLERK_AUTHORIZED_PARTIES: productionOrigin,
      API_CORS_ORIGINS: productionOrigin,
      TRUST_PROXY_CIDRS: '127.0.0.1/32,::1/128',
      METRICS_TOKEN: 'platform-metrics-token-with-at-least-32-characters',
      LOG_LEVEL: 'fatal',
      SHUTDOWN_TIMEOUT_MS: '30000',
    });

    const verifier = {
      verify: vi.fn(async (authorizationHeader: string | undefined) => {
        if (authorizationHeader === 'Bearer valid-session-token') {
          return principal;
        }

        if (authorizationHeader === 'Bearer rate-limit-session-token') {
          return { ...principal, userId: 'user_rate_limit' };
        }

        throw new ApiException(
          401,
          'AUTHENTICATION_REQUIRED',
          'Authentication is required.',
        );
      }),
    };
    const { AppModule } =
      await vi.importActual<typeof import('../app.module')>('../app.module');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTHENTICATION_VERIFIER)
      .useValue(verifier)
      .overrideProvider(StorageService)
      .useValue({ isReady: vi.fn(async () => true) })
      .compile();

    app = module.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    await configureApiApplication(app);
    await app.init();
  }, 60000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    await container?.stop();
  });

  it('serves liveness and readiness with security headers', async () => {
    await request(app.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect('x-content-type-options', 'nosniff')
      .expect(({ body }) => {
        expect(body).toMatchObject({ status: 'ok', service: 'api' });
      });

    await request(app.getHttpServer()).get('/health/ready').expect(200);
  });

  it('enforces exact CORS origins and a bounded preflight policy', async () => {
    await request(app.getHttpServer())
      .options('/v1/analyses')
      .set('Origin', productionOrigin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type')
      .expect(204)
      .expect('access-control-allow-origin', productionOrigin)
      .expect('access-control-max-age', '600');

    await request(app.getHttpServer())
      .options('/v1/analyses')
      .set('Origin', 'https://attacker.example.test')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204)
      .expect(({ headers }) => {
        expect(headers['access-control-allow-origin']).toBeUndefined();
      });
  });

  it('uses safe envelopes for authentication, validation, and unknown routes', async () => {
    await request(app.getHttpServer())
      .post('/v1/analyses')
      .set('Idempotency-Key', 'request-key-123')
      .send({})
      .expect(401)
      .expect(({ body }) => {
        expect(body.error).toMatchObject({
          version: '1',
          code: 'AUTHENTICATION_REQUIRED',
          details: null,
        });
      });

    await request(app.getHttpServer())
      .post('/v1/analyses')
      .set('Authorization', 'Bearer valid-session-token')
      .set('Idempotency-Key', 'request-key-456')
      .send({ ownerId: 'user_must_not_be_accepted' })
      .expect(400)
      .expect(({ body }) => {
        expect(body.error).toMatchObject({
          code: 'VALIDATION_FAILED',
          details: {
            fields: [{ field: 'request', code: 'UNRECOGNIZED_KEYS' }],
          },
        });
      });

    await request(app.getHttpServer())
      .get('/v1/not-a-route')
      .expect(404)
      .expect(({ body }) => {
        expect(body.error).toMatchObject({ code: 'NOT_FOUND', details: null });
      });
  });

  it('preserves valid request IDs and generates a replacement for unsafe values', async () => {
    await request(app.getHttpServer())
      .get('/health/live')
      .set('X-Request-ID', 'safe.request-123')
      .expect('x-request-id', 'safe.request-123');

    await request(app.getHttpServer())
      .get('/health/live')
      .set('X-Request-ID', 'x'.repeat(65))
      .expect(({ headers }) => {
        expect(headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
      });
  });

  it('rejects oversized and malformed JSON through the safe error contract', async () => {
    await request(app.getHttpServer())
      .post('/v1/analyses')
      .set('Authorization', 'Bearer valid-session-token')
      .set('Idempotency-Key', 'request-key-789')
      .send({ displayName: 'x'.repeat(1048576) })
      .expect(413)
      .expect(({ body }) => {
        expect(body.error).toMatchObject({
          code: 'VALIDATION_FAILED',
          details: null,
        });
      });

    await request(app.getHttpServer())
      .post('/v1/analyses')
      .set('Authorization', 'Bearer valid-session-token')
      .set('Idempotency-Key', 'request-key-987')
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400)
      .expect(({ body }) => {
        expect(body.error).toMatchObject({
          code: 'VALIDATION_FAILED',
          details: null,
        });
      });
  });

  it('keeps documentation absent in production and protects metrics', async () => {
    await request(app.getHttpServer()).get('/docs').expect(404);
    await request(app.getHttpServer())
      .get('/metrics')
      .expect(401)
      .expect('cache-control', 'no-store');
    await request(app.getHttpServer())
      .get('/metrics')
      .set(
        'Authorization',
        'Bearer platform-metrics-token-with-at-least-32-characters',
      )
      .expect(200)
      .expect('content-type', /text\/plain/)
      .expect(({ text }) => {
        expect(text).toContain('ecosuitability_http_requests_total');
      });
  });

  it('returns 429 and Retry-After for authentication-failure and user limits', async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await request(app.getHttpServer())
        .get('/v1/analyses/an_0123456789abcdef0123456789abcdef')
        .set('X-Forwarded-For', '203.0.113.42')
        .expect(401);
    }

    await request(app.getHttpServer())
      .get('/v1/analyses/an_0123456789abcdef0123456789abcdef')
      .set('X-Forwarded-For', '203.0.113.42')
      .expect(429)
      .expect('retry-after', /[1-9][0-9]*/)
      .expect(({ body }) => {
        expect(body.error).toMatchObject({
          code: 'RATE_LIMITED',
          details: null,
        });
      });

    for (let attempt = 0; attempt < 120; attempt += 1) {
      await request(app.getHttpServer())
        .get('/v1/analyses/an_0123456789abcdef0123456789abcdef')
        .set('Authorization', 'Bearer rate-limit-session-token')
        .set('X-Forwarded-For', '203.0.113.42')
        .expect(404);
    }

    await request(app.getHttpServer())
      .get('/v1/analyses/an_0123456789abcdef0123456789abcdef')
      .set('Authorization', 'Bearer rate-limit-session-token')
      .set('X-Forwarded-For', '203.0.113.42')
      .expect(429)
      .expect('retry-after', /[1-9][0-9]*/);
  });

  it('keeps liveness available while Redis loss makes readiness unavailable', async () => {
    await container.stop();

    await request(app.getHttpServer()).get('/health/live').expect(200);
    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503)
      .expect(({ body }) => {
        expect(body.error).toMatchObject({
          code: 'DEPENDENCY_UNAVAILABLE',
          details: null,
        });
      });
  }, 30000);
});
