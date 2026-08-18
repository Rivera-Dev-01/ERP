import { expect, type Page } from '@playwright/test';

export const TEST_ACCOUNT = {
  email: 'accountant@v0.local',
  password: 'demo-pass-123',
};

export async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(TEST_ACCOUNT.email);
  await page.getByLabel('Password').fill(TEST_ACCOUNT.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}
