import { expect, test } from '@playwright/test';

test('keeps landing actions readable in both themes', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await page.addInitScript((selectedTheme) => {
      window.localStorage.setItem('app:appearance', selectedTheme);
    }, theme);
    await page.goto('/');

    const action = page.getByRole('link', { name: 'Try example dataset' });
    await expect(action).toBeVisible();
    await action.hover();
    await action.focus();
    await expect(action).toBeFocused();

    const colors = await action.evaluate((element) => {
      const styles = window.getComputedStyle(element);
      return {
        border: styles.borderColor,
        foreground: styles.color,
      };
    });
    expect(colors.foreground).not.toBe(colors.border);
  }
});

test('renders the branded authentication shell without horizontal clipping', async ({ page }) => {
  await page.goto('/analyses/new');
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(
    page.getByRole('heading', { name: 'Scientific modelling, made spatial.' })
  ).toBeVisible();

  await page.setViewportSize({ height: 844, width: 390 });
  await expect(
    page.getByRole('heading', { name: 'Scientific modelling, made spatial.' })
  ).toBeHidden();
  await expect(page.getByRole('link', { name: 'EcoSuitability home' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );

  await page.goto('/sign-up');
  await expect(page.getByRole('link', { name: 'EcoSuitability home' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
});
