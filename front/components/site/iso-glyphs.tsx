import type { ReactNode } from "react";

/* ── Tiny isometric line-art glyphs (same 3D language as the partner buildings).
      currentColor stroke so they invert inside the brand chip on hover. ── */

type P = [number, number];
const VW: P = [0.866, -0.5];
const VD: P = [-0.866, -0.5];
const VH: P = [0, -1];
const ad = (p: P, v: P, s: number): P => [p[0] + v[0] * s, p[1] + v[1] * s];
const f = (v: number) => v.toFixed(1);
const poly = (pts: P[]) => "M" + pts.map((p) => `${f(p[0])} ${f(p[1])}`).join("L") + "Z";
const ln = (a: P, b: P) => `M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}`;

function geom(fx: number, fy: number, w: number, d: number, h: number) {
  const F: P = [fx, fy];
  const Rb = ad(F, VW, w);
  const Lb = ad(F, VD, d);
  const Bb = ad(Rb, VD, d);
  const Ft = ad(F, VH, h);
  const Rt = ad(Rb, VH, h);
  const Lt = ad(Lb, VH, h);
  const Bt = ad(Bb, VH, h);
  return { F, Rb, Lb, Bb, Ft, Rt, Lt, Bt };
}
const box = (fx: number, fy: number, w: number, d: number, h: number) => {
  const b = geom(fx, fy, w, d, h);
  return (
    poly([b.F, b.Rb, b.Rt, b.Bt, b.Lt, b.Lb]) +
    ln(b.F, b.Ft) +
    ln(b.Ft, b.Lt) +
    ln(b.Ft, b.Rt)
  );
};
const topFace = (fx: number, fy: number, w: number, d: number, h: number) => {
  const b = geom(fx, fy, w, d, h);
  return poly([b.Ft, b.Rt, b.Bt, b.Lt]);
};
const dia = (cx: number, cy: number, rw: number, rh: number) =>
  poly([[cx, cy - rh], [cx + rw, cy], [cx, cy + rh], [cx - rw, cy]]);

/* drawing primitives (inherit stroke from <svg>) */
const O = (d: string, k?: string | number) => <path key={k} d={d} />;
const Fill = (d: string, k?: string | number) => (
  <path key={k} d={d} fill="currentColor" fillOpacity={0.14} stroke="none" />
);

/* a solid iso cube (faint top fill for depth) */
function cube(fx: number, fy: number, w: number, d: number, h: number, k?: string) {
  return (
    <g key={k}>
      {Fill(topFace(fx, fy, w, d, h))}
      {O(box(fx, fy, w, d, h))}
    </g>
  );
}

const GLYPHS: Record<string, ReactNode> = {
  /* 제조 ─────────────────────── */
  // 제품 크기 — measured block + dimension arrow across the top
  "제품 크기": (
    <>
      {Fill(topFace(24, 36, 14, 12, 12))}
      {O(box(24, 36, 14, 12, 12))}
      {O(ln([13.6, 18], [36.1, 17]))}
      {O("M13.6 18L17 16M13.6 18L17 20")}
      {O("M36.1 17L32.7 15M36.1 17L32.7 19")}
    </>
  ),
  // 구조 복잡도 — stacked layers
  "구조 복잡도": (
    <>
      {O(dia(24, 34, 13, 6.5))}
      {O(dia(24, 25, 13, 6.5))}
      {O(dia(24, 16, 13, 6.5))}
    </>
  ),
  // 도색 여부 — block + paint droplet
  "도색 여부": (
    <>
      {Fill(topFace(24, 38, 14, 12, 10))}
      {O(box(24, 38, 14, 12, 10))}
      <path d="M24 6 C27.5 11 28.5 13.5 24 15.5 C19.5 13.5 20.5 11 24 6 Z" fill="currentColor" fillOpacity={0.2} />
    </>
  ),
  // 기능 구현 — module: cube + smaller cube on top
  "기능 구현": (
    <>
      {cube(21, 38, 13, 11, 9)}
      {cube(25, 25, 7, 6, 7)}
    </>
  ),
  // 소재 종류 — solid material cube (all faces shaded)
  "소재 종류": (
    <>
      {Fill(topFace(24, 36, 14, 12, 12))}
      <path d={poly([geom(24, 36, 14, 12, 12).F, geom(24, 36, 14, 12, 12).Rb, geom(24, 36, 14, 12, 12).Rt, geom(24, 36, 14, 12, 12).Ft])} fill="currentColor" fillOpacity={0.07} stroke="none" />
      {O(box(24, 36, 14, 12, 12))}
    </>
  ),
  // 제작 수량 — three units
  "제작 수량": (
    <>
      {cube(16, 40, 8, 7, 7)}
      {cube(30, 40, 8, 7, 7)}
      {cube(23, 31, 8, 7, 7)}
    </>
  ),
  // 금형 필요 여부 — mold press (two halves closing)
  "금형 필요 여부": (
    <>
      {O(box(24, 23, 14, 12, 4))}
      {O(box(24, 40, 14, 12, 4))}
      {O("M20 28L24 32L28 28")}
    </>
  ),

  /* 개발 ─────────────────────── */
  // 페이지 수 — fanned sheets
  "페이지 수": (
    <>
      {cube(18, 41, 11, 8, 2)}
      {cube(22, 36, 11, 8, 2)}
      {cube(26, 31, 11, 8, 2)}
    </>
  ),
  // 기능 수 — feature board (top plane split into a grid)
  "기능 수": (
    <>
      {O(dia(24, 24, 15, 8))}
      {O(ln([24, 16], [24, 32]))}
      {O(ln([9, 24], [39, 24]))}
    </>
  ),
  // 로그인 — locked cube with keyhole
  로그인: (
    <>
      {Fill(topFace(24, 37, 14, 12, 12))}
      {O(box(24, 37, 14, 12, 12))}
      <circle cx="30" cy="25" r="2.4" />
      {O(ln([30, 27], [30, 30.5]))}
    </>
  ),
  // 관리자 페이지 — dashboard panel with bars
  "관리자 페이지": (
    <>
      {O(box(24, 36, 17, 4, 15))}
      {O(ln([26.5, 27.5], [37, 22]))}
      {O(ln([26.5, 31.5], [37, 26]))}
      {O(ln([26.5, 35.5], [33, 31.5]))}
    </>
  ),
  // 결제 기능 — payment card (thin slab + magnetic stripe)
  "결제 기능": (
    <>
      {Fill(topFace(24, 32, 18, 13, 3))}
      {O(box(24, 32, 18, 13, 3))}
      {O(ln([12, 26], [27.5, 18]))}
    </>
  ),
  // DB 연동 — cylinder stack
  "DB 연동": (
    <>
      <ellipse cx="24" cy="15" rx="10" ry="4" />
      {O(ln([14, 15], [14, 31]))}
      {O(ln([34, 15], [34, 31]))}
      <path d="M14 31 A10 4 0 0 0 34 31" fill="none" />
      <path d="M14 23 A10 4 0 0 0 34 23" fill="none" />
    </>
  ),
  // 배포 — launch (cube + rising arrow)
  배포: (
    <>
      {Fill(topFace(24, 40, 14, 12, 9))}
      {O(box(24, 40, 14, 12, 9))}
      {O(ln([24, 22], [24, 8]))}
      {O("M19 13L24 8L29 13")}
    </>
  ),
  // 유지보수 — gear
  유지보수: (
    <>
      <circle cx="24" cy="24" r="6.5" />
      <circle cx="24" cy="24" r="2.2" />
      {O("M30.5 24L33.5 24")}
      {O("M27.25 18.4L28.75 15.8")}
      {O("M20.75 18.4L19.25 15.8")}
      {O("M17.5 24L14.5 24")}
      {O("M20.75 29.6L19.25 32.2")}
      {O("M27.25 29.6L28.75 32.2")}
    </>
  ),

  /* group headers */
  __manufacture: (
    <>
      {Fill(topFace(24, 38, 17, 15, 14))}
      {O(box(24, 38, 17, 15, 14))}
    </>
  ),
  __develop: (
    <>
      {Fill(topFace(24, 38, 17, 15, 14))}
      {O(box(24, 38, 17, 15, 14))}
      {O("M19 23L15 27.5L19 32")}
      {O("M29 23L33 27.5L29 32")}
      {O("M26.5 21L21.5 34")}
    </>
  ),
};

export function IsoGlyph({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="round"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      {GLYPHS[name] ?? cube(24, 36, 14, 12, 12)}
    </svg>
  );
}
