"use client";
import { useEffect, useRef, useState } from "react";
import { WORKFLOW_STEPS } from "@/lib/landing-content";

/**
 * Five-step horizontal flow. The connecting line is drawn with a width
 * transition and the nodes light up in sequence once the block is in view.
 */
export function WorkflowFlow() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      const timer = setTimeout(() => setShown(true), 0);
      return () => clearTimeout(timer);
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShown(true);
        observer.disconnect();
      }
    }, { threshold: 0.2 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`lp-flow${shown ? " is-in" : ""}`}>
      <div className="lp-flow__line" aria-hidden="true"><div className="lp-flow__line-fill" /></div>
      <ol className="lp-flow__steps" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {WORKFLOW_STEPS.map((step) => (
          <li className="lp-flow__step" key={step.no}>
            <span className="lp-flow__dot" aria-hidden="true">{step.no}</span>
            <div>
              <div className="lp-flow__title">{step.title}</div>
              <p className="lp-flow__text">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
