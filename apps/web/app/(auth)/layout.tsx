import { TopNav } from "@/components/top-nav";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Login / register / password pages keep the same top bar, without the page padding. */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <>
      <TopNav user={user ? { email: user.email, role: user.role } : null} />
      {children}
    </>
  );
}
