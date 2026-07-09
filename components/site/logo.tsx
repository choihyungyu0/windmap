import Image from "next/image";
import { brand } from "@/lib/content";
import { cn } from "@/lib/utils";

/**
 * Brand mark — 바람 흐름선(streamline) 3획. 지도 위 플룸과 같은 모티프로
 * 브랜드 일관성을 만든다. currentColor 상속 (라이트/다크 겸용).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
      strokeLinecap="round"
    >
      {/* 위 흐름선 — 끝이 말리는 바람 관례 (기상 아이콘 계열) */}
      <path
        d="M3 7.5h11.5a2.6 2.6 0 1 0-2.5-3.3"
        stroke="currentColor"
        strokeWidth="2.1"
      />
      {/* 가운데 흐름선 — 가장 길게, 주풍 */}
      <path
        d="M3 12.5h16a2.8 2.8 0 1 1-2.6 3.7"
        stroke="currentColor"
        strokeWidth="2.1"
      />
      {/* 아래 흐름선 — 짧게, 지표풍 */}
      <path d="M3 17.5h8.5" stroke="currentColor" strokeWidth="2.1" />
    </svg>
  );
}

/** 정식 로고 (라이트 배경 전용 — 남색 워드마크). 다크 화면은 LogoMark 사용. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <Image
        src="/images/logo.png"
        alt={brand.name}
        width={434}
        height={154}
        priority
        className="h-9 w-auto lg:h-10"
      />
    </span>
  );
}
