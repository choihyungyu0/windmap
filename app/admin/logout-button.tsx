"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/admin/login", { method: "DELETE" });
        router.replace("/admin/login");
        router.refresh();
      }}
      className="rounded-full border border-control-line px-4 py-1.5 text-sm font-medium text-control-muted transition-colors hover:border-wind/60 hover:text-control-text"
    >
      로그아웃
    </button>
  );
}
