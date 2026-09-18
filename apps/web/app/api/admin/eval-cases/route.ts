import { evalCases } from "@oa/domain/db";import { z } from "zod";import { requireAdmin } from "@/lib/auth";import { db } from "@/lib/db";import { errorResponse,readJson } from "@/lib/errors";
const schema=z.object({name:z.string().min(1).max(200),description:z.string().max(2000).nullable().optional()});
export async function GET(){try{await requireAdmin();return Response.json({evalCases:await db.select().from(evalCases)})}catch(error){return errorResponse(error)}}
export async function POST(request:Request){try{const admin=await requireAdmin();const input=await readJson(request,schema);const rows=await db.insert(evalCases).values({...input,createdBy:admin.id}).returning();return Response.json({evalCase:rows[0]},{status:201})}catch(error){return errorResponse(error)}}
