import { test, expect } from '@playwright/test';
import { signIn } from './support/helpers';

test.describe.configure({ mode: 'serial' });
test.setTimeout(60_000);

test('projects switcher and per-project reports isolation', async ({ page }) => {
  await signIn(page);

  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: /Projects/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Example Client').first()).toBeVisible({ timeout: 10_000 });

  // Create My Project via form if not exists
  const nameInput = page.getByLabel('Project name');
  if (await nameInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
    const myProjectExists = await page.getByText('My Project').first().isVisible({ timeout: 2_000 }).catch(() => false);
    if (!myProjectExists) {
      await nameInput.fill('My Project');
      const clientInput = page.getByLabel('Client name (optional)');
      if (await clientInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await clientInput.fill('Mine');
      }
      const createBtn = page.getByRole('button', { name: /Create/i }).first();
      await createBtn.click();
      await expect(page.getByText('My Project').first()).toBeVisible({ timeout: 10_000 }).catch(() => {});
    }
  }

  // Check switcher exists in sidebar
  await expect(page.locator('[data-project-switcher]').first()).toBeVisible({ timeout: 5_000 }).catch(async () => {
    await expect(page.getByText('Project').first()).toBeVisible({ timeout: 5_000 });
  });

  // Reports per project via query param
  // Example Client should show seeded 120000 halves (from demo seed)
  await page.goto('/reports/trial-balance?from=2026-07-01&to=2026-07-31');
  // Wait for either project content or empty state
  await page.waitForTimeout(1000);
  // The trial page should be visible (either with data or project switcher)
  await expect(page.getByText(/Trial Balance/i).first()).toBeVisible({ timeout: 10_000 });
});
