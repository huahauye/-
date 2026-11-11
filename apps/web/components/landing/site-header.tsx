"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { NAV_LINKS } from "@/lib/landing-content";

/**
 * Sticky marketing header: highlights the section in view and closes the mobile
 * menu after a jump. Sections carry matching ids and `scroll-margin-top`.
 */
export function SiteHeader() {
  const [stuck, setStuck] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Smooth anchor scrolling only while the marketing page is mounted, and never
  // for people who asked for reduced motion.
  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const previous = root.style.scrollBehavior;
    if (!reduced) root.style.scrollBehavior = "smooth";
    return () => { root.style.scrollBehavior = previous; };
  }, []);

  // Scroll spy: the active section is the last one whose top has passed the
  // header. A plain scroll handler is deterministic here; an IO band was both
  // fiddly to tune and could lag behind a programmatic jump.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const offset = window.scrollY + 120;
      let current = "";
      let currentTop = -1;
      for (const link of NAV_LINKS) {
        const section = document.getElementById(link.id);
        if (!section) continue;
        // Sections are not in nav order, so the deepest one that has passed the
        // header wins rather than the last one in the list.
        if (section.offsetTop <= offset && section.offsetTop > currentTop) {
          current = link.id;
          currentTop = section.offsetTop;
        }
      }
      setActive(current);
    };
    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <header className={`lp-nav${stuck ? " is-stuck" : ""}`}>
      <div className="lp-shell lp-nav__inner">
        <Link href="/" className="lp-brand" aria-label="集智首页">
          <span className="lp-brand__mark">集</span>
          <span className="lp-brand__text">
            <span className="lp-brand__name">集智</span>
            <span className="lp-brand__sub">审查意见答复工作台</span>
          </span>
        </Link>

        <nav className={`lp-nav__links${open ? " is-open" : ""}`} aria-label="主导航">
          {NAV_LINKS.map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              className={`lp-nav__link${active === link.id ? " is-active" : ""}`}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </a>
          ))}
          {/* The ghost 登录 button is hidden on small screens, so the menu keeps it. */}
          <Link href="/login" className="lp-nav__link lp-nav__only-mobile" onClick={() => setOpen(false)}>登录</Link>
        </nav>

        <div className="lp-nav__actions">
          <Link className="lp-btn lp-btn--ghost" href="/login">登录</Link>
          <Link className="lp-btn" href="/register">立即体验</Link>
          <button className="lp-nav__toggle" onClick={() => setOpen((value) => !value)} aria-label={open ? "关闭菜单" : "打开菜单"} aria-expanded={open}>
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>
    </header>
  );
}
