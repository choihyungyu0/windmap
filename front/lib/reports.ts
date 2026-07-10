import { appendFile, readFile } from "fs/promises";
import path from "path";

/**
 * 시민 체감 제보 저장 계층 (서버 전용).
 *
 * primary: backend/citizen-reports.jsonl (로컬 파일 — backend 배치가 바로 소비,
 * 오프라인 데모 무결). mirror: Supabase citizen_report (배포용, best-effort).
 * 개인정보 미수집 — 시설ID·불리언·예측 스냅샷만 저장 (윤리 XIV·NFR 보안).
 */

export interface CitizenReport {
  receptorId: string;
  receptor: string;
  smell: boolean; // true=냄새남, false=괜찮음
  reporter: "resident" | "facility";
  predLevel?: string;
  predConc?: number;
  wd?: number;
  ws?: number;
  ts: string; // ISO8601
}

// Next 는 front/ 에서 실행되므로 한 단계 위의 backend/ 를 가리킨다
const FILE = path.join(process.cwd(), "..", "backend", "citizen-reports.jsonl");

export async function saveReport(r: CitizenReport): Promise<void> {
  try {
    await appendFile(FILE, JSON.stringify(r) + "\n", "utf-8");
  } catch {
    // 배포 환경(FS 읽기전용·backend 미포함) — Supabase 미러가 primary 역할
  }

  // Supabase 미러 (배포용) — 실패해도 무시 (로컬이 primary)
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (url && key) {
    try {
      await fetch(`${url}/rest/v1/citizen_report`, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          receptor_id: r.receptorId,
          receptor: r.receptor,
          smell: r.smell,
          reporter: r.reporter,
          pred_level: r.predLevel,
          pred_conc: r.predConc,
          wd: r.wd,
          ws: r.ws,
        }),
        signal: AbortSignal.timeout(6000),
      });
    } catch {
      /* best-effort */
    }
  }
}

export interface ReportStats {
  total: number;
  smell: number;
  ok: number;
  byReceptor: Record<string, { smell: number; ok: number }>;
  /** 예측(주의 이상)과 체감(냄새남) 일치율 — 플라이휠 신뢰 지표 */
  agreement: number | null;
  facilityShare: number;
}

export async function readReports(): Promise<CitizenReport[]> {
  try {
    const raw = await readFile(FILE, "utf-8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as CitizenReport);
  } catch {
    return [];
  }
}

export async function reportStats(): Promise<ReportStats> {
  const rows = await readReports();
  const byReceptor: Record<string, { smell: number; ok: number }> = {};
  let smell = 0;
  let ok = 0;
  let matched = 0;
  let comparable = 0;
  let facility = 0;

  for (const r of rows) {
    (r.smell ? smell++ : ok++);
    if (r.reporter === "facility") facility++;
    const b = (byReceptor[r.receptor] ??= { smell: 0, ok: 0 });
    r.smell ? b.smell++ : b.ok++;
    // 예측↔체감 교차검증: 예측 '주의 이상'과 체감 '냄새남'의 일치
    if (r.predLevel) {
      comparable++;
      const predBad = r.predLevel !== "좋음" && r.predLevel !== "good";
      if (predBad === r.smell) matched++;
    }
  }

  return {
    total: rows.length,
    smell,
    ok,
    byReceptor,
    agreement: comparable ? Math.round((matched / comparable) * 100) : null,
    facilityShare: rows.length ? Math.round((facility / rows.length) * 100) : 0,
  };
}
