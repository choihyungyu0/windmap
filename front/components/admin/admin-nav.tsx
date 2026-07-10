"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin", label: "관제" },
  { href: "/admin/sources", label: "배출원" },
  { href: "/admin/history", label: "이력" },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="관리자 메뉴" className="flex items-center gap-1">
      {TABS.map((t) => {
        const active =
          t.href === "/admin" ? pathname === "/admin" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-control-surface text-control-text"
                : "text-control-muted hover:text-control-text"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
