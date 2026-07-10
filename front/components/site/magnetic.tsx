"use client";

import { useRef, type MouseEvent, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * Wraps a CTA so it subtly pulls toward the cursor on hover, springing back on
 * leave. Disabled under reduced motion. Render-inline so it hugs the child.
 */
export function Magnetic({
  children,
  strength = 0.35,
  className,
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);

  function onMove(e: MouseEvent<HTMLSpanElement>) {
    const el = ref.current;
    if (reduce || !el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - (r.left + r.width / 2)) * strength;
    const y = (e.clientY - (r.top + r.height / 2)) * strength;
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }
  function reset() {
    if (ref.current) ref.current.style.transform = "translate3d(0,0,0)";
  }

  return (
    <span
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={reset}
      className={className}
      style={{
        display: "inline-block",
        transition: "transform 0.3s cubic-bezier(0.16,1,0.3,1)",
        willChange: "transform",
      }}
    >
      {children}
    </span>
  );
}
