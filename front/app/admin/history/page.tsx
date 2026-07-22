import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { HistoryBoard } from "@/components/admin/history-board";

export const metadata: Metadata = {
  title: "배출 이력",
  robots: { index: false, follow: false },
};

/** ADM-LOG 경보·노출 이력 (F-ALOG-01/02) */
export default function AdminHistoryPage() {
  return (
    <AdminShell>
      <h1 className="text-2xl font-bold">배출 이력</h1>
      <p className="mt-2 text-sm text-control-muted">
        시설별 실배출 시계열(CleanSYS TMS)을 조회하고 CSV로 내보냅니다.
      </p>
      <div className="mt-6">
        <HistoryBoard />
      </div>
    </AdminShell>
  );
}
