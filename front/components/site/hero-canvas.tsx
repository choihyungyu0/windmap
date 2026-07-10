"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * Hero background: a slow-flowing monochrome fog rendered with a single
 * full-screen WebGL quad (domain-warped value-noise FBM). No photos — the
 * visual IS the proof of craft for a dev studio.
 *
 * - "Ink on paper": white base with soft-gray fog and a faint ink-blue bleed.
 * - Reacts subtly to the cursor (ink gathers gently under it).
 * - DPR capped, paused when the tab/section is hidden, single static frame
 *   under prefers-reduced-motion. Falls back silently if WebGL is unavailable
 *   (the parent's bg-background shows through).
 */
const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;

float hash(vec2 p){
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.55;
  mat2 m = mat2(1.5, 1.0, -1.0, 1.5);
  for (int i = 0; i < 5; i++){ v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}
void main(){
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  vec2 p = uv;
  p.x *= u_res.x / u_res.y;
  p *= 0.85;            // zoom out → larger, softer mist forms
  float t = u_time * 0.028;

  // domain warp for organic, slow-drifting mist (gentler than before)
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(4.2, 1.3 - t)));
  vec2 r = vec2(
    fbm(p + 1.1 * q + vec2(1.7, 9.2) + 0.12 * t),
    fbm(p + 1.1 * q + vec2(8.3, 2.8) - 0.10 * t)
  );
  float f = fbm(p + 1.3 * r);
  f = smoothstep(0.15, 0.95, f); // narrower range → soft, low-contrast mist
  f = pow(f, 1.25);              // ease the mids down

  // soft ink gathering under the cursor
  vec2 m = u_mouse;
  m.x *= u_res.x / u_res.y;
  m *= 0.85;
  float glow = smoothstep(0.85, 0.0, distance(p, m)) * 0.14;
  f += glow;

  // tone: paper white down to soft gray fog (light, airy mist)
  float g = mix(1.0, 0.85, f);
  vec3 col = vec3(g);

  // intentional brand-blue bleed, anchored soft in the upper-right corner
  float blueField = smoothstep(0.9, 0.0, distance(uv, vec2(0.92, 0.88)));
  col = mix(
    col,
    vec3(0.145, 0.388, 0.922),
    blueField * 0.09 + smoothstep(0.35, 0.55, f) * 0.05
  );

  // gentle vignette — a whisper of gray at the edges
  float vig = smoothstep(1.3, 0.4, length(uv - 0.5));
  col *= mix(0.94, 1.0, vig);

  gl_FragColor = vec4(col, 1.0);
}
`;

const VERT = `
attribute vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

export function HeroCanvas() {
  const reduce = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl =
      canvas.getContext("webgl", { antialias: false, alpha: false }) ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) return; // graceful fallback: parent bg-background shows

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
    const aPos = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, "u_res");
    const uTime = gl.getUniformLocation(program, "u_time");
    const uMouse = gl.getUniformLocation(program, "u_mouse");

    let width = 0;
    let height = 0;
    const resize = () => {
      // lighter pixel budget on phones (the FBM shader is the cost driver)
      const cap = window.matchMedia("(max-width: 768px)").matches ? 1.25 : 1.6;
      const dpr = Math.min(window.devicePixelRatio || 1, cap);
      width = Math.floor(canvas.clientWidth * dpr);
      height = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
      gl.uniform2f(uRes, width, height);
    };
    resize();

    // mouse: lerp current toward target (gl origin is bottom-left → flip y)
    const target = { x: 0.5, y: 0.5 };
    const cur = { x: 0.5, y: 0.5 };
    const onMove = (e: MouseEvent) => {
      target.x = e.clientX / window.innerWidth;
      target.y = 1 - e.clientY / window.innerHeight;
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("resize", resize);

    let raf = 0;
    let running = false;
    let inView = true;
    const start = performance.now();

    const render = (now: number) => {
      cur.x += (target.x - cur.x) * 0.05;
      cur.y += (target.y - cur.y) * 0.05;
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.uniform2f(uMouse, cur.x, cur.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(render);
    };

    // run only when the tab is visible AND the hero is on-screen
    const startLoop = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(render);
    };
    const stopLoop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    const sync = () => {
      if (!document.hidden && inView) startLoop();
      else stopLoop();
    };

    let io: IntersectionObserver | undefined;
    if (reduce) {
      // single static frame, frozen at a pleasing offset
      gl.uniform1f(uTime, 12.0);
      gl.uniform2f(uMouse, 0.5, 0.5);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      sync();
      document.addEventListener("visibilitychange", sync);
      io = new IntersectionObserver(
        ([entry]) => {
          inView = entry.isIntersecting;
          sync();
        },
        { threshold: 0 }
      );
      io.observe(canvas);
    }

    return () => {
      stopLoop();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", sync);
      io?.disconnect();
      const ext = gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
    };
  }, [reduce]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="absolute inset-0 h-full w-full"
    />
  );
}
