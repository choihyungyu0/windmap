import { NextRequest, NextResponse } from "next/server";
import { generateText } from "@/lib/llm";
import { LEVEL_META, type AlertLevel } from "@/lib/mock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 동네 검색 해설 (F-SRCH-02 확장) — LLM은 '전달 계층'.
 * 확산 예측·위험 판정은 클라이언트의 물리 엔진이 이미 계산했고,
 * 이 API는 그 결과 데이터만 받아 자연어로 풀어낸다.
 * 시스템 프롬프트로 수치 창작·판단 개입·기업 지목을 금지(윤리 XIV).
 */

const LEVELS: AlertLevel[] = ["good", "watch", "warn", "severe"];

const SYSTEM = `당신은 대기질 예측 서비스의 지역 해설 작성자입니다. 규칙:
1. 아래 제공된 데이터만 사용해 2~3문장으로 설명. 제공되지 않은 수치·사실을 만들어내지 말 것.
2. 위험 등급 판정을 바꾸거나 재해석하지 말 것 — 등급은 이미 물리 모델이 계산한 값.
3. 특정 기업·시설을 오염의 원인으로 지목하지 말 것. 배출원은 "시범 배출원"으로만 지칭.
4. 불안을 조장하지 말고, 등급이 나쁠 때는 실행 가능한 행동을 한 가지 덧붙일 것.
5. 존댓말, 주민에게 말하듯 쉽게. "시뮬레이션 기준"임을 자연스럽게 포함할 것.`;

interface ExplainBody {
  emd?: string;
  gu?: string;
  level?: string;
  distanceKm?: number;
  direction?: string; // 배출원 기준 8방위 (예: "북동쪽")
  downwind?: boolean; // 현재 바람 기준 풍하측 여부
  wd?: number;
  ws?: number;
}

function templateText(b: ExplainBody, level: AlertLevel): string {
  const pos = `${b.emd}은(는) 시범 배출원에서 ${b.direction} 약 ${b.distanceKm}km에 있습니다.`;
  const windRel = b.downwind
    ? "현재 바람 방향 기준 영향권(풍하측)에 해당하며"
    : "현재 바람 방향 기준 영향권 밖(풍상측)이며";
  return `${pos} ${windRel}, 시뮬레이션 기준 위험도는 '${LEVEL_META[level].label}'입니다.`;
}

export async function POST(req: NextRequest) {
  let body: ExplainBody;
  try {
    body = (await req.json()) as ExplainBody;
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  }

  const level = LEVELS.includes(body.level as AlertLevel)
    ? (body.level as AlertLevel)
    : null;
  if (!level || typeof body.emd !== "string" || typeof body.distanceKm !== "number") {
    return NextResponse.json(
      { ok: false, error: "emd·level·distanceKm 필요" },
      { status: 400 }
    );
  }

  const fallback = templateText(body, level);

  const prompt =
    `다음 데이터로 "${body.emd}" 주민에게 지역 해설을 작성하세요.\n` +
    `- 행정구역: ${body.gu ?? ""} ${body.emd}\n` +
    `- 위치 관계(방향 주의): ${body.emd}이(가) 시범 배출원의 ${body.direction}에 위치함. 거리 약 ${body.distanceKm}km. (배출원이 ${body.emd}의 ${body.direction}에 있는 것이 아님)\n` +
    `- 현재 바람: 풍향 ${body.wd}° · 풍속 ${body.ws} m/s\n` +
    `- 현재 바람 기준 풍하측(영향권) 여부: ${body.downwind ? "예" : "아니오"}\n` +
    `- 물리 모델이 계산한 위험 등급: ${LEVEL_META[level].label}\n` +
    `- 등급별 표준 권고: ${LEVEL_META[level].advice}`;

  const result = await generateText(SYSTEM, prompt);
  if (!result) {
    return NextResponse.json({ ok: true, source: "template", text: fallback });
  }
  return NextResponse.json({ ok: true, source: "ai", text: result.text });
}
