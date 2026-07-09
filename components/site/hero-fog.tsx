"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * 랜딩 히어로 배경 — Vanta FOG. "대기·공기"의 은은한 흐름을 브랜드
 * 시안(#00B8D4) 하이라이트로. 흰 바탕 유지 + 낮은 불투명도로 텍스트
 * 가독성 보존. prefers-reduced-motion 이면 렌더하지 않는다.
 */
export function HeroFog() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let effect: { destroy: () => void } | null = null;
    let mounted = true;
    import("vanta/dist/vanta.fog.min").then((m) => {
      if (!mounted || !ref.current) return;
      effect = m.default({
        el: ref.current,
        THREE,
        highlightColor: 0x00b8d4, // 브랜드 시안
        midtoneColor: 0xd9f4f9,
        lowlightColor: 0xffffff,
        baseColor: 0xffffff,
        blurFactor: 0.55,
        speed: 1.1,
        zoom: 0.8,
        mouseControls: false,
        touchControls: false,
        gyroControls: false,
      });
    });
    return () => {
      mounted = false;
      effect?.destroy();
    };
  }, []);

  // 그라데이션 마스크 — 텍스트(좌측)는 거의 흰 바탕, 우측·상단으로 갈수록 안개.
  // "벽지"가 아니라 "연출"이 되도록 농도에 방향을 준다.
  const mask =
    "linear-gradient(100deg, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.28) 42%, rgba(0,0,0,0.95) 78%)";
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 opacity-60"
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    />
  );
}
