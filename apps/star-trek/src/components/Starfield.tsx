"use client";

import { useEffect, useRef } from "react";

/**
 * Campo estelar visto desde la cabina. Además del efecto de túnel, aplica dos
 * consecuencias reales de viajar a velocidades relativistas:
 *
 *  - Aberración: las estrellas se concentran hacia la dirección de movimiento
 *    siguiendo cos(theta') = (cos theta + v) / (1 + v cos theta).
 *  - Efecto Doppler: la luz de proa se corre al azul y la de popa al rojo, con
 *    el factor D = 1 / [gamma (1 - v cos theta')].
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

/** Color percibido de una estrella según su corrimiento Doppler. */
function dopplerColor(doppler: number, alpha: number): string {
  // doppler > 1 -> azul (proa); doppler < 1 -> rojo (popa).
  const t = Math.max(-1, Math.min(1, Math.log(doppler) / 1.1));
  const r = t >= 0 ? 200 - t * 80 : 255;
  const g = t >= 0 ? 226 - t * 20 : 226 + t * 90;
  const b = t >= 0 ? 255 : 255 + t * 130;
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha.toFixed(3)})`;
}

export default function Starfield({
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

  // El bucle de animación lee estos valores por referencia para no reiniciarse
  // en cada fotograma del reproductor.
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let stars: Star[] = [];
    let frame = 0;
    let last = 0;
    let drift = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const density = Math.round((width * height) / 1100);
      stars = makeStars(Math.max(220, Math.min(1100, density)));
    };

    const paintNebulae = (v: number) => {
      const zoom = 1 + 0.12 * v;
      const shift = (drift * 12) % (height || 1);
      for (const nebula of NEBULAE) {
        const cx = nebula.x * width;
        const cy = ((nebula.y * height - shift) % height + height) % height;
        const radius = nebula.r * Math.max(width, height) * zoom;
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        gradient.addColorStop(0, nebula.color);
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
      }
    };

    const render = (now: number) => {
      const dt = last === 0 ? 0.016 : Math.min(0.05, (now - last) / 1000);
      last = now;

      const signed = Math.max(
        -MAX_VISUAL_SPEED,
        Math.min(MAX_VISUAL_SPEED, speedRef.current),
      );
      const v = Math.abs(signed);
      const direction = signed >= 0 ? 1 : -1;
      const moving = runningRef.current && !reduceMotion;
      const gamma = 1 / Math.sqrt(1 - v * v);

      ctx.fillStyle = "#02040b";
      ctx.fillRect(0, 0, width, height);
      paintNebulae(v);

      const cx = width / 2;
      const cy = height * 0.46;
      const focal = Math.max(width, height) * 0.62;

      // Avance en z: lento en reposo, túnel de luz cerca de c. La aberración
      // (abajo) es independiente: con el cielo congelado las estrellas no
      // recorren z, pero sí se concentran hacia la proa al subir v.
      const zSpeed = (0.12 + 3.4 * v ** 1.6) * direction;
      const trail = Math.min(2.6, Math.abs(zSpeed) * (0.02 + 0.5 * v ** 2.5));
      if (moving) drift += zSpeed * dt * 0.05;

      ctx.lineCap = "round";

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

        const project = (z: number) => {
          const rx = (star.x / z) * focal;
          const ry = (star.y / z) * focal;
          const r = Math.hypot(rx, ry);
          if (r < 1e-6) return { sx: cx, sy: cy, cosTheta: 1 };

          const theta = Math.atan2(r, focal);
          const cosTheta = Math.cos(theta);
          const aberrV = direction * v;
          const cosAberrated = (cosTheta + aberrV) / (1 + aberrV * cosTheta);
          const clamped = Math.max(-1, Math.min(1, cosAberrated));
          const aberrated = Math.acos(clamped);
          const rAberrated = focal * Math.tan(Math.min(aberrated, 1.45));
          const scale = rAberrated / r;
          return {
            sx: cx + rx * scale,
            sy: cy + ry * scale,
            cosTheta: clamped,
          };
        };

        const head = project(star.z);
        if (
          head.sx < -width ||
          head.sx > width * 2 ||
          head.sy < -height ||
          head.sy > height * 2
        ) {
          continue;
        }

        const depth = 1 - (star.z - Z_NEAR) / (Z_FAR - Z_NEAR);
        const doppler = 1 / (gamma * (1 - v * head.cosTheta));
        const boost = Math.min(3.2, doppler ** 1.4);
        const alpha = Math.min(1, star.mag * (0.34 + depth * 0.82) * boost);
        const size = Math.max(0.7, star.mag * (0.8 + depth * 2.1));

        if (v > 0.04 && moving) {
          const tail = project(star.z + trail * direction);
          ctx.strokeStyle = dopplerColor(doppler, alpha * 0.85);
          ctx.lineWidth = size;
          ctx.beginPath();
          ctx.moveTo(tail.sx, tail.sy);
          ctx.lineTo(head.sx, head.sy);
          ctx.stroke();
        } else {
          ctx.fillStyle = dopplerColor(doppler, alpha);
          ctx.beginPath();
          ctx.arc(head.sx, head.sy, size / 2, 0, Math.PI * 2);
          ctx.fill();
        }

        // Las estrellas más brillantes reciben un halo suave.
        if (star.mag > 0.82 && depth > 0.45) {
          ctx.fillStyle = dopplerColor(doppler, alpha * 0.14);
          ctx.beginPath();
          ctx.arc(head.sx, head.sy, size * 1.9, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Resplandor de proa: la aberración concentra la luz hacia adelante.
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

      frame = window.requestAnimationFrame(render);
    };

    resize();
    frame = window.requestAnimationFrame(render);

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="starfield" aria-hidden="true" />;
}
