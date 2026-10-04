import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient() {
  const configuredPoolSize = Number.parseInt(process.env.DATABASE_POOL_SIZE ?? "", 10);
  const configuredPoolMaxUses = Number.parseInt(process.env.DATABASE_POOL_MAX_USES ?? "", 10);
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    ...(Number.isSafeInteger(configuredPoolSize) && configuredPoolSize > 0
      ? { max: configuredPoolSize }
      : {}),
    ...(Number.isSafeInteger(configuredPoolMaxUses) && configuredPoolMaxUses > 0
      ? { maxUses: configuredPoolMaxUses }
      : {}),
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
