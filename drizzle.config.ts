import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./packages/domain/src/db/schema.ts",
  out: "./netlify/database/migrations",
  dbCredentials: {
    url: process.env.NETLIFY_DB_URL ?? process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/oa_agent"
  },
  strict: true,
  verbose: true
});
