import { expect, test } from '@playwright/test';
import { signIn, TEST_ACCOUNT } from './support/helpers';

test.describe('authentication', () => {
  test('redirects unauthenticated users to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('signs in with the seeded accountant and reaches the dashboard', async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('shows a generic error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(TEST_ACCOUNT.email);
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Invalid email or password.');
  });

  test('signs out back to /login', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
