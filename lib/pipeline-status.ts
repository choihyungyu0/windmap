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
  try {
    const p = path.join(process.cwd(), "public", "data", "pipeline-status.json");
    return JSON.parse(await readFile(p, "utf-8")) as PipelineStatus;
  } catch {
    return null;
  }
}

export const MODE_LABEL: Record<PipelineStatus["mode"], string> = {
  mock: "모의 수집",
  live: "실데이터 수집",
  "live-fallback": "부분 폴백",
};
