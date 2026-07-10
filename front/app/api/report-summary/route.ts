import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { generateText } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 애블레이션 리포트 자연어 요약 (관리자·발표용) — LLM은 요약만 담당.
 * 근거는 engine 검증 배치가 산출한 validation-report.json 뿐이며,
 * 수치 창작·해석 과장을 시스템 프롬프트로 금지한다.
 */

const SYSTEM = `당신은 대기확산 예측 시스템의 검증 리포트 요약자입니다. 규칙:
1. 제공된 검증 데이터의 수치만 인용하세요. 새 수치·결론을 만들지 마세요.
2. 한계(합성 실험 여부, 신뢰구간 폭, 표본 규모)를 숨기지 말고 한 문장으로 정직하게 포함하세요.
3. 3~4문장, 발표에서 그대로 읽을 수 있는 존댓말 문어체.
4. 과장 금지 — "통계적으로 유의"는 데이터가 그렇게 말할 때만.`;

export async function POST() {
  let report: {
    caveat: string;
    hours: number;
    trainHours: number;
    testHours: number;
    metric: string;
    ladder: { id: string; name: string; rmse: number; r: number }[];
    improvementPct: number;
    bootstrap: { ci95: [number, number]; note: string };
    deltaMethods: { corrAB: number };
  };
  try {
    const p = path.join(process.cwd(), "public", "data", "validation-report.json");
    report = JSON.parse(await readFile(p, "utf-8"));
  } catch {
    return NextResponse.json(
      { ok: false, error: "검증 리포트가 아직 없습니다. engine 애블레이션 배치를 먼저 실행하세요." },
      { status: 404 }
    );
  }

  const b1b = report.ladder.find((s) => s.id === "B1b");
  const b2 = report.ladder.find((s) => s.id === "B2");
  const fallback =
    `${report.hours}시간 데이터(학습 ${report.trainHours}·검증 ${report.testHours}, 시간 분리) 기준, ` +
    `퍼프 물리모델(RMSE ${b1b?.rmse}) 대비 보정 모델 적용 시 RMSE ${b2?.rmse}로 ${report.improvementPct}% 개선되었습니다. ` +
    `다만 ${report.caveat.split("—")[0].trim()} 결과이며, 개선의 95% 신뢰구간은 [${report.bootstrap.ci95[0]}%, ${report.bootstrap.ci95[1]}%]로 넓어 유의성 확보에는 실데이터 표본 확대가 필요합니다.`;

  const prompt =
    `다음 애블레이션 검증 결과를 요약하세요.\n` +
    `- 성격: ${report.caveat}\n` +
    `- 데이터: 총 ${report.hours}시간 (학습 ${report.trainHours} / 검증 ${report.testHours}, 시간 분리 교차검증)\n` +
    `- 지표: ${report.metric}\n` +
    report.ladder.map((s) => `- ${s.id} ${s.name}: RMSE ${s.rmse}, R ${s.r}`).join("\n") +
    `\n- B1b→B2 개선율: ${report.improvementPct}%\n` +
    `- 개선 부트스트랩 95% CI: [${report.bootstrap.ci95[0]}%, ${report.bootstrap.ci95[1]}%] (${report.bootstrap.note})\n` +
    `- Δ농도 분리 교차확인(방법 A·B 상관): ${report.deltaMethods.corrAB}`;

  const result = await generateText(SYSTEM, prompt);
  return NextResponse.json({
    ok: true,
    source: result ? "ai" : "template",
    text: result?.text ?? fallback,
  });
}
