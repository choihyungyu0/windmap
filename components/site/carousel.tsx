"use client";

import useEmblaCarousel from "embla-carousel-react";
import type { EmblaOptionsType } from "embla-carousel";
import Autoplay from "embla-carousel-autoplay";
import { useCallback, useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Embla wrapper hook: tracks selection + snaps and exposes controls. */
export function useCarousel(options: EmblaOptionsType = {}, autoplay = false) {
  const reduce = useReducedMotion();
  const plugins =
    autoplay && !reduce
      ? [Autoplay({ delay: 5000, stopOnInteraction: false, stopOnMouseEnter: true })]
      : [];
  const [ref, api] = useEmblaCarousel(
    { loop: true, align: "start", ...options },
    plugins
  );
  const [selected, setSelected] = useState(0);
  const [snaps, setSnaps] = useState<number[]>([]);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setSelected(api.selectedScrollSnap());
    const onReInit = () => {
      setSnaps(api.scrollSnapList());
      onSelect();
    };
    onReInit();
    api.on("select", onSelect).on("reInit", onReInit);
    return () => {
      api.off("select", onSelect).off("reInit", onReInit);
    };
  }, [api]);

  const scrollPrev = useCallback(() => api?.scrollPrev(), [api]);
  const scrollNext = useCallback(() => api?.scrollNext(), [api]);
  const scrollTo = useCallback((i: number) => api?.scrollTo(i), [api]);

  return { ref, api, selected, snaps, scrollPrev, scrollNext, scrollTo };
}

export function CarouselArrow({
  dir,
  onClick,
  className,
}: {
  dir: "prev" | "next";
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === "prev" ? "이전" : "다음"}
      className={cn(
        "inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/80 text-foreground backdrop-blur transition-colors hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      {dir === "prev" ? (
        <ArrowLeft className="size-4" strokeWidth={1.8} />
      ) : (
        <ArrowRight className="size-4" strokeWidth={1.8} />
      )}
    </button>
  );
}

export function CarouselDots({
  count,
  selected,
  onSelect,
  className,
}: {
  count: number;
  selected: number;
  onSelect: (i: number) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)} role="tablist">
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-selected={i === selected}
          aria-label={`${i + 1}번 슬라이드로 이동`}
          onClick={() => onSelect(i)}
          className={cn(
            "h-1.5 rounded-full transition-all duration-300",
            i === selected
              ? "w-7 bg-foreground"
              : "w-1.5 bg-foreground/25 hover:bg-foreground/50"
          )}
        />
      ))}
    </div>
  );
}

/** "01 / 05" style counter. */
export function CarouselCount({
  selected,
  total,
  className,
}: {
  selected: number;
  total: number;
  className?: string;
}) {
  return (
    <span className={cn("tnum text-sm text-muted-foreground", className)}>
      <span className="text-foreground">
        {String(selected + 1).padStart(2, "0")}
      </span>{" "}
      / {String(total).padStart(2, "0")}
    </span>
  );
}
