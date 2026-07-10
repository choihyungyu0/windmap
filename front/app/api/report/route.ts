import { NextRequest, NextResponse } from "next/server";
import { reportStats, saveReport, type CitizenReport } from "@/lib/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 시민 체감 제보 (플라이휠) — 경보 주민의 원터치 응답.
 * POST: 제보 저장. GET: 집계 통계 (관리자·현황용).
 */

interface Body {
  receptorId?: string;
  receptor?: string;
  smell?: boolean;
  reporter?: string;
  predLevel?: string;
  predConc?: number;
  wd?: number;
  ws?: number;
}

export async function POST(req: NextRequest) {
  let b: Body;
  try {
    b = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  }
  if (typeof b.smell !== "boolean" || typeof b.receptorId !== "string" || b.receptorId.length > 63) {
    return NextResponse.json({ ok: false, error: "receptorId·smell 필요" }, { status: 400 });
  }

  const report: CitizenReport = {
    receptorId: b.receptorId,
    receptor: typeof b.receptor === "string" ? b.receptor.slice(0, 60) : b.receptorId,
    smell: b.smell,
    reporter: b.reporter === "facility" ? "facility" : "resident",
    predLevel: typeof b.predLevel === "string" ? b.predLevel : undefined,
    predConc: typeof b.predConc === "number" ? b.predConc : undefined,
    wd: typeof b.wd === "number" ? b.wd : undefined,
    ws: typeof b.ws === "number" ? b.ws : undefined,
    ts: new Date().toISOString(),
  };

  try {
    await saveReport(report);
  } catch (e) {
    console.warn("제보 저장 실패", e);
    return NextResponse.json({ ok: false, error: "저장 실패" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, stats: await reportStats() });
}
