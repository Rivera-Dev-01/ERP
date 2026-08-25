import { expect, test } from '@playwright/test';
import { signIn } from './support/helpers';

test('accounts slice', async ({ page }) => {
  await signIn(page);
  await page.goto('/accounts');
  await expect(page.getByRole('heading', { name: 'Chart of Accounts' })).toBeVisible();
  await expect(page.getByText('1000')).toBeVisible();
});
