"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error || "로그인에 실패했습니다.");
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-secondary px-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-border bg-white p-8 shadow-[0_30px_80px_-40px_rgba(11,11,12,0.25)]"
      >
        <p className="kicker text-foreground/45">Admin</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">관리자 로그인</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          문의 내역 관리를 위한 페이지입니다.
        </p>

        <label className="mt-6 block text-sm font-medium" htmlFor="admin-pw">
          비밀번호
        </label>
        <input
          id="admin-pw"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          autoComplete="current-password"
          className="mt-2 w-full rounded-lg border border-input bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-brand"
        />

        {error && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || password.length === 0}
          className="mt-6 w-full rounded-full bg-gradient-to-br from-brand to-[#3b82f6] py-3 text-sm font-semibold text-white transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "확인 중…" : "로그인"}
        </button>
      </form>
    </main>
  );
}
