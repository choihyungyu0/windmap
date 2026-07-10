"use client";

import { useEffect, useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * F-GID-01 첫 사용 안내 + F-GID-02 범례·해석 가이드.
 * 최초 방문 시 자동 표시(localStorage), 이후 헤더 "도움말"로 재열람.
 */

const SEEN_KEY = "windmap-guide-seen";

const STEPS = [
  {
    title: "바람을 직접 돌려보세요",
    body: "왼쪽 풍향 다이얼을 드래그하면 플룸(오염 기둥)이 실시간으로 방향을 바꿉니다. 풍속·배출률·대기안정도 슬라이더도 즉시 반영됩니다 — 정해진 답을 재생하는 것이 아니라, 조건이 바뀌면 지도가 다시 계산됩니다.",
  },
  {
    title: "색이 곧 농도 등급입니다",
    body: "플룸 색은 예측 도달 농도입니다. 시안(낮음) → 호박(주의 40) → 주황(경계 90) → 적색(심각 180 μg/m³). 지도 왼쪽 아래 범례와 같은 축이며, 경보 등급과 임계값을 공유합니다. 점선 원은 배출원에서 2km·4km 거리입니다.",
  },
  {
    title: "취약시설이 먼저입니다",
    body: "오른쪽 카드가 학교·병원·경로당의 도달 농도와 등급(○◐◑●)을 실시간으로 보여줍니다. 등급이 오르면 \"실외활동 조정\" 같은 행동 권고가 함께 표시됩니다 — 경보는 공포가 아니라 대응 정보입니다.",
  },
] as const;

export function MapGuide() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  // 최초 방문 자동 표시 (F-GID-01) — ?guide=0 이면 억제(데모·스크린샷용)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("guide") === "0") return;
    if (!localStorage.getItem(SEEN_KEY)) setOpen(true);
  }, []);

  function close() {
    localStorage.setItem(SEEN_KEY, "1");
    setOpen(false);
    setStep(0);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const last = step === STEPS.length - 1;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-control-line px-3 py-1 text-xs text-control-muted transition-colors hover:border-wind/60 hover:text-control-text"
      >
        <HelpCircle className="size-3.5" aria-hidden />
        도움말
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="확산 지도 사용 안내"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-control-line bg-control-surface p-7 text-control-text shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <p className="kicker text-wind">
                {step + 1} / {STEPS.length}
              </p>
              <button
                type="button"
                onClick={close}
                aria-label="안내 닫기"
                className="text-control-muted transition-colors hover:text-control-text"
              >
                <X className="size-5" />
              </button>
            </div>
            <h2 className="mt-3 text-xl font-bold">{STEPS[step].title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-control-muted">
              {STEPS[step].body}
            </p>

            <div className="mt-7 flex items-center justify-between">
              <div className="flex gap-1.5" aria-hidden>
                {STEPS.map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      i === step ? "w-5 bg-wind" : "w-1.5 bg-control-line"
                    )}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                {step > 0 && (
                  <button
                    type="button"
                    onClick={() => setStep((s) => s - 1)}
                    className="rounded-full border border-control-line px-4 py-2 text-sm text-control-muted transition-colors hover:text-control-text"
                  >
                    이전
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => (last ? close() : setStep((s) => s + 1))}
                  className="rounded-full bg-wind px-5 py-2 text-sm font-semibold text-[#04141f] transition-[filter] hover:brightness-110"
                >
                  {last ? "시작하기" : "다음"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
