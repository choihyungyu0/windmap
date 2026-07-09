/**
 * 시연·프레임용 데모 데이터 — 전부 시뮬레이션 표본.
 * 실데이터 파이프라인(P2, engine/collectors)이 붙으면 이 파일의 소비처가
 * public/data/ 스냅샷·API로 교체된다. 화면에는 항상 "시뮬레이션" 라벨 병기.
 *
 * 윤리 원칙(계획서 XIV): 실존 기업·시설명을 쓰지 않는다 — 배출원은
 * "시범 배출원 A", 수용지점은 유형+가나다 익명 표기.
 */

import { concentrationAt, type Stability } from "./plume";

/** 수용지점(취약시설) — 배출원 원점 기준 동/북 오프셋(m), 유형별 익명 명칭 */
export interface Receptor {
  id: string;
  name: string;
  type: "학교" | "병원" | "경로당" | "주거지";
  ex: number; // 동쪽 +m
  ny: number; // 북쪽 +m
}

// 기본 시나리오(북서풍 315° → 플룸 남동진)에서 등급이 사다리로 갈리도록 배치:
// 다(플룸 축 위·근거리)=심각, 라(축 부근·원거리)=경계, 나머지=영향권 밖.
export const receptors: Receptor[] = [
  { id: "r1", name: "초등학교 가", type: "학교", ex: 1200, ny: 900 },
  { id: "r2", name: "요양병원 나", type: "병원", ex: -950, ny: 1650 },
  { id: "r3", name: "경로당 다", type: "경로당", ex: 1300, ny: -1200 },
  { id: "r4", name: "아파트단지 라", type: "주거지", ex: 2300, ny: -2100 },
  { id: "r5", name: "마을회관 마", type: "주거지", ex: -2200, ny: -1150 },
];

export const source = {
  id: "s1",
  name: "시범 배출원 A (소각시설)",
  // 굴뚝 제원 표준 가정값 — 실제 제원 미공개 시 민감도 분석 대상 (오픈이슈 O-2)
  stackHeight: 40, // m (유효고)
  item: "NOx",
};

/** 경보 등급 — 데모 임계값(μg/m³). 대기환경기준·조례 연동은 P5(오픈이슈 #4). */
export type AlertLevel = "good" | "watch" | "warn" | "severe";

export function gradeOf(conc: number): AlertLevel {
  if (conc >= 180) return "severe";
  if (conc >= 90) return "warn";
  if (conc >= 40) return "watch";
  return "good";
}

export const LEVEL_META: Record<
  AlertLevel,
  { label: string; symbol: string; advice: string }
> = {
  good: { label: "좋음", symbol: "○", advice: "정상 활동 가능" },
  watch: { label: "주의", symbol: "◐", advice: "민감군 실외활동 조정 권고" },
  warn: { label: "경계", symbol: "◑", advice: "실외수업·산책 일정 조정, 환기 자제" },
  severe: { label: "심각", symbol: "●", advice: "실내 대피·환기 차단, 외출 자제" },
};

/** 기본 시나리오 — 지도 초기값 (북서풍, 중립 안정도) */
export const defaultScenario = {
  q: 40, // g/s
  u: 3, // m/s
  wd: 315, // 북서풍
  stability: "D" as Stability,
};

/** 시범 배출원 목록 — 관리자 화면(F-ASRC-01/02) 프레임용. CleanSYS 연동은 P2. */
export const sourceCandidates = [
  {
    id: "s1",
    name: "시범 배출원 A (소각시설)",
    lat: 36.72,
    lon: 127.49,
    stackH: 40,
    stackDia: 1.8,
    gasTemp: 160,
    gasVel: 12,
    active: true,
  },
  {
    id: "s2",
    name: "배출원 후보 B (산단 보일러)",
    lat: 36.71,
    lon: 127.53,
    stackH: 55,
    stackDia: 2.2,
    gasTemp: 180,
    gasVel: 15,
    active: false,
  },
  {
    id: "s3",
    name: "배출원 후보 C (소각시설)",
    lat: 36.74,
    lon: 127.46,
    stackH: 35,
    stackDia: 1.5,
    gasTemp: 150,
    gasVel: 10,
    active: false,
  },
] as const;

/** 현재(기본 시나리오) 수용지점별 도달 현황 — 홈 요약·경보·관제가 공유 */
export function defaultReadings() {
  const p = { ...defaultScenario, h: source.stackHeight };
  return receptors
    .map((r) => {
      const conc = concentrationAt(r.ex, r.ny, p);
      return { ...r, conc, level: gradeOf(conc) };
    })
    .sort((a, b) => b.conc - a.conc);
}

/** 경보·노출 이력 행 (F-ALOG-01) */
export interface HistoryRow {
  ts: string; // "MM-DD HH:00"
  hoursAgo: number; // 기간 필터용 (0 = 최신)
  receptor: string;
  type: Receptor["type"];
  level: AlertLevel;
  conc: number;
  wd: number;
  u: number;
}

/**
 * 데모 이력 생성 — 결정적(시드 고정, Math.random 미사용).
 * 시간별로 풍향·풍속·배출률을 규칙적으로 변화시키며 플룸 엔진으로
 * 실제 농도를 계산해, "좋음"이 아닌 시점만 경보 이력으로 남긴다.
 * P2 수집 파이프라인이 붙으면 DB(alert 테이블) 조회로 교체.
 */
export function demoHistory(hours = 72): HistoryRow[] {
  const rows: HistoryRow[] = [];
  // 고정 기준 시각 (재현성 — NFR-8): 2026-07-09 12:00 에서 과거로
  const base = new Date(2026, 6, 9, 12, 0, 0);
  for (let i = 0; i < hours; i++) {
    const wd = (290 + i * 17) % 360;
    const u = 1.5 + ((i * 7) % 8) * 0.7;
    const q = 25 + ((i * 11) % 50);
    const t = new Date(base.getTime() - i * 3600_000);
    const ts = `${String(t.getMonth() + 1).padStart(2, "0")}-${String(
      t.getDate()
    ).padStart(2, "0")} ${String(t.getHours()).padStart(2, "0")}:00`;
    for (const r of receptors) {
      const conc = concentrationAt(r.ex, r.ny, {
        q, u, wd,
        stability: "D",
        h: source.stackHeight,
      });
      const level = gradeOf(conc);
      if (level !== "good") {
        rows.push({
          ts,
          hoursAgo: i,
          receptor: r.name,
          type: r.type,
          level,
          conc: Math.round(conc * 10) / 10,
          wd,
          u: Math.round(u * 10) / 10,
        });
      }
    }
  }
  return rows;
}

/** /report 프레임용 애블레이션 예시 수치 — P6 실검증값으로 교체 (라벨 필수) */
export const ablationExample = {
  caveat: "예시 수치 — P6 검증 배치의 실측 결과로 교체 예정",
  metric: "Δ농도 RMSE (μg/m³)",
  ladder: [
    { id: "B0", name: "측정소 현재값 (국가 방식)", rmse: 18.2, mae: 6.1, r: 0, note: "예측 없음" },
    { id: "B1a", name: "가우시안 플룸 (정상상태)", rmse: 12.4, mae: 5.2, r: 0.31, note: "물리 기본 성능" },
    { id: "B1b", name: "가우시안 퍼프 (시간 전파)", rmse: 10.8, mae: 4.4, r: 0.55, note: "도달시각 산출" },
    { id: "B2", name: "퍼프 + 보정 AI (제안)", rmse: 7.1, mae: 3.2, r: 0.68, note: "AI의 순수 기여" },
  ],
};
