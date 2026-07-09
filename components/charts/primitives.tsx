/**
 * 자체 SVG 차트 프리미티브 — 라이브러리 미사용(의존성 0·오프라인 무결 NFR-8).
 * 서버/클라이언트 양쪽에서 렌더 가능(훅 없음). 색·타이포는 디자인 시스템 준수.
 */

// ── 스파크라인: 추이 미니 라인 (+ 옅은 영역) ──
export function SparkLine({
  data,
  color = "#00b8d4",
  width = 120,
  height = 32,
  strokeWidth = 1.6,
  fillOpacity = 0.12,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
  fillOpacity?: number;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = 2;
  const pts = data.map((v, i) => [
    pad + (i / (data.length - 1)) * (width - pad * 2),
    pad + (1 - (v - min) / span) * (height - pad * 2),
  ]);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${pad},${height - pad} ${line} ${width - pad},${height - pad}`;
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden
      className="overflow-visible"
    >
      <polygon points={area} fill={color} opacity={fillOpacity} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lx} cy={ly} r={2.4} fill={color} />
    </svg>
  );
}

// ── 미니 세로 막대: 단일 지표를 베이스라인별로 비교 (small multiples용) ──
export function MiniBars({
  labels,
  values,
  highlight,
  format = (v) => String(v),
  color = "var(--brand, #0e7490)",
  mutedColor = "rgba(120,130,140,0.28)",
  height = 130,
}: {
  labels: string[];
  values: number[];
  /** 강조할 인덱스 (제안 모델) */
  highlight?: number;
  format?: (v: number) => string;
  color?: string;
  mutedColor?: string;
  height?: number;
}) {
  const max = Math.max(...values) || 1;
  const bw = 34; // 막대 폭
  const gap = 22;
  const top = 18; // 값 라벨 공간
  const bottom = 18; // 축 라벨 공간
  const width = values.length * bw + (values.length - 1) * gap + 8;
  const plotH = height - top - bottom;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img">
      {values.map((v, i) => {
        const h = Math.max(3, (v / max) * plotH);
        const x = 4 + i * (bw + gap);
        const y = top + plotH - h;
        const hot = i === highlight;
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={bw}
              height={h}
              rx={4}
              fill={hot ? color : mutedColor}
            />
            <text
              x={x + bw / 2}
              y={y - 5}
              textAnchor="middle"
              fontSize="11"
              fontWeight={hot ? 700 : 500}
              fill="currentColor"
              className="font-data"
            >
              {format(v)}
            </text>
            <text
              x={x + bw / 2}
              y={height - 4}
              textAnchor="middle"
              fontSize="10"
              fill="currentColor"
              opacity={0.55}
              className="font-data"
            >
              {labels[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── 도넛: 구성비 ──
export function Donut({
  segments,
  size = 140,
  thickness = 18,
  centerLabel,
  centerSub,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(120,130,140,0.15)"
        strokeWidth={thickness}
      />
      {segments.map((s, i) => {
        const frac = s.value / total;
        const dash = frac * c;
        const offset = c * 0.25 - acc * c; // 12시 시작, 시계방향
        acc += frac;
        if (s.value === 0) return null;
        return (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={thickness}
            strokeDasharray={`${dash} ${c - dash}`}
            strokeDashoffset={offset}
            strokeLinecap={segments.length > 1 ? "butt" : "round"}
          />
        );
      })}
      {centerLabel && (
        <text
          x={size / 2}
          y={size / 2 + (centerSub ? -2 : 5)}
          textAnchor="middle"
          fontSize="20"
          fontWeight={700}
          fill="currentColor"
          className="font-data"
        >
          {centerLabel}
        </text>
      )}
      {centerSub && (
        <text
          x={size / 2}
          y={size / 2 + 16}
          textAnchor="middle"
          fontSize="10"
          fill="currentColor"
          opacity={0.55}
        >
          {centerSub}
        </text>
      )}
    </svg>
  );
}

// ── 신뢰구간 바: 점추정 + 95% CI + 0 기준선 ──
export function CIBar({
  median,
  ci,
  domain,
  unit = "%",
  color = "#0e7490",
  height = 92,
}: {
  median: number;
  ci: [number, number];
  /** 축 범위 [min, max] — 미지정 시 CI에 여유를 더해 자동 */
  domain?: [number, number];
  unit?: string;
  color?: string;
  height?: number;
}) {
  const [dMin, dMax] =
    domain ?? [Math.min(ci[0], 0) - 15, Math.max(ci[1], median) + 15];
  const width = 560;
  const padX = 14;
  const plotW = width - padX * 2;
  const x = (v: number) => padX + ((v - dMin) / (dMax - dMin)) * plotW;
  const cy = 36;
  const ticks = [dMin, dMin / 2, 0, dMax / 2, dMax].map((v) => Math.round(v));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img">
      {/* 축 + 눈금 */}
      <line x1={padX} y1={cy + 22} x2={width - padX} y2={cy + 22} stroke="currentColor" opacity={0.18} />
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} y1={cy + 19} x2={x(t)} y2={cy + 25} stroke="currentColor" opacity={0.3} />
          <text x={x(t)} y={cy + 40} textAnchor="middle" fontSize="10" fill="currentColor" opacity={0.5} className="font-data">
            {t}
            {unit}
          </text>
        </g>
      ))}
      {/* 0 기준선 */}
      <line x1={x(0)} y1={10} x2={x(0)} y2={cy + 22} stroke="currentColor" opacity={0.35} strokeDasharray="3 3" />
      <text x={x(0)} y={8} textAnchor="middle" fontSize="9" fill="currentColor" opacity={0.5}>
        개선 없음
      </text>
      {/* CI 밴드 */}
      <line x1={x(ci[0])} y1={cy} x2={x(ci[1])} y2={cy} stroke={color} strokeWidth={6} opacity={0.3} strokeLinecap="round" />
      <line x1={x(ci[0])} y1={cy - 8} x2={x(ci[0])} y2={cy + 8} stroke={color} strokeWidth={2} />
      <line x1={x(ci[1])} y1={cy - 8} x2={x(ci[1])} y2={cy + 8} stroke={color} strokeWidth={2} />
      {/* 중앙값 점 */}
      <circle cx={x(median)} cy={cy} r={6} fill={color} />
      <text x={x(median)} y={cy - 14} textAnchor="middle" fontSize="12" fontWeight={700} fill="currentColor" className="font-data">
        {median}
        {unit}
      </text>
    </svg>
  );
}

// ── 멀티 라인 차트: 시계열 비교 (관측 vs 모델) ──
export function LineChart({
  series,
  height = 220,
  yUnit = "",
  xLabels,
}: {
  series: { name: string; color: string; data: number[]; dashed?: boolean }[];
  height?: number;
  yUnit?: string;
  /** x축에 드문드문 표시할 라벨 [index, label][] */
  xLabels?: [number, string][];
}) {
  const width = 720;
  const padL = 40;
  const padR = 10;
  const padT = 10;
  const padB = 24;
  const n = Math.max(...series.map((s) => s.data.length));
  const all = series.flatMap((s) => s.data);
  const min = Math.min(...all, 0);
  const max = Math.max(...all) || 1;
  const span = max - min || 1;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const px = (i: number) => padL + (i / (n - 1)) * plotW;
  const py = (v: number) => padT + (1 - (v - min) / span) * plotH;
  const yTicks = [min, min + span / 2, max];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img">
      {/* y 그리드 */}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={padL} y1={py(t)} x2={width - padR} y2={py(t)} stroke="currentColor" opacity={0.1} />
          <text x={padL - 6} y={py(t) + 3.5} textAnchor="end" fontSize="10" fill="currentColor" opacity={0.5} className="font-data">
            {Math.round(t)}
            {yUnit}
          </text>
        </g>
      ))}
      {/* x 라벨 */}
      {xLabels?.map(([i, label]) => (
        <text key={i} x={px(i)} y={height - 6} textAnchor="middle" fontSize="10" fill="currentColor" opacity={0.5} className="font-data">
          {label}
        </text>
      ))}
      {/* 시리즈 */}
      {series.map((s) => (
        <polyline
          key={s.name}
          points={s.data.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ")}
          fill="none"
          stroke={s.color}
          strokeWidth={s.dashed ? 1.4 : 2}
          strokeDasharray={s.dashed ? "4 3" : undefined}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

// ── 바람 장미: 16방위 빈도 (경보 발생 풍향 분포 등) ──
export function WindRose({
  bins,
  size = 180,
  color = "#22d3ee",
}: {
  /** 16방위 빈도 — index 0 = 북(N), 시계방향 22.5° 간격 */
  bins: number[];
  size?: number;
  color?: string;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const rMax = size / 2 - 20;
  const max = Math.max(...bins) || 1;
  const wedge = (i: number, r: number) => {
    const a0 = ((i * 22.5 - 9.5) * Math.PI) / 180; // 살짝 간격
    const a1 = ((i * 22.5 + 9.5) * Math.PI) / 180;
    const x0 = cx + r * Math.sin(a0);
    const y0 = cy - r * Math.cos(a0);
    const x1 = cx + r * Math.sin(a1);
    const y1 = cy - r * Math.cos(a1);
    return `M ${cx} ${cy} L ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z`;
  };
  const gridR = [1 / 3, 2 / 3, 1].map((f) => rMax * f);
  const compass: [string, number, number][] = [
    ["N", cx, 11],
    ["E", size - 6, cy + 3.5],
    ["S", cx, size - 4],
    ["W", 6, cy + 3.5],
  ];
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img">
      {gridR.map((r) => (
        <circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" opacity={0.12} />
      ))}
      <line x1={cx} y1={cy - rMax} x2={cx} y2={cy + rMax} stroke="currentColor" opacity={0.1} />
      <line x1={cx - rMax} y1={cy} x2={cx + rMax} y2={cy} stroke="currentColor" opacity={0.1} />
      {bins.map((v, i) =>
        v > 0 ? (
          <path
            key={i}
            d={wedge(i, 6 + (v / max) * (rMax - 6))}
            fill={color}
            opacity={0.32 + 0.55 * (v / max)}
          />
        ) : null
      )}
      {compass.map(([t, x, y]) => (
        <text key={t} x={x} y={y} textAnchor="middle" fontSize="10" fill="currentColor" opacity={0.55} className="font-data">
          {t}
        </text>
      ))}
    </svg>
  );
}

// ── 차트 범례 ──
export function ChartLegend({
  items,
  className = "",
}: {
  items: { label: string; color: string; dashed?: boolean }[];
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs ${className}`}>
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5 opacity-80">
          <svg width="18" height="6" aria-hidden>
            <line
              x1="1"
              y1="3"
              x2="17"
              y2="3"
              stroke={it.color}
              strokeWidth="2.5"
              strokeDasharray={it.dashed ? "4 3" : undefined}
            />
          </svg>
          {it.label}
        </span>
      ))}
    </div>
  );
}
