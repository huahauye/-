import { readFile } from "node:fs/promises";
import postgres from "postgres";

const databaseUrl = process.env.NETLIFY_DB_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("NETLIFY_DB_URL is required. Run `netlify db init` and `netlify env:pull .env.netlify` first.");

const migration = await readFile(new URL("../netlify/database/migrations/0000_initial.sql", import.meta.url), "utf8");
const sql = postgres(databaseUrl, { max: 1 });

try {
  const [{ exists }] = await sql`SELECT to_regclass('public.app_users') IS NOT NULL AS exists`;
  if (exists) {
    console.log("Netlify database schema already exists; no changes were needed.");
  } else {
    await sql.unsafe(migration);
    console.log("Netlify database schema is ready.");
  }
} finally {
  await sql.end();
}
