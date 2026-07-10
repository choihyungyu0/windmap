import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { generateText } from "@/lib/llm";
import { concentrationAt } from "@/lib/plume";
import { arrivalSeconds } from "@/lib/puff";
import { lngLatToOffset } from "@/lib/geo";
import {
  defaultReadings,
  defaultScenario,
  gradeOf,
  LEVEL_META,
  source,
} from "@/lib/mock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 시민 질의응답 챗봇 — RAG 방식: 서버가 물리 엔진으로 계산한 현재 상태를
 * [데이터] 블록으로 밀봉해 전달하고, LLM은 그 안에서만 답하게 강제한다.
 * 데이터 밖 질문 → "알 수 없음" + 지도 안내. 판단·수치 창작 금지.
 */

const SYSTEM = `당신은 대기오염 확산 예측 서비스 '바람의 지도'의 시민 안내 챗봇입니다. 규칙:
1. 아래 [데이터] 블록의 정보로만 답하세요. 데이터에 없는 내용은 "제공된 예측 데이터로는 알 수 없습니다"라고 정직하게 말하고, 확산 지도 화면에서 동네를 검색해보라고 안내하세요.
2. 수치·등급·도달시각을 새로 만들어내지 마세요. 등급 판정은 물리 모델이 이미 계산했습니다.
3. 의료 판단 금지 — 건강 이상 증상 문의에는 의료기관 상담을 안내하세요.
4. 특정 기업·시설을 오염의 원인으로 지목하지 마세요. 배출원은 "시범 배출원"으로만 지칭.
5. 2~4문장, 존댓말, 쉬운 말. 답변에 이 수치들이 '시뮬레이션 기준'임을 자연스럽게 포함하세요.
6. 불안 조장 금지 — 등급이 나쁘면 실행 가능한 행동(환기 조정·실외활동 조정)을 함께 안내.`;

/** 영향 행정동 목록 — 경계 정점 샘플링 (모듈 캐시: 기본 시나리오 고정) */
let emdCache: { name: string; level: string }[] | null = null;
async function affectedEmds(): Promise<{ name: string; level: string }[]> {
  if (emdCache) return emdCache;
  try {
    const p = path.join(process.cwd(), "public", "data", "cheongju_emd.geojson");
    const geo = JSON.parse(await readFile(p, "utf-8")) as {
      features: {
        properties: { emd: string; centroid: [number, number] };
        geometry: { type: string; coordinates: number[][][] | number[][][][] };
      }[];
    };
    const params = { ...defaultScenario, h: source.stackHeight };
    const out: { name: string; level: string }[] = [];
    for (const f of geo.features) {
      const [cex, cny] = lngLatToOffset(...f.properties.centroid);
      if (Math.abs(cex) > 9000 || Math.abs(cny) > 9000) continue;
      let maxC = concentrationAt(cex, cny, params);
      const polys =
        f.geometry.type === "MultiPolygon"
          ? (f.geometry.coordinates as number[][][][])
          : [f.geometry.coordinates as number[][][]];
      for (const poly of polys) {
        for (let i = 0; i < poly[0].length; i += 3) {
          const [ex, ny] = lngLatToOffset(poly[0][i][0], poly[0][i][1]);
          const c = concentrationAt(ex, ny, params);
          if (c > maxC) maxC = c;
        }
      }
      const lv = gradeOf(maxC);
      if (lv !== "good") out.push({ name: f.properties.emd, level: LEVEL_META[lv].label });
    }
    emdCache = out;
    return out;
  } catch {
    return [];
  }
}

async function buildContext(): Promise<string> {
  const readings = defaultReadings();
  const bearing = ((defaultScenario.wd + 180) % 360) * (Math.PI / 180);
  const lines = readings.map((r) => {
    const downwind = r.ex * Math.sin(bearing) + r.ny * Math.cos(bearing);
    const arr = arrivalSeconds(downwind, defaultScenario.u);
    return `- ${r.name}(${r.type}): 등급 ${LEVEL_META[r.level].label}, 예측 농도 ${r.conc < 0.1 ? "0 수준" : r.conc.toFixed(1) + " μg/m³"}${arr ? `, 도달 예상 약 ${Math.round(arr / 60)}분` : ", 현재 영향권 밖"}`;
  });
  const emds = await affectedEmds();
  return (
    `[데이터]\n` +
    `현재 시나리오(시뮬레이션): 풍향 ${defaultScenario.wd}°(북서풍) · 풍속 ${defaultScenario.u} m/s · 배출률 ${defaultScenario.q} g/s · 배출원: ${source.name}(익명 예시 좌표)\n` +
    `취약시설 예측:\n${lines.join("\n")}\n` +
    `영향권 행정동(시뮬레이션): ${emds.length ? emds.map((e) => `${e.name}(${e.level})`).join(", ") : "없음"}\n` +
    `서비스 정보: 공개 데이터(굴뚝 TMS·기상청·에어코리아·위성)로 확산을 예측. 확산 지도 화면에서 동네 검색 가능. 예측은 대응 참고용이며 역학적 인과 입증이 아님.`
  );
}

interface ChatBody {
  question?: string;
  history?: { role: "user" | "assistant"; text: string }[];
}

export async function POST(req: NextRequest) {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  }
  const q = (body.question ?? "").trim().slice(0, 500);
  if (!q) {
    return NextResponse.json({ ok: false, error: "질문이 필요합니다." }, { status: 400 });
  }

  const transcript = (body.history ?? [])
    .slice(-6)
    .map((m) => `${m.role === "user" ? "시민" : "챗봇"}: ${m.text}`)
    .join("\n");

  const prompt =
    (await buildContext()) +
    (transcript ? `\n\n[이전 대화]\n${transcript}` : "") +
    `\n\n[시민 질문]\n${q}`;

  const result = await generateText(SYSTEM, prompt);
  if (!result) {
    return NextResponse.json({
      ok: true,
      source: "template",
      text: "지금은 AI 답변을 사용할 수 없습니다. 확산 지도 화면에서 우리 동네를 검색하면 현재 예측 상태를 바로 확인하실 수 있어요.",
    });
  }
  return NextResponse.json({ ok: true, source: "ai", text: result.text });
}
