import "dotenv/config";

import { Client } from "pg";

const APP_ROLE = "campus_sweep_app";
const roleName = process.env.POSTGRES_APP_USER ?? APP_ROLE;
const password = process.env.POSTGRES_APP_PASSWORD;
const adminUrl = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;

if (roleName !== APP_ROLE) throw new Error(`POSTGRES_APP_USER must be ${APP_ROLE}`);
if (!password) throw new Error("POSTGRES_APP_PASSWORD is required");
if (!adminUrl) throw new Error("DATABASE_ADMIN_URL or DATABASE_URL is required");

function quoteIdentifier(value: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`Invalid PostgreSQL identifier: ${value}`);
  return `"${value}"`;
}

function quoteLiteral(value: string) { return `'${value.replaceAll("'", "''")}'`; }

const client = new Client({ connectionString: adminUrl });
try {
  await client.connect();
  const adminRole = new URL(adminUrl).username;
  const database = (await client.query<{ database: string }>("SELECT current_database() AS database")).rows[0].database;
  const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [APP_ROLE]);
  if (exists.rowCount === 0) {
    await client.query(`CREATE ROLE ${quoteIdentifier(APP_ROLE)} WITH LOGIN PASSWORD ${quoteLiteral(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`);
  } else {
    await client.query(`ALTER ROLE ${quoteIdentifier(APP_ROLE)} WITH LOGIN PASSWORD ${quoteLiteral(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`);
  }
  await client.query(`GRANT CONNECT ON DATABASE ${quoteIdentifier(database)} TO ${quoteIdentifier(APP_ROLE)}`);
  await client.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
  await client.query(`REVOKE CREATE ON SCHEMA public FROM ${quoteIdentifier(APP_ROLE)}`);
  await client.query(`GRANT USAGE ON SCHEMA public TO ${quoteIdentifier(APP_ROLE)}`);
  await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${quoteIdentifier(APP_ROLE)}`);
  await client.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${quoteIdentifier(APP_ROLE)}`);
  await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${quoteIdentifier(adminRole)} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${quoteIdentifier(APP_ROLE)}`);
  await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${quoteIdentifier(adminRole)} IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${quoteIdentifier(APP_ROLE)}`);
  console.log("Application database role provisioned.");
} finally {
  await client.end();
}
