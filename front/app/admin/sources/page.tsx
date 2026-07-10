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
        시범 배출원의 좌표·굴뚝 제원을 관리하고, 확산 계산 대상 여부를 지정합니다.
      </p>
      <div className="mt-6">
        <SourcesTable />
      </div>
    </AdminShell>
  );
}
