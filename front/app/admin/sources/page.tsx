import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { SourcesTable } from "@/components/admin/sources-table";

export const metadata: Metadata = {
  title: "배출원 관리",
  robots: { index: false, follow: false },
};

/** ADM-SRC 배출원 관리 (F-ASRC-01/02) */
export default function AdminSourcesPage() {
  return (
    <AdminShell>
      <h1 className="text-2xl font-bold">배출원 관리</h1>
      <p className="mt-2 text-sm text-control-muted">
        충북 전역 배출 굴뚝의 실좌표·소속 시군·배출 물질을 조회합니다 (CleanSYS TMS 등재 사업장).
      </p>
      <div className="mt-6">
        <SourcesTable />
      </div>
    </AdminShell>
  );
}
