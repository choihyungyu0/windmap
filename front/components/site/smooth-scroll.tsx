"use client";

import type { ReactNode } from "react";

/**
 * 네이티브 스크롤 — 휠/터치는 브라우저 기본(즉각 반응)으로 두고, 앵커 이동만
 * CSS scroll-behavior로 부드럽게 처리한다. (스무스 스크롤 라이브러리 제거:
 * 휠 관성이 무겁게 느껴지고 저사양/무거운 페이지에서 스크롤이 밀리던 문제 해결)
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
