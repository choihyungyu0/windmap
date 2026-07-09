"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { brand } from "@/lib/content";
import { useUiStore } from "@/store/useStore";
import { LogoMark } from "./logo";

const EASE = [0.76, 0, 0.24, 1] as const;
const DURATION = 1600;

/**
 * Entry preloader: a 0→100 counter with a progress hairline, then the whole
 * curtain slides up to reveal the page. SSR-rendered so it covers content on
 * first paint (no flash). Hidden instantly under prefers-reduced-motion (CSS).
 */
export function Preloader() {
  const reduce = useReducedMotion();
  const pathname = usePathname();
  const skip = pathname.startsWith("/admin"); // 관리자 화면엔 연출 불필요
  const setEntered = useUiStore((s) => s.setEntered);
  const [pct, setPct] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // 세션 내 재방문이면 연출 생략 — 본질(콘텐츠) 우선
    let seen = false;
    try {
      seen = sessionStorage.getItem("windmap-preloader") === "1";
    } catch {
      /* storage 차단 환경 — 연출 1회 재생으로 폴백 */
    }
    if (reduce || skip || seen) {
      setDone(true);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setPct(Math.round(eased * 100));
      if (t < 1) raf = requestAnimationFrame(tick);
      else
        window.setTimeout(() => {
          setDone(true);
          try {
            sessionStorage.setItem("windmap-preloader", "1");
          } catch {
            /* noop */
          }
        }, 250);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduce, skip]);

  // lock native scroll while the curtain is up, restore when it lifts
  useEffect(() => {
    document.body.style.overflow = done ? "" : "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [done]);

  // signal the hero to begin its reveal as the curtain starts lifting
  useEffect(() => {
    if (done) setEntered(true);
  }, [done, setEntered]);

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          className="preloader-overlay fixed inset-0 z-[150] flex flex-col justify-between bg-background text-foreground"
          initial={{ y: 0 }}
          exit={{ y: "-100%" }}
          transition={{ duration: 1, ease: EASE }}
        >
          <div className="flex items-center justify-between px-6 py-6 lg:px-10">
            <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <LogoMark className="h-4 w-4" />
              {brand.name}
            </span>
            <span className="kicker hidden text-foreground/50 sm:block">
              {brand.tagline}
            </span>
          </div>

          <div className="flex flex-1 items-end justify-end px-6 lg:px-10">
            <motion.span
              className="display tnum leading-[0.8] text-foreground"
              style={{ fontSize: "clamp(5rem, 20vw, 16rem)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              {pct}
              <span className="text-foreground/40">%</span>
            </motion.span>
          </div>

          <div className="px-6 pb-8 lg:px-10">
            <div className="h-px w-full overflow-hidden bg-foreground/15">
              <div
                className="h-full bg-foreground"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
