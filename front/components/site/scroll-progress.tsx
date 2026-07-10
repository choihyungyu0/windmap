"use client";

import { motion, useScroll, useSpring } from "framer-motion";

/** Thin top progress bar tied to page scroll (scroll-linked, reliable with Lenis). */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    mass: 0.3,
  });
  return (
    <motion.div
      aria-hidden
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[70] h-[2px] origin-left bg-foreground"
    />
  );
}
