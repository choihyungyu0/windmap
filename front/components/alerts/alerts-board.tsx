"use client";

import { useEffect, useMemo, useState } from "react";
import {
  loadChungbuk,
  measAt,
  upwindEmitters,
  windAt,
  type ChungbukSnapshot,
  type UpwindEmitter,
} from "@/lib/chungbuk";
import { AIR_LEVEL_META, pm25Level, type AirLevel } from "@/lib/air-grid";
import { cn } from "@/lib/utils";
import { SparkLine } from "@/components/charts/primitives";

/**
 * 취약시설 경보 보드 — 충북 전역 34개 대기측정소(에어코리아) 실측 대기질로
 * 지역별 경보 카드를 생성하고, 풍상(upwind) 배출원과 실측 추이를 함께 보여준다.
 * 실데이터. ⚠ 풍상 배출원은 풍향·거리 기반 근사이며 인과 입증이 아니다.
 * 측정소가 없는 사각지대는 /air(측정소 보간)와 시민 제보가 보완한다.
 */

const SEV: Record<AirLevel, number> = { good: 0, watch: 1, warn: 2, severe: 3 };
type Filter = "all" | AirLevel;

interface AdvisoryState {
  loading?: boolean;
  text?: string;
  source?: "ai" | "template";
}

interface StationAlert {
  id: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
  pm25: number;
  no2: number | null;
  level: AirLevel;
  trend: number[];
  upwind: UpwindEmitter[];
  wd: number | null;
  ws: number;
}

export function AlertsBoard() {
  const [snap, setSnap] = useState<ChungbukSnapshot | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [advisories, setAdvisories] = useState<Record<string, AdvisoryState>>({});
  const [reported, setReported] = useState<Record<string, "smell" | "ok">>({});

  useEffect(() => {
    let alive = true;
    loadChungbuk().then((s) => alive && setSnap(s));
    return () => {
      alive = false;
    };
  }, []);

  const alerts = useMemo<StationAlert[]>(() => {
    if (!snap) return [];
    const t = snap.n - 1;
    const start = Math.max(0, t - 23);
    return snap.stations
      .map((st, si) => {
        const pm25 = measAt(snap, "PM25", si, t);
        const { wd, ws } = windAt(snap, st.city, t);
        return {
          id: st.name,
          name: st.name,
          city: st.city,
          lat: st.lat,
          lon: st.lon,
          pm25: pm25 ?? -1,
          no2: measAt(snap, "NO2", si, t),
          level: pm25 != null ? pm25Level(pm25) : ("good" as AirLevel),
          trend: snap.meas.PM25[si].slice(start, t + 1).map((v) => v ?? 0),
          upwind: upwindEmitters(snap, { lat: st.lat, lon: st.lon }, "NOx", t).slice(0, 3),
          wd,
          ws,
        };
      })
      .filter((a) => a.pm25 >= 0)
      .sort((a, b) => SEV[b.level] - SEV[a.level] || b.pm25 - a.pm25);
  }, [snap]);

  const nowLabel = snap ? snap.times[snap.n - 1] : "—";

  async function sendReport(a: StationAlert, smell: boolean) {
    setReported((s) => ({ ...s, [a.id]: smell ? "smell" : "ok" }));
    try {
      await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receptorId: a.id,
          receptor: a.name,
          smell,
          reporter: "resident",
          predLevel: AIR_LEVEL_META[a.level].label,
          predConc: a.pm25,
          wd: a.wd ?? undefined,
          ws: a.ws,
        }),
      });
    } catch {
      /* 낙관적 UI */
    }
  }

  async function generateAdvisory(a: StationAlert) {
    setAdvisories((s) => ({ ...s, [a.id]: { loading: true } }));
    try {
      const res = await fetch("/api/advisory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${a.city} ${a.name} 일대`,
          type: "대기측정소 관할 지역",
          level: a.level,
          conc: a.pm25,
          etaMin: null,
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

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: alerts.length, good: 0, watch: 0, warn: 0, severe: 0 };
    for (const a of alerts) c[a.level]++;
    return c;
  }, [alerts]);

  const visible = filter === "all" ? alerts : alerts.filter((a) => a.level === filter);

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: "전체" },
    { key: "severe", label: "매우나쁨" },
    { key: "warn", label: "나쁨" },
    { key: "watch", label: "보통" },
    { key: "good", label: "좋음" },
  ];

  return (
    <div>
      {/* 시각 + 등급 필터 */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
          기준 시각 <span className="font-data">{nowLabel}</span> · 34개 측정소 실측
        </span>
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
      </div>

      {/* 경보 카드 */}
      {!snap ? (
        <p className="mt-10 rounded-lg border border-border p-8 text-center text-muted-foreground">
          실측 데이터 불러오는 중…
        </p>
      ) : visible.length === 0 ? (
        <p className="mt-10 rounded-lg border border-border p-8 text-center text-muted-foreground">
          이 등급의 측정소가 없습니다. 다른 등급을 선택해 보세요.
        </p>
      ) : (
        <ul className="mt-8 grid gap-4 md:grid-cols-2">
          {visible.map((a) => {
            const meta = AIR_LEVEL_META[a.level];
            return (
              <li key={a.id} className="rounded-xl border border-border p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold">{a.name}</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {a.city} · 대기측정소 관할 지역
                    </p>
                  </div>
                  <span
                    className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold text-white"
                    style={{ background: meta.hex }}
                  >
                    <span aria-hidden>{meta.symbol}</span>
                    {meta.label}
                  </span>
                </div>

                <dl className="tnum mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">실측 PM2.5</dt>
                    <dd className="mt-0.5 font-semibold">{a.pm25} μg/m³</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">실측 NO₂</dt>
                    <dd className="mt-0.5 font-semibold">{a.no2 ?? "—"}</dd>
                  </div>
                </dl>

                {/* 풍상 배출원 (근사) */}
                <div className="mt-4 border-t border-border pt-4">
                  <p className="text-xs text-muted-foreground">
                    풍상(upwind) 배출원 <span className="opacity-70">· 풍향·거리 근사</span>
                  </p>
                  {a.upwind.length === 0 ? (
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      현재 풍상 25km 내 활성 배출원 없음
                    </p>
                  ) : (
                    <ul className="mt-1.5 flex flex-col gap-1">
                      {a.upwind.map((e) => (
                        <li key={e.name} className="flex items-center gap-2 text-sm">
                          <span className="truncate" title={e.name}>
                            {e.name}
                          </span>
                          <span className="tnum ml-auto shrink-0 text-xs text-muted-foreground">
                            {e.distKm.toFixed(0)}km · {e.E.toFixed(1)} g/s
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* 최근 24h 실측 추이 */}
                <div className="mt-4 flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">최근 24시간 PM2.5</p>
                    <p className="tnum mt-0.5 text-xs text-muted-foreground/70">
                      최대 {Math.max(...a.trend).toFixed(0)} μg/m³
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

                {/* 맞춤 권고문 (LLM, 실패 시 템플릿) */}
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
                      onClick={() => generateAdvisory(a)}
                      className="mt-3 rounded-full border border-border px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-brand/50 hover:text-brand disabled:opacity-50"
                    >
                      {advisories[a.id]?.loading ? "생성 중…" : "지역 맞춤 권고문 생성"}
                    </button>
                  )
                )}

                {/* 원터치 체감 제보 (플라이휠) */}
                <div className="mt-4 border-t border-border pt-4">
                  {reported[a.id] ? (
                    <p className="text-xs text-brand">
                      ✓ 응답이 접수됐습니다 —{" "}
                      {reported[a.id] === "smell" ? "냄새남" : "괜찮음"}. 이 응답은 예측
                      보정 학습에 반영됩니다.
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">
                        지금 이 지역, 실제로 어떤가요? (응답이 AI를 학습시킵니다)
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
        충북 전역 34개 대기측정소(에어코리아)의 실측 PM2.5·NO₂ 기준 · {nowLabel}.
        경보 등급은 한국 대기질 기준을 서비스 4단계에 매핑했습니다. 풍상 배출원은
        시군별 실측 바람(ASOS)·거리 기반 근사이며 특정 시설을 오염 피해의 인과로
        지목하지 않습니다. 측정소가 없는 사각지대는 측정소 보간(/air)과 시민 제보로 보완합니다.
      </p>
    </div>
  );
}
