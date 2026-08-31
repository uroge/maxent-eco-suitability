import { spawnSync } from 'node:child_process';

const composeEnvironment = {
  ...process.env,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'https://app.example.test',
  CLERK_PUBLISHABLE_KEY: process.env.CLERK_PUBLISHABLE_KEY ?? 'pk_test_placeholder',
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ?? 'sk_test_placeholder',
  CLERK_AUTHORIZED_PARTIES: process.env.CLERK_AUTHORIZED_PARTIES ?? 'https://app.example.test',
  API_CORS_ORIGINS: process.env.API_CORS_ORIGINS ?? 'https://app.example.test',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://redis:6379',
  METRICS_TOKEN: process.env.METRICS_TOKEN ?? 'test-metrics-token-with-at-least-32-characters',
  WORKER_METRICS_TOKEN:
    process.env.WORKER_METRICS_TOKEN ?? 'test-worker-metrics-token-with-at-least-32-characters',
  MINIO_ROOT_USER: process.env.MINIO_ROOT_USER ?? 'minioadmin',
  MINIO_ROOT_PASSWORD: process.env.MINIO_ROOT_PASSWORD ?? 'minioadmin',
  CADDY_EMAIL: process.env.CADDY_EMAIL ?? 'ops@example.test',
  WEB_DOMAIN: process.env.WEB_DOMAIN ?? 'app.example.test',
  API_DOMAIN: process.env.API_DOMAIN ?? 'api.example.test',
};

const run = (command, arguments_, options = {}) => {
  const result = spawnSync(command, arguments_, {
    encoding: 'utf8',
    env: composeEnvironment,
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} failed.`);
  }

  return result.stdout;
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const compose = JSON.parse(
  run('docker', [
    'compose',
    '-p',
    'ecosuitability',
    '-f',
    'infrastructure/docker/compose.yaml',
    '-f',
    'infrastructure/docker/compose.production.yaml',
    'config',
    '--format',
    'json',
  ])
);

for (const serviceName of ['api', 'worker', 'web']) {
  const service = compose.services[serviceName];

  assert(service.read_only === true, `${serviceName} must use a read-only filesystem.`);
  assert(service.cap_drop?.includes('ALL'), `${serviceName} must drop all Linux capabilities.`);
  assert(
    service.security_opt?.includes('no-new-privileges:true'),
    `${serviceName} must prevent privilege escalation.`
  );
}

assert(compose.services.caddy.ports?.length === 2, 'Only Caddy may publish ports.');

for (const serviceName of ['api', 'worker', 'redis', 'seaweedfs']) {
  assert(
    !compose.services[serviceName].ports?.length,
    `${serviceName} must not publish a host port in production.`
  );
}

for (const image of ['ecosuitability-api', 'ecosuitability-worker', 'ecosuitability-web']) {
  const configuration = JSON.parse(run('docker', ['image', 'inspect', image]))[0].Config;
  assert(configuration.User === 'node', `${image} must run as the non-root node user.`);

  const history = run('docker', ['history', '--no-trunc', image]);
  assert(
    !/(sk_(live|test)_|METRICS_TOKEN=|CLERK_SECRET_KEY=)/.test(history),
    `${image} history contains a secret.`
  );

  const sourceMaps = run('docker', [
    'run',
    '--rm',
    '--entrypoint',
    'sh',
    image,
    '-c',
    'find /app -type f -name "*.map" -print -quit',
  ]);
  assert(!sourceMaps.trim(), `${image} must not contain source maps.`);
}
