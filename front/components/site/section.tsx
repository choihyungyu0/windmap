import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Reveal, RevealLines } from "./reveal";

export function Section({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn("relative scroll-mt-20 px-6 py-24 lg:px-10 lg:py-32", className)}
    >
      <div className="mx-auto max-w-[100rem]">{children}</div>
    </section>
  );
}

export function SectionHeader({
  kicker,
  title,
  description,
  trailing,
  invert,
  className,
}: {
  kicker: string;
  title: string;
  description?: string;
  trailing?: ReactNode;
  invert?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-8 md:flex-row md:items-end md:justify-between",
        className
      )}
    >
      <div className="max-w-3xl">
        <Reveal>
          <span className={cn("kicker", invert ? "text-white/60" : "text-brand")}>
            {kicker}
          </span>
        </Reveal>
        <RevealLines
          as="h2"
          text={title}
          className="display mt-4 block text-[clamp(2rem,4.5vw,3.75rem)]"
        />
        {description && (
          <Reveal delay={0.1}>
            <p
              className={cn(
                "mt-6 max-w-xl text-lg leading-relaxed",
                invert ? "text-white/70" : "text-muted-foreground"
              )}
            >
              {description}
            </p>
          </Reveal>
        )}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}
