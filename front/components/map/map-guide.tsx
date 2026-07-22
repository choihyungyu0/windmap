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
    title: "충북 전역 실배출을 봅니다",
    body: "왼쪽에서 물질(NO₂·SO₂·HCl·PM10·PM2.5)과 시군을 고르면, 충북 59개 굴뚝의 실시간 배출량(CleanSYS TMS)과 시군별 실측 바람(ASOS)으로 확산 근사가 다시 그려집니다. 정해진 답이 아니라 실측 데이터가 지도를 만듭니다.",
  },
  {
    title: "시간을 돌려보세요",
    body: "시각 슬라이더로 7/10~7/16의 실측 시계열(1시간 간격)을 앞뒤로 넘기고, 재생 버튼으로 배출·바람의 변화를 애니메이션할 수 있습니다. 굴뚝 마커에 커서를 올리면 실제 사업장명과 그 시각 배출량(g/s)이 표시됩니다.",
  },
  {
    title: "색은 상대 강도입니다 (근사)",
    body: "확산 색은 절대 농도(μg/m³)가 아니라 풍향·풍속·배출량 기반의 상대 영향 강도 근사입니다 — 검증된 물리 모델이 아닙니다. 초록 테두리 점은 대기측정소의 실측 농도색입니다. 배출 영향 범위 추정이며 특정 시설을 오염 피해의 인과로 지목하지 않습니다.",
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
