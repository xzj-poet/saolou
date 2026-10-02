import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/auth/me/route";
import { GET as clearExpiredSession } from "@/app/api/auth/session-expired/route";
import { hashPassword } from "@/modules/auth/password";

const origin = "http://localhost";
const username = "route-agent";
const disabledUsername = "route-disabled";

function postRequest(path: string, body: unknown, requestOrigin = origin) {
  return new Request(`${origin}${path}`, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      Origin: requestOrigin,
    },
    method: "POST",
  });
}

async function responseJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

beforeAll(async () => {
  const passwordHash = await hashPassword("route-password-123");
  await prisma.user.createMany({
    data: [
      {
        name: "路由代理",
        passwordHash,
        role: "AGENT",
        status: "ACTIVE",
        username,
      },
      {
        name: "停用代理",
        passwordHash,
        role: "AGENT",
        status: "DISABLED",
        username: disabledUsername,
      },
    ],
  });
});

afterAll(async () => {
  const users = await prisma.user.findMany({
    select: { id: true },
    where: { username: { in: [username, disabledUsername] } },
  });
  await prisma.session.deleteMany({
    where: { userId: { in: users.map((user) => user.id) } },
  });
  await prisma.user.deleteMany({
    where: { username: { in: [username, disabledUsername] } },
  });
});

describe("authentication routes", () => {
  it("logs in with a secure cookie and ignores no client identity", async () => {
    const response = await login(
      postRequest("/api/auth/login", {
        password: "route-password-123",
        username: `  ${username.toUpperCase()}  `,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(
      /^campus_sweep_session=[A-Za-z0-9_-]{43};/,
    );
    expect(await responseJson(response)).toEqual({
      user: expect.objectContaining({ role: "AGENT", username }),
    });
  });

  it("rejects validation errors and forged identity fields", async () => {
    for (const body of [
      { username },
      {
        agentId: "forged",
        password: "route-password-123",
        role: "ADMIN",
        userId: "forged",
        username,
      },
    ]) {
      const response = await login(postRequest("/api/auth/login", body));
      expect(response.status).toBe(400);
      expect(await responseJson(response)).toMatchObject({
        error: { code: "VALIDATION_ERROR" },
      });
    }
  });

  it("returns approved Chinese credential and disabled-account errors", async () => {
    const unknown = await login(
      postRequest("/api/auth/login", {
        password: "route-password-123",
        username: "unknown-user",
      }),
    );
    const wrong = await login(
      postRequest("/api/auth/login", {
        password: "wrong-password",
        username,
      }),
    );
    const disabled = await login(
      postRequest("/api/auth/login", {
        password: "route-password-123",
        username: disabledUsername,
      }),
    );

    expect([unknown.status, wrong.status]).toEqual([401, 401]);
    expect(await responseJson(unknown)).toEqual({
      error: { code: "INVALID_CREDENTIALS", message: "账号或密码错误" },
    });
    expect(await responseJson(wrong)).toEqual({
      error: { code: "INVALID_CREDENTIALS", message: "账号或密码错误" },
    });
    expect(disabled.status).toBe(403);
    expect(await responseJson(disabled)).toEqual({
      error: { code: "ACCOUNT_DISABLED", message: "账号已停用，请联系管理员" },
    });
  });

  it("returns only trusted public user fields from /me", async () => {
    const loginResponse = await login(
      postRequest("/api/auth/login", {
        password: "route-password-123",
        username,
      }),
    );
    const cookie = loginResponse.headers.get("set-cookie")?.split(";", 1)[0];
    const response = await me(
      new Request(`${origin}/api/auth/me`, {
        headers: { Cookie: cookie ?? "" },
      }),
    );

    expect(response.status).toBe(200);
    expect(Object.keys((await responseJson(response)).user as object).sort()).toEqual([
      "id",
      "name",
      "role",
      "username",
    ]);
  });

  it("revokes the session and clears its cookie on logout", async () => {
    const loginResponse = await login(
      postRequest("/api/auth/login", {
        password: "route-password-123",
        username,
      }),
    );
    const cookie = loginResponse.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
    const beforeCount = await prisma.session.count();
    const response = await logout(
      new Request(`${origin}/api/auth/logout`, {
        headers: { Cookie: cookie, Origin: origin },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(await prisma.session.count()).toBe(beforeCount - 1);
    expect(response.headers.get("set-cookie")).toMatch(
      /campus_sweep_session=;.*(?:Expires=Thu, 01 Jan 1970|Max-Age=0)/,
    );
  });

  it("clears an invalid protected-session cookie before returning to login", async () => {
    const response = await clearExpiredSession(
      new Request(`${origin}/api/auth/session-expired`),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${origin}/login`);
    expect(response.headers.get("set-cookie")).toMatch(
      /campus_sweep_session=;.*(?:Expires=Thu, 01 Jan 1970|Max-Age=0)/,
    );
  });

  it.each(["/api/auth/login", "/api/auth/logout"])(
    "rejects foreign and malformed origins on %s",
    async (path) => {
      for (const requestOrigin of ["https://evil.example.com", "not a url"]) {
        const response =
          path.endsWith("login")
            ? await login(
                postRequest(
                  path,
                  { password: "route-password-123", username },
                  requestOrigin,
                ),
              )
            : await logout(
                new Request(`${origin}${path}`, {
                  headers: { Origin: requestOrigin },
                  method: "POST",
                }),
              );
        expect(response.status).toBe(403);
        expect(await responseJson(response)).toMatchObject({
          error: { code: "ORIGIN_MISMATCH" },
        });
      }
    },
  );
});
