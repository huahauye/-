import { expect, test } from "@playwright/test";

test("landing page explains the product boundary", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /专利 OA/ })).toBeVisible();
  await expect(page.getByText(/工作稿/).first()).toBeVisible();
});

test("login page exposes registration and recovery paths", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /登录/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /注册/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /找回|重置/ })).toBeVisible();
});
