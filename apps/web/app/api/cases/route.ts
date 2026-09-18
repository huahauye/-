import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { cases, runs } from "@oa/domain/db";
import { createCaseSchema } from "@oa/schemas";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { errorResponse, readJson } from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const search = new URL(request.url).searchParams.get("q")?.trim();
    const owner = and(eq(cases.ownerUserId, user.id), isNull(cases.deletedAt));
    const where = search ? and(owner, or(ilike(cases.applicationNo, `%${search}%`), ilike(cases.title, `%${search}%`), ilike(cases.internalCaseNo, `%${search}%`))) : owner;
    const rows = await db.select().from(cases).where(where).orderBy(desc(cases.updatedAt));
    return Response.json({ cases: rows });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = await readJson(request, createCaseSchema);
    const rows = await db.insert(cases).values({ ownerUserId: user.id, title: input.title || null, applicationNo: input.applicationNo || null, internalCaseNo: input.internalCaseNo || null }).returning();
    return Response.json({ case: rows[0] }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
