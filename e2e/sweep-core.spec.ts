import type { Page } from "@playwright/test";

import { prisma } from "../src/lib/db";
import { expect, test } from "./fixtures/sweep";

async function navigate(page: Page, path: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { await page.goto(path, { waitUntil: "domcontentloaded" }); return; }
    catch (error) { if (attempt === 2 || !String(error).includes("ERR_ABORTED")) throw error; }
  }
}

async function login(page: Page, username: string, password: string) {
  const response = await page.request.post("/api/auth/login", {
    data: { password, username },
    headers: { origin: "http://127.0.0.1:3000" },
  });
  expect(response.ok()).toBe(true);
}

test.describe("desktop sweep workflow", () => {
test("agents complete single and batch sweep flows while administrators can trace corrections", async ({ authUsers, browser, page, sweepScenario }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Full workflow is covered once on desktop");
  test.setTimeout(300_000);
  const firstContext = await browser.newContext(testInfo.project.use);
  const first = await firstContext.newPage();
  await login(first, authUsers.agent.username, authUsers.agent.password);
  await navigate(first, `/app/buildings/${sweepScenario.buildingId}?floor=2`);
  await expect(first.getByRole("link", { name: /201.*未扫/ })).toHaveAttribute("href", new RegExp(`/app/dormitories/${sweepScenario.dormitoryIds["201"]}/record`));
  await navigate(first, `/app/dormitories/${sweepScenario.dormitoryIds["201"]}/record?floor=2`);
  await expect(first.getByRole("heading", { name: "记录 201" })).toBeVisible();
  const pendingNoteButton = first.getByRole("button", { name: sweepScenario.pendingNote });
  await expect(async () => {
    await pendingNoteButton.click();
    await expect(pendingNoteButton).toHaveAttribute("aria-pressed", "true");
  }).toPass({ timeout: 30_000 });
  const singleSaveResponse = first.waitForResponse((response) => response.url().includes(`/api/dormitories/${sweepScenario.dormitoryIds["201"]}/my-record`) && response.request().method() === "PUT", { timeout: 30_000 });
  await first.getByRole("button", { name: "保存记录" }).click();
  expect((await singleSaveResponse).ok()).toBe(true);
  await expect(first).toHaveURL(new RegExp(`/app/buildings/${sweepScenario.buildingId}\\?floor=2`), { timeout: 20_000 });
  await expect(first.getByText("1 待补扫")).toBeVisible();

  const secondRecord = await prisma.sweepRecord.create({ data: { agentId: sweepScenario.secondAgent.id, dormitoryId: sweepScenario.dormitoryIds["201"], note: sweepScenario.coveredNote, status: "COVERED" } });
  await prisma.sweepAudit.create({ data: { action: "CREATE", afterNote: sweepScenario.coveredNote, afterStatus: "COVERED", agentId: sweepScenario.secondAgent.id, dormitoryId: sweepScenario.dormitoryIds["201"], operatorId: sweepScenario.secondAgent.id, recordId: secondRecord.id } });

  await expect.poll(() => prisma.sweepRecord.count({ where: { dormitoryId: sweepScenario.dormitoryIds["201"] } })).toBe(2);
  await navigate(first, `/app/buildings/${sweepScenario.buildingId}?floor=2`);
  const room201 = first.getByRole("link", { name: /201.*已覆盖.*我扫过/ });
  await expect(room201).toBeVisible();
  await navigate(first, `/app/dormitories/${sweepScenario.dormitoryIds["201"]}?floor=2`);
  await expect(first.getByText(sweepScenario.pendingNote)).toBeVisible();
  await expect(first.getByText(sweepScenario.coveredNote)).toHaveCount(0);
  await navigate(first, `/app/dormitories/${sweepScenario.dormitoryIds["201"]}/history?floor=2`);
  await expect(first.getByRole("main").getByText("测试代理")).toBeVisible();
  await expect(first.getByRole("main").getByText("第二代理")).toBeVisible();

  await navigate(first, `/app/buildings/${sweepScenario.buildingId}/batch?floor=2`);
  const select202Button = first.getByRole("button", { name: "选择202" });
  const nextBatchStepButton = first.getByRole("button", { name: "下一步 · 标记1间" });
  await expect(async () => {
    await select202Button.click();
    await expect(nextBatchStepButton).toBeVisible();
  }).toPass({ timeout: 30_000 });
  await nextBatchStepButton.click();
  await expect(first.getByRole("heading", { name: "标记 202" })).toBeVisible();
  const coveredButton = first.getByRole("button", { exact: true, name: "已覆盖" });
  await coveredButton.click();
  await expect(coveredButton).toHaveAttribute("aria-pressed", "true");
  const coveredNoteButton = first.getByRole("button", { name: sweepScenario.coveredNote });
  await coveredNoteButton.click();
  await expect(coveredNoteButton).toHaveAttribute("aria-pressed", "true");
  const batchSaveResponse = first.waitForResponse((response) => response.url().endsWith("/api/sweep-records/batch") && response.request().method() === "POST", { timeout: 30_000 });
  await first.getByRole("button", { name: "保存1间宿舍" }).click();
  expect((await batchSaveResponse).ok()).toBe(true);
  await expect(first.getByText("2 已覆盖")).toBeVisible({ timeout: 20_000 });

  await login(page, authUsers.admin.username, authUsers.admin.password);
  await navigate(page, "/admin/sweep-data");
  await page.getByLabel("学校").selectOption(sweepScenario.schoolId);
  await page.getByLabel("房号").fill("201");
  const firstRow = page.locator(".sweep-data-row").filter({ hasText: "201" }).filter({ hasText: "测试代理" }).first();
  const adminNoteInput = page.getByLabel("管理员备注");
  await expect(async () => {
    await firstRow.getByRole("button", { name: /编辑 201/ }).click();
    await expect(adminNoteInput).toBeVisible();
  }).toPass({ timeout: 30_000 });
  await page.getByRole("button", { exact: true, name: "已覆盖" }).click();
  await adminNoteInput.fill("管理员复核完成");
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByText("管理员复核完成")).toBeVisible();
  const secondRow = page.locator(".sweep-data-row").filter({ hasText: "201" }).filter({ hasText: "第二代理" }).first();
  await secondRow.getByRole("button", { name: /删除 201/ }).click();
  await page.getByRole("button", { name: "确认永久删除" }).click();
  await page.getByRole("tab", { name: "审计记录" }).click();
  await expect(page.getByText("UPDATE · 操作人 测试管理员")).toBeVisible();
  await expect(page.getByText("DELETE · 操作人 测试管理员")).toBeVisible();

  await prisma.agentSchoolAccess.delete({ where: { agentId_schoolId: { agentId: (await prisma.user.findUniqueOrThrow({ where: { username: authUsers.agent.username } })).id, schoolId: sweepScenario.schoolId } } });
  await navigate(first, `/app/dormitories/${sweepScenario.dormitoryIds["202"]}/record?floor=2`);
  await expect(first).toHaveURL(/\/app\/schools\?access=revoked$/);

  if (testInfo.project.name.includes("mobile")) {
    const box = await page.getByRole("tab", { name: "审计记录" }).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(48);
  }
  await firstContext.close();
});
});

test("mobile sweep controls keep 48px touch targets", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "Mobile viewport assertion");
  await navigate(page, "/login");
  for (const control of [page.getByLabel("账号"), page.getByLabel("密码", { exact: true }), page.getByRole("button", { name: "登录" })]) {
    const box = await control.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(48);
  }
});
