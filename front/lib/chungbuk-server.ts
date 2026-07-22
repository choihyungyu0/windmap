import "server-only";
import { readFile } from "fs/promises";
import path from "path";
import type { ChungbukSnapshot } from "./chungbuk";

/**
 * 충북 스냅샷 서버 로더 — 서버 컴포넌트(관제·홈)가 fs 로 직접 읽는다.
 * (클라이언트 컴포넌트는 lib/chungbuk 의 loadChungbuk() 로 fetch.)
 *
 * Next 는 front/ 에서 실행되므로 public/data/chungbuk.json 을 cwd 기준으로 읽는다.
 * build_snapshot.py 미실행 등으로 파일이 없으면 null (호출부가 폴백 처리).
 */
let cache: ChungbukSnapshot | null = null;

export async function readSnapshotServer(): Promise<ChungbukSnapshot | null> {
  if (cache) return cache;
  try {
    const file = path.join(process.cwd(), "public", "data", "chungbuk.json");
    cache = JSON.parse(await readFile(file, "utf-8")) as ChungbukSnapshot;
    return cache;
  } catch {
    return null;
  }
}
