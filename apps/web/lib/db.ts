import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@oa/domain/db";
import { databaseUrl } from "./config";

const globalDb = globalThis as unknown as { sqlClient?: ReturnType<typeof postgres> };
const sqlClient = globalDb.sqlClient ?? postgres(databaseUrl(), { prepare: false, max: process.env.NODE_ENV === "production" ? 5 : 1 });
if (process.env.NODE_ENV !== "production") globalDb.sqlClient = sqlClient;

export const db = drizzle(sqlClient, { schema });
export { sqlClient };
