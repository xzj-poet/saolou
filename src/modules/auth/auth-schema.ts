import { z } from "zod";

export const loginSchema = z
  .object({
    password: z.string().min(1).max(128),
    username: z.string().trim().min(1).max(100),
  })
  .strict();
