import "dotenv/config";

import { randomUUID } from "node:crypto";
import { Client } from "pg";

const runtimeUrl = process.env.DATABASE_URL;
if (!runtimeUrl) throw new Error("DATABASE_URL is required");

const client = new Client({ connectionString: runtimeUrl });
try {
  await client.connect();
  const identity = await client.query<{ current_user: string }>("SELECT current_user");
  if (identity.rows[0].current_user !== "campus_sweep_app") throw new Error("DATABASE_URL does not use campus_sweep_app");

  const id = randomUUID();
  await client.query("BEGIN");
  await client.query("INSERT INTO quick_notes (id, status, content, updated_at) VALUES ($1, 'PENDING', $2, now())", [id, "role verification"]);
  const selected = await client.query<{ content: string }>("SELECT content FROM quick_notes WHERE id = $1", [id]);
  if (selected.rows[0]?.content !== "role verification") throw new Error("Runtime SELECT/INSERT verification failed");
  await client.query("UPDATE quick_notes SET content = $2, updated_at = now() WHERE id = $1", [id, "role verification updated"]);
  await client.query("DELETE FROM quick_notes WHERE id = $1", [id]);
  await client.query("ROLLBACK");

  let denied = false;
  try {
    await client.query("CREATE TABLE public.__app_role_forbidden_probe (id integer)");
    await client.query("DROP TABLE public.__app_role_forbidden_probe");
  } catch (error) {
    denied = (error as { code?: string }).code === "42501";
  }
  if (!denied) throw new Error("Runtime role unexpectedly has schema creation permission");
  console.log("Application database role verified.");
} finally {
  await client.end();
}
