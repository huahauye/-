/**
 * Applies every SQL migration in `db/migrations` to the configured database.
 *
 * Run on the server after installing dependencies:
 *
 *     DATABASE_URL=... node scripts/apply-migrations.mjs
 *
 * Migrations are written to be idempotent, so re-running is safe; the applied
 * filenames are still recorded in `schema_migrations` for visibility.
 */
import { readdir, readFile } from "node:fs/promises";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL ?? process.env.NETLIFY_DB_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const directory = new URL("../db/migrations/", import.meta.url);
const files = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
const sql = postgres(databaseUrl, { max: 1 });

try {
  await sql.unsafe(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  for (const file of files) {
    const [applied] = await sql`SELECT filename FROM schema_migrations WHERE filename = ${file}`;
    if (applied) {
      console.log(`skip   ${file} (already applied)`);
      continue;
    }
    const contents = await readFile(new URL(file, directory), "utf8");
    await sql.unsafe(contents);
    await sql`INSERT INTO schema_migrations (filename) VALUES (${file})`;
    console.log(`apply  ${file}`);
  }
  console.log("migrations complete");
} finally {
  await sql.end();
}
