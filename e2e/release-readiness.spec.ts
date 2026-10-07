import type { Locator, Page } from "@playwright/test";

import { prisma } from "../src/lib/db";
import { expect, test } from "./fixtures/sweep";

async function login(page: Page, username: string, password: string) {
  const response = await page.request.post("/api/auth/login", {
    data: { password, username },
    headers: { origin: "http://127.0.0.1:3000" },
  });
  expect(response.ok()).toBe(true);
}

async function navigate(page: Page, path: string) {
  await page.goto(path, { waitUntil: "networkidle" });
}

async function expectTouchTarget(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(48);
}

test("desktop release readiness covers twenty rooms in two atomic batches", async ({ authUsers, page, sweepScenario }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop scale workflow");
  test.setTimeout(180_000);
  await login(page, authUsers.agent.username, authUsers.agent.password);

  for (const roomNumbers of [sweepScenario.releaseRoomNumbers.slice(0, 10), sweepScenario.releaseRoomNumbers.slice(10)]) {
    await navigate(page, `/app/buildings/${sweepScenario.releaseBuildingId}/batch?floor=3`);
    for (const roomNo of roomNumbers) await page.getByRole("button", { name: `选择${roomNo}` }).click();
    await page.getByRole("button", { name: "下一步 · 标记10间" }).click();
    await page.getByRole("button", { exact: true, name: "已覆盖" }).click();

    const picker = page.getByRole("button", { name: /快捷备注/ });
    await expect(picker).toHaveAttribute("aria-expanded", "false");
    await picker.click();
    const options = page.getByRole("listbox", { name: "快捷备注选项" });
    await expect(options).toBeVisible();
    expect(await options.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    expect((await options.getByRole("option").allTextContents()).at(-1)).toBe("自定义备注");
    await options.getByRole("option", { name: sweepScenario.coveredNote }).click();
    await expect(picker).toHaveAttribute("aria-expanded", "false");

    const response = page.waitForResponse((candidate) => candidate.url().endsWith("/api/sweep-records/batch") && candidate.request().method() === "POST");
    await page.getByRole("button", { name: "保存10间宿舍" }).click();
    expect((await response).ok()).toBe(true);
  }

  await expect(page.getByText("20 已覆盖")).toBeVisible();
  const agent = await prisma.user.findUniqueOrThrow({ where: { username: authUsers.agent.username } });
  await expect.poll(() => prisma.sweepRecord.count({
    where: { agentId: agent.id, dormitoryId: { in: sweepScenario.releaseRoomIds }, status: "COVERED" },
  })).toBe(20);
});

test("mobile release readiness controls keep 48px touch targets", async ({ authUsers, page, sweepScenario }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "Mobile viewport assertion");
  test.setTimeout(120_000);
  await login(page, authUsers.agent.username, authUsers.agent.password);
  await navigate(page, "/app/schools");

  const school = page.getByRole("link", { name: new RegExp(sweepScenario.schoolName) });
  await expectTouchTarget(school);
  await school.click();
  const building = page.getByRole("link", { name: /发布验收20间楼/ });
  await expectTouchTarget(building);
  await building.click();

  await expectTouchTarget(page.getByRole("link", { name: "返回楼栋选择" }));
  await expectTouchTarget(page.getByRole("link", { name: /301.*未扫/ }));
  const batch = page.getByRole("link", { name: "批量标记" });
  await expectTouchTarget(batch);
  await batch.click();

  await expectTouchTarget(page.getByRole("link", { name: "退出批量模式" }));
  await expectTouchTarget(page.getByRole("button", { name: "选择301" }));
  await page.getByRole("button", { name: "选择301" }).click();
  const next = page.getByRole("button", { name: "下一步 · 标记1间" });
  await expectTouchTarget(next);
  await next.click();

  await expectTouchTarget(page.getByRole("button", { exact: true, name: "待补扫" }));
  await expectTouchTarget(page.getByRole("button", { exact: true, name: "已覆盖" }));
  await page.getByRole("button", { exact: true, name: "已覆盖" }).click();
  const picker = page.getByRole("button", { name: /快捷备注/ });
  await expectTouchTarget(picker);
  await picker.click();
  await expectTouchTarget(page.getByRole("option", { name: sweepScenario.coveredNote }));
  await page.getByRole("option", { name: sweepScenario.coveredNote }).click();
  await expectTouchTarget(page.getByRole("button", { name: "保存1间宿舍" }));
});
