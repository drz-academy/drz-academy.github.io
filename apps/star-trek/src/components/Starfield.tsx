"use client";

import { memo, useEffect, useRef } from "react";

/**
 * Campo estelar visto desde la cabina. Además del efecto de túnel, aplica dos
 * consecuencias reales de viajar a velocidades relativistas:
 *
 *  - Aberración: las estrellas se concentran hacia la dirección de movimiento
 *    siguiendo cos(theta') = (cos theta + v) / (1 + v cos theta).
 *  - Efecto Doppler: la luz de proa se corre al azul y la de popa al rojo, con
 *    el factor D = 1 / [gamma (1 - v cos theta')].
 *
 * El lienzo cubre el viewport, así que el bucle está pensado para costar poco:
 * menos estrellas en teléfono, 30 fps, aberración sin atan/acos, y se detiene
 * si el cielo está congelado y la velocidad no cambia.
 */

type Star = {
  x: number;
  y: number;
  z: number;
  /** Brillo intrínseco, para que el campo no sea uniforme. */
  mag: number;
};

const Z_NEAR = 0.25;
const Z_FAR = 7;
const MAX_VISUAL_SPEED = 0.9995;
/** acos/tan se sustituyen por √(1−c²)/c; el tope 1,45 rad se conserva. */
const COS_ABERRATION_CAP = Math.cos(1.45);
const TAN_ABERRATION_CAP = Math.tan(1.45);
const FRAME_MS = 1000 / 30;

type Nebula = {
  x: number;
  y: number;
  r: number;
  color: string;
};

const NEBULAE: Nebula[] = [
  { x: 0.18, y: 0.28, r: 0.42, color: "rgba(122, 60, 200, 0.4)" },
  { x: 0.78, y: 0.2, r: 0.36, color: "rgba(0, 140, 190, 0.32)" },
  { x: 0.62, y: 0.78, r: 0.44, color: "rgba(196, 48, 122, 0.26)" },
  { x: 0.08, y: 0.82, r: 0.3, color: "rgba(40, 120, 180, 0.24)" },
  { x: 0.45, y: 0.5, r: 0.55, color: "rgba(24, 46, 96, 0.34)" },
];

const DOPPLER_BINS = 48;
const ALPHA_BINS = 16;
const COLOR_LUT: string[] = new Array((DOPPLER_BINS + 1) * (ALPHA_BINS + 1));

for (let i = 0; i <= DOPPLER_BINS; i += 1) {
  const t = (i / DOPPLER_BINS) * 2 - 1;
  const r = Math.round(t >= 0 ? 200 - t * 80 : 255);
  const g = Math.round(t >= 0 ? 226 - t * 20 : 226 + t * 90);
  const b = Math.round(t >= 0 ? 255 : 255 + t * 130);
  for (let a = 0; a <= ALPHA_BINS; a += 1) {
    COLOR_LUT[i * (ALPHA_BINS + 1) + a] =
      `rgba(${r},${g},${b},${(a / ALPHA_BINS).toFixed(3)})`;
  }
}

/** Color percibido de una estrella según su corrimiento Doppler. */
function dopplerColor(doppler: number, alpha: number): string {
  const t = Math.log(doppler) / 1.1;
  const i = Math.max(
    0,
    Math.min(DOPPLER_BINS, Math.round((t + 1) * 0.5 * DOPPLER_BINS)),
  );
  const a = Math.max(0, Math.min(ALPHA_BINS, Math.round(alpha * ALPHA_BINS)));
  return COLOR_LUT[i * (ALPHA_BINS + 1) + a];
}

function makeStars(count: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i += 1) {
    stars.push({
      x: (Math.random() * 2 - 1) * 2.4,
      y: (Math.random() * 2 - 1) * 2.4,
      z: Z_NEAR + Math.random() * (Z_FAR - Z_NEAR),
      mag: 0.35 + Math.random() ** 2 * 0.65,
    });
  }
  return stars;
}

function recycle(star: Star) {
  star.x = (Math.random() * 2 - 1) * 2.4;
  star.y = (Math.random() * 2 - 1) * 2.4;
  star.z = Z_FAR;
  star.mag = 0.35 + Math.random() ** 2 * 0.65;
}

function starBudget(width: number, height: number, coarse: boolean): number {
  const phone = coarse || width < 540;
  const max = phone ? 220 : 460;
  const areaDiv = phone ? 3400 : 2600;
  return Math.max(110, Math.min(max, Math.round((width * height) / areaDiv)));
}

function project(
  star: Star,
  z: number,
  focal: number,
  cx: number,
  cy: number,
  aberrV: number,
) {
  const rx = (star.x / z) * focal;
  const ry = (star.y / z) * focal;
  const r2 = rx * rx + ry * ry;
  if (r2 < 1e-12) return { sx: cx, sy: cy, cosTheta: 1 };

  const cosTheta = focal / Math.sqrt(r2 + focal * focal);
  const cosAberrated = (cosTheta + aberrV) / (1 + aberrV * cosTheta);
  const c = Math.max(-1, Math.min(1, cosAberrated));
  const tanA =
    c <= COS_ABERRATION_CAP
      ? TAN_ABERRATION_CAP
      : Math.sqrt(Math.max(0, 1 - c * c)) / c;
  const scale = (focal * tanA) / Math.sqrt(r2);
  return { sx: cx + rx * scale, sy: cy + ry * scale, cosTheta: c };
}

function Starfield({
  speed,
  running,
}: {
  /** Velocidad instantánea en unidades de c. */
  speed: number;
  /** Si es false el campo queda congelado (pero sigue mostrando aberración). */
  running: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const speedRef = useRef(speed);
  const runningRef = useRef(running);
  const wakeRef = useRef<(() => void) | null>(null);

  // El bucle de animación lee estos valores por referencia para no reiniciarse
  // en cada fotograma del reproductor.
  useEffect(() => {
    speedRef.current = speed;
    wakeRef.current?.();
  }, [speed]);

  useEffect(() => {
    runningRef.current = running;
    wakeRef.current?.();
  }, [running]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", {
      alpha: false,
      desynchronized: true,
    });
    if (!ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const coarse =
      window.matchMedia("(pointer: coarse)").matches ||
      window.matchMedia("(max-width: 720px)").matches;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let stars: Star[] = [];
    let raf = 0;
    let last = 0;
    let lastDrawn = 0;
    let lastSigned = Number.NaN;
    let drift = 0;
    let dirty = true;
    let originCx = 0;
    let originCy = 0;
    let originFocal = 0;

    const nebula = document.createElement("canvas");
    const nebulaCtx = nebula.getContext("2d", { alpha: false });

    const paintNebulaSheet = () => {
      if (!nebulaCtx || width < 1 || height < 1) return;
      nebula.width = Math.max(1, Math.round(width * dpr));
      nebula.height = Math.max(1, Math.round(height * 2 * dpr));
      nebulaCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      nebulaCtx.fillStyle = "#02040b";
      nebulaCtx.fillRect(0, 0, width, height * 2);
      for (const cloud of NEBULAE) {
        const nx = cloud.x * width;
        const ny = cloud.y * height;
        const radius = cloud.r * Math.max(width, height);
        for (const y of [ny, ny + height]) {
          const gradient = nebulaCtx.createRadialGradient(
            nx,
            y,
            0,
            nx,
            y,
            radius,
          );
          gradient.addColorStop(0, cloud.color);
          gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
          nebulaCtx.fillStyle = gradient;
          nebulaCtx.beginPath();
          nebulaCtx.arc(nx, y, radius, 0, Math.PI * 2);
          nebulaCtx.fill();
        }
      }
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dprCap = coarse ? 1.2 : 1.5;
      const scale = coarse ? 0.58 : 0.72;
      dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      width = Math.max(1, Math.round(rect.width * scale));
      height = Math.max(1, Math.round(rect.height * scale));
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = makeStars(starBudget(width, height, coarse));
      paintNebulaSheet();
      readOrigin();
      dirty = true;
    };

    /** El túnel sale del centro del visor, no del viewport: en el teléfono
     *  la cabecera empuja la ventana hacia abajo. */
    const readOrigin = () => {
      originCx = width / 2;
      originCy = height / 2;
      originFocal = Math.max(width, height) * 0.62;
      const glass = document.querySelector("[data-starfield-origin]");
      if (!(glass instanceof HTMLElement)) return;
      const canvasRect = canvas.getBoundingClientRect();
      const glassRect = glass.getBoundingClientRect();
      if (canvasRect.width < 1 || canvasRect.height < 1) return;
      if (glassRect.width < 1 || glassRect.height < 1) return;
      const sx = width / canvasRect.width;
      const sy = height / canvasRect.height;
      originCx = (glassRect.left + glassRect.width / 2 - canvasRect.left) * sx;
      originCy = (glassRect.top + glassRect.height / 2 - canvasRect.top) * sy;
      const glassW = glassRect.width * sx;
      const glassH = glassRect.height * sy;
      originFocal = Math.max(glassW, glassH) * 0.9;
    };

    let resizeTimer = 0;
    const requestResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resize();
        schedule();
      }, 90);
    };

    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(tick);
    };

    const tick = (now: number) => {
      raf = 0;
      if (document.hidden) return;

      const signed = Math.max(
        -MAX_VISUAL_SPEED,
        Math.min(MAX_VISUAL_SPEED, speedRef.current),
      );
      const moving = runningRef.current && !reduceMotion;
      if (!dirty && !moving && signed === lastSigned) return;
      if (!dirty && now - lastDrawn < FRAME_MS) {
        schedule();
        return;
      }

      const dt = last === 0 ? 0.016 : Math.min(0.05, (now - last) / 1000);
      last = now;
      lastDrawn = now;
      lastSigned = signed;
      dirty = false;

      const v = Math.abs(signed);
      const direction = signed >= 0 ? 1 : -1;
      const gamma = 1 / Math.sqrt(1 - v * v);
      readOrigin();
      const cx = originCx;
      const cy = originCy;
      const focal = originFocal;
      const aberrV = direction * v;
      const zSpeed = (0.12 + 3.4 * v ** 1.6) * direction;
      const trail = Math.min(2.6, Math.abs(zSpeed) * (0.02 + 0.5 * v ** 2.5));
      if (moving) drift += zSpeed * dt * 0.05;

      const shift = ((drift * 12) % height + height) % height;
      const zoom = 1 + 0.12 * v;
      const dw = width * zoom;
      const dh = height * zoom;
      ctx.drawImage(
        nebula,
        0,
        shift * dpr,
        width * dpr,
        height * dpr,
        cx - dw / 2,
        cy - dh / 2,
        dw,
        dh,
      );

      ctx.lineCap = "round";
      const drawTrails = v > 0.04 && moving;
      const padX = width * 0.08;
      const padY = height * 0.08;

      for (const star of stars) {
        if (moving) {
          star.z -= zSpeed * dt;
          if (star.z < 0.08) {
            if (direction >= 0) {
              recycle(star);
              continue;
            }
            star.z = 0.08;
          }
          if (direction >= 0 && star.z <= Z_NEAR) {
            recycle(star);
            continue;
          }
          if (direction < 0 && star.z >= Z_FAR) {
            star.x = (Math.random() * 2 - 1) * 2.4;
            star.y = (Math.random() * 2 - 1) * 2.4;
            star.z = Z_NEAR + 0.02;
            star.mag = 0.35 + Math.random() ** 2 * 0.65;
            continue;
          }
        }

        const head = project(star, star.z, focal, cx, cy, aberrV);
        if (
          head.sx < -padX ||
          head.sx > width + padX ||
          head.sy < -padY ||
          head.sy > height + padY
        ) {
          continue;
        }

        const depth = 1 - (star.z - Z_NEAR) / (Z_FAR - Z_NEAR);
        const doppler = 1 / (gamma * (1 - v * head.cosTheta));
        const boost = Math.min(3.2, doppler ** 1.4);
        const alpha = Math.min(1, star.mag * (0.34 + depth * 0.82) * boost);
        const size = Math.max(0.7, star.mag * (0.8 + depth * 2.1));

        if (drawTrails && (star.mag > 0.48 || depth > 0.52)) {
          const tail = project(
            star,
            star.z + trail * direction,
            focal,
            cx,
            cy,
            aberrV,
          );
          ctx.strokeStyle = dopplerColor(doppler, alpha * 0.85);
          ctx.lineWidth = size;
          ctx.beginPath();
          ctx.moveTo(tail.sx, tail.sy);
          ctx.lineTo(head.sx, head.sy);
          ctx.stroke();
        } else {
          ctx.fillStyle = dopplerColor(doppler, alpha);
          if (size <= 2.3) {
            ctx.fillRect(head.sx - size / 2, head.sy - size / 2, size, size);
          } else {
            ctx.beginPath();
            ctx.arc(head.sx, head.sy, size / 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        if (star.mag > 0.88 && depth > 0.5) {
          ctx.fillStyle = dopplerColor(doppler, alpha * 0.14);
          ctx.beginPath();
          ctx.arc(head.sx, head.sy, size * 1.9, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (v > 0.25) {
        const glow = ctx.createRadialGradient(
          cx,
          cy,
          0,
          cx,
          cy,
          Math.max(width, height) * 0.34,
        );
        const intensity = Math.min(0.35, (v - 0.25) * 0.5);
        glow.addColorStop(0, `rgba(180, 226, 255, ${intensity.toFixed(3)})`);
        glow.addColorStop(1, "rgba(180, 226, 255, 0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, width, height);
      }

      if (moving) schedule();
    };

    wakeRef.current = () => {
      dirty = true;
      schedule();
    };

    const onVisibility = () => {
      if (document.hidden) return;
      last = 0;
      dirty = true;
      schedule();
    };

    resize();
    schedule();

    const onLayout = () => {
      dirty = true;
      schedule();
    };
    const observer = new ResizeObserver((entries) => {
      if (entries.some((entry) => entry.target === canvas)) requestResize();
      else onLayout();
    });
    observer.observe(canvas);
    const glass = document.querySelector("[data-starfield-origin]");
    if (glass instanceof HTMLElement) observer.observe(glass);
    const inner = document.querySelector(".bridge-inner");
    if (inner instanceof HTMLElement) observer.observe(inner);
    window.addEventListener("scroll", onLayout, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      wakeRef.current = null;
      window.cancelAnimationFrame(raf);
      window.clearTimeout(resizeTimer);
      observer.disconnect();
      window.removeEventListener("scroll", onLayout);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="starfield" aria-hidden="true" />;
}

export default memo(Starfield);
