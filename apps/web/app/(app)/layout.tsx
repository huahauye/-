import { redirect } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Workbench chrome: these pages are only reachable with a session. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/login");
  }
  return (
    <>
      <TopNav user={{ email: user.email, role: user.role }} />
      <main className="shell page">{children}</main>
    </>
  );
}
