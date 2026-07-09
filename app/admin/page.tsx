import type { Metadata } from "next";
import { LogoutButton } from "./logout-button";

export const metadata: Metadata = {
  title: "관제 대시보드",
  robots: { index: false, follow: false },
};

/**
 * ADM-DSH 관제 대시보드 (F-ADSH-01/02) — P7에서 구현.
 * 배출원 상태·활성 경보·시설 위험도 집계가 이 화면에 들어온다.
 */
export default function AdminDashboardPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-16">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium tracking-widest text-muted-foreground">
            ADMIN · 바람의 지도
          </p>
          <h1 className="mt-1 text-3xl font-bold">관제 대시보드</h1>
        </div>
        <LogoutButton />
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "배출원 상태", desc: "시범 배출원 가동·수집 상태 (F-ADSH-01)" },
          { label: "활성 경보", desc: "현재 발령 중인 취약시설 경보 (F-ADSH-02)" },
          { label: "시설 위험도", desc: "취약시설별 위험도 집계 (F-ADSH-01)" },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border border-border p-5">
            <h2 className="font-semibold">{c.label}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{c.desc}</p>
            <p className="mt-4 text-xs text-muted-foreground">P7 단계 구현 예정</p>
          </div>
        ))}
      </section>
    </main>
  );
}
