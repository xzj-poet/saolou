import { z } from "zod";

export const changePasswordSchema = z
  .object({
    confirmPassword: z.string().min(6, "密码至少需要 6 位").max(128, "密码不能超过 128 位"),
    newPassword: z.string().min(6, "密码至少需要 6 位").max(128, "密码不能超过 128 位"),
  })
  .strict()
  .refine(({ confirmPassword, newPassword }) => confirmPassword === newPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
  });
