"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LayoutDashboard, LogOut, Settings, ShieldCheck, FolderOpen, User } from "lucide-react";

export interface NavUser { email: string; role: "USER" | "ADMIN"; }

/**
 * Top navigation shared by every page.
 *
 * Only real destinations are listed — there is one core capability (OA response)
 * plus case management, so no placeholder entries are invented. The brand shows
 * the product mark and name; the account area collapses into a menu once signed in.
 */
export function TopNav({ user }: { user: NavUser | null }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const isCases = pathname === "/cases" || pathname.startsWith("/cases/") || pathname.startsWith("/runs/");
  const items = [
    { href: "/", label: "工作台", active: pathname === "/" && Boolean(user) },
    { href: "/cases", label: "案件", active: isCases },
    ...(user?.role === "ADMIN" ? [{ href: "/admin", label: "管理", active: pathname.startsWith("/admin") }] : [])
  ];

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    setOpen(false);
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="topbar">
      <div className="shell topbar-inner">
        <Link href={user ? "/" : "/login"} className="brand">
          <span className="brand-mark">集</span>
          <span className="brand-text">
            <span className="brand-name">集智</span>
            <span className="brand-sub">审通答复工作台</span>
          </span>
        </Link>

        <nav className="nav">
          {items.map((item) => (
            <Link key={item.href} href={item.href} className={`nav-link${item.active ? " active" : ""}`}>{item.label}</Link>
          ))}
        </nav>

        <div className="nav-actions">
          {user ? (
            <div className="user-wrap" ref={wrap}>
              <button className="user-button" onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open}>
                <span className="avatar"><User size={14} /></span>
                <span className="user-email">{user.email}</span>
                <ChevronDown size={14} color="#9ca3af" />
              </button>
              {open && (
                <div className="menu" role="menu">
                  <div className="menu-head"><strong>{user.email}</strong><span>{user.role === "ADMIN" ? "管理员" : "普通用户"}</span></div>
                  <Link className="menu-item" href="/" onClick={() => setOpen(false)}><LayoutDashboard size={14} />工作台</Link>
                  <Link className="menu-item" href="/account" onClick={() => setOpen(false)}><Settings size={14} />账户与安全</Link>
                  {user.role === "ADMIN" && <Link className="menu-item" href="/admin" onClick={() => setOpen(false)}><ShieldCheck size={14} />系统管理</Link>}
                  <button className="menu-item" onClick={signOut}><LogOut size={14} />退出登录</button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link className="button ghost" href="/login"><FolderOpen size={15} />登录</Link>
              <Link className="button" href="/register">注册</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
