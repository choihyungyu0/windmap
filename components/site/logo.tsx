import { brand } from "@/lib/content";
import { cn } from "@/lib/utils";

/** Brand mark — square(제조) ∪ circle(개발) = 통합 솔루션. Inherits currentColor. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="12.5" height="12.5" rx="2.4" stroke="currentColor" strokeWidth="2.1" />
      <circle cx="15.2" cy="15.2" r="6.2" stroke="currentColor" strokeWidth="2.1" />
    </svg>
  );
}

/** Mark + wordmark lockup. */
export function Logo({
  className,
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="h-5 w-5" />
      {showWordmark && (
        <span className="text-base font-bold tracking-tight">{brand.name}</span>
      )}
    </span>
  );
}
