"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useUiStore } from "@/store/useStore";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * 마커 페인트 — 페이지가 드러난 뒤(delay초 후) 잉크 박스가 왼→오로
 * 단어를 쓸고 지나가며 흰 글자로 반전시킨다. (홈 "창업" · 문의 "아이디어")
 * prefers-reduced-motion 에서는 처음부터 칠해진 상태로 표시.
 */
export function PaintWord({
  children,
  delay = 1.5,
  tone = "ink",
}: {
  children: string;
  delay?: number;
  /** ink: 잉크 스탬프(기본) · brand: 브랜드 블루 · gradient: CTA와 같은 블루 그라데이션 */
  tone?: "ink" | "brand" | "gradient";
}) {
  const reduce = useReducedMotion();
  const entered = useUiStore((s) => s.entered);
  const painted = reduce || entered;

  return (
    <span className="relative -mx-[0.06em] inline-block px-[0.06em]">
      {children}
      <motion.span
        aria-hidden
        // 박스를 줄 안쪽으로 0.02em 수축 — 타이트한 행간(1.05)에서도 윗줄/아랫줄
        // 박스가 겹치지 않고 얇은 슬릿이 남는다. 글자는 아래에서 원위치로 보정.
        className={`absolute inset-x-0 inset-y-[0.02em] overflow-hidden px-[0.06em] text-white ${
          tone === "gradient"
            ? "bg-gradient-to-br from-brand to-[#3b82f6]"
            : tone === "brand"
              ? "bg-brand"
              : "bg-ink"
        }`}
        initial={
          reduce
            ? { clipPath: "inset(0 0% 0 0)" }
            : { clipPath: "inset(0 100% 0 0)" }
        }
        animate={painted ? { clipPath: "inset(0 0% 0 0)" } : undefined}
        transition={
          reduce ? { duration: 0 } : { duration: 0.9, delay, ease: EASE }
        }
      >
        {/* 박스 수축분(0.02em)만큼 글자를 올려 원문과 픽셀 정렬 */}
        <span className="block -translate-y-[0.02em]">{children}</span>
      </motion.span>
    </span>
  );
}
