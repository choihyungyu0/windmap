import { brand, footer } from "@/lib/content";
import { LogoMark } from "./logo";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-ink px-6 py-16 text-white lg:px-10 lg:py-20">
      <div className="mx-auto max-w-[100rem]">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <LogoMark className="h-5 w-5" />
              <span className="text-lg font-bold tracking-tight">
                {brand.name}
              </span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-white/60">
              {footer.description}
            </p>
            <a
              href={`mailto:${brand.email}`}
              className="mt-6 inline-block text-sm text-white/80 underline-offset-4 hover:underline"
            >
              {brand.email}
            </a>
          </div>

          {footer.groups.map((g) => (
            <div key={g.title}>
              <div className="kicker text-white/40">{g.title}</div>
              <ul className="mt-4 flex flex-col gap-2.5">
                {g.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      className="text-sm text-white/75 transition-colors hover:text-white"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <div className="kicker text-white/40">Social</div>
            <ul className="mt-4 flex flex-col gap-2.5">
              {footer.social.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.href}
                    className="text-sm text-white/75 transition-colors hover:text-white"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-4 border-t border-white/10 pt-8 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {brand.name}. All rights reserved.
          </p>
          <div className="flex items-center gap-5">
            {footer.legal.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="transition-colors hover:text-white/80"
              >
                {l.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
