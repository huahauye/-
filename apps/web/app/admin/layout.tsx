import { redirect } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let user;
  try {
    user = await requireAdmin();
  } catch {
    redirect("/cases");
  }
  return (
    <>
      <TopNav user={{ email: user.email, role: user.role }} />
      <main className="shell page">{children}</main>
    </>
  );
}
