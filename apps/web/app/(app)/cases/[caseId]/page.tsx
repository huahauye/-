import { notFound } from "next/navigation";
import { CaseWorkbench } from "@/components/case-workbench";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { requireOwnedCase } from "@/lib/ownership";

/**
 * Resolves ownership on the server so that an unknown or foreign case shows the
 * 404 page instead of letting the client workbench render against an error body.
 */
export default async function Page({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const user = await requireUser();
  try {
    await requireOwnedCase(caseId, user.id);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
  return <CaseWorkbench caseId={caseId} />;
}
