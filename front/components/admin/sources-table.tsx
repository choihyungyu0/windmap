"use client";

import { useEffect, useMemo, useState } from "react";
import { loadChungbuk, type ChungbukSnapshot } from "@/lib/chungbuk";

/**
 * ADM-SRC 배출원 관리 — 충북 전역 배출 굴뚝 실좌표·소속시군·배출물질 목록.
 * 실데이터(backend/data). 시군 필터 제공. CRUD·live 편집은 P7 백엔드 연동 시.
 */
export function SourcesTable() {
  const [snap, setSnap] = useState<ChungbukSnapshot | null>(null);
  const [city, setCity] = useState<string>("all");

  useEffect(() => {
    let alive = true;
    loadChungbuk().then((s) => alive && setSnap(s));
    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo(() => {
    if (!snap) return [];
    return snap.facilities
      .filter((f) => city === "all" || f.city === city)
      .slice()
      .sort((a, b) => a.city.localeCompare(b.city, "ko"));
  }, [snap, city]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-control-muted">
          시군
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="rounded-md border border-control-line bg-control-bg px-3 py-1.5 text-sm text-control-text"
          >
            <option value="all">전체</option>
            {(snap?.cities ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <span className="font-data text-sm text-control-muted">{rows.length}개소</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-control-line">
        <table className="w-full min-w-[42rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-control-line bg-control-surface/60 text-left text-xs text-control-muted">
              <th className="px-4 py-3 font-medium">배출원</th>
              <th className="px-4 py-3 font-medium">시군</th>
              <th className="px-4 py-3 font-medium">좌표 (위도, 경도)</th>
              <th className="px-4 py-3 font-medium">배출 물질</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.name} className="border-b border-control-line/60 last:border-0">
                <td className="px-4 py-3.5 font-medium">{f.name}</td>
                <td className="px-4 py-3.5 text-control-muted">{f.city}</td>
                <td className="font-data px-4 py-3.5 text-control-muted">
                  {f.lat.toFixed(4)}, {f.lon.toFixed(4)}
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex flex-wrap gap-1">
                    {f.pols.map((p) => (
                      <span
                        key={p}
                        className="rounded border border-control-line px-1.5 py-0.5 text-[11px] text-control-muted"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {snap && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-control-muted">
                  해당 시군에 등재 굴뚝이 없습니다.
                </td>
              </tr>
            )}
            {!snap && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-control-muted">
                  실데이터 불러오는 중…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-control-muted">
        좌표는 사업장 주소 지오코딩(VWorld) 실좌표. 배출 물질은 CleanSYS TMS 등재
        측정 항목(NOx·SOx·HCl·TSP)입니다. 굴뚝 제원(고·직경·유속)은 미공개로 확산
        계산 시 표준 가정값을 쓰며, 등록·수정·삭제는 P7 백엔드 연동 시 활성화됩니다.
        배출 영향 범위 추정이며 특정 시설을 오염 피해의 인과로 지목하지 않습니다.
      </p>
    </div>
  );
}
