import "dotenv/config";

import { z } from "zod";

const environmentSchema = z.object({
  ADMIN_PASSWORD: z.string().min(10),
  ADMIN_USERNAME: z.string().trim().min(1),
  DATABASE_URL: z.string().trim().min(1),
});

export class EnvironmentConfigurationError extends Error {
  constructor(fields: string[]) {
    super(`Missing or invalid environment variables: ${fields.join(", ")}`);
    this.name = "EnvironmentConfigurationError";
  }
}

export type ApplicationEnvironment = z.infer<typeof environmentSchema>;

export function parseEnv(
  source: Record<string, string | undefined>,
): ApplicationEnvironment {
  const result = environmentSchema.safeParse(source);
  if (result.success) {
    return result.data;
  }

  const fields = [
    ...new Set(result.error.issues.map((issue) => String(issue.path[0]))),
  ].sort();
  throw new EnvironmentConfigurationError(fields);
}

export const env = parseEnv(process.env);
