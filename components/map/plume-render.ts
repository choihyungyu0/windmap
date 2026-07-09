/**
 * 플룸 농도장 → 캔버스 래스터 (클라이언트 전용).
 *
 * 색은 경보 임계값(40/90/180 μg/m³)과 같은 절대 축 — 범례·등급과 항상 일치.
 * deck.gl BitmapLayer의 image 소스로 쓰인다 (HeatmapLayer를 쓰지 않는 이유:
 * 줌 레벨에 따른 상대 정규화로 "색=농도" 약속이 깨지기 때문).
 */

import { computeGrid, type PlumeParams } from "@/lib/plume";

/** 농도(μg/m³) → RGBA. 시안(저) → 호박(주의) → 주황(경계) → 적(심각). */
export function colorFor(c: number): [number, number, number, number] {
  if (c < 1) return [0, 0, 0, 0];
  const stops: [number, [number, number, number]][] = [
    [0, [0, 184, 212]],
    [40, [0, 184, 212]],
    [90, [217, 119, 6]],
    [180, [234, 88, 12]],
    [360, [220, 38, 38]],
  ];
  let rgb: [number, number, number] = stops[stops.length - 1][1];
  for (let i = 1; i < stops.length; i++) {
    if (c <= stops[i][0]) {
      const [c0, rgb0] = stops[i - 1];
      const [c1, rgb1] = stops[i];
      const t = (c - c0) / (c1 - c0);
      rgb = [
        rgb0[0] + (rgb1[0] - rgb0[0]) * t,
        rgb0[1] + (rgb1[1] - rgb0[1]) * t,
        rgb0[2] + (rgb1[2] - rgb0[2]) * t,
      ];
      break;
    }
  }
  const alpha = Math.min(0.85, 0.12 + (c / 40) * 0.35);
  return [rgb[0], rgb[1], rgb[2], Math.round(alpha * 255)];
}

/** 농도장을 계산해 새 캔버스로 반환 — 참조가 바뀌므로 deck.gl이 자동 갱신. */
export function renderPlumeCanvas(
  params: PlumeParams,
  grid: number,
  halfExtentM: number
): HTMLCanvasElement {
  const { data } = computeGrid(params, grid, halfExtentM);
  const img = new ImageData(grid, grid);
  for (let i = 0; i < data.length; i++) {
    const [r, g, b, a] = colorFor(data[i]);
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = a;
  }
  const canvas = document.createElement("canvas");
  canvas.width = grid;
  canvas.height = grid;
  canvas.getContext("2d")!.putImageData(img, 0, 0);
  return canvas;
}
