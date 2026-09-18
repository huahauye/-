import { desc } from "drizzle-orm";
import { runs } from "@oa/domain/db";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/errors";

export async function GET(){try{await requireAdmin();return Response.json({runs:await db.select().from(runs).orderBy(desc(runs.createdAt)).limit(100)})}catch(error){return errorResponse(error)}}
