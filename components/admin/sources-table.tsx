"use client";

import { useState } from "react";
import { sourceCandidates } from "@/lib/mock";
import { cn } from "@/lib/utils";

/**
 * F-ASRC-01/02 배출원 관리 — 목록·제원·시범여부 토글 프레임.
 * 토글은 클라이언트 상태만 변경(데모). 저장·CRUD는 P7 백엔드 연동 시 config로.
 */
export function SourcesTable() {
  const [rows, setRows] = useState(
    // as const 리터럴(active: true/false)을 boolean으로 넓혀 토글 가능하게
    sourceCandidates.map((s) => ({ ...s, active: s.active as boolean }))
  );

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-control-line">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-control-line bg-control-surface/60 text-left text-xs text-control-muted">
              <th className="px-4 py-3 font-medium">배출원</th>
              <th className="px-4 py-3 font-medium">좌표</th>
              <th className="px-4 py-3 font-medium">굴뚝고</th>
              <th className="px-4 py-3 font-medium">직경</th>
              <th className="px-4 py-3 font-medium">배출온도</th>
              <th className="px-4 py-3 font-medium">유속</th>
              <th className="px-4 py-3 font-medium">시범 대상</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => (
              <tr key={s.id} className="border-b border-control-line/60 last:border-0">
                <td className="px-4 py-3.5 font-medium">{s.name}</td>
                <td className="font-data px-4 py-3.5 text-control-muted">
                  {s.lat.toFixed(2)}, {s.lon.toFixed(2)}
                </td>
                <td className="font-data px-4 py-3.5">{s.stackH} m</td>
                <td className="font-data px-4 py-3.5">{s.stackDia} m</td>
                <td className="font-data px-4 py-3.5">{s.gasTemp} ℃</td>
                <td className="font-data px-4 py-3.5">{s.gasVel} m/s</td>
                <td className="px-4 py-3.5">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={s.active}
                    aria-label={`${s.name} 시범 대상 ${s.active ? "해제" : "지정"}`}
                    onClick={() =>
                      setRows((prev) =>
                        prev.map((r, j) => (j === i ? { ...r, active: !r.active } : r))
                      )
                    }
                    className={cn(
                      "relative h-6 w-11 rounded-full border transition-colors",
                      s.active
                        ? "border-wind/60 bg-wind/30"
                        : "border-control-line bg-control-bg"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 h-[18px] w-[18px] rounded-full transition-[left,background]",
                        s.active ? "left-[22px] bg-wind" : "left-0.5 bg-control-muted"
                      )}
                    />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-control-muted">
        굴뚝 제원은 표준 가정값(오픈이슈 O-2 — 실제 제원 미공개 시 민감도 분석
        대상). 등록·수정·삭제와 토글 저장은 P7 백엔드 연동 시 활성화되며, 지금
        토글은 화면 상태만 바뀌는 데모입니다. 시범 배출원 선정 원칙: CleanSYS
        충북 등재 사업장 중 데이터 가용성이 검증된 곳부터.
      </p>
    </div>
  );
}
