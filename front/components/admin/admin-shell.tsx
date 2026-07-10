import Link from "next/link";
import { LogoDark } from "@/components/site/logo";
import { AdminNav } from "./admin-nav";

/** 관리자 공통 셸 — 관제 다크 톤. 탭: 관제 / 배출원 / 이력. */
export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-control-bg text-control-text">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-control-line px-4 py-3 lg:px-6">
        <Link
          href="/admin"
          className="flex items-center gap-2 transition-opacity hover:opacity-80"
        >
          <LogoDark />
          <span className="rounded border border-control-line px-1.5 py-0.5 text-[10px] font-semibold tracking-widest text-control-muted">
            ADMIN
          </span>
        </Link>

        <AdminNav />

        <Link
          href="/map"
          className="ml-auto text-sm text-control-muted transition-colors hover:text-control-text"
        >
          공개 화면 보기
        </Link>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 lg:px-6 lg:py-10">
        {children}
      </main>
    </div>
  );
}
