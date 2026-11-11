"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { SHOWCASE } from "@/lib/landing-content";

/**
 * Sticky text + switching product screenshots. The left column stays pinned
 * while the right column's panels scroll past; the panel closest to the middle
 * of the viewport decides which module is highlighted and which shot is shown.
 */
export function Showcase() {
  const [active, setActive] = useState(0);
  const panelRefs = useRef<Array<HTMLDivElement | null>>([]);
  const navRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const panels = panelRefs.current.filter((panel): panel is HTMLDivElement => Boolean(panel));
    if (panels.length === 0) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const index = panels.indexOf(visible.target as HTMLDivElement);
      if (index >= 0) setActive(index);
    }, { rootMargin: "-35% 0px -35% 0px", threshold: [0.1, 0.4, 0.75] });
    for (const panel of panels) observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  const jump = useCallback((index: number) => {
    setActive(index);
    panelRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  return (
    <div className="lp-showcase">
      <div className="lp-showcase__nav">
        {SHOWCASE.map((module, index) => (
          <button
            key={module.id}
            ref={(node) => { navRefs.current[index] = node; }}
            className={`lp-showcase__item${index === active ? " is-active" : ""}`}
            onClick={() => jump(index)}
            aria-current={index === active}
          >
            <span className="lp-showcase__no">{module.no}</span>
            <h3>{module.title}</h3>
            <p>{index === active ? module.lead : module.text}</p>
          </button>
        ))}
      </div>

      <div className="lp-showcase__panels">
        {SHOWCASE.map((module, index) => (
          <div
            key={module.id}
            ref={(node) => { panelRefs.current[index] = node; }}
            className={`lp-showcase__panel${index === active ? " is-active" : ""}`}
            id={`showcase-${module.id}`}
          >
            <figure className="lp-media" style={{ margin: 0 }}>
              {/* Real product screenshots captured from the running app. */}
              <img src={module.image} alt={module.alt} loading="lazy" />
            </figure>
            <div style={{ marginTop: 14 }}>
              <strong style={{ fontSize: 15 }}>{module.lead}</strong>
              {module.points && (
                <ul className="lp-points" style={{ marginTop: 10 }}>
                  {module.points.map((point) => <li key={point}>{point}</li>)}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
