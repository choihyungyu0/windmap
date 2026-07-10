import { NextRequest, NextResponse } from "next/server";
import { generateText } from "@/lib/llm";
import { LEVEL_META, type AlertLevel } from "@/lib/mock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * F-ALT-03 경보 권고문 자동생성 — LLM은 문안 생성만 담당(판단 미개입 원칙).
 * ANTHROPIC_API_KEY 미설정·호출 실패 시 표준 템플릿으로 폴백한다.
 */

const LEVELS: AlertLevel[] = ["good", "watch", "warn", "severe"];

// 윤리 원칙(계획서 XIV)을 시스템 프롬프트로 강제 — 불안 조장 금지, 행동 중심
const SYSTEM = `당신은 대기오염 경보 시스템의 권고문 작성자입니다. 규칙:
1. 두 문장 이내, 존댓말. 공포·불안을 조장하는 표현 금지.
2. 반드시 실행 가능한 행동(환기 조정, 실외활동 조정 등)을 담을 것.
3. 특정 기업·시설을 오염의 원인으로 지목하지 않을 것.
4. 시설 유형(학교/병원/경로당/주거지)에 맞는 대상(학생, 환자, 어르신, 주민)을 언급할 것.
5. 이 권고는 예측 기반 사전 정보이며 진단·판단이 아님. 수치를 새로 만들어내지 말 것.`;

interface AdvisoryBody {
  name?: string;
  type?: string;
  level?: string;
  conc?: number;
  etaMin?: number | null;
}

function templateText(level: AlertLevel, etaMin: number | null | undefined): string {
  const eta =
    typeof etaMin === "number" ? `약 ${etaMin}분 후 도달이 예상됩니다. ` : "";
  return `${LEVEL_META[level].label} 단계 — ${eta}${LEVEL_META[level].advice}.`;
}

export async function POST(req: NextRequest) {
  let body: AdvisoryBody;
  try {
    body = (await req.json()) as AdvisoryBody;
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const level = LEVELS.includes(body.level as AlertLevel)
    ? (body.level as AlertLevel)
    : null;
  if (!level || typeof body.name !== "string") {
    return NextResponse.json(
      { ok: false, error: "name·level 이 필요합니다." },
      { status: 400 }
    );
  }

  const fallback = templateText(level, body.etaMin);

  const prompt =
    `취약시설 경보 권고문을 작성하세요.\n` +
    `시설: ${body.name} (${body.type ?? "시설"})\n` +
    `경보 등급: ${LEVEL_META[level].label}\n` +
    `예측 도달 농도: ${typeof body.conc === "number" ? `${body.conc} μg/m³` : "미상"}\n` +
    `도달 예상: ${typeof body.etaMin === "number" ? `약 ${body.etaMin}분 후` : "정보 없음"}`;

  // 키 미설정·호출 실패 등 어떤 경우든 템플릿 폴백 (명세 F-ALT-03)
  const result = await generateText(SYSTEM, prompt);
  if (!result) {
    return NextResponse.json({ ok: true, source: "template", text: fallback });
  }
  return NextResponse.json({ ok: true, source: "ai", text: result.text });
}
