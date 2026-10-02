import { z } from "zod";

const name = z.string().trim().min(1, "代理名称不能为空").max(100);
const username = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "登录账号至少 3 个字符")
  .max(100)
  .regex(/^[a-z0-9._-]+$/, "登录账号只能包含小写字母、数字、点、下划线和短横线");

export const agentCreateSchema = z.object({ name, username }).strict();
export const agentRenameSchema = z.object({ name }).strict();
export const agentStatusSchema = z.object({ status: z.enum(["ACTIVE", "DISABLED"]) }).strict();
export const agentSchoolAccessSchema = z.object({ schoolIds: z.array(z.uuid()) }).strict();
