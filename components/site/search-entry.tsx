"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

/**
 * F-SRCH-01 지역 검색 진입 — 홈의 개인화 진입점.
 * 지오코딩(주소→좌표)은 P5에서 연결. 현재는 검색어와 무관하게 지도에 진입한다.
 */
export function SearchEntry() {
  const router = useRouter();
  const [value, setValue] = useState("");

  return (
    <form
      className="flex w-full max-w-xl overflow-hidden rounded-full border border-input bg-white shadow-sm focus-within:ring-2 focus-within:ring-brand"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(value ? `/map?q=${encodeURIComponent(value)}` : "/map");
      }}
    >
      <label className="flex flex-1 items-center gap-3 pl-5">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="sr-only">우리 동네 주소·읍면동 검색</span>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="우리 동네 주소·읍면동 입력 — 예: 청주시 청원구 북이면"
          className="w-full bg-transparent py-3.5 text-sm outline-none placeholder:text-muted-foreground/70"
        />
      </label>
      <button
        type="submit"
        className="m-1.5 shrink-0 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        확인하기
      </button>
    </form>
  );
}
