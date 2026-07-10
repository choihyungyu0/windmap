"use client";

import { useRef } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Scroll-linked word reveal (zetta-joule style). As the block scrolls through
 * the viewport, words light up left→right — faint → full — giving a "typed in"
 * feel. It's tied to SCROLL position (not a timer), so it scrubs both ways.
 * Lines are split on "\n"; words within a line stay on one row, word order is
 * continuous across lines so the reveal flows naturally.
 */
function Word({
  children,
  range,
  progress,
}: {
  children: string;
  range: [number, number];
  progress: MotionValue<number>;
}) {
  const opacity = useTransform(progress, range, [0.16, 1]);
  return (
    <motion.span style={{ opacity }} className="mr-[0.26em] inline-block">
      {children}
    </motion.span>
  );
}

export function ScrollRevealText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.85", "end 0.5"],
  });

  const lines = text.split("\n").map((l) => l.split(" "));
  const total = lines.reduce((n, l) => n + l.length, 0);

  if (reduce) {
    return (
      <div className={className}>
        {text.split("\n").map((l, i) => (
          <span key={i} className="block">
            {l}
          </span>
        ))}
      </div>
    );
  }

  let idx = 0;
  return (
    <div ref={ref} className={className}>
      {lines.map((words, li) => (
        <span key={li} className="block">
          {words.map((w, wi) => {
            const i = idx++;
            const start = i / total;
            const end = Math.min(1, (i + 1.6) / total); // slight overlap = smoother
            return (
              <Word key={wi} range={[start, end]} progress={scrollYProgress}>
                {w}
              </Word>
            );
          })}
        </span>
      ))}
    </div>
  );
}
