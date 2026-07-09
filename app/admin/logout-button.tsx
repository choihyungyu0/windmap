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
      className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground/70 transition-colors hover:border-foreground/40 hover:text-foreground"
    >
      로그아웃
    </button>
  );
}
