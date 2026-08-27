"use client";

import { useId, useState } from "react";

/** Muestra el valor con coma decimal, sin miles, para que coincida con lo que se teclea. */
function formatField(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const compact = Number(value.toPrecision(10));
  const sign = compact < 0 || Object.is(compact, -0) ? "−" : "";
  const abs = Math.abs(compact);
  const raw = abs.toString();
  const plain = raw.includes("e") || raw.includes("E")
    ? abs.toFixed(10).replace(/\.?0+$/, "")
    : raw;
  return `${sign}${plain.replace(".", ",")}`;
}

/** Acepta "0,2", "0.2", "−0,2" y "1.234,5". */
function parseField(raw: string): number {
  const trimmed = raw.trim().replace(/\s/g, "").replace(/−/g, "-");
  if (
    trimmed === "" ||
    trimmed === "-" ||
    trimmed === "," ||
    trimmed === "." ||
    trimmed === "-," ||
    trimmed === "-."
  ) {
    return Number.NaN;
  }
  if (trimmed.includes(",") && trimmed.includes(".")) {
    return Number(trimmed.replace(/\./g, "").replace(",", "."));
  }
  return Number(trimmed.replace(",", "."));
}

/**
 * Campo numérico que respeta lo que el usuario está escribiendo: acepta
 * estados intermedios como "-", "0," o "" mientras el foco está dentro y solo
 * ajusta el valor a los límites al salir.
 */
export default function NumberField({
  value,
  onCommit,
  min,
  max,
  suffix,
  label,
  hint,
  disabled,
}: {
  value: number;
  onCommit: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState(() => formatField(value));
  const [focused, setFocused] = useState(false);
  const [syncedValue, setSyncedValue] = useState(value);

  // Si el valor cambia desde fuera (un preset, el deslizador) mientras el campo
  // no tiene el foco, el texto se pone al día durante el render.
  if (!focused && value !== syncedValue) {
    setSyncedValue(value);
    setText(formatField(value));
  }

  const handleChange = (raw: string) => {
    setText(raw);
    const parsed = parseField(raw);
    if (!Number.isFinite(parsed)) return;
    if (parsed < min || parsed > max) return;
    onCommit(parsed);
  };

  const handleBlur = () => {
    setFocused(false);
    const parsed = parseField(text);
    if (!Number.isFinite(parsed)) {
      setText(formatField(value));
      setSyncedValue(value);
      return;
    }
    const clamped = Math.min(max, Math.max(min, parsed));
    onCommit(clamped);
    setText(formatField(clamped));
    setSyncedValue(clamped);
  };

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="field-input">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={text}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onChange={(event) => handleChange(event.target.value)}
          onBlur={handleBlur}
        />
        {suffix ? <span className="field-suffix">{suffix}</span> : null}
      </div>
      {hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}
