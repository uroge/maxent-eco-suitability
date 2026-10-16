import { expect, test } from '@playwright/test';

test('renders the landing page and links to analysis creation', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: /from species observations/i })
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /start analysis/i })).toHaveAttribute(
    'href',
    '/analyses/new'
  );
});
