"use client";

import { useEffect, useState } from "react";
import { LEVEL_META, type AlertLevel } from "@/lib/mock";

/**
 * 동네 검색 해설 카드 — 검색 매칭된 행정동의 계산 결과를 LLM이 자연어로 해설.
 * 데이터(위치·풍향 관계·등급)는 전부 클라이언트 물리 엔진의 산출물이고,
 * LLM은 설명만 담당(전달 계층). 실패 시 서버가 템플릿 문안으로 폴백.
 */

export interface EmdExplainInput {
  emd: string;
  gu: string;
  level: AlertLevel;
  distanceKm: number;
  direction: string;
  downwind: boolean;
  wd: number;
  ws: number;
}

export function EmdExplain(props: EmdExplainInput) {
  const [state, setState] = useState<{
    loading: boolean;
    text?: string;
    source?: "ai" | "template";
  }>({ loading: true });

  // 동·등급이 바뀔 때만 재생성 (풍향 미세 조작마다 호출하지 않음 — 비용·안정성)
  const key = `${props.emd}|${props.level}|${props.downwind}`;
  useEffect(() => {
    let cancelled = false;
    setState({ loading: true });
    fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(props),
    })
      .then((r) => r.json())
      .then((d: { ok: boolean; source?: "ai" | "template"; text?: string }) => {
        if (cancelled) return;
        setState(
          d.ok && d.text
            ? { loading: false, text: d.text, source: d.source }
            : { loading: false }
        );
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className="mb-4 rounded-md border border-wind/30 bg-wind/5 px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold">
          {props.emd}{" "}
          <span className="font-normal text-control-muted">우리 동네 해설</span>
        </h3>
        <span className="font-data text-[10px] text-control-muted">
          {LEVEL_META[props.level].symbol} {LEVEL_META[props.level].label}
        </span>
      </div>
      {state.loading ? (
        <p className="mt-2 text-xs text-control-muted">해설 생성 중…</p>
      ) : state.text ? (
        <>
          <p className="mt-2 text-xs leading-relaxed text-control-text/90">
            {state.text}
          </p>
          <p className="mt-1.5 text-[10px] text-control-muted">
            {state.source === "ai"
              ? "AI 해설 — 판단·수치는 물리 모델 계산값에 근거"
              : "표준 해설 (AI 미연결 시 폴백)"}
          </p>
        </>
      ) : (
        <p className="mt-2 text-xs text-control-muted">해설을 불러오지 못했습니다.</p>
      )}
    </div>
  );
}
