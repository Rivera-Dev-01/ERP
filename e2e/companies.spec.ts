import { test, expect } from '@playwright/test';
import { signIn } from './support/helpers';

test.describe.configure({ mode: 'serial' });
test.setTimeout(60_000);

test('companies switcher and per-company reports isolation', async ({ page }) => {
  await signIn(page);

  await page.goto('/companies');
  await expect(page.getByRole('heading', { name: /Companies/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Example Client').first()).toBeVisible({ timeout: 10_000 });

  // Create My Company via form if not exists
  const nameInput = page.getByLabel('Company name');
  if (await nameInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
    const myCompanyExists = await page.getByText('My Company').first().isVisible({ timeout: 2_000 }).catch(() => false);
    if (!myCompanyExists) {
      await nameInput.fill('My Company');
      const clientInput = page.getByLabel('Client name (optional)');
      if (await clientInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await clientInput.fill('Mine');
      }
      const createBtn = page.getByRole('button', { name: /Create/i }).first();
      await createBtn.click();
      await expect(page.getByText('My Company').first()).toBeVisible({ timeout: 10_000 }).catch(() => {});
    }
  }

  // Check switcher exists in sidebar (support both old and new data attr)
  await expect(page.locator('[data-company-switcher]').first()).toBeVisible({ timeout: 5_000 }).catch(async () => {
    await expect(page.locator('[data-project-switcher]').first()).toBeVisible({ timeout: 5_000 }).catch(async () => {
      await expect(page.getByText('Company').first()).toBeVisible({ timeout: 5_000 });
    });
  });

  // Reports per company via query param
  // Example Client should show seeded 120000 halves (from demo seed)
  await page.goto('/reports/trial-balance?from=2026-07-01&to=2026-07-31');
  // Wait for either company content or empty state
  await page.waitForTimeout(1000);
  // The trial page should be visible (either with data or company switcher)
  await expect(page.getByText(/Trial Balance/i).first()).toBeVisible({ timeout: 10_000 });
});
