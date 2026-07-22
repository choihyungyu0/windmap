"use client";

import { useEffect, useMemo, useState } from "react";
import {
  loadChungbuk,
  windAt,
  type ChungbukSnapshot,
  type EmisKey,
} from "@/lib/chungbuk";
import { ChartLegend, LineChart } from "@/components/charts/primitives";

// 시설별 라인 색 (관제 다크 배경 위 구분되는 팔레트)
const TREND_COLORS = ["#22d3ee", "#f59e0b", "#f87171", "#a78bfa", "#34d399"];
const EMIS: { key: EmisKey; label: string }[] = [
  { key: "NOx", label: "NOx" },
  { key: "SOx", label: "SOx" },
  { key: "HCl", label: "HCl" },
  { key: "TSP", label: "TSP(먼지)" },
];

/**
 * ADM-LOG 배출 이력 — 충북 전역 실배출 시계열(CleanSYS TMS)을 물질·시설별로
 * 조회하고 CSV 로 내보낸다. 실데이터(backend/data).
 */
export function HistoryBoard() {
  const [snap, setSnap] = useState<ChungbukSnapshot | null>(null);
  const [pol, setPol] = useState<EmisKey>("NOx");
  const [facility, setFacility] = useState<string>(""); // "" = 자동(최다 배출)

  useEffect(() => {
    let alive = true;
    loadChungbuk().then((s) => alive && setSnap(s));
    return () => {
      alive = false;
    };
  }, []);

  // 물질별 총배출 내림차순 시설
  const emitters = useMemo(() => {
    if (!snap) return [];
    return snap.facilities
      .map((f, fi) => ({
        fi,
        name: f.name,
        city: f.city,
        total: snap.emis[pol][fi].reduce((a, b) => a + (b || 0), 0),
      }))
      .filter((e) => e.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [snap, pol]);

  // 상위 5개 시설 배출 추이 라인
  const series = useMemo(() => {
    if (!snap) return [];
    return emitters.slice(0, 5).map((e, i) => ({
      name: e.name.length > 12 ? e.name.slice(0, 11) + "…" : e.name,
      color: TREND_COLORS[i % TREND_COLORS.length],
      data: snap.emis[pol][e.fi],
    }));
  }, [snap, emitters, pol]);

  // 테이블: 선택 시설(기본=최다 배출)의 시계열 (최신순)
  const selected =
    emitters.find((e) => e.name === facility) ?? emitters[0] ?? null;
  const rows = useMemo(() => {
    if (!snap || !selected) return [];
    const out: { ts: string; E: number; wd: number | null; ws: number }[] = [];
    for (let ti = snap.n - 1; ti >= 0; ti--) {
      const { wd, ws } = windAt(snap, selected.city, ti);
      out.push({ ts: snap.times[ti], E: snap.emis[pol][selected.fi][ti] ?? 0, wd, ws });
    }
    return out;
  }, [snap, selected, pol]);

  function exportCsv() {
    if (!snap) return;
    const header = "시각,시설,시군,물질,배출량(g/s)";
    const lines: string[] = [];
    snap.facilities.forEach((f, fi) => {
      snap.emis[pol][fi].forEach((v, ti) => {
        if (v && v > 0) lines.push(`${snap.times[ti]},${f.name},${f.city},${pol},${v}`);
      });
    });
    const blob = new Blob(["﻿" + header + "\n" + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `windmap_배출이력_${pol}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const n = snap?.n ?? 0;

  return (
    <div>
      {/* 필터 + 내보내기 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-md border border-control-line p-1">
          {EMIS.map((e) => (
            <button
              key={e.key}
              type="button"
              onClick={() => {
                setPol(e.key);
                setFacility("");
              }}
              aria-pressed={pol === e.key}
              className={
                "rounded px-2.5 py-1 text-xs font-medium transition-colors " +
                (pol === e.key
                  ? "bg-wind/20 text-control-text"
                  : "text-control-muted hover:text-control-text")
              }
            >
              {e.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-control-muted">
          시설
          <select
            value={selected?.name ?? ""}
            onChange={(e) => setFacility(e.target.value)}
            className="max-w-[16rem] rounded-md border border-control-line bg-control-bg px-3 py-1.5 text-sm text-control-text"
          >
            {emitters.map((e) => (
              <option key={e.fi} value={e.name}>
                {e.name} ({e.city})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={exportCsv}
          disabled={!snap}
          className="ml-auto rounded-full border border-control-line px-4 py-1.5 text-sm font-medium text-control-text transition-colors hover:border-wind/60 disabled:opacity-40"
        >
          CSV 내보내기
        </button>
      </div>

      {/* 상위 배출 시설 추이 라인 차트 */}
      <div className="mt-4 rounded-lg border border-control-line bg-control-surface/60 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="kicker text-control-muted">
            상위 배출 시설 추이 · {pol}{" "}
            <span className="font-data normal-case text-control-muted">g/s</span>
          </h2>
          <ChartLegend items={series.map((s) => ({ label: s.name, color: s.color }))} />
        </div>
        <div className="mt-4">
          {n > 0 && (
            <LineChart
              series={series}
              height={190}
              xLabels={[
                [0, snap!.times[0]],
                [Math.floor(n / 2), snap!.times[Math.floor(n / 2)]],
                [n - 1, snap!.times[n - 1]],
              ]}
            />
          )}
        </div>
      </div>

      {/* 이력 테이블 (선택 시설) */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-control-line">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-control-line bg-control-surface/60 text-left text-xs text-control-muted">
              <th className="px-4 py-3 font-medium">시각</th>
              <th className="px-4 py-3 font-medium">배출량 (g/s)</th>
              <th className="px-4 py-3 font-medium">풍향</th>
              <th className="px-4 py-3 font-medium">풍속</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 60).map((r, i) => (
              <tr key={i} className="border-b border-control-line/60 last:border-0">
                <td className="font-data px-4 py-2.5 text-control-muted">{r.ts}</td>
                <td className="font-data px-4 py-2.5">{r.E.toFixed(2)}</td>
                <td className="font-data px-4 py-2.5 text-control-muted">
                  {r.wd == null ? "—" : `${r.wd}°`}
                </td>
                <td className="font-data px-4 py-2.5 text-control-muted">
                  {r.ws.toFixed(1)}
                </td>
              </tr>
            ))}
            {!snap && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-control-muted">
                  실데이터 불러오는 중…
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {rows.length > 60 && (
          <p className="border-t border-control-line px-4 py-2.5 text-xs text-control-muted">
            최근 60건 표시 — 전체는 CSV로 내보내세요.
          </p>
        )}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-control-muted">
        노출 이력 아카이브(사업계획서 Ⅷ) — CleanSYS TMS 실배출 농도를 30분 누적으로
        쌓은 시계열입니다. 배출·기상 조건과 함께 축적해 향후 건강영향조사의 기초자료가
        됩니다. 배출 영향 범위 추정이며 특정 시설을 오염 피해의 인과로 지목하지 않습니다.
      </p>
    </div>
  );
}
