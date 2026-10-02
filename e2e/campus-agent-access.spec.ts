import type { Page } from "@playwright/test";

import { prisma } from "../src/lib/db";
import { expect, test } from "./fixtures/campus";

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("账号").fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
  await page.reload();
}

test("administrator builds campus data and controls one agent's school access", async ({
  authUsers,
  browser,
  campusScenario,
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await login(page, authUsers.admin.username, authUsers.admin.password);
  await page.goto("/admin/campus");

  await page.getByRole("button", { name: /添加学校/ }).click();
  const addSchool = page.getByRole("dialog", { name: "添加学校" });
  await expect(addSchool.getByRole("button", { name: "关闭添加学校" })).toBeFocused();
  await addSchool.getByLabel("学校名称").fill(campusScenario.schoolName);
  await addSchool.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText(campusScenario.schoolName)).toBeVisible();

  await expect.poll(async () => (
    await prisma.school.findUnique({ where: { name: campusScenario.schoolName }, select: { id: true } })
  )?.id).not.toBeNull();
  const school = await prisma.school.findUniqueOrThrow({ where: { name: campusScenario.schoolName } });

  const schoolToggle = page.getByRole("button", { name: `展开${campusScenario.schoolName}` });
  if (await schoolToggle.isVisible()) await schoolToggle.click();
  const schoolMenu = page.getByRole("button", { name: `${campusScenario.schoolName}操作` });
  const schoolMenuBox = await schoolMenu.boundingBox();
  expect(schoolMenuBox?.height).toBeGreaterThanOrEqual(44);
  expect(schoolMenuBox?.width).toBeGreaterThanOrEqual(44);
  await schoolMenu.click();
  await page.getByRole("menuitem", { name: "新建楼栋" }).click();
  const addBuilding = page.getByRole("dialog", { name: "新建楼栋" });
  await addBuilding.getByLabel("楼栋名称").fill(campusScenario.buildingName);
  await addBuilding.getByLabel("楼栋备注（可选）").fill("备注写着99层，但统计必须来自宿舍数据");
  await addBuilding.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("0层 · 0间宿舍")).toBeVisible();

  await page.getByRole("button", { name: `${campusScenario.buildingName}操作` }).click();
  await page.getByRole("menuitem", { name: "宿舍管理" }).click();
  const dormitoryManager = page.getByRole("dialog", { name: `${campusScenario.buildingName}宿舍管理` });
  await dormitoryManager.getByRole("tab", { name: "批量添加" }).click();
  await dormitoryManager.getByLabel("起始楼层").fill("2");
  await dormitoryManager.getByLabel("结束楼层").fill("2");
  await dormitoryManager.getByLabel("起始房号").fill("1");
  await dormitoryManager.getByLabel("结束房号").fill("2");
  await dormitoryManager.getByRole("button", { name: "生成预览" }).click();
  await expect(dormitoryManager.getByText("将处理：201、202")).toBeVisible();
  await dormitoryManager.getByRole("button", { name: "确认批量添加" }).click();
  await expect(page.getByText("1层 · 2间宿舍")).toBeVisible();

  const building = await prisma.building.findFirstOrThrow({
    where: { name: campusScenario.buildingName, schoolId: school.id },
  });

  await page.goto("/admin/agents");
  const createAgentTrigger = page.getByRole("button", { name: /创建代理/ });
  await createAgentTrigger.click();
  const createAgent = page.getByRole("dialog", { name: "创建代理" });
  await createAgent.getByLabel("代理名称").fill(campusScenario.agentName);
  await createAgent.getByLabel("登录账号").fill(campusScenario.agentUsername);
  await createAgent.getByRole("button", { name: "创建账号" }).click();
  const temporaryPassword = (await createAgent.locator("code").textContent())?.trim();
  expect(temporaryPassword).toBeTruthy();
  await createAgent.getByRole("button", { name: "关闭创建代理" }).click();
  await expect(createAgentTrigger).toBeFocused();

  await page.getByRole("button", { name: `${campusScenario.agentName}账号操作` }).click();
  await page.getByRole("menuitem", { name: "配置学校权限" }).click();
  const accessDialog = page.getByRole("dialog", { name: `配置${campusScenario.agentName}的学校权限` });
  await accessDialog.getByLabel(campusScenario.schoolName).check();
  await accessDialog.getByRole("button", { name: "保存学校权限" }).click();
  await expect(page.getByText(campusScenario.schoolName)).toBeVisible();

  const agent = await prisma.user.findUniqueOrThrow({ where: { username: campusScenario.agentUsername } });
  await expect.poll(() => prisma.agentSchoolAccess.count({
    where: { agentId: agent.id, schoolId: school.id },
  })).toBe(1);
  const room201 = await prisma.dormitory.findUniqueOrThrow({
    where: { buildingId_roomNo: { buildingId: building.id, roomNo: "201" } },
  });
  const record = await prisma.sweepRecord.create({
    data: { agentId: agent.id, dormitoryId: room201.id, note: "历史文本必须保留", status: "PENDING" },
  });
  await prisma.sweepAudit.create({
    data: {
      action: "CREATE",
      afterNote: "历史文本必须保留",
      afterStatus: "PENDING",
      agentId: agent.id,
      dormitoryId: room201.id,
      operatorId: agent.id,
      recordId: record.id,
    },
  });

  const agentContext = await browser.newContext(testInfo.project.use);
  const agentPage = await agentContext.newPage();
  await login(agentPage, campusScenario.agentUsername, temporaryPassword!);
  await expect(agentPage).toHaveURL(/\/app\/schools$/);
  await expect(agentPage.getByText(campusScenario.agentName)).toBeVisible();
  await expect(agentPage.getByRole("heading", { name: "选择学校" })).toBeVisible();
  await expect(agentPage.getByText(campusScenario.schoolName)).toBeVisible();
  await expect(agentPage.getByText("已授权", { exact: true })).toBeVisible();
  const schoolLink = agentPage.getByRole("link", { name: new RegExp(`${campusScenario.schoolName}.*已授权`) });
  await schoolLink.evaluate((element) => (element as HTMLElement).click());
  await expect(agentPage).toHaveURL(new RegExp(`/app/schools/${school.id}/buildings$`));
  await expect(agentPage.getByRole("link", { name: /3号楼.*1层.*2间宿舍/ })).toBeVisible();
  const backControl = agentPage.getByRole("link", { name: "返回学校选择" });
  const backBox = await backControl.boundingBox();
  expect(backBox?.height).toBeGreaterThanOrEqual(48);
  const buildingUrl = `/app/buildings/${building.id}`;
  await agentPage.goto(buildingUrl);
  await expect(agentPage.getByRole("heading", { name: campusScenario.buildingName })).toBeVisible();
  await expect(agentPage.getByText("201", { exact: true })).toBeVisible();
  await expect(agentPage.getByText("202", { exact: true })).toBeVisible();

  const adminPage = await page.context().newPage();
  await adminPage.goto("/admin/agents");
  await adminPage.getByRole("button", { name: `${campusScenario.agentName}账号操作` }).click();
  await adminPage.getByRole("menuitem", { name: "配置学校权限" }).click();
  const revokeDialog = adminPage.getByRole("dialog", { name: `配置${campusScenario.agentName}的学校权限` });
  await revokeDialog.getByLabel(campusScenario.schoolName).uncheck();
  await revokeDialog.getByRole("button", { name: "保存学校权限" }).click();
  await agentPage.goto(buildingUrl);
  await expect(agentPage).toHaveURL(/\/app\/schools\?access=revoked$/);

  await adminPage.goto(`/admin/campus?school=${school.id}`);
  await adminPage.getByRole("button", { name: `${campusScenario.buildingName}操作` }).click();
  await adminPage.getByRole("menuitem", { name: "宿舍管理" }).click();
  const retireDialog = adminPage.getByRole("dialog", { name: `${campusScenario.buildingName}宿舍管理` });
  await retireDialog.getByRole("tab", { name: "删除停用" }).click();
  await retireDialog.getByRole("checkbox", { name: /201/ }).check();
  await retireDialog.getByRole("checkbox", { name: /202/ }).check();
  await retireDialog.getByRole("button", { name: "删除/停用所选宿舍" }).click();

  await expect.poll(async () => (
    await prisma.dormitory.findUnique({
      where: { buildingId_roomNo: { buildingId: building.id, roomNo: "201" } },
      select: { isActive: true },
    })
  )?.isActive).toBe(false);
  await expect.poll(() => prisma.dormitory.findUnique({
    where: { buildingId_roomNo: { buildingId: building.id, roomNo: "202" } },
  })).toBeNull();
  await expect.poll(() => prisma.sweepRecord.count({ where: { id: record.id } })).toBe(1);
  await expect.poll(() => prisma.sweepAudit.count({ where: { recordId: record.id } })).toBe(1);

  await agentContext.close();
});
