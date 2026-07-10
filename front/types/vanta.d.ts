declare module "vanta/dist/vanta.fog.min" {
  interface VantaEffect {
    destroy: () => void;
  }
  interface VantaFogOptions {
    el: HTMLElement;
    THREE: unknown;
    highlightColor?: number;
    midtoneColor?: number;
    lowlightColor?: number;
    baseColor?: number;
    blurFactor?: number;
    speed?: number;
    zoom?: number;
    mouseControls?: boolean;
    touchControls?: boolean;
    gyroControls?: boolean;
  }
  const FOG: (options: VantaFogOptions) => VantaEffect;
  export default FOG;
}
