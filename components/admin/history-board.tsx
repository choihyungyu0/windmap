"use client";

import { useMemo, useState } from "react";
import { demoHistory, demoTrend, LEVEL_META, receptors, type AlertLevel } from "@/lib/mock";
import { cn } from "@/lib/utils";
import { ChartLegend, LineChart } from "@/components/charts/primitives";

// 시설별 라인 색 (관제 다크 배경 위 구분되는 팔레트)
const TREND_COLORS = ["#22d3ee", "#f59e0b", "#f87171", "#a78bfa", "#34d399"];

/**
 * F-ALOG-01/02 경보·노출 이력 — 시설 필터 + CSV 내보내기.
 * 이력은 결정적 데모 생성(플룸 실계산). P2 이후 DB(alert) 조회로 교체.
 */

const LEVEL_TEXT: Record<AlertLevel, string> = {
  good: "text-alert-good",
  watch: "text-alert-watch",
  warn: "text-alert-warn",
  severe: "text-alert-severe",
};

export function HistoryBoard() {
  const all = useMemo(() => demoHistory(72), []);
  const [receptor, setReceptor] = useState<string>("all");
  const [level, setLevel] = useState<"all" | AlertLevel>("all");
  const [hours, setHours] = useState(72); // 기간 필터 (F-ALOG-01)

  const rows = all.filter(
    (r) =>
      r.hoursAgo < hours &&
      (receptor === "all" || r.receptor === receptor) &&
      (level === "all" || r.level === level)
  );

  // 농도 추이 라인 (기간·시설 필터 연동 — 등급 필터와 무관한 연속 시계열)
  const trendSeries = useMemo(() => {
    const targets =
      receptor === "all" ? receptors : receptors.filter((r) => r.name === receptor);
    return targets.map((r, i) => ({
      name: r.name,
      color: TREND_COLORS[i % TREND_COLORS.length],
      data: demoTrend(r.id, hours),
    }));
  }, [receptor, hours]);

  function exportCsv() {
    const header = "시각,시설,유형,등급,농도(μg/m³),풍향(°),풍속(m/s)";
    const body = rows
      .map(
        (r) =>
          `${r.ts},${r.receptor},${r.type},${LEVEL_META[r.level].label},${r.conc},${r.wd},${r.u}`
      )
      .join("\n");
    // BOM — 한글 엑셀 호환
    const blob = new Blob(["﻿" + header + "\n" + body], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "windmap_경보이력.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* 필터 + 내보내기 */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-control-muted">
          기간
          <select
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="rounded-md border border-control-line bg-control-bg px-3 py-1.5 text-sm text-control-text"
          >
            <option value={24}>최근 24시간</option>
            <option value={48}>최근 48시간</option>
            <option value={72}>최근 72시간</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-control-muted">
          시설
          <select
            value={receptor}
            onChange={(e) => setReceptor(e.target.value)}
            className="rounded-md border border-control-line bg-control-bg px-3 py-1.5 text-sm text-control-text"
          >
            <option value="all">전체</option>
            {receptors.map((r) => (
              <option key={r.id} value={r.name}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-control-muted">
          등급
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as typeof level)}
            className="rounded-md border border-control-line bg-control-bg px-3 py-1.5 text-sm text-control-text"
          >
            <option value="all">전체</option>
            <option value="watch">주의</option>
            <option value="warn">경계</option>
            <option value="severe">심각</option>
          </select>
        </label>
        <span className="font-data text-sm text-control-muted">{rows.length}건</span>
        <button
          type="button"
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="ml-auto rounded-full border border-control-line px-4 py-1.5 text-sm font-medium text-control-text transition-colors hover:border-wind/60 disabled:opacity-40"
        >
          CSV 내보내기
        </button>
      </div>

      {/* 농도 추이 라인 차트 (기간·시설 필터 연동) */}
      <div className="mt-4 rounded-lg border border-control-line bg-control-surface/60 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="kicker text-control-muted">
            농도 추이{" "}
            <span className="font-data normal-case text-control-muted">μg/m³</span>
          </h2>
          <ChartLegend
            items={trendSeries.map((s) => ({ label: s.name, color: s.color }))}
          />
        </div>
        <div className="mt-4">
          <LineChart
            series={trendSeries}
            height={190}
            xLabels={[
              [0, `${hours}시간 전`],
              [Math.floor(hours / 2), `${Math.floor(hours / 2)}시간 전`],
              [hours - 1, "현재"],
            ]}
          />
        </div>
      </div>

      {/* 이력 테이블 */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-control-line">
        <table className="w-full min-w-[44rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-control-line bg-control-surface/60 text-left text-xs text-control-muted">
              <th className="px-4 py-3 font-medium">시각</th>
              <th className="px-4 py-3 font-medium">시설</th>
              <th className="px-4 py-3 font-medium">유형</th>
              <th className="px-4 py-3 font-medium">등급</th>
              <th className="px-4 py-3 font-medium">농도</th>
              <th className="px-4 py-3 font-medium">풍향</th>
              <th className="px-4 py-3 font-medium">풍속</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 60).map((r, i) => (
              <tr key={i} className="border-b border-control-line/60 last:border-0">
                <td className="font-data px-4 py-2.5 text-control-muted">{r.ts}</td>
                <td className="px-4 py-2.5 font-medium">{r.receptor}</td>
                <td className="px-4 py-2.5 text-control-muted">{r.type}</td>
                <td className={cn("px-4 py-2.5 font-semibold", LEVEL_TEXT[r.level])}>
                  {LEVEL_META[r.level].symbol} {LEVEL_META[r.level].label}
                </td>
                <td className="font-data px-4 py-2.5">{r.conc}</td>
                <td className="font-data px-4 py-2.5 text-control-muted">{r.wd}°</td>
                <td className="font-data px-4 py-2.5 text-control-muted">{r.u}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 60 && (
          <p className="border-t border-control-line px-4 py-2.5 text-xs text-control-muted">
            최근 60건 표시 — 전체 {rows.length}건은 CSV로 내보내세요.
          </p>
        )}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-control-muted">
        노출 이력 아카이브(사업계획서 Ⅷ) — 배출·기상 조건과 함께 시설별 노출
        추정을 시계열로 축적해, 향후 건강영향조사의 기초자료가 됩니다. 현재는
        플룸 엔진 기반 데모 생성이며 P2 수집 파이프라인 연동 시 실데이터로
        교체됩니다.
      </p>
    </div>
  );
}
