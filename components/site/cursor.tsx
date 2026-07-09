"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * Custom cursor: an instant dot + a lagging ring that grows over interactive
 * elements. Uses mix-blend-mode: difference so it stays visible on light and
 * dark backgrounds. Only on fine-pointer (mouse) devices; off for touch and
 * reduced-motion (native cursor is used instead).
 */
export function Cursor() {
  const reduce = useReducedMotion();
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (reduce) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    setOn(true);

    let mx = -100,
      my = -100,
      rx = -100,
      ry = -100,
      raf = 0;

    const onMove = (e: PointerEvent) => {
      mx = e.clientX;
      my = e.clientY;
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
      }
    };
    const loop = () => {
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      }
      raf = requestAnimationFrame(loop);
    };
    const setHover = (e: Event, v: boolean) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest("a, button, [data-cursor]")) {
        document.documentElement.classList.toggle("cursor-hover", v);
      }
    };
    const onOver = (e: Event) => setHover(e, true);
    const onOut = (e: Event) => setHover(e, false);

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.documentElement.classList.add("has-cursor");
    raf = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.documentElement.classList.remove("has-cursor", "cursor-hover");
      cancelAnimationFrame(raf);
    };
  }, [reduce]);

  if (!on) return null;
  return (
    <>
      <div ref={dotRef} className="cursor-dot" aria-hidden />
      <div ref={ringRef} className="cursor-ring" aria-hidden />
    </>
  );
}
