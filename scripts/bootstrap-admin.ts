import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { ensureAdmin } from "@/modules/auth/bootstrap-admin";

try {
  const result = await ensureAdmin({
    name: "系统管理员",
    password: env.ADMIN_PASSWORD,
    username: env.ADMIN_USERNAME,
  });

  console.log(
    result.created ? "Administrator created." : "Administrator already exists.",
  );
} finally {
  await prisma.$disconnect();
}
