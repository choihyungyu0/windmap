/**
 * 시연·프레임용 데모 데이터 — 전부 시뮬레이션 표본.
 * 실데이터 파이프라인(P2, engine/collectors)이 붙으면 이 파일의 소비처가
 * public/data/ 스냅샷·API로 교체된다. 화면에는 항상 "시뮬레이션" 라벨 병기.
 *
 * 윤리 원칙(계획서 XIV): 실존 기업·시설명을 쓰지 않는다 — 배출원은
 * "시범 배출원 A", 수용지점은 유형+가나다 익명 표기.
 */

import type { Stability } from "./plume";

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

/** /report 프레임용 애블레이션 예시 수치 — P6 실검증값으로 교체 (라벨 필수) */
export const ablationExample = {
  caveat: "예시 수치 — P6 검증 배치의 실측 결과로 교체 예정",
  metric: "Δ농도 RMSE (μg/m³)",
  ladder: [
    { id: "B0", name: "측정소 현재값 (국가 방식)", rmse: 18.2, note: "예측 없음" },
    { id: "B1a", name: "가우시안 플룸 (정상상태)", rmse: 12.4, note: "물리 기본 성능" },
    { id: "B1b", name: "가우시안 퍼프 (시간 전파)", rmse: 10.8, note: "도달시각 산출" },
    { id: "B2", name: "퍼프 + 보정 AI (제안)", rmse: 7.1, note: "AI의 순수 기여" },
  ],
};
