"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

/** Fade + rise on scroll into view. Disabled under reduced motion. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 24,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Editorial line-mask reveal: each line (split on "\n") rises from behind a
 * clip. Used for big display headlines — the signature premium-corporate move.
 */
export function RevealLines({
  text,
  className,
  lineClassName,
  delay = 0,
  as: Tag = "span",
}: {
  text: string;
  className?: string;
  lineClassName?: string;
  delay?: number;
  /** wrapper element — pass "h2"/"h3" so titles are real headings (a11y) */
  as?: ElementType;
}) {
  const reduce = useReducedMotion();
  const lines = text.split("\n");

  if (reduce) {
    return (
      <Tag className={className}>
        {lines.map((l, i) => (
          <span key={i} className={cn("block", lineClassName)}>
            {l}
          </span>
        ))}
      </Tag>
    );
  }

  return (
    <Tag className={className}>
      {lines.map((l, i) => (
        <motion.span
          key={i}
          className={cn("block", lineClassName)}
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, delay: delay + i * 0.09, ease: EASE }}
        >
          {l}
        </motion.span>
      ))}
    </Tag>
  );
}
