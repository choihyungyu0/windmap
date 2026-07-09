"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

/**
 * F-RPT 요약 — 검증 리포트의 자연어 요약 (발표·관리자용).
 * 근거는 validation-report.json 수치뿐, LLM은 문장화만 담당.
 */
export function ReportSummary() {
  const [state, setState] = useState<{
    loading?: boolean;
    text?: string;
    source?: "ai" | "template";
    error?: string;
  }>({});

  async function generate() {
    setState({ loading: true });
    try {
      const res = await fetch("/api/report-summary", { method: "POST" });
      const d = (await res.json()) as {
        ok: boolean;
        source?: "ai" | "template";
        text?: string;
        error?: string;
      };
      setState(
        d.ok
          ? { text: d.text, source: d.source }
          : { error: d.error ?? "요약 생성에 실패했습니다." }
      );
    } catch {
      setState({ error: "네트워크 오류가 발생했습니다." });
    }
  }

  return (
    <div className="mt-8 rounded-xl border border-border p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 font-bold">
          <Sparkles className="size-4 text-brand" aria-hidden />
          발표용 자연어 요약
        </h4>
        <button
          type="button"
          onClick={generate}
          disabled={state.loading}
          className="rounded-full border border-border px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-brand/50 hover:text-brand disabled:opacity-50"
        >
          {state.loading ? "생성 중…" : state.text ? "다시 생성" : "요약 생성"}
        </button>
      </div>
      {state.text && (
        <>
          <p className="mt-4 rounded-md bg-muted px-4 py-3 text-sm leading-relaxed">
            {state.text}
          </p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {state.source === "ai"
              ? "AI 요약 — 수치는 검증 배치 산출값에 근거, 발표 전 검토 필요"
              : "표준 요약 (AI 미연결 시 폴백)"}
          </p>
        </>
      )}
      {state.error && (
        <p className="mt-4 text-sm text-muted-foreground">{state.error}</p>
      )}
    </div>
  );
}
