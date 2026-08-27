"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FlightSample, LegResult } from "../lib/relativity";
import { formatDecimal, formatExponential } from "../lib/relativity";

export type ChartAxis = "ship" | "earth";

/**
 * Los gráficos se dibujan con un viewBox del mismo ancho que su contenedor, de
 * modo que un "píxel" del SVG es un píxel real y las etiquetas conservan un
 * tamaño legible lo mismo en un teléfono que en un monitor.
 */
function useMeasuredWidth(fallback: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width ?? 0;
      if (measured > 0) setWidth(measured);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return [min];
  }

  const rawStep = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step =
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) *
    magnitude;

  const ticks: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let value = start; value <= max + step * 0.5; value += step) {
    // El redondeo evita etiquetas del tipo 0.30000000000000004.
    ticks.push(Number(value.toFixed(12)));
  }
  return ticks;
}

function formatTick(value: number, span: number): string {
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1e5 || abs < 1e-3) {
    return formatExponential(value, 0);
  }
  const decimals = span >= 50 ? 0 : span >= 5 ? 1 : span >= 0.5 ? 2 : 3;
  return formatDecimal(value, decimals, abs >= 1000);
}

/** Coordenada SVG como string fija: Node y V8 no serializan el mismo float. */
function px(n: number): string {
  return n.toFixed(3);
}

/** Rango vertical de un panel, con un margen para que la curva respire. */
function panelDomain(values: number[]): [number, number] {
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  if (max === min) return [min - 1, max + 1];
  const pad = (max - min) * 0.08;
  return [min === 0 ? 0 : min - pad, max + pad];
}

type PanelSpec = {
  key: string;
  label: string;
  unit: string;
  color: string;
  value: (sample: FlightSample) => number;
};

const PANELS: PanelSpec[] = [
  {
    key: "x",
    label: "Distancia recorrida",
    unit: "a-l",
    color: "#7ce8ff",
    value: (s) => s.x,
  },
  {
    key: "t",
    label: "Tiempo coordenado",
    unit: "a",
    color: "#ffc46b",
    value: (s) => s.t,
  },
  {
    key: "v",
    label: "Velocidad",
    unit: "c",
    color: "#a0ff9d",
    value: (s) => s.v,
  },
];

export function FlightProfileChart({
  samples,
  legs,
  axis,
  markerX,
}: {
  samples: FlightSample[];
  legs: LegResult[];
  axis: ChartAxis;
  markerX: number | null;
}) {
  const gradientId = useId();
  const { ref, width } = useMeasuredWidth(640);

  const compact = width < 440;
  const padL = compact ? 46 : 68;
  const padR = compact ? 12 : 18;
  const padT = compact ? 14 : 16;
  const padB = compact ? 30 : 34;
  const panelH = compact ? 148 : 176;
  const tickCount = compact ? 4 : 5;

  const axisLabel =
    axis === "ship"
      ? "Tiempo propio de la nave τ [a]"
      : "Tiempo en el planeta t [a]";

  const xs = useMemo(
    () => samples.map((sample) => (axis === "ship" ? sample.tau : sample.t)),
    [samples, axis],
  );

  const xMax = Math.max(...xs, 1e-6);

  const boundaries = useMemo(
    () =>
      legs
        .filter((leg) => leg.status !== "failed")
        .map((leg) => (axis === "ship" ? leg.endTau : leg.endT)),
    [legs, axis],
  );

  const totalHeight = PANELS.length * panelH;
  const scaleX = (value: number) =>
    padL + (value / xMax) * (width - padL - padR);

  return (
    <div ref={ref} className="chart-measure">
      <svg
        className="chart"
        width={width}
        height={totalHeight}
        viewBox={`0 0 ${width} ${totalHeight}`}
        role="img"
        aria-label="Perfil de vuelo: distancia recorrida, tiempo coordenado y velocidad"
      >
        <defs>
          {PANELS.map((panel) => (
            <linearGradient
              key={panel.key}
              id={`${gradientId}-${panel.key}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={panel.color} stopOpacity="0.32" />
              <stop offset="100%" stopColor={panel.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {PANELS.map((panel, panelIndex) => {
          const offsetY = panelIndex * panelH;
          const [yMin, yMax] = panelDomain(samples.map(panel.value));
          const plotTop = offsetY + padT;
          const plotBottom = offsetY + panelH - padB;

          const scaleY = (value: number) =>
            plotBottom -
            ((value - yMin) / (yMax - yMin || 1)) * (plotBottom - plotTop);

          const line = samples
            .map(
              (sample, i) =>
                `${i === 0 ? "M" : "L"}${scaleX(xs[i]).toFixed(2)},${scaleY(
                  panel.value(sample),
                ).toFixed(2)}`,
            )
            .join(" ");

          const baseline = scaleY(Math.max(0, yMin)).toFixed(2);
          const area = `${line} L${scaleX(xMax).toFixed(2)},${baseline} L${scaleX(0).toFixed(2)},${baseline} Z`;

          const yTicks = niceTicks(yMin, yMax, 4);
          const xTicks = niceTicks(0, xMax, tickCount);
          const isLast = panelIndex === PANELS.length - 1;

          return (
            <g key={panel.key}>
              <rect
                x={px(padL)}
                y={px(plotTop)}
                width={px(width - padL - padR)}
                height={px(plotBottom - plotTop)}
                className="chart-plot-bg"
              />

              {yTicks.map((tick) => (
                <g key={`y-${tick}`}>
                  <line
                    x1={px(padL)}
                    x2={px(width - padR)}
                    y1={px(scaleY(tick))}
                    y2={px(scaleY(tick))}
                    className="chart-grid"
                  />
                  <text
                    x={px(padL - 7)}
                    y={px(scaleY(tick))}
                    className="chart-tick chart-tick--y"
                  >
                    {formatTick(tick, yMax - yMin)}
                  </text>
                </g>
              ))}

              {boundaries.slice(0, -1).map((boundary, i) => (
                <line
                  key={`b-${i}`}
                  x1={px(scaleX(boundary))}
                  x2={px(scaleX(boundary))}
                  y1={px(plotTop)}
                  y2={px(plotBottom)}
                  className="chart-leg-line"
                />
              ))}

              <path d={area} fill={`url(#${gradientId}-${panel.key})`} />
              <path
                d={line}
                fill="none"
                stroke={panel.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {markerX !== null && (
                <line
                  x1={px(scaleX(markerX))}
                  x2={px(scaleX(markerX))}
                  y1={px(plotTop)}
                  y2={px(plotBottom)}
                  className="chart-marker"
                />
              )}

              <text x={px(padL)} y={px(offsetY + 11)} className="chart-panel-title">
                {panel.label} [{panel.unit}]
              </text>

              {xTicks.map((tick) => (
                <text
                  key={`x-${tick}`}
                  x={px(scaleX(tick))}
                  y={px(plotBottom + 14)}
                  className="chart-tick chart-tick--x"
                >
                  {formatTick(tick, xMax)}
                </text>
              ))}

              {isLast && (
                <text
                  x={px((padL + width - padR) / 2)}
                  y={px(plotBottom + 28)}
                  className="chart-axis-label"
                >
                  {axisLabel}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function SpacetimeChart({
  samples,
  legs,
  markerX,
}: {
  samples: FlightSample[];
  legs: LegResult[];
  markerX: number | null;
}) {
  const { ref, width } = useMeasuredWidth(460);
  const size = Math.max(240, Math.min(width, 500));
  const compact = size < 380;
  const pad = {
    l: compact ? 44 : 60,
    r: compact ? 14 : 20,
    t: 20,
    b: compact ? 42 : 46,
  };

  const maxT = Math.max(...samples.map((s) => s.t), 1e-6);
  const maxX = Math.max(...samples.map((s) => s.x), 1e-6);
  const span = Math.max(maxT, maxX) * 1.06;

  const scale = (value: number, axis: "x" | "y") =>
    axis === "x"
      ? pad.l + (value / span) * (size - pad.l - pad.r)
      : size - pad.b - (value / span) * (size - pad.t - pad.b);

  const worldline = samples
    .map(
      (s, i) =>
        `${i === 0 ? "M" : "L"}${scale(s.t, "x").toFixed(2)},${scale(s.x, "y").toFixed(2)}`,
    )
    .join(" ");

  const ticks = niceTicks(0, span, compact ? 4 : 5);
  const marker =
    markerX === null
      ? null
      : samples.reduce(
          (best, s) =>
            Math.abs(s.t - markerX) < Math.abs(best.t - markerX) ? s : best,
          samples[0],
        );

  return (
    <div ref={ref} className="chart-measure chart-measure--square">
      <svg
        className="chart"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="Diagrama de espacio-tiempo de la nave"
      >
        <rect
          x={px(pad.l)}
          y={px(pad.t)}
          width={px(size - pad.l - pad.r)}
          height={px(size - pad.t - pad.b)}
          className="chart-plot-bg"
        />

        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={px(pad.l)}
              x2={px(size - pad.r)}
              y1={px(scale(tick, "y"))}
              y2={px(scale(tick, "y"))}
              className="chart-grid"
            />
            <line
              x1={px(scale(tick, "x"))}
              x2={px(scale(tick, "x"))}
              y1={px(pad.t)}
              y2={px(size - pad.b)}
              className="chart-grid"
            />
            <text
              x={px(pad.l - 7)}
              y={px(scale(tick, "y"))}
              className="chart-tick chart-tick--y"
            >
              {formatTick(tick, span)}
            </text>
            <text
              x={px(scale(tick, "x"))}
              y={px(size - pad.b + 14)}
              className="chart-tick chart-tick--x"
            >
              {formatTick(tick, span)}
            </text>
          </g>
        ))}

        <line
          x1={px(scale(0, "x"))}
          y1={px(scale(0, "y"))}
          x2={px(scale(span, "x"))}
          y2={px(scale(span, "y"))}
          className="chart-lightline"
        />
        <text
          x={px(scale(span * 0.62, "x"))}
          y={px(scale(span * 0.62, "y"))}
          dy="-0.7em"
          transform={`rotate(-45 ${px(scale(span * 0.62, "x"))} ${px(scale(span * 0.62, "y"))})`}
          className="chart-lightline-label"
        >
          rayo de luz
        </text>

        {legs
          .filter((leg) => leg.status !== "failed")
          .slice(0, -1)
          .map((leg) => (
            <circle
              key={leg.index}
              cx={px(scale(leg.endT, "x"))}
              cy={px(scale(leg.endX, "y"))}
              r="3.5"
              className="chart-leg-dot"
            />
          ))}

        <path
          d={worldline}
          fill="none"
          stroke="#7ce8ff"
          strokeWidth={2.4}
          strokeLinejoin="round"
        />

        {marker && (
          <circle
            cx={px(scale(marker.t, "x"))}
            cy={px(scale(marker.x, "y"))}
            r="5"
            className="chart-marker-dot"
          />
        )}

        <text
          x={px((pad.l + size - pad.r) / 2)}
          y={px(size - 8)}
          className="chart-axis-label"
        >
          Tiempo coordenado t [a]
        </text>
        <text
          transform={`translate(14 ${px((pad.t + size - pad.b) / 2)}) rotate(-90)`}
          className="chart-axis-label"
        >
          Distancia x [a-l]
        </text>
      </svg>
    </div>
  );
}
