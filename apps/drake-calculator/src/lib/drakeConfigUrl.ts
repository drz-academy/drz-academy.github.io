export type InputMode = "exact" | "range" | "distribution";
export type SamplingDistribution = "uniform" | "gaussian" | "triangular";
export type DistributionMode = "arms" | "disk" | "ghz";
export type DistanceUnit = "kpc" | "kal" | "al";

export type ParameterKey =
  | "starRate"
  | "planetFraction"
  | "habitablePlanets"
  | "lifeFraction"
  | "intelligenceFraction"
  | "communicationFraction"
  | "lifetimeExponent";

export type DrakeValues = Record<ParameterKey, number>;
export type DrakeRange = { min: number; max: number };
export type DrakeRanges = Record<ParameterKey, DrakeRange>;
export type ParameterDistributions = Record<ParameterKey, SamplingDistribution>;

export type DrakeConfigSnapshot = {
  inputMode: InputMode;
  values: DrakeValues;
  ranges: DrakeRanges;
  parameterDistributions: ParameterDistributions;
  distributionMode: DistributionMode;
  distanceUnit: DistanceUnit;
  radiosphereYears: number;
  distributionSeed: number;
  showRadiosphere: boolean;
  showGhzOverlay: boolean;
};

type ParameterSpec = {
  key: ParameterKey;
  min: number;
  max: number;
  step: number;
  useLifetimeYears?: boolean;
};

const PARAMETER_SPECS: ParameterSpec[] = [
  { key: "starRate", min: 0, max: 10, step: 0.1 },
  { key: "planetFraction", min: 0, max: 1, step: 0.01 },
  { key: "habitablePlanets", min: 0, max: 2, step: 0.01 },
  { key: "lifeFraction", min: 0, max: 1, step: 0.01 },
  { key: "intelligenceFraction", min: 0, max: 1, step: 0.01 },
  { key: "communicationFraction", min: 0, max: 1, step: 0.01 },
  {
    key: "lifetimeExponent",
    min: 0,
    max: 8,
    step: 0.01,
    useLifetimeYears: true,
  },
];

const URL_ROOT_KEYS = new Set([
  "mode",
  "spatial",
  "unit",
  "radio",
  "seed",
  "showRadio",
  "showGhz",
]);

const INPUT_MODES = new Set<InputMode>(["exact", "range", "distribution"]);
const SPATIAL_MODES = new Set<DistributionMode>(["arms", "disk", "ghz"]);
const DISTANCE_UNITS = new Set<DistanceUnit>(["kpc", "kal", "al"]);
const SAMPLING_DISTRIBUTIONS = new Set<SamplingDistribution>([
  "uniform",
  "gaussian",
  "triangular",
]);

function snapToStep(value: number, step: number) {
  const decimals = (step.toString().split(".")[1] ?? "").length;
  return Number((Math.round(value / step) * step).toFixed(decimals));
}

function clampParameter(value: number, spec: ParameterSpec) {
  return snapToStep(
    Math.min(spec.max, Math.max(spec.min, value)),
    spec.step,
  );
}

function parseNumber(raw: string | null) {
  if (raw === null || raw.trim() === "") return null;
  const normalized = raw.trim().replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function parseBoolean(raw: string | null) {
  if (raw === null) return null;
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return null;
}

function lifetimeYearsToExponent(years: number, spec: ParameterSpec) {
  if (years <= 0) return spec.min;
  const exponent = Math.log10(years);
  if (exponent <= spec.min) {
    return clampParameter(spec.step, spec);
  }
  return clampParameter(exponent, spec);
}

function lifetimeExponentToYears(exponent: number) {
  if (exponent <= 0) return 0;
  return 10 ** exponent;
}

function paramUrlKey(spec: ParameterSpec) {
  return spec.useLifetimeYears ? "lifetimeYears" : spec.key;
}

function distUrlKey(spec: ParameterSpec) {
  return `${paramUrlKey(spec)}Dist`;
}

function hasConfigParams(params: URLSearchParams) {
  for (const key of params.keys()) {
    if (URL_ROOT_KEYS.has(key)) return true;
    if (key.endsWith("Min") || key.endsWith("Max") || key.endsWith("Dist")) {
      return true;
    }
    if (PARAMETER_SPECS.some((spec) => paramUrlKey(spec) === key)) return true;
  }
  return false;
}

function readStoredValue(
  params: URLSearchParams,
  spec: ParameterSpec,
  mode: InputMode,
) {
  const urlKey = paramUrlKey(spec);

  if (mode === "exact") {
    const raw = parseNumber(params.get(urlKey));
    if (raw === null) return null;
    if (spec.useLifetimeYears) {
      return lifetimeYearsToExponent(raw, spec);
    }
    return clampParameter(raw, spec);
  }

  const minRaw = parseNumber(params.get(`${urlKey}Min`));
  const maxRaw = parseNumber(params.get(`${urlKey}Max`));
  if (minRaw === null && maxRaw === null) return null;

  let min =
    minRaw === null
      ? spec.min
      : spec.useLifetimeYears
        ? lifetimeYearsToExponent(minRaw, spec)
        : clampParameter(minRaw, spec);
  let max =
    maxRaw === null
      ? spec.max
      : spec.useLifetimeYears
        ? lifetimeYearsToExponent(maxRaw, spec)
        : clampParameter(maxRaw, spec);

  if (min > max) [min, max] = [max, min];
  if (spec.useLifetimeYears && min <= spec.min && max <= spec.min) {
    return { min: spec.min, max: spec.min };
  }
  if (min === max && max < spec.max) {
    max = clampParameter(max + spec.step, spec);
  } else if (min === max && min > spec.min) {
    min = clampParameter(min - spec.step, spec);
  }

  return { min, max };
}

export function parseDrakeConfigFromSearchParams(
  params: URLSearchParams,
): Partial<DrakeConfigSnapshot> | null {
  if (!hasConfigParams(params)) return null;

  const modeRaw = params.get("mode");
  const inputMode: InputMode =
    modeRaw && INPUT_MODES.has(modeRaw as InputMode)
      ? (modeRaw as InputMode)
      : "exact";

  const values = {} as DrakeValues;
  const ranges = {} as DrakeRanges;
  const parameterDistributions = {} as ParameterDistributions;

  for (const spec of PARAMETER_SPECS) {
    const stored = readStoredValue(params, spec, inputMode);

    if (stored === null) continue;

    if (typeof stored === "number") {
      values[spec.key] = stored;
      ranges[spec.key] = { min: stored, max: stored };
      continue;
    }

    ranges[spec.key] = stored;
    values[spec.key] = snapToStep((stored.min + stored.max) / 2, spec.step);

    if (inputMode === "distribution") {
      const distRaw = params.get(distUrlKey(spec));
      parameterDistributions[spec.key] =
        distRaw && SAMPLING_DISTRIBUTIONS.has(distRaw as SamplingDistribution)
          ? (distRaw as SamplingDistribution)
          : "uniform";
    }
  }

  const spatialRaw = params.get("spatial");
  const unitRaw = params.get("unit");
  const radioRaw = parseNumber(params.get("radio"));
  const seedRaw = parseNumber(params.get("seed"));
  const showRadioRaw = parseBoolean(params.get("showRadio"));
  const showGhzRaw = parseBoolean(params.get("showGhz"));

  return {
    inputMode,
    ...(Object.keys(values).length > 0 ? { values } : {}),
    ...(Object.keys(ranges).length > 0 ? { ranges } : {}),
    ...(inputMode === "distribution" && Object.keys(parameterDistributions).length > 0
      ? { parameterDistributions }
      : {}),
    ...(spatialRaw && SPATIAL_MODES.has(spatialRaw as DistributionMode)
      ? { distributionMode: spatialRaw as DistributionMode }
      : {}),
    ...(unitRaw && DISTANCE_UNITS.has(unitRaw as DistanceUnit)
      ? { distanceUnit: unitRaw as DistanceUnit }
      : {}),
    ...(radioRaw !== null && radioRaw > 0 ? { radiosphereYears: radioRaw } : {}),
    ...(seedRaw !== null && seedRaw >= 0
      ? { distributionSeed: Math.round(seedRaw) }
      : {}),
    ...(showRadioRaw !== null ? { showRadiosphere: showRadioRaw } : {}),
    ...(showGhzRaw !== null ? { showGhzOverlay: showGhzRaw } : {}),
  };
}

export function parseDrakeConfigFromSearch(search: string) {
  return parseDrakeConfigFromSearchParams(new URLSearchParams(search));
}

export function buildDrakeConfigSearchParams(
  snapshot: DrakeConfigSnapshot,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("mode", snapshot.inputMode);

  for (const spec of PARAMETER_SPECS) {
    const urlKey = paramUrlKey(spec);

    if (snapshot.inputMode === "exact") {
      const value = snapshot.values[spec.key];
      params.set(
        urlKey,
        spec.useLifetimeYears
          ? String(Math.round(lifetimeExponentToYears(value)))
          : String(value),
      );
      continue;
    }

    const range = snapshot.ranges[spec.key];
    params.set(
      `${urlKey}Min`,
      spec.useLifetimeYears
        ? String(Math.round(lifetimeExponentToYears(range.min)))
        : String(range.min),
    );
    params.set(
      `${urlKey}Max`,
      spec.useLifetimeYears
        ? String(Math.round(lifetimeExponentToYears(range.max)))
        : String(range.max),
    );

    if (snapshot.inputMode === "distribution") {
      params.set(distUrlKey(spec), snapshot.parameterDistributions[spec.key]);
    }
  }

  params.set("spatial", snapshot.distributionMode);
  params.set("unit", snapshot.distanceUnit);
  params.set("radio", String(snapshot.radiosphereYears));
  params.set("seed", String(snapshot.distributionSeed));
  params.set("showRadio", snapshot.showRadiosphere ? "1" : "0");
  params.set("showGhz", snapshot.showGhzOverlay ? "1" : "0");

  return params;
}

export function buildDrakeConfigUrl(
  snapshot: DrakeConfigSnapshot,
  pathname?: string,
): string {
  const params = buildDrakeConfigSearchParams(snapshot);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const path =
    pathname ??
    (typeof window !== "undefined"
      ? window.location.pathname
      : `${basePath}/`);
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://example.com";
  return `${origin}${path}?${params.toString()}`;
}

export function mergeDrakeConfigSnapshot(
  defaults: DrakeConfigSnapshot,
  partial: Partial<DrakeConfigSnapshot>,
): DrakeConfigSnapshot {
  return {
    inputMode: partial.inputMode ?? defaults.inputMode,
    values: { ...defaults.values, ...partial.values },
    ranges: { ...defaults.ranges, ...partial.ranges },
    parameterDistributions: {
      ...defaults.parameterDistributions,
      ...partial.parameterDistributions,
    },
    distributionMode: partial.distributionMode ?? defaults.distributionMode,
    distanceUnit: partial.distanceUnit ?? defaults.distanceUnit,
    radiosphereYears: partial.radiosphereYears ?? defaults.radiosphereYears,
    distributionSeed: partial.distributionSeed ?? defaults.distributionSeed,
    showRadiosphere: partial.showRadiosphere ?? defaults.showRadiosphere,
    showGhzOverlay: partial.showGhzOverlay ?? defaults.showGhzOverlay,
  };
}

let cachedUrlConfig: Partial<DrakeConfigSnapshot> | null | undefined;

export function readDrakeConfigFromUrl(): Partial<DrakeConfigSnapshot> | null {
  if (cachedUrlConfig !== undefined) return cachedUrlConfig;
  if (typeof window === "undefined") {
    cachedUrlConfig = null;
    return null;
  }
  cachedUrlConfig = parseDrakeConfigFromSearch(window.location.search);
  return cachedUrlConfig;
}

export function applyUrlConfigToDefaults(
  defaults: DrakeConfigSnapshot,
): DrakeConfigSnapshot {
  const fromUrl = readDrakeConfigFromUrl();
  return fromUrl ? mergeDrakeConfigSnapshot(defaults, fromUrl) : defaults;
}

export const DRAKE_CONFIG_URL_DOCS = {
  mode: "exact | range | distribution",
  parameters:
    "En exacto: starRate, planetFraction, …, lifetimeYears. En rango/distribución: {param}Min y {param}Max; en distribución también {param}Dist (uniform | gaussian | triangular).",
  spatial: "arms | disk | ghz",
  unit: "kpc | al | kal",
  radio: "años de la radiosfera",
  seed: "semilla del mapa",
  showRadio: "0 | 1",
  showGhz: "0 | 1",
} as const;
