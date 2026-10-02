import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures/auth";

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("账号").fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
}

test("administrator enters the administrator shell", async ({ authUsers, page }) => {
  await login(page, authUsers.admin.username, authUsers.admin.password);

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText("管理员后台").first()).toBeVisible();
  await expect(page.getByText("测试管理员")).toBeVisible();
});

test("agent enters the mobile school flow", async ({ authUsers, page }) => {
  await login(page, authUsers.agent.username, authUsers.agent.password);

  await expect(page).toHaveURL(/\/app\/schools$/);
  await expect(page.getByRole("heading", { name: "选择学校" })).toBeVisible();
  await expect(page.getByText("测试代理")).toBeVisible();
});

test("wrong password shows the approved generic message", async ({ authUsers, page }) => {
  await login(page, authUsers.agent.username, "wrong-password");

  await expect(page.getByText("账号或密码错误", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("password visibility can be toggled", async ({ page }) => {
  await page.goto("/login");
  const password = page.getByLabel("密码", { exact: true });

  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "显示密码" }).click();
  await expect(password).toHaveAttribute("type", "text");
});

test("logout returns to login and revokes protected access", async ({ authUsers, page }) => {
  await login(page, authUsers.agent.username, authUsers.agent.password);
  await page.getByRole("button", { name: "退出登录" }).click();

  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/app/schools");
  await expect(page).toHaveURL(/\/login$/);
});

test("direct protected URL redirects an anonymous user", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login$/);
});

test("mobile login controls meet the 48px touch target", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "Mobile viewport assertion");
  await page.goto("/login");

  for (const control of [
    page.getByLabel("账号"),
    page.getByLabel("密码", { exact: true }),
    page.getByRole("button", { name: "显示密码" }),
    page.getByRole("button", { name: "登录" }),
  ]) {
    const box = await control.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(48);
  }
});
