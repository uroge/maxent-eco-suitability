import { expect, test } from '@playwright/test';
import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';

const analysisId = 'an_0123456789abcdef0123456789abcdef';

test('completes the authenticated analysis workflow against the contract API', async ({ page }) => {
  await setupClerkTestingToken({ page });
  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: {
      strategy: 'password',
      identifier: process.env.E2E_CLERK_USER_EMAIL!,
      password: process.env.E2E_CLERK_USER_PASSWORD!,
    },
  });

  await page.goto('/analyses/new?example=1');
  await expect(page.getByRole('heading', { name: 'Validate source data' })).toBeVisible();
  await expect(page.getByText('Raster alignment')).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Occurrence and predictor spatial profile' })
  ).toBeVisible();
  await expect(page.getByText('100% of preview points')).toBeVisible();
  await page.getByRole('link', { name: 'Configure analysis' }).click();

  await page.getByLabel('Species name').fill('Lynx lynx');
  await page.getByRole('button', { name: 'Save and continue to Review' }).click();
  await expect(page.getByRole('heading', { name: 'Review and queue' })).toBeVisible();
  await expect(page.getByText('passed', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Queue analysis' }).click();
  await expect(page.getByRole('heading', { name: 'Analysis execution' })).toBeVisible();
  await expect(page).toHaveURL(`/analyses/${analysisId}`, { timeout: 20_000 });

  await expect(page.getByRole('heading', { name: 'Lynx lynx' })).toBeVisible();
  await expect(page.getByText('Mean AUC')).toBeVisible();
  await expect(page.getByLabel('Suitability and occurrence map preview')).toBeVisible();
  await page.getByRole('link', { name: 'Explore map' }).click();
  await expect(page.getByRole('heading', { name: 'Map layers' })).toBeVisible();
  await page.locator('.maplibregl-canvas').click({ position: { x: 200, y: 200 } });
  await expect(page.getByText('0.8200')).toBeVisible();

  await page.getByRole('link', { name: 'Diagnostics' }).click();
  await expect(page.getByText('Pooled held-out ROC')).toBeVisible();
  await page.getByRole('link', { name: 'responses' }).click();
  await expect(page.getByText(/Response curve · synthetic_elevation/)).toBeVisible();

  await page.getByRole('link', { name: 'Downloads' }).click();
  await expect(page.getByText('ecosuitability-results.zip')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download all' }).click();
  await expect(download).resolves.toBeDefined();
});
