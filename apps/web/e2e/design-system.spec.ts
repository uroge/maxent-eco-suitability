import { expect, test } from '@playwright/test';

const expectInside = async (
  parent: import('@playwright/test').Locator,
  child: import('@playwright/test').Locator
): Promise<void> => {
  const parentBox = await parent.boundingBox();
  const childBox = await child.boundingBox();
  expect(parentBox).not.toBeNull();
  expect(childBox).not.toBeNull();
  expect(childBox!.x).toBeGreaterThanOrEqual(parentBox!.x);
  expect(childBox!.y).toBeGreaterThanOrEqual(parentBox!.y);
  expect(childBox!.x + childBox!.width).toBeLessThanOrEqual(parentBox!.x + parentBox!.width);
  expect(childBox!.y + childBox!.height).toBeLessThanOrEqual(parentBox!.y + parentBox!.height);
};

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

test('keeps both scientific atlas compositions inside their responsive safe areas', async ({
  page,
}) => {
  await page.goto('/');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((selectedTheme) => {
      window.localStorage.setItem('app:appearance', selectedTheme);
    }, theme);
    for (const viewport of [
      { composition: 'desktop', height: 900, width: 1440 },
      { composition: 'mobile', height: 844, width: 390 },
    ]) {
      await page.setViewportSize({ height: viewport.height, width: viewport.width });
      await page.reload();

      const atlas = page.locator(`[data-atlas-composition="${viewport.composition}"]`);
      await expect(atlas).toBeVisible();
      await expect(atlas).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
      for (const element of ['legend', 'scale', 'occurrence-focus']) {
        const feature = atlas.locator(`[data-atlas-element="${element}"]`);
        await expect(feature).toBeVisible();
        await expectInside(atlas, feature);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true);
    }
  }
});
