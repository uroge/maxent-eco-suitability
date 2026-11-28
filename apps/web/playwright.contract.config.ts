import { defineConfig, devices } from '@playwright/test';

const required = [
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
  'E2E_CLERK_USER_EMAIL',
  'E2E_CLERK_USER_PASSWORD',
] as const;

for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`${name} is required for the authenticated contract suite.`);
  }
}

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/contract.spec.ts',
  globalSetup: './e2e/support/clerk-global-setup.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://127.0.0.1:3000',
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node e2e/support/contract-api.mjs',
      url: 'http://127.0.0.1:4010/health',
      reuseExistingServer: false,
    },
    {
      command:
        'API_INTERNAL_URL=http://127.0.0.1:4010 NEXT_PUBLIC_API_URL=http://127.0.0.1:4010 pnpm dev --hostname 127.0.0.1 --port 3000',
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
