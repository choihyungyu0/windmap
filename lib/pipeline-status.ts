import { readFile } from "fs/promises";
import path from "path";

/**
 * engine 파이프라인 상태(public/data/pipeline-status.json) 서버 측 로더.
 * 파일이 없으면 null — 관제 대시보드가 "미가동" 배지를 띄운다.
 */

export interface PipelineStatus {
  lastRun: string;
  mode: "mock" | "live" | "live-fallback";
  cycles: number;
  collectors: Record<string, { mode: string; rows: number; message: string }>;
  issues: { collector: string; level: string; message: string }[];
  dbTotals: Record<string, number>;
  note?: string;
}

export async function readPipelineStatus(): Promise<PipelineStatus | null> {
  // 1) 로컬 파일 (개발 — engine 이 직접 씀)
  try {
    const p = path.join(process.cwd(), "public", "data", "pipeline-status.json");
    return JSON.parse(await readFile(p, "utf-8")) as PipelineStatus;
  } catch {
    // 2) Supabase 사본 (배포 — engine 이 REST 로 동기화)
    return readFromSupabase();
  }
}

async function readFromSupabase(): Promise<PipelineStatus | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(
      `${url}/rest/v1/pipeline_status?id=eq.1&select=payload`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as { payload: PipelineStatus }[];
    return rows[0]?.payload ?? null;
  } catch {
    return null;
  }
}

export const MODE_LABEL: Record<PipelineStatus["mode"], string> = {
  mock: "모의 수집",
  live: "실데이터 수집",
  "live-fallback": "부분 폴백",
};
