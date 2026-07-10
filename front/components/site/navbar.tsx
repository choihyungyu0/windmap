"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLenis } from "lenis/react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
import { brand, nav } from "@/lib/content";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { Magnetic } from "./magnetic";

export function Navbar() {
  const lenis = useLenis();
  const router = useRouter();
  const pathname = usePathname();
  const onHome = pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // prefetch a route on hover so navigation feels instant
  function prefetch(href: string) {
    if (href.startsWith("/") && !href.startsWith("/#")) router.prefetch(href);
  }

  function go(href: string) {
    setOpen(false);
    // route page (e.g. /process)
    if (href.startsWith("/") && !href.startsWith("/#")) {
      router.push(href);
      return;
    }
    // section anchor — normalise "/#x" and "#x"
    const hash = href.startsWith("/#") ? href.slice(1) : href;
    if (!onHome) {
      router.push("/" + hash); // leave sub-page → home, then browser anchors
      return;
    }
    if (lenis) lenis.scrollTo(hash, { offset: -80 });
    else document.querySelector(hash)?.scrollIntoView();
  }

  // the hero is light too now — `solid` only gates the bar's backdrop
  const solid = (scrolled || !onHome) && !open;

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div
        className={cn(
          "transition-colors duration-300",
          solid
            ? "border-b border-border bg-background/85 backdrop-blur-xl"
            : "border-b border-transparent bg-transparent"
        )}
      >
        <nav className="mx-auto flex h-16 max-w-[100rem] items-center justify-between gap-6 px-6 lg:h-20 lg:px-10">
          <button
            type="button"
            onClick={() => go("#top")}
            aria-label={brand.name}
            className="text-foreground transition-colors"
          >
            <Logo />
          </button>

          <ul className="hidden items-center gap-9 lg:flex">
            {nav.map((item) => {
              const active =
                item.href.startsWith("/") &&
                !item.href.startsWith("/#") &&
                pathname === item.href;
              return (
                <li key={item.href}>
                  <button
                    type="button"
                    onClick={() => go(item.href)}
                    onMouseEnter={() => prefetch(item.href)}
                    className={cn(
                      "text-sm transition-colors",
                      active
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center gap-3">
            <Magnetic className="hidden lg:inline-block">
              <button
                type="button"
                onClick={() => go("/map")}
                onMouseEnter={() => prefetch("/map")}
                className="inline-flex rounded-full bg-gradient-to-br from-brand to-[#00b8d4] px-5 py-2.5 text-sm font-semibold text-white transition-[filter,box-shadow] duration-300 hover:brightness-110 hover:shadow-[0_8px_24px_-8px_rgba(14,116,144,0.6)]"
              >
                확산 지도 열기
              </button>
            </Magnetic>

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
              aria-expanded={open}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground transition-colors lg:hidden"
            >
              {open ? <X className="size-6" /> : <Menu className="size-6" />}
            </button>
          </div>
        </nav>
      </div>

      {/* Mobile fullscreen overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-40 flex flex-col bg-background px-6 pb-10 pt-24 text-foreground lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <ul className="flex flex-col">
              {nav.map((item, i) => (
                <motion.li
                  key={item.href}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 + i * 0.06, duration: 0.5 }}
                  className="border-b border-border"
                >
                  <button
                    type="button"
                    onClick={() => go(item.href)}
                    className="w-full py-5 text-left text-3xl font-semibold tracking-tight"
                  >
                    {item.label}
                  </button>
                </motion.li>
              ))}
            </ul>
            <div className="mt-auto flex flex-col gap-2 text-sm text-muted-foreground">
              <a href={`mailto:${brand.email}`} className="hover:text-foreground">
                {brand.email}
              </a>
              <span>{brand.location}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
