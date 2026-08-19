"use client";

import { useState } from "react";

type DualRangeSliderProps = {
  id: string;
  min: number;
  max: number;
  step: number;
  minValue: number;
  maxValue: number;
  onMinChange: (value: number) => void;
  onMaxChange: (value: number) => void;
  ariaLabel: string;
};

export function DualRangeSlider({
  id,
  min,
  max,
  step,
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
  ariaLabel,
}: DualRangeSliderProps) {
  const [activeThumb, setActiveThumb] = useState<"min" | "max" | null>(null);
  const span = max - min || 1;
  const minPercent = ((minValue - min) / span) * 100;
  const maxPercent = ((maxValue - min) / span) * 100;

  return (
    <div className="dual-range-slider" id={id}>
      <div className="dual-range-slider__track" aria-hidden="true" />
      <div
        className="dual-range-slider__fill"
        aria-hidden="true"
        style={{
          left: `${minPercent}%`,
          width: `${Math.max(0, maxPercent - minPercent)}%`,
        }}
      />
      <input
        type="range"
        className="dual-range-slider__input dual-range-slider__input--min"
        min={min}
        max={max}
        step={step}
        value={minValue}
        style={{ zIndex: activeThumb === "min" ? 5 : 3 }}
        onPointerDown={() => setActiveThumb("min")}
        onPointerUp={() => setActiveThumb(null)}
        onPointerCancel={() => setActiveThumb(null)}
        onInput={(event) => onMinChange(Number(event.currentTarget.value))}
        onChange={(event) => onMinChange(Number(event.currentTarget.value))}
        aria-label={`${ariaLabel}, mínimo`}
        aria-valuemin={min}
        aria-valuemax={maxValue}
        aria-valuenow={minValue}
      />
      <input
        type="range"
        className="dual-range-slider__input dual-range-slider__input--max"
        min={min}
        max={max}
        step={step}
        value={maxValue}
        style={{ zIndex: activeThumb === "max" ? 5 : 4 }}
        onPointerDown={() => setActiveThumb("max")}
        onPointerUp={() => setActiveThumb(null)}
        onPointerCancel={() => setActiveThumb(null)}
        onInput={(event) => onMaxChange(Number(event.currentTarget.value))}
        onChange={(event) => onMaxChange(Number(event.currentTarget.value))}
        aria-label={`${ariaLabel}, máximo`}
        aria-valuemin={minValue}
        aria-valuemax={max}
        aria-valuenow={maxValue}
      />
    </div>
  );
}
