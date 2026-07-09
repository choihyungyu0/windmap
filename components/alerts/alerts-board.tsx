"use client";

import { useMemo, useState } from "react";
import { concentrationAt } from "@/lib/plume";
import {
  defaultScenario,
  demoTrend,
  gradeOf,
  LEVEL_META,
  receptors,
  source,
  type AlertLevel,
} from "@/lib/mock";
import { cn } from "@/lib/utils";
import { SparkLine } from "@/components/charts/primitives";

/**
 * F-ALT-01/02 취약시설 경보 보드 — 기본 시나리오(플룸 엔진 실계산)로
 * 경보 카드를 생성하고 등급 필터를 제공한다. 도달 예상 시각은
 * 풍하거리/풍속의 근사값 — 퍼프 도달시각(P3)으로 교체 예정.
 */

const LEVEL_BADGE: Record<AlertLevel, string> = {
  good: "bg-alert-good",
  watch: "bg-alert-watch",
  warn: "bg-alert-warn",
  severe: "bg-alert-severe",
};

type Filter = "all" | AlertLevel;

interface AdvisoryState {
  loading?: boolean;
  text?: string;
  source?: "ai" | "template";
}

export function AlertsBoard() {
  const [filter, setFilter] = useState<Filter>("all");
  // F-ALT-03 — 시설별 맞춤 권고문 (LLM, 실패 시 템플릿 폴백)
  const [advisories, setAdvisories] = useState<Record<string, AdvisoryState>>({});
  // 시민 체감 제보 (플라이휠) — 제출된 시설 ID → 응답
  const [reported, setReported] = useState<Record<string, "smell" | "ok">>({});

  async function sendReport(
    a: { id: string; name: string; type: string; level: string; conc: number },
    smell: boolean
  ) {
    setReported((s) => ({ ...s, [a.id]: smell ? "smell" : "ok" }));
    try {
      await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receptorId: a.id,
          receptor: a.name,
          smell,
          // 취약시설 카드의 제보는 시설 담당자 시드 제보자로 가중
          reporter: "facility",
          predLevel: LEVEL_META[a.level as AlertLevel].label,
          predConc: Math.round(a.conc * 10) / 10,
          wd: defaultScenario.wd,
          ws: defaultScenario.u,
        }),
      });
    } catch {
      /* 낙관적 UI — 실패해도 표시는 유지 */
    }
  }

  async function generateAdvisory(a: {
    id: string;
    name: string;
    type: string;
    level: string;
    conc: number;
    etaMin: number | null;
  }) {
    setAdvisories((s) => ({ ...s, [a.id]: { loading: true } }));
    try {
      const res = await fetch("/api/advisory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: a.name,
          type: a.type,
          level: a.level,
          conc: Math.round(a.conc * 10) / 10,
          etaMin: a.etaMin,
        }),
      });
      const d = (await res.json()) as { ok: boolean; source?: "ai" | "template"; text?: string };
      setAdvisories((s) => ({
        ...s,
        [a.id]: d.ok && d.text ? { text: d.text, source: d.source } : {},
      }));
    } catch {
      setAdvisories((s) => ({ ...s, [a.id]: {} }));
    }
  }

  const alerts = useMemo(() => {
    const p = { ...defaultScenario, h: source.stackHeight };
    const bearing = ((p.wd + 180) % 360) * (Math.PI / 180);
    return receptors
      .map((r) => {
        const conc = concentrationAt(r.ex, r.ny, p);
        const downwind = r.ex * Math.sin(bearing) + r.ny * Math.cos(bearing);
        const etaMin =
          downwind > 0 ? Math.round(downwind / p.u / 60) : null;
        return { ...r, conc, level: gradeOf(conc), etaMin, trend: demoTrend(r.id, 24) };
      })
      .sort((a, b) => b.conc - a.conc);
  }, []);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: alerts.length, good: 0, watch: 0, warn: 0, severe: 0 };
    for (const a of alerts) c[a.level]++;
    return c;
  }, [alerts]);

  const visible = filter === "all" ? alerts : alerts.filter((a) => a.level === filter);

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: "전체" },
    { key: "watch", label: "주의" },
    { key: "warn", label: "경계" },
    { key: "severe", label: "심각" },
  ];

  return (
    <div>
      {/* 등급 필터 (F-ALT-02) */}
      <div role="group" aria-label="경보 등급 필터" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
              filter === f.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:border-foreground/40"
            )}
          >
            {f.label}
            <span className="tnum ml-1.5 text-xs opacity-70">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {/* 경보 카드 */}
      {visible.length === 0 ? (
        <p className="mt-10 rounded-lg border border-border p-8 text-center text-muted-foreground">
          현재 조건에서 이 등급의 경보가 없습니다. 다른 등급을 선택하거나
          확산 지도에서 조건을 바꿔보세요.
        </p>
      ) : (
        <ul className="mt-8 grid gap-4 md:grid-cols-2">
          {visible.map((a) => {
            const meta = LEVEL_META[a.level];
            return (
              <li key={a.id} className="rounded-xl border border-border p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold">{a.name}</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {a.type} · {source.name} 영향권
                    </p>
                  </div>
                  <span
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold text-white",
                      LEVEL_BADGE[a.level]
                    )}
                  >
                    <span aria-hidden>{meta.symbol}</span>
                    {meta.label}
                  </span>
                </div>

                <dl className="tnum mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">예측 도달 농도</dt>
                    <dd className="mt-0.5 font-semibold">
                      {a.conc < 0.1 ? "< 0.1" : a.conc.toFixed(1)} μg/m³
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">도달 예상</dt>
                    <dd className="mt-0.5 font-semibold">
                      {a.etaMin === null ? "영향권 밖" : `약 ${a.etaMin}분 후`}
                    </dd>
                  </div>
                </dl>

                {/* 최근 24h 추이 스파크라인 — 등급 색 연동 */}
                <div className="mt-4 flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">최근 24시간 추이</p>
                    <p className="tnum mt-0.5 text-xs text-muted-foreground/70">
                      최대 {Math.max(...a.trend).toFixed(1)} μg/m³
                    </p>
                  </div>
                  <SparkLine
                    data={a.trend}
                    color={`var(--alert-${a.level})`}
                    width={150}
                    height={36}
                  />
                </div>

                <p className="mt-4 rounded-md bg-muted px-4 py-3 text-sm leading-relaxed">
                  {meta.advice}
                </p>

                {/* F-ALT-03 맞춤 권고문 */}
                {advisories[a.id]?.text ? (
                  <div className="mt-3 rounded-md border border-brand/30 bg-brand/5 px-4 py-3">
                    <p className="text-sm leading-relaxed">{advisories[a.id].text}</p>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      {advisories[a.id].source === "ai"
                        ? "AI 생성 문안 — 발송 전 담당자 검토 필요"
                        : "표준 템플릿 문안 (AI 미연결 시 폴백)"}
                    </p>
                  </div>
                ) : (
                  a.level !== "good" && (
                    <button
                      type="button"
                      disabled={advisories[a.id]?.loading}
                      onClick={() =>
                        generateAdvisory({
                          id: a.id,
                          name: a.name,
                          type: a.type,
                          level: a.level,
                          conc: a.conc,
                          etaMin: a.etaMin,
                        })
                      }
                      className="mt-3 rounded-full border border-border px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-brand/50 hover:text-brand disabled:opacity-50"
                    >
                      {advisories[a.id]?.loading ? "생성 중…" : "시설 맞춤 권고문 생성"}
                    </button>
                  )
                )}

                {/* 원터치 체감 제보 (플라이휠) */}
                <div className="mt-4 border-t border-border pt-4">
                  {reported[a.id] ? (
                    <p className="text-xs text-brand">
                      ✓ 응답이 접수됐습니다 —{" "}
                      {reported[a.id] === "smell" ? "냄새남" : "괜찮음"}. 이 응답은
                      예측 보정 학습에 반영됩니다.
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">
                        지금 이 시설, 실제로 어떤가요? (응답이 AI를 학습시킵니다)
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => sendReport(a, true)}
                          className="flex-1 rounded-full border border-alert-warn/40 bg-alert-warn/5 px-4 py-2 text-sm font-medium text-alert-warn transition-colors hover:bg-alert-warn/10"
                        >
                          😷 냄새나요
                        </button>
                        <button
                          type="button"
                          onClick={() => sendReport(a, false)}
                          className="flex-1 rounded-full border border-alert-good/40 bg-alert-good/5 px-4 py-2 text-sm font-medium text-alert-good transition-colors hover:bg-alert-good/10"
                        >
                          🙂 괜찮아요
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
        시뮬레이션 표본(북서풍 {defaultScenario.wd}° · {defaultScenario.u} m/s ·{" "}
        {defaultScenario.q} g/s) 기준. 도달 시각은 풍하거리/풍속 근사이며, 퍼프
        모델(P3)의 정식 도달시각으로 교체됩니다. 경보 임계값은 데모 기준으로
        대기환경기준 연동 예정입니다.
      </p>
    </div>
  );
}
