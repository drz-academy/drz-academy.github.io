"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import packageJson from "../../package.json";
import {
  buildDrakeConfigUrl,
  mergeDrakeConfigSnapshot,
  parseDrakeConfigFromSearch,
  type DrakeConfigSnapshot,
} from "../lib/drakeConfigUrl";
import { DualRangeSlider } from "./DualRangeSlider";

type DrakeValues = {
  starRate: number;
  planetFraction: number;
  habitablePlanets: number;
  lifeFraction: number;
  intelligenceFraction: number;
  communicationFraction: number;
  lifetimeExponent: number;
};

type DrakeRange = {
  min: number;
  max: number;
};

type DrakeRanges = Record<keyof DrakeValues, DrakeRange>;

type ParameterKey = keyof DrakeValues;
type InputMode = "exact" | "range" | "distribution";
type SamplingDistribution = "uniform" | "gaussian" | "triangular";
type ParameterDistributions = Record<ParameterKey, SamplingDistribution>;

type ParameterDefinition = {
  key: ParameterKey;
  symbol: string;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
};

// Estimaciones de Drake y colegas en la conferencia de Green Bank (1961).
// Fuente: https://en.wikipedia.org/wiki/Drake_equation#Original_estimates
const DEFAULT_L_YEARS = 100;
const DRAKE_1961_L_MIN_YEARS = 1_000;
const DRAKE_1961_L_MAX_YEARS = 100_000_000;

const INITIAL_VALUES: DrakeValues = {
  starRate: 1,
  planetFraction: 0.35,
  habitablePlanets: 3,
  lifeFraction: 1,
  intelligenceFraction: 1,
  communicationFraction: 0.15,
  lifetimeExponent: Math.log10(DEFAULT_L_YEARS),
};

const INITIAL_RANGES: DrakeRanges = {
  starRate: { min: 1, max: 1 },
  planetFraction: { min: 0.2, max: 0.5 },
  habitablePlanets: { min: 1, max: 5 },
  lifeFraction: { min: 1, max: 1 },
  intelligenceFraction: { min: 1, max: 1 },
  communicationFraction: { min: 0.1, max: 0.2 },
  lifetimeExponent: {
    min: Math.log10(DRAKE_1961_L_MIN_YEARS),
    max: Math.log10(DRAKE_1961_L_MAX_YEARS),
  },
};

const INITIAL_PARAMETER_DISTRIBUTIONS: ParameterDistributions = {
  starRate: "uniform",
  planetFraction: "uniform",
  habitablePlanets: "uniform",
  lifeFraction: "uniform",
  intelligenceFraction: "uniform",
  communicationFraction: "uniform",
  lifetimeExponent: "uniform",
};

const DISTRIBUTION_MONTE_CARLO_SAMPLES = 1024;
const SPATIAL_SEPARATION_MC_MAX = 400;
const DISTRIBUTION_ANALYSIS_BASE_SEED = 9001;
const SAMPLING_DISTRIBUTION_LABELS: Record<SamplingDistribution, string> = {
  uniform: "Uniforme",
  gaussian: "Gaussiana",
  triangular: "Triangular",
};

const formatDecimal = (value: number) =>
  new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(value);

const PARAMETERS: ParameterDefinition[] = [
  {
    key: "starRate",
    symbol: "R★",
    label: "Tasa de formación estelar",
    description: "Estrellas que se forman cada año en la galaxia.",
    min: 0,
    max: 10,
    step: 0.1,
    format: (value) => `${formatDecimal(value)} / año`,
  },
  {
    key: "planetFraction",
    symbol: "fₚ",
    label: "Fracción de estrellas con planetas",
    description: "Fracción de estrellas que poseen sistemas planetarios.",
    min: 0,
    max: 1,
    step: 0.01,
    format: (value) => `${Math.round(value * 100)} %`,
  },
  {
    key: "habitablePlanets",
    symbol: "nₑ",
    label: "Mundos habitables",
    description: "Planetas potencialmente habitables por sistema planetario.",
    min: 0,
    max: 10,
    step: 0.1,
    format: formatDecimal,
  },
  {
    key: "lifeFraction",
    symbol: "fₗ",
    label: "Probabilidad de abiogénesis",
    description: "Fracción de mundos habitables donde aparece la vida.",
    min: 0,
    max: 1,
    step: 0.01,
    format: (value) => `${Math.round(value * 100)} %`,
  },
  {
    key: "intelligenceFraction",
    symbol: "fᵢ",
    label: "Probabilidad de inteligencia",
    description: "Fracción de mundos con vida donde surge inteligencia.",
    min: 0,
    max: 1,
    step: 0.01,
    format: (value) => `${Math.round(value * 100)} %`,
  },
  {
    key: "communicationFraction",
    symbol: "f𝒸",
    label: "Probabilidad de tecnología de comunicaciones",
    description: "Fracción que desarrolla señales detectables a distancia.",
    min: 0,
    max: 1,
    step: 0.01,
    format: (value) => `${Math.round(value * 100)} %`,
  },
  {
    key: "lifetimeExponent",
    symbol: "L",
    label: "Tiempo comunicándose",
    description: "Años durante los cuales una civilización emite señales.",
    min: 1,
    max: 8,
    step: 0.01,
    format: (value) =>
      `${new Intl.NumberFormat("es-CO", {
        maximumSignificantDigits: 3,
      }).format(10 ** value)} años`,
  },
];

const DRAKE_HELP_TERMS = [
  {
    id: "result",
    symbol: "N",
    name: "Civilizaciones comunicantes",
    description:
      "Número estimado de civilizaciones en la Vía Láctea cuyas señales podríamos detectar hoy. Es el resultado de multiplicar todos los factores de la ecuación.",
  },
  {
    id: "starRate",
    symbol: "R★",
    name: "Tasa de formación estelar",
    description:
      "Promedio de estrellas que se forman cada año en la galaxia. A mayor R★, hay más ‘semillas’ donde podrían surgir civilizaciones.",
  },
  {
    id: "planetFraction",
    symbol: "fₚ",
    name: "Fracción de estrellas con planetas",
    description:
      "Fracción de estrellas que poseen al menos un planeta. No basta con que existan estrellas: muchas deben tener sistemas planetarios.",
  },
  {
    id: "habitablePlanets",
    symbol: "nₑ",
    name: "Mundos habitables",
    description:
      "Número promedio de planetas con condiciones adecuadas para la vida por cada sistema planetario.",
  },
  {
    id: "lifeFraction",
    symbol: "fₗ",
    name: "Probabilidad de abiogénesis",
    description:
      "Fracción de esos mundos habitables donde la vida llega a originarse en algún momento de su historia.",
  },
  {
    id: "intelligenceFraction",
    symbol: "fᵢ",
    name: "Probabilidad de inteligencia",
    description:
      "Fracción de mundos con vida en los que aparece una civilización o inteligencia capaz de tecnología.",
  },
  {
    id: "communicationFraction",
    symbol: "f𝒸",
    name: "Probabilidad de tecnología de comunicaciones",
    description:
      "Fracción de civilizaciones inteligentes que desarrollan señales detectables a distancia, como emisiones de radio.",
  },
  {
    id: "lifetimeExponent",
    symbol: "L",
    name: "Tiempo comunicándose",
    description:
      "Años durante los cuales una civilización mantiene señales detectables. Cuanto más breve sea L, menos civilizaciones activas habrá en un momento dado.",
  },
] as const;

function buildDefaultConfigSnapshot(): DrakeConfigSnapshot {
  return {
    inputMode: "exact",
    values: INITIAL_VALUES,
    ranges: INITIAL_RANGES,
    parameterDistributions: INITIAL_PARAMETER_DISTRIBUTIONS,
    distributionMode: DEFAULT_SPATIAL_DISTRIBUTION,
    distanceUnit: DEFAULT_DISTANCE_UNIT,
    radiosphereYears: DEFAULT_RADIOSPHERE_YEARS,
    distributionSeed: 2026,
    showRadiosphere: true,
    showGhzOverlay: false,
  };
}

const MAX_VISIBLE_CIVILIZATIONS = 3000;
const CIVILIZATION_HOVER_TOOLTIP_MAX = 250;
const DEFAULT_RADIOSPHERE_YEARS = 100;
const GALAXY_DISK_RADIUS_KPC = 21.1;
const MILKY_WAY_SCALE_LENGTH_KPC = 3.5;
const MILKY_WAY_BULGE_RADIUS_KPC = 4;
const GHZ_INNER_RADIUS_KPC = 7;
const GHZ_OUTER_RADIUS_KPC = 10;
const GHZ_OUTSIDE_RETENTION = 0.1;
const SVG_GALAXY_MAX_RADIUS = 430;
const SVG_DISK_RADIUS = 474;
const SVG_CENTER = 500;
const SUN_SVG = { x: 683, y: 500 };
const KPC_PER_LIGHT_YEAR = 1 / 3261.56;
const LIGHT_YEARS_PER_KPC = 1 / KPC_PER_LIGHT_YEAR;
const DEFAULT_DISTANCE_UNIT = "al";

type DistanceUnit = "kpc" | "kal" | "al";
type DistributionMode = "arms" | "disk" | "ghz";
const DEFAULT_SPATIAL_DISTRIBUTION: DistributionMode = "ghz";

const HELP_AU_PER_LIGHT_YEAR = 63241;
const HELP_LIGHT_YEARS_PER_KPC = Math.round(LIGHT_YEARS_PER_KPC);
const HELP_AU_PER_KPC = 206_265_000;

const DRAKE_HELP_GUIDE_SECTIONS = [
  {
    id: "distance-units",
    title: "Unidades de distancia",
    paragraphs: [
      <>
        Las estadísticas pueden mostrarse en{" "}
        <strong>kpc</strong> (kiloparsec), <strong>al</strong> (años-luz) o{" "}
        <strong>kal</strong> (kilo-años-luz, 1000 al). La radiósfera se define
        en años; a la velocidad de la luz equivale al mismo número de años-luz.
      </>,
      <>
        <strong>al</strong> (año-luz): distancia que recorre la luz en el
        vacío durante un año juliano (~9,46 × 10¹² km). Equivale aproximadamente
        a {HELP_AU_PER_LIGHT_YEAR.toLocaleString("es-CO")}{" "}
        <abbr title="unidades astronómicas">UA</abbr> (unidades astronómicas).{" "}
        <a
          href="https://es.wikipedia.org/wiki/A%C3%B1o_luz"
          target="_blank"
          rel="noreferrer"
        >
          Más sobre el año-luz
        </a>
        .
      </>,
      <>
        <strong>kpc</strong> (kiloparsec): 1000{" "}
        <a
          href="https://es.wikipedia.org/wiki/Parsec"
          target="_blank"
          rel="noreferrer"
        >
          parsecs
        </a>
        . Un parsec es la distancia a la que 1 UA subtende 1 arcosegundo; por
        definición 1 pc = 206 265 UA, luego 1 kpc ≈{" "}
        {HELP_AU_PER_KPC.toLocaleString("es-CO")} UA. En esta calculadora, 1 kpc
        ≈ {HELP_LIGHT_YEARS_PER_KPC.toLocaleString("es-CO")} al.
      </>,
      <>
        <strong>kal</strong>: kilo-año-luz (10³ al). Es útil para distancias
        galácticas sin manejar números tan grandes como en años-luz sueltos. 1
        kal = 1000 al ≈ 0,31 kpc en las conversiones usadas aquí.
      </>,
      <>
        La{" "}
        <a
          href="https://es.wikipedia.org/wiki/Unidad_astron%C3%B3mica"
          target="_blank"
          rel="noreferrer"
        >
          unidad astronómica (UA)
        </a>{" "}
        es la distancia media Tierra–Sol (~149,6 millones de km) y sirve como
        referencia para comparar escalas planetarias y estelares.
      </>,
    ],
  },
  {
    id: "ghz",
    title: "Zona de habitabilidad galáctica (ZHG)",
    paragraphs: [
      <>
        La{" "}
        <a
          href="https://en.wikipedia.org/wiki/Galactic_habitable_zone"
          target="_blank"
          rel="noreferrer"
        >
          zona de habitabilidad galáctica
        </a>{" "}
        es el anillo de la Vía Láctea donde las condiciones promedio favorecen
        la aparición de vida compleja: lejos del bulbo y del centro (radiación,
        inestabilidades) y no demasiado cerca del borde (poca metalicidad,
        estrellas viejas).
      </>,
      <>
        En esta app el modo <strong>ZHG</strong> coloca preferentemente las
        civilizaciones en un anillo de {GHZ_INNER_RADIUS_KPC}–
        {GHZ_OUTER_RADIUS_KPC} kpc desde el centro galáctico. El Sol (~8,5 kpc)
        cae dentro de esa franja. Fuera del anillo solo se conserva el{" "}
        {Math.round(GHZ_OUTSIDE_RETENTION * 100)} % de los candidatos; hacia el
        centro la retención baja linealmente del {Math.round(GHZ_OUTSIDE_RETENTION * 100)} % en el
        borde interior (7 kpc) al 0 % en el centro.
      </>,
      <>
        No debe confundirse con la{" "}
        <a
          href="https://es.wikipedia.org/wiki/Zona_habitable"
          target="_blank"
          rel="noreferrer"
        >
          zona habitable de un sistema planetario
        </a>
        : la ZHG es una región a escala galáctica, no la distancia a una
        estrella donde puede existir agua líquida.
      </>,
    ],
  },
  {
    id: "parameter-distributions",
    title: "Distribuciones de parámetros",
    paragraphs: [
      <>
        En el modo <strong>Distribución</strong> cada factor de la ecuación se
        muestrea al azar dentro del intervalo del deslizador. Puedes elegir tres
        formas:
      </>,
    ],
    list: [
      <>
        <strong>Uniforme</strong>: cualquier valor en el intervalo es
        equiprobable.{" "}
        <a
          href="https://es.wikipedia.org/wiki/Distribuci%C3%B3n_uniforme_continua"
          target="_blank"
          rel="noreferrer"
        >
          Distribución uniforme continua
        </a>
        .
      </>,
      <>
        <strong>Triangular</strong>: el valor más probable es el centro del
        intervalo; la densidad decrece linealmente hacia los extremos.{" "}
        <a
          href="https://es.wikipedia.org/wiki/Distribuci%C3%B3n_triangular"
          target="_blank"
          rel="noreferrer"
        >
          Distribución triangular
        </a>
        .
      </>,
      <>
        <strong>Gaussiana (normal)</strong>: la media coincide con el centro del
        intervalo y 1 σ es la mitad del ancho; la curva se trunca en los
        límites del deslizador.{" "}
        <a
          href="https://es.wikipedia.org/wiki/Distribuci%C3%B3n_normal"
          target="_blank"
          rel="noreferrer"
        >
          Distribución normal
        </a>
        .
      </>,
    ],
    afterListId: "confidence-interval",
    afterList: (
      <>
        El número de civilizaciones <strong>N</strong> en modo Distribución se
        resume con promedio e intervalo del 95 % mediante simulación Monte
        Carlo.{" "}
        <a
          href="https://es.wikipedia.org/wiki/M%C3%A9todo_de_Monte_Carlo"
          target="_blank"
          rel="noreferrer"
        >
          Método de Monte Carlo
        </a>
        .
      </>
    ),
  },
  {
    id: "stellar-disk",
    title: "Distribución estelar en el disco",
    paragraphs: [
      <>
        Las posiciones en el mapa no son uniformes en área: siguen un disco
        exponencial de la forma Σ(<i>R</i>) ∝ <i>R</i> e<sup>−<i>R</i>/<i>h</i></sup>,
        con escala <i>h</i> ≈ {MILKY_WAY_SCALE_LENGTH_KPC} kpc, como en modelos
        habituales del{" "}
        <a
          href="https://es.wikipedia.org/wiki/Disco_gal%C3%A1ctico"
          target="_blank"
          rel="noreferrer"
        >
          disco galáctico
        </a>
        . Hay más estrellas hacia el interior que hacia el borde exterior.
      </>,
      <>
        Para cada civilización se elige un radio <i>R</i> mediante muestreo por
        rechazo acorde a esa ley (hasta {GALAXY_DISK_RADIUS_KPC} kpc) y un
        ángulo aleatorio uniforme en [0, 2π), lo que reparte puntos en anillos
        con densidad radial realista.
      </>,
      <>
        En el modo <strong>Brazos</strong>, dentro del bulbo (~
        {MILKY_WAY_BULGE_RADIUS_KPC} kpc) se mantiene solo la densidad radial; fuera
        del bulbo los puntos se agrupan en cuatro brazos espirales logarítmicos
        superpuestos a ese perfil. El modo <strong>Disco</strong> ignora los
        brazos y usa únicamente el perfil radial en todo el disco.
      </>,
      <>
        La imagen de fondo es una vista cenital de la Vía Láctea (
        <a
          href="https://milkyway-plot.readthedocs.io/"
          target="_blank"
          rel="noreferrer"
        >
          mw-plot
        </a>
        , NASA/JPL-Caltech/R. Hurt). Las estadísticas de separación y
        probabilidad en la radiosfera se calculan según el modo espacial
        elegido (disco, ZHG o brazos).
      </>,
    ],
  },
] as const;

const DRAKE_HELP_IA_DISCLOSURE = [
  <>
    Esta aplicación fue{" "}
    <strong>
      desarrollada con asistencia de agentes de inteligencia artificial
    </strong>{" "}
    (codificación, documentación, iteración de interfaz y corrección de errores).
  </>,
  <>
    Sin embargo, el <strong>diseño conceptual</strong>, la{" "}
    <strong>concepción de las opciones</strong> (modos Exacto/Rango/Distribución,
    distribuciones espaciales Disco/Brazos/ZHG, tipos de distribución de
    parámetros, estadísticas mostradas, panel de ayuda contextual), las{" "}
    <strong>decisiones científicas y pedagógicas</strong> y la{" "}
    <strong>interpretación de los resultados</strong> son responsabilidad del
    autor, <strong>Jorge I. Zuluaga</strong>.
  </>,
  <>
    Los agentes de IA actuaron como herramientas de implementación bajo dirección
    humana; no sustituyen el criterio del autor sobre el modelo ni sobre la
    experiencia de uso.
  </>,
] as const;

type SidePanel = "stats" | "config" | "help" | null;

type CivilizationPosition = {
  x: number;
  y: number;
  radius: number;
  opacity: number;
};

type CivilizationHoverStats = {
  distanceToSunKpc: number;
  distanceToCenterKpc: number;
  nearestNeighborKpc: number | null;
};

type MapHoverStats = {
  civilizations: CivilizationHoverStats[];
  sun: CivilizationHoverStats;
};

type MapHoverTarget =
  | { kind: "civilization"; index: number }
  | { kind: "sun" };

type DerivedStats = {
  meanSeparationKpc: number | null;
  meanSeparationLy: number | null;
  sampleMeanSeparationKpc: number | null;
  radiosphereRadiusLy: number;
  radiosphereRadiusKpc: number;
  radiosphereInGalaxy: boolean;
  probabilityWithinRadiosphere: number;
  nearestNeighborFromSunKpc: number | null;
};

type NumericDistributionSummary = {
  mean: number;
  lower95: number;
  upper95: number;
};

type DistributionAnalysis = {
  civilization: NumericDistributionSummary;
  meanSeparationKpc: NumericDistributionSummary | null;
  meanSeparationLy: NumericDistributionSummary | null;
  probabilityWithinRadiosphere: NumericDistributionSummary;
};

function snapToStep(value: number, step: number) {
  const decimals = (step.toString().split(".")[1] ?? "").length;
  return Number((Math.round(value / step) * step).toFixed(decimals));
}

function clampToParameter(value: number, parameter: ParameterDefinition) {
  return snapToStep(
    Math.min(parameter.max, Math.max(parameter.min, value)),
    parameter.step,
  );
}

function rangesFromExactValues(values: DrakeValues): DrakeRanges {
  const ranges = {} as DrakeRanges;

  for (const parameter of PARAMETERS) {
    const exact = values[parameter.key];
    let min = clampToParameter(exact * 0.95, parameter);
    let max = clampToParameter(exact * 1.05, parameter);

    if (min > max) {
      [min, max] = [max, min];
    }

    if (min === max) {
      if (max < parameter.max) {
        max = clampToParameter(max + parameter.step, parameter);
      } else if (min > parameter.min) {
        min = clampToParameter(min - parameter.step, parameter);
      }
    }

    ranges[parameter.key] = { min, max };
  }

  return ranges;
}

function sampleTriangular(min: number, max: number, random: () => number) {
  const mode = (min + max) / 2;
  const span = max - min;
  if (span <= 0) return min;

  const u = random();
  const relativeMode = (mode - min) / span;

  if (u < relativeMode) {
    return min + Math.sqrt(u * span * (mode - min));
  }

  return max - Math.sqrt((1 - u) * span * (max - mode));
}

function sampleTruncatedGaussian(
  mean: number,
  sigma: number,
  lower: number,
  upper: number,
  random: () => number,
) {
  if (sigma <= 0) {
    return Math.min(upper, Math.max(lower, mean));
  }

  for (let attempt = 0; attempt < 64; attempt += 1) {
    const u1 = Math.max(random(), Number.EPSILON);
    const u2 = random();
    const z =
      Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const value = mean + sigma * z;

    if (value >= lower && value <= upper) {
      return value;
    }
  }

  return Math.min(upper, Math.max(lower, mean));
}

function sampleParameterValue(
  bounds: DrakeRange,
  distribution: SamplingDistribution,
  parameter: ParameterDefinition,
  random: () => number,
) {
  const { min, max } = bounds;

  switch (distribution) {
    case "uniform":
      return clampToParameter(min + random() * (max - min), parameter);
    case "triangular":
      return clampToParameter(sampleTriangular(min, max, random), parameter);
    case "gaussian": {
      const mean = (min + max) / 2;
      const sigma = (max - min) / 2;
      return clampToParameter(
        sampleTruncatedGaussian(mean, sigma, min, max, random),
        parameter,
      );
    }
  }
}

function sampleDrakeValues(
  bounds: DrakeRanges,
  distributions: ParameterDistributions,
  seed: number,
): DrakeValues {
  const random = mulberry32(seed);
  const values = {} as DrakeValues;

  for (const parameter of PARAMETERS) {
    values[parameter.key] = sampleParameterValue(
      bounds[parameter.key],
      distributions[parameter.key],
      parameter,
      random,
    );
  }

  return values;
}

function computeLifetimeYears(values: DrakeValues) {
  return 10 ** values.lifetimeExponent;
}

function computeCivilizationEstimate(values: DrakeValues) {
  return (
    values.starRate *
    values.planetFraction *
    values.habitablePlanets *
    values.lifeFraction *
    values.intelligenceFraction *
    values.communicationFraction *
    computeLifetimeYears(values)
  );
}

function valuesFromBounds(bounds: DrakeRanges, pick: "min" | "max"): DrakeValues {
  return {
    starRate: bounds.starRate[pick],
    planetFraction: bounds.planetFraction[pick],
    habitablePlanets: bounds.habitablePlanets[pick],
    lifeFraction: bounds.lifeFraction[pick],
    intelligenceFraction: bounds.intelligenceFraction[pick],
    communicationFraction: bounds.communicationFraction[pick],
    lifetimeExponent: bounds.lifetimeExponent[pick],
  };
}

function formatRange<T>(
  min: T,
  max: T,
  formatter: (value: T) => string,
) {
  const minText = formatter(min);
  const maxText = formatter(max);
  return minText === maxText ? minText : `${minText} – ${maxText}`;
}

function formatNullableRange(
  min: number | null,
  max: number | null,
  formatter: (value: number | null) => string,
) {
  if (min === null && max === null) return "—";
  return formatRange(min, max, (value) => formatter(value));
}

function svgToKpc(x: number, y: number) {
  const scale = GALAXY_DISK_RADIUS_KPC / SVG_DISK_RADIUS;
  return {
    x: (x - SVG_CENTER) * scale,
    y: (y - SVG_CENTER) * scale,
  };
}

function computeMeanNearestNeighborKpc(
  positions: CivilizationPosition[],
): number | null {
  if (positions.length < 2) return null;

  const points = positions.map((position) => svgToKpc(position.x, position.y));
  let nearestSum = 0;

  for (let index = 0; index < points.length; index += 1) {
    let nearest = Number.POSITIVE_INFINITY;
    for (let other = 0; other < points.length; other += 1) {
      if (other === index) continue;
      const distance = Math.hypot(
        points[index].x - points[other].x,
        points[index].y - points[other].y,
      );
      nearest = Math.min(nearest, distance);
    }
    nearestSum += nearest;
  }

  return nearestSum / points.length;
}

function computeNearestNeighborFromSunKpc(
  positions: CivilizationPosition[],
): number | null {
  if (positions.length === 0) return null;

  const sun = svgToKpc(SUN_SVG.x, SUN_SVG.y);
  return positions.reduce((nearest, position) => {
    const point = svgToKpc(position.x, position.y);
    const distance = Math.hypot(point.x - sun.x, point.y - sun.y);
    return Math.min(nearest, distance);
  }, Number.POSITIVE_INFINITY);
}

function computeMapHoverStats(positions: CivilizationPosition[]): MapHoverStats {
  const civilizationPoints = positions.map((position) =>
    svgToKpc(position.x, position.y),
  );
  const sun = svgToKpc(SUN_SVG.x, SUN_SVG.y);
  const sunDistanceToCenterKpc = Math.hypot(sun.x, sun.y);

  const civilizations = civilizationPoints.map((point, index) => {
    const distanceToSunKpc = Math.hypot(point.x - sun.x, point.y - sun.y);
    const distanceToCenterKpc = Math.hypot(point.x, point.y);

    let nearestNeighborKpc = distanceToSunKpc;

    for (let other = 0; other < civilizationPoints.length; other += 1) {
      if (other === index) continue;
      nearestNeighborKpc = Math.min(
        nearestNeighborKpc,
        Math.hypot(
          point.x - civilizationPoints[other].x,
          point.y - civilizationPoints[other].y,
        ),
      );
    }

    return {
      distanceToSunKpc,
      distanceToCenterKpc,
      nearestNeighborKpc,
    };
  });

  const sunNearestNeighborKpc =
    civilizationPoints.length === 0
      ? null
      : civilizationPoints.reduce((nearest, point) => {
          const distance = Math.hypot(point.x - sun.x, point.y - sun.y);
          return Math.min(nearest, distance);
        }, Number.POSITIVE_INFINITY);

  return {
    civilizations,
    sun: {
      distanceToSunKpc: 0,
      distanceToCenterKpc: sunDistanceToCenterKpc,
      nearestNeighborKpc: sunNearestNeighborKpc,
    },
  };
}

function computeDerivedStats(
  civilizationEstimate: number,
  radiosphereYears: number,
  positions: CivilizationPosition[],
  distributionMode: DistributionMode,
  analysisSeed: number,
): DerivedStats {
  const radiosphereRadiusLy = radiosphereYears;
  const radiosphereRadiusKpc = radiosphereRadiusLy * KPC_PER_LIGHT_YEAR;
  const radiosphereInGalaxy = radiosphereRadiusKpc <= GALAXY_DISK_RADIUS_KPC;

  const theoretical = computeTheoreticalSpatialStats(
    civilizationEstimate,
    radiosphereRadiusKpc,
    distributionMode,
    analysisSeed,
  );

  return {
    meanSeparationKpc: theoretical.meanSeparationKpc,
    meanSeparationLy: theoretical.meanSeparationLy,
    sampleMeanSeparationKpc: computeMeanNearestNeighborKpc(positions),
    radiosphereRadiusLy,
    radiosphereRadiusKpc,
    radiosphereInGalaxy,
    probabilityWithinRadiosphere: theoretical.probabilityWithinRadiosphere,
    nearestNeighborFromSunKpc: computeNearestNeighborFromSunKpc(positions),
  };
}

function kpcToDistanceUnit(valueKpc: number, unit: DistanceUnit) {
  switch (unit) {
    case "kpc":
      return valueKpc;
    case "al":
      return valueKpc * LIGHT_YEARS_PER_KPC;
    case "kal":
      return (valueKpc * LIGHT_YEARS_PER_KPC) / 1000;
  }
}

function formatDistanceFromKpc(valueKpc: number | null, unit: DistanceUnit) {
  if (valueKpc === null) return "—";

  if (unit === "kpc") {
    if (valueKpc < 0.01) {
      return `${formatDecimal(valueKpc * 1000)} pc`;
    }
    if (valueKpc >= 100) {
      return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(valueKpc)} kpc`;
    }
    return `${formatDecimal(valueKpc)} kpc`;
  }

  const converted = kpcToDistanceUnit(valueKpc, unit);
  const label = unit;

  if (unit === "al") {
    return `${new Intl.NumberFormat("es-CO", {
      maximumSignificantDigits: 3,
    }).format(converted)} ${label}`;
  }

  if (converted >= 100) {
    return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(converted)} ${label}`;
  }
  if (converted >= 1) {
    return `${formatDecimal(converted)} ${label}`;
  }
  return `${new Intl.NumberFormat("es-CO", {
    maximumSignificantDigits: 3,
  }).format(converted)} ${label}`;
}

function formatPercent(value: number) {
  if (value <= 0) return "0 %";
  if (value < 0.0001) {
    return `${new Intl.NumberFormat("es-CO", {
      maximumSignificantDigits: 2,
    }).format(value * 100)} %`;
  }
  return `${formatDecimal(value * 100)} %`;
}

function mulberry32(seed: number) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function roundCivilizations(value: number) {
  return Math.max(0, Math.round(value));
}

function formatCivilizations(value: number) {
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 0,
  }).format(roundCivilizations(value));
}

function percentile(sorted: number[], probability: number) {
  if (sorted.length === 0) return 0;
  const index = probability * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function summarizeSamples(samples: number[]): NumericDistributionSummary {
  const sorted = [...samples].sort((left, right) => left - right);
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  return {
    mean,
    lower95: percentile(sorted, 0.025),
    upper95: percentile(sorted, 0.975),
  };
}

function estimateDistributionAnalysis(
  bounds: DrakeRanges,
  distributions: ParameterDistributions,
  radiosphereYears: number,
  spatialMode: DistributionMode,
): DistributionAnalysis {
  const civilizationSamples: number[] = [];

  for (let index = 0; index < DISTRIBUTION_MONTE_CARLO_SAMPLES; index += 1) {
    const values = sampleDrakeValues(
      bounds,
      distributions,
      DISTRIBUTION_ANALYSIS_BASE_SEED + index * 9973,
    );
    civilizationSamples.push(computeCivilizationEstimate(values));
  }

  const civilization = summarizeSamples(civilizationSamples);
  const minN = roundCivilizations(civilization.lower95);
  const maxN = roundCivilizations(civilization.upper95);
  const meanN = roundCivilizations(civilization.mean);

  const statsAtMinN = computeDerivedStats(
    minN,
    radiosphereYears,
    [],
    spatialMode,
    DISTRIBUTION_ANALYSIS_BASE_SEED + 1,
  );
  const statsAtMaxN = computeDerivedStats(
    maxN,
    radiosphereYears,
    [],
    spatialMode,
    DISTRIBUTION_ANALYSIS_BASE_SEED + 2,
  );
  const statsAtMeanN = computeDerivedStats(
    meanN,
    radiosphereYears,
    [],
    spatialMode,
    DISTRIBUTION_ANALYSIS_BASE_SEED + 3,
  );

  const meanSeparationKpc =
    statsAtMeanN.meanSeparationKpc !== null &&
    statsAtMinN.meanSeparationKpc !== null &&
    statsAtMaxN.meanSeparationKpc !== null
      ? {
          mean: statsAtMeanN.meanSeparationKpc,
          lower95: statsAtMaxN.meanSeparationKpc,
          upper95: statsAtMinN.meanSeparationKpc,
        }
      : null;

  const meanSeparationLy =
    statsAtMeanN.meanSeparationLy !== null &&
    statsAtMinN.meanSeparationLy !== null &&
    statsAtMaxN.meanSeparationLy !== null
      ? {
          mean: statsAtMeanN.meanSeparationLy,
          lower95: statsAtMaxN.meanSeparationLy,
          upper95: statsAtMinN.meanSeparationLy,
        }
      : null;

  return {
    civilization,
    meanSeparationKpc,
    meanSeparationLy,
    probabilityWithinRadiosphere: {
      mean: statsAtMeanN.probabilityWithinRadiosphere,
      lower95: statsAtMinN.probabilityWithinRadiosphere,
      upper95: statsAtMaxN.probabilityWithinRadiosphere,
    },
  };
}

function formatDistributionInterval(
  summary: NumericDistributionSummary,
  formatter: (value: number) => string,
) {
  return `${formatter(summary.lower95)} – ${formatter(summary.upper95)}`;
}

function parseRadiosphereYears(raw: string) {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function sampleExponentialDiskRadius(
  random: () => number,
  scaleLength: number,
  maxRadius: number,
) {
  if (maxRadius <= 0) return 0;
  if (scaleLength <= 0) return random() * maxRadius;

  const peak = scaleLength * Math.exp(-1);

  for (let attempt = 0; attempt < 64; attempt += 1) {
    const radius = random() * maxRadius;
    if (random() * peak <= radius * Math.exp(-radius / scaleLength)) {
      return radius;
    }
  }

  return Math.min(maxRadius, scaleLength);
}

function svgRadiusToKpc(radius: number) {
  return (radius / SVG_GALAXY_MAX_RADIUS) * GALAXY_DISK_RADIUS_KPC;
}

function kpcToDiskSvgRadius(radiusKpc: number) {
  return (radiusKpc / GALAXY_DISK_RADIUS_KPC) * SVG_DISK_RADIUS;
}

const GHZ_INNER_SVG_RADIUS = kpcToDiskSvgRadius(GHZ_INNER_RADIUS_KPC);
const GHZ_OUTER_SVG_RADIUS = kpcToDiskSvgRadius(GHZ_OUTER_RADIUS_KPC);

function kpcToSvgRadius(radiusKpc: number) {
  return (radiusKpc / GALAXY_DISK_RADIUS_KPC) * SVG_GALAXY_MAX_RADIUS;
}

function ghzRetentionProbability(radius: number) {
  const radiusKpc = svgRadiusToKpc(radius);

  if (radiusKpc >= GHZ_INNER_RADIUS_KPC && radiusKpc <= GHZ_OUTER_RADIUS_KPC) {
    return 1;
  }

  if (radiusKpc < GHZ_INNER_RADIUS_KPC) {
    return GHZ_OUTSIDE_RETENTION * (radiusKpc / GHZ_INNER_RADIUS_KPC);
  }

  return GHZ_OUTSIDE_RETENTION;
}

function shouldKeepGhzCandidate(radius: number, random: () => number) {
  return random() < ghzRetentionProbability(radius);
}

function createCivilizationPosition(
  r: number,
  angle: number,
  random: () => number,
): CivilizationPosition {
  return {
    x: Math.round((500 + r * Math.cos(angle)) * 10) / 10,
    y: Math.round((500 + r * Math.sin(angle) * 0.93) * 10) / 10,
    radius: Math.round((1.6 + random() * 1.7) * 10) / 10,
    opacity: Math.round((0.55 + random() * 0.45) * 100) / 100,
  };
}

function sampleDiskPosition(
  random: () => number,
  scaleLength: number,
  maxRadius: number,
) {
  return {
    r: sampleExponentialDiskRadius(random, scaleLength, maxRadius),
    angle: random() * Math.PI * 2,
  };
}

function buildGhzCivilizationPositions(
  count: number,
  seed: number,
  scaleLength: number,
  maxRadius: number,
) {
  const positions: CivilizationPosition[] = [];
  let attempt = 0;
  const maxAttempts = Math.max(count * 1000, 2000);

  while (positions.length < count && attempt < maxAttempts) {
    const random = mulberry32(seed + count * 7919 + attempt * 1337);
    const { r, angle } = sampleDiskPosition(random, scaleLength, maxRadius);

    if (shouldKeepGhzCandidate(r, random)) {
      positions.push(createCivilizationPosition(r, angle, random));
    }

    attempt += 1;
  }

  const innerSvg = kpcToSvgRadius(GHZ_INNER_RADIUS_KPC);
  const outerSvg = kpcToSvgRadius(GHZ_OUTER_RADIUS_KPC);

  while (positions.length < count) {
    const random = mulberry32(seed + count * 7919 + attempt * 1337);
    attempt += 1;
    let placed = false;

    for (let trial = 0; trial < 64; trial += 1) {
      const candidate = sampleExponentialDiskRadius(random, scaleLength, maxRadius);
      if (candidate >= innerSvg && candidate <= outerSvg) {
        positions.push(
          createCivilizationPosition(
            candidate,
            random() * Math.PI * 2,
            random,
          ),
        );
        placed = true;
        break;
      }
    }

    if (!placed) {
      positions.push(
        createCivilizationPosition(
          (innerSvg + outerSvg) / 2,
          random() * Math.PI * 2,
          random,
        ),
      );
    }
  }

  return positions;
}

function buildCivilizationPositions(
  count: number,
  seed: number,
  mode: DistributionMode,
) {
  const maxRadius = SVG_GALAXY_MAX_RADIUS;
  const scaleLength =
    (MILKY_WAY_SCALE_LENGTH_KPC / GALAXY_DISK_RADIUS_KPC) * maxRadius;
  const bulgeRadius =
    (MILKY_WAY_BULGE_RADIUS_KPC / GALAXY_DISK_RADIUS_KPC) * maxRadius;

  if (mode === "ghz") {
    return buildGhzCivilizationPositions(count, seed, scaleLength, maxRadius);
  }

  return Array.from({ length: count }, (_, index) => {
    let r: number;
    let angle: number;
    const random = mulberry32(seed + count * 7919 + index * 1337);
    const baseRadius = sampleExponentialDiskRadius(random, scaleLength, maxRadius);
    const inBulge = baseRadius <= bulgeRadius;

    if (mode === "disk" || inBulge) {
      r = baseRadius;
      angle = random() * Math.PI * 2;
    } else {
      const arm = index % 4;
      const armAngle = arm * (Math.PI / 2) - baseRadius * 0.013;
      angle = armAngle + (random() - 0.5) * 0.7;
      r = Math.max(0, Math.min(maxRadius, baseRadius + (random() - 0.5) * 38));
    }

    return createCivilizationPosition(r, angle, random);
  });
}

function computeTheoreticalSpatialStats(
  civilizationEstimate: number,
  radiosphereRadiusKpc: number,
  distributionMode: DistributionMode,
  analysisSeed: number,
) {
  if (civilizationEstimate <= 0) {
    return {
      meanSeparationKpc: null,
      meanSeparationLy: null,
      probabilityWithinRadiosphere: 0,
    };
  }

  if (!radiosphereInGalaxyRadius(radiosphereRadiusKpc)) {
    const meanSeparationKpc = computeScaledMeanSeparation(
      civilizationEstimate,
      distributionMode,
      analysisSeed,
    );
    return {
      meanSeparationKpc,
      meanSeparationLy:
        meanSeparationKpc === null
          ? null
          : meanSeparationKpc / KPC_PER_LIGHT_YEAR,
      probabilityWithinRadiosphere: 1,
    };
  }

  const meanSeparationKpc = computeScaledMeanSeparation(
    civilizationEstimate,
    distributionMode,
    analysisSeed,
  );

  const singleHitProbability = estimateRadiosphereHitProbability(
    radiosphereRadiusKpc,
    distributionMode,
  );

  return {
    meanSeparationKpc,
    meanSeparationLy:
      meanSeparationKpc === null
        ? null
        : meanSeparationKpc / KPC_PER_LIGHT_YEAR,
    probabilityWithinRadiosphere:
      1 - Math.exp(-civilizationEstimate * singleHitProbability),
  };
}

function radiosphereInGalaxyRadius(radiosphereRadiusKpc: number) {
  return radiosphereRadiusKpc <= GALAXY_DISK_RADIUS_KPC;
}

function computeScaledMeanSeparation(
  civilizationEstimate: number,
  distributionMode: DistributionMode,
  analysisSeed: number,
) {
  if (civilizationEstimate <= 1) return null;

  const sampleCount = Math.min(
    Math.max(civilizationEstimate, 80),
    SPATIAL_SEPARATION_MC_MAX,
  );
  const samplePositions = buildCivilizationPositions(
    sampleCount,
    analysisSeed + 5101,
    distributionMode,
  );
  let meanSeparationKpc = computeMeanNearestNeighborKpc(samplePositions);

  if (meanSeparationKpc !== null && sampleCount !== civilizationEstimate) {
    meanSeparationKpc *= Math.sqrt(sampleCount / civilizationEstimate);
  }

  return meanSeparationKpc;
}

function estimateRadiosphereHitProbability(
  radiosphereRadiusKpc: number,
  distributionMode: DistributionMode,
) {
  if (radiosphereRadiusKpc <= 0) return 0;

  const sun = svgToKpc(SUN_SVG.x, SUN_SVG.y);
  return estimateRadiosphereHitProbabilityAnalytic(
    radiosphereRadiusKpc,
    distributionMode,
    sun,
  );
}

function exponentialDiskRadialIntegral(
  minRadiusKpc: number,
  maxRadiusKpc: number,
  scaleLength: number,
) {
  const antiderivative = (radius: number) => {
    const decay = Math.exp(-radius / scaleLength);
    return -scaleLength * (radius + scaleLength) * decay + scaleLength ** 2;
  };

  return antiderivative(maxRadiusKpc) - antiderivative(minRadiusKpc);
}

function radialDensityAt(radiusKpc: number, scaleLength: number) {
  return radiusKpc * Math.exp(-radiusKpc / scaleLength);
}

function estimateRadiosphereHitProbabilityAnalytic(
  radiosphereRadiusKpc: number,
  distributionMode: DistributionMode,
  sun: { x: number; y: number },
) {
  const circleArea = Math.PI * radiosphereRadiusKpc ** 2;
  const scaleLength = MILKY_WAY_SCALE_LENGTH_KPC;
  const sunRadiusKpc = Math.hypot(sun.x, sun.y);
  const radialAtSun = radialDensityAt(sunRadiusKpc, scaleLength);
  const diskRadialIntegral = exponentialDiskRadialIntegral(
    0,
    GALAXY_DISK_RADIUS_KPC,
    scaleLength,
  );
  const diskArea = Math.PI * GALAXY_DISK_RADIUS_KPC ** 2;

  if (distributionMode === "ghz") {
    const annulusRadialIntegral = exponentialDiskRadialIntegral(
      GHZ_INNER_RADIUS_KPC,
      GHZ_OUTER_RADIUS_KPC,
      scaleLength,
    );
    const sunInAnnulus =
      sunRadiusKpc >= GHZ_INNER_RADIUS_KPC &&
      sunRadiusKpc <= GHZ_OUTER_RADIUS_KPC;

    if (
      !sunInAnnulus ||
      annulusRadialIntegral <= 0 ||
      diskRadialIntegral <= 0
    ) {
      return (
        GHZ_OUTSIDE_RETENTION *
        (radialAtSun / diskRadialIntegral) *
        circleArea
      );
    }

    // 90 % en el anillo (densidad local en el Sol) + 10 % en el disco completo.
    return (
      (0.9 * (radialAtSun / annulusRadialIntegral) +
        0.1 * (radialAtSun / diskRadialIntegral)) *
      circleArea
    );
  }

  if (distributionMode === "disk") {
    if (diskRadialIntegral <= 0) {
      return circleArea / diskArea;
    }

    return (radialAtSun / diskRadialIntegral) * circleArea;
  }

  return circleArea / diskArea;
}

function spatialDistributionStatsNote(mode: DistributionMode) {
  switch (mode) {
    case "ghz":
      return "Estimación para la ZHG (7–10 kpc): 10 % fuera del anillo y gradiente lineal del 10 % al 0 % del borde interior al centro.";
    case "disk":
      return "Estimación para la densidad radial exponencial del disco galáctico.";
    default:
      return "Estimación para bulbo radial y brazos espirales fuera del bulbo.";
  }
}

function spatialDistributionSampleNote(mode: DistributionMode) {
  switch (mode) {
    case "ghz":
      return "Promedio del vecino más cercano en la muestra del mapa (ZHG).";
    case "disk":
      return "Promedio del vecino más cercano en la muestra del mapa (disco).";
    default:
      return "Promedio del vecino más cercano en la muestra del mapa (brazos).";
  }
}

const GITHUB_APP_URL =
  process.env.NEXT_PUBLIC_GITHUB_APP_URL ??
  "https://github.com/seap-udea/seap-udea.github.io/tree/main/apps/drake-calculator";

const SCENARIOS_README_URL = `${GITHUB_APP_URL.replace("/tree/", "/blob/")}/README.md#escenarios-de-ejemplo`;

const WHATSNEW_URL = `${GITHUB_APP_URL.replace("/tree/", "/blob/")}/WHATSNEW.md`;

function formatLastPushDate(isoDate: string) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Bogota",
  }).format(date);
}

function SidePanelHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="side-panel-header">
      <h3>{title}</h3>
      <button
        type="button"
        className="side-panel-close"
        aria-label={`Cerrar ${title.toLowerCase()}`}
        onClick={onClose}
      >
        ×
      </button>
    </div>
  );
}

function CivilizationMapTooltip({
  stats,
  anchorX,
  anchorY,
  formatDistance,
}: {
  stats: CivilizationHoverStats;
  anchorX: number;
  anchorY: number;
  formatDistance: (valueKpc: number | null) => string;
}) {
  return (
    <div
      className="civilization-tooltip"
      style={{ left: `${anchorX / 10}%`, top: `${anchorY / 10}%` }}
      role="tooltip"
    >
      <p>
        <span>Al Sol</span>
        {formatDistance(stats.distanceToSunKpc)}
      </p>
      <p>
        <span>Vecino más cercano</span>
        {formatDistance(stats.nearestNeighborKpc)}
      </p>
      <p>
        <span>Al centro</span>
        {formatDistance(stats.distanceToCenterKpc)}
      </p>
    </div>
  );
}

function AcademyFooter({ variant }: { variant: "panel" | "site-end" }) {
  const lastPushLabel = formatLastPushDate(
    process.env.NEXT_PUBLIC_LAST_PUSH_DATE ?? "",
  );

  return (
    <footer className={`academy-footer academy-footer--${variant}`}>
      <Image
        src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/drz.png`}
        alt="Dr. Z Academy"
        width={58}
        height={58}
      />
      <p>
        <i>
          Desarrollado por{" "}
          <a href="https://drz.academy" target="_blank" rel="noreferrer">
            Jorge I. Zuluaga (Dr. Z)
          </a>{" "}
          en Cursor.
        </i>
      </p>
      <div className="footer-meta">
        <div className="version">
          Versión {packageJson.version}
          {lastPushLabel ? <> · {lastPushLabel}</> : null}
        </div>
        <a
          className="footer-repo-link"
          href={GITHUB_APP_URL}
          target="_blank"
          rel="noreferrer"
        >
          Código y README en GitHub
        </a>
        <a
          className="footer-repo-link"
          href={WHATSNEW_URL}
          target="_blank"
          rel="noreferrer"
        >
          Novedades (WHATSNEW)
        </a>
      </div>
    </footer>
  );
}

function MapAttributionNotes({
  roundedEstimate,
  civilizationEstimate,
}: {
  roundedEstimate: number;
  civilizationEstimate: number;
}) {
  return (
    <>
      {roundedEstimate > MAX_VISIBLE_CIVILIZATIONS ? (
        <p>
          Se muestran {MAX_VISIBLE_CIVILIZATIONS.toLocaleString("es-CO")}{" "}
          puntos representativos de un total estimado de{" "}
          {formatCivilizations(civilizationEstimate)}.
        </p>
      ) : (
        <p>Cada punto turquesa representa una civilización estimada.</p>
      )}
      <p>
        Imagen: NASA/JPL-Caltech/R. Hurt (SSC/Caltech), generada con{" "}
        <a
          href="https://milkyway-plot.readthedocs.io/"
          target="_blank"
          rel="noreferrer"
        >
          mw-plot
        </a>
        .
      </p>
    </>
  );
}

type EstimateHeaderProps = {
  variant: "desktop" | "mobile";
  inputMode: InputMode;
  civilizationBounds: { min: number; max: number } | null;
  distributionAnalysis: DistributionAnalysis | null;
  civilizationEstimate: number;
  estimateLabel: string;
  onOpenConfidenceIntervalHelp: () => void;
};

function EstimateHeader({
  variant,
  inputMode,
  civilizationBounds,
  distributionAnalysis,
  civilizationEstimate,
  estimateLabel,
  onOpenConfidenceIntervalHelp,
}: EstimateHeaderProps) {
  return (
    <header
      className={`estimate-header estimate-header--${variant}`}
      aria-labelledby={variant === "desktop" ? "estimate-title" : undefined}
    >
      <p>ECUACIÓN DE DRAKE</p>
      <h2 id={variant === "desktop" ? "estimate-title" : undefined}>
        <strong>
          {inputMode === "range" && civilizationBounds
            ? `${formatCivilizations(civilizationBounds.min)} – ${formatCivilizations(civilizationBounds.max)}`
            : inputMode === "distribution" && distributionAnalysis
              ? formatCivilizations(distributionAnalysis.civilization.mean)
              : formatCivilizations(civilizationEstimate)}
        </strong>{" "}
        {estimateLabel}
      </h2>
      <span>
        {inputMode === "range"
          ? "rango posible en la galaxia; el mapa usa una muestra aleatoria uniforme"
          : inputMode === "distribution" && distributionAnalysis
            ? (
                <>
                  <ConfidenceIntervalLabel
                    onOpenHelp={onOpenConfidenceIntervalHelp}
                  />
                  :{" "}
                  {formatCivilizations(
                    distributionAnalysis.civilization.lower95,
                  )}{" "}
                  –{" "}
                  {formatCivilizations(
                    distributionAnalysis.civilization.upper95,
                  )}
                  ; el mapa muestra una muestra aleatoria
                </>
              )
            : inputMode === "distribution"
              ? "muestra aleatoria según las distribuciones elegidas"
              : "en nuestra galaxia, según tus supuestos"}
      </span>
    </header>
  );
}

function MapSummary({
  inputMode,
  civilizationEstimate,
  distributionAnalysis,
  onOpenConfidenceIntervalHelp,
}: {
  inputMode: InputMode;
  civilizationEstimate: number;
  distributionAnalysis: DistributionAnalysis | null;
  onOpenConfidenceIntervalHelp: () => void;
}) {
  if (inputMode === "exact") {
    return null;
  }

  return (
    <div className="map-summary">
      {inputMode === "range" && (
        <p>
          Muestra actual:{" "}
          {formatCivilizations(civilizationEstimate)} civilizaciones con
          parámetros aleatorios uniformes.
        </p>
      )}
      {inputMode === "distribution" && distributionAnalysis && (
        <p>
          Promedio:{" "}
          {formatCivilizations(distributionAnalysis.civilization.mean)}{" "}
          civilizaciones (
          <ConfidenceIntervalLabel
            onOpenHelp={onOpenConfidenceIntervalHelp}
          />
          :{" "}
          {formatCivilizations(distributionAnalysis.civilization.lower95)} –{" "}
          {formatCivilizations(distributionAnalysis.civilization.upper95)}
          ). Muestra del mapa:{" "}
          {formatCivilizations(civilizationEstimate)} civilizaciones.
        </p>
      )}
      {inputMode === "distribution" && !distributionAnalysis && (
        <p>
          Muestra actual:{" "}
          {formatCivilizations(civilizationEstimate)} civilizaciones con
          parámetros generados según las distribuciones elegidas.
        </p>
      )}
    </div>
  );
}

function helpTermElementId(id: string) {
  return `help-term-${id}`;
}

function helpGuideElementId(id: string) {
  return `help-guide-${id}`;
}

function InlineHelpButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-help-button"
      aria-label={`Ayuda: ${label}`}
      onClick={onClick}
    >
      ?
    </button>
  );
}

function ConfidenceIntervalLabel({
  onOpenHelp,
}: {
  onOpenHelp: () => void;
}) {
  return (
    <span className="confidence-interval-label">
      intervalo del 95 %
      <InlineHelpButton
        label="intervalo del 95 %"
        onClick={onOpenHelp}
      />
    </span>
  );
}

function ParameterLabelWithHelp({
  label,
  parameterKey,
  onOpenHelp,
}: {
  label: string;
  parameterKey: ParameterKey;
  onOpenHelp: (parameterKey: ParameterKey) => void;
}) {
  return (
    <span className="parameter-name">
      {label}
      <InlineHelpButton
        label={label}
        onClick={() => onOpenHelp(parameterKey)}
      />
    </span>
  );
}

function resolveConfigFromSearch(search: string): DrakeConfigSnapshot {
  const defaults = buildDefaultConfigSnapshot();
  if (!search) return defaults;
  const partial = parseDrakeConfigFromSearch(search);
  return partial ? mergeDrakeConfigSnapshot(defaults, partial) : defaults;
}

function subscribeToLocation(onStoreChange: () => void) {
  window.addEventListener("popstate", onStoreChange);
  return () => window.removeEventListener("popstate", onStoreChange);
}

function getLocationSearch() {
  return window.location.search;
}

function getServerLocationSearch() {
  return "";
}

function DrakeCalculatorView({
  initialConfig,
}: {
  initialConfig: DrakeConfigSnapshot;
}) {
  const [values, setValues] = useState<DrakeValues>(initialConfig.values);
  const [ranges, setRanges] = useState<DrakeRanges>(initialConfig.ranges);
  const [parameterDistributions, setParameterDistributions] =
    useState<ParameterDistributions>(initialConfig.parameterDistributions);
  const [inputMode, setInputMode] = useState<InputMode>(initialConfig.inputMode);
  const [distributionSeed, setDistributionSeed] = useState(
    initialConfig.distributionSeed,
  );
  const [parameterSampleSeed, setParameterSampleSeed] = useState(4096);
  const [activeSidePanel, setActiveSidePanel] = useState<SidePanel>(null);
  const [focusedHelpTermId, setFocusedHelpTermId] = useState<string | null>(
    null,
  );
  const [hoveredMapTarget, setHoveredMapTarget] = useState<MapHoverTarget | null>(
    null,
  );
  const [distributionMode, setDistributionMode] = useState<DistributionMode>(
    initialConfig.distributionMode,
  );
  const [showRadiosphere, setShowRadiosphere] = useState(
    initialConfig.showRadiosphere,
  );
  const [showGhzOverlay, setShowGhzOverlay] = useState(
    initialConfig.showGhzOverlay,
  );
  const [radiosphereYears, setRadiosphereYears] = useState(
    initialConfig.radiosphereYears,
  );
  const [radiosphereInput, setRadiosphereInput] = useState(
    String(initialConfig.radiosphereYears),
  );
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>(
    initialConfig.distanceUnit,
  );
  const [copyLinkFeedback, setCopyLinkFeedback] = useState<string | null>(
    null,
  );

  const formatDistance = useCallback(
    (valueKpc: number | null) => formatDistanceFromKpc(valueKpc, distanceUnit),
    [distanceUnit],
  );

  const toggleSidePanel = (panel: Exclude<SidePanel, null>) => {
    setActiveSidePanel((current) => (current === panel ? null : panel));
  };

  const closeSidePanel = useCallback(() => {
    setActiveSidePanel(null);
  }, []);

  const openHelpTarget = useCallback((targetId: string) => {
    setFocusedHelpTermId(targetId);
    setActiveSidePanel("help");

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById(targetId)?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      });
    });
  }, []);

  const openParameterHelp = useCallback(
    (parameterKey: ParameterKey) =>
      openHelpTarget(helpTermElementId(parameterKey)),
    [openHelpTarget],
  );

  const openHelpGuide = useCallback(
    (guideId: string) => openHelpTarget(helpGuideElementId(guideId)),
    [openHelpTarget],
  );

  const openConfidenceIntervalHelp = useCallback(
    () => openHelpTarget(helpGuideElementId("confidence-interval")),
    [openHelpTarget],
  );

  useEffect(() => {
    if (!focusedHelpTermId) return;
    const timeout = window.setTimeout(() => setFocusedHelpTermId(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [focusedHelpTermId]);

  const buildCurrentConfigSnapshot = useCallback(
    (): DrakeConfigSnapshot => ({
      inputMode,
      values,
      ranges,
      parameterDistributions,
      distributionMode,
      distanceUnit,
      radiosphereYears,
      distributionSeed,
      showRadiosphere,
      showGhzOverlay,
    }),
    [
      inputMode,
      values,
      ranges,
      parameterDistributions,
      distributionMode,
      distanceUnit,
      radiosphereYears,
      distributionSeed,
      showRadiosphere,
      showGhzOverlay,
    ],
  );

  const handleCopyConfigLink = useCallback(async () => {
    const url = buildDrakeConfigUrl(buildCurrentConfigSnapshot());

    try {
      await navigator.clipboard.writeText(url);
      setCopyLinkFeedback("Enlace copiado");
    } catch {
      setCopyLinkFeedback("No se pudo copiar el enlace");
    }

    window.setTimeout(() => setCopyLinkFeedback(null), 2500);
  }, [buildCurrentConfigSnapshot]);

  const activeValues = useMemo(() => {
    if (inputMode === "exact") return values;
    if (inputMode === "range") {
      return sampleDrakeValues(
        ranges,
        INITIAL_PARAMETER_DISTRIBUTIONS,
        parameterSampleSeed,
      );
    }
    return sampleDrakeValues(ranges, parameterDistributions, parameterSampleSeed);
  }, [inputMode, values, ranges, parameterDistributions, parameterSampleSeed]);

  const civilizationEstimate = useMemo(
    () => computeCivilizationEstimate(activeValues),
    [activeValues],
  );

  const civilizationBounds = useMemo(() => {
    if (inputMode !== "range") return null;
    const minValues = valuesFromBounds(ranges, "min");
    const maxValues = valuesFromBounds(ranges, "max");
    return {
      min: roundCivilizations(computeCivilizationEstimate(minValues)),
      max: roundCivilizations(computeCivilizationEstimate(maxValues)),
    };
  }, [inputMode, ranges]);

  const distributionAnalysis = useMemo(() => {
    if (inputMode !== "distribution") return null;
    return estimateDistributionAnalysis(
      ranges,
      parameterDistributions,
      radiosphereYears,
      distributionMode,
    );
  }, [inputMode, ranges, parameterDistributions, radiosphereYears, distributionMode]);

  const roundedEstimate = roundCivilizations(civilizationEstimate);
  const visibleCount = Math.min(roundedEstimate, MAX_VISIBLE_CIVILIZATIONS);

  const civilizationPositions = useMemo(
    () =>
      buildCivilizationPositions(
        visibleCount,
        distributionSeed,
        distributionMode,
      ),
    [visibleCount, distributionSeed, distributionMode],
  );

  const civilizationHoverEnabled =
    civilizationPositions.length <= CIVILIZATION_HOVER_TOOLTIP_MAX;

  const mapHoverStats = useMemo(() => {
    if (!civilizationHoverEnabled) return null;
    return computeMapHoverStats(civilizationPositions);
  }, [civilizationHoverEnabled, civilizationPositions]);

  const activeHoveredMapTarget: MapHoverTarget | null =
    civilizationHoverEnabled && hoveredMapTarget
      ? hoveredMapTarget.kind === "sun" ||
        hoveredMapTarget.index < civilizationPositions.length
        ? hoveredMapTarget
        : null
      : null;

  const derivedStats = useMemo(
    () =>
      computeDerivedStats(
        roundedEstimate,
        radiosphereYears,
        civilizationPositions,
        distributionMode,
        distributionSeed,
      ),
    [
      roundedEstimate,
      radiosphereYears,
      civilizationPositions,
      distributionMode,
      distributionSeed,
    ],
  );

  const derivedStatsBounds = useMemo(() => {
    if (inputMode === "exact" || !civilizationBounds) return null;
    return {
      min: computeDerivedStats(
        civilizationBounds.min,
        radiosphereYears,
        [],
        distributionMode,
        distributionSeed + 1,
      ),
      max: computeDerivedStats(
        civilizationBounds.max,
        radiosphereYears,
        [],
        distributionMode,
        distributionSeed + 2,
      ),
    };
  }, [
    inputMode,
    civilizationBounds,
    radiosphereYears,
    distributionMode,
    distributionSeed,
  ]);

  const updateValue = (key: ParameterKey, value: number) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const updateRange = (
    key: ParameterKey,
    bound: "min" | "max",
    value: number,
  ) => {
    setRanges((current) => {
      const next = { ...current[key], [bound]: value };
      if (next.min > next.max) {
        if (bound === "min") next.max = value;
        else next.min = value;
      }
      return { ...current, [key]: next };
    });
    if (inputMode === "range" || inputMode === "distribution") {
      setParameterSampleSeed((seed) => seed + 1);
    }
  };

  const updateParameterDistribution = (
    key: ParameterKey,
    distribution: SamplingDistribution,
  ) => {
    setParameterDistributions((current) => ({
      ...current,
      [key]: distribution,
    }));

    if (inputMode === "distribution") {
      setParameterSampleSeed((seed) => seed + 1);
    }
  };

  const handleInputModeChange = (mode: InputMode) => {
    if ((mode === "range" || mode === "distribution") && inputMode === "exact") {
      setRanges(rangesFromExactValues(values));
    }
    setInputMode(mode);
    setParameterSampleSeed((seed) => seed + 1);
  };

  const handleNewDistribution = () => {
    setHoveredMapTarget(null);
    setDistributionSeed((seed) => seed + 1);
    if (inputMode === "range" || inputMode === "distribution") {
      setParameterSampleSeed((seed) => seed + 1);
    }
  };

  const handleRadiosphereInputChange = (raw: string) => {
    setRadiosphereInput(raw);
    const parsed = parseRadiosphereYears(raw);
    if (parsed !== null) {
      setRadiosphereYears(parsed);
    }
  };

  const handleRadiosphereInputBlur = () => {
    const parsed = parseRadiosphereYears(radiosphereInput);
    if (parsed === null) {
      setRadiosphereYears(DEFAULT_RADIOSPHERE_YEARS);
      setRadiosphereInput(String(DEFAULT_RADIOSPHERE_YEARS));
      return;
    }

    setRadiosphereYears(parsed);
    setRadiosphereInput(String(parsed));
  };

  const estimateLabel =
    (inputMode === "distribution" && distributionAnalysis
      ? roundCivilizations(distributionAnalysis.civilization.mean)
      : roundedEstimate) === 1
      ? "civilización podría comunicarse"
      : "civilizaciones podrían comunicarse";

  return (
    <div className="app-shell">
      <aside className="control-panel">
        <header className="brand-header">
          <p className="eyebrow">ASTROBIOLOGÍA INTERACTIVA</p>
          <h1>La calculadora de Drake</h1>
          <p className="brand-byline">
            Por{" "}
            <a
              href="https://jorgezuluaga.github.io"
              target="_blank"
              rel="noreferrer"
            >
              Jorge I. Zuluaga
            </a>
          </p>
          <p className="intro">
            Ajusta cada supuesto y explora cuántas civilizaciones podrían
            comunicarse hoy en la Vía Láctea.{" "}
            <a href={SCENARIOS_README_URL} target="_blank" rel="noreferrer">
              Prueba algunos escenarios interesantes.
            </a>
          </p>
        </header>

        <div className="equation" aria-label="Ecuación de Drake">
          <i>N</i> = <i>R</i><sub>★</sub> · <i>f</i><sub>p</sub> ·{" "}
          <i>n</i><sub>e</sub> · <i>f</i><sub>l</sub> · <i>f</i>
          <sub>i</sub> · <i>f</i><sub>c</sub> · <i>L</i>
        </div>

        <fieldset className="input-mode-selector" aria-label="Entrada de parámetros">
          <legend className="input-mode-legend">Entrada de parámetros</legend>
          <div className="input-mode-options" role="radiogroup" aria-label="Entrada de parámetros">
            {(
              [
                ["exact", "Exacto"],
                ["range", "Rango"],
                ["distribution", "Distribución"],
              ] as const
            ).map(([mode, label]) => (
              <div className="input-mode-option-wrap" key={mode}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={inputMode === mode}
                  className={`input-mode-option${
                    inputMode === mode ? " input-mode-option--active" : ""
                  }`}
                  onClick={() => handleInputModeChange(mode)}
                >
                  {label}
                </button>
                {mode === "distribution" && (
                  <InlineHelpButton
                    label="Modo Distribución"
                    onClick={() => openHelpGuide("parameter-distributions")}
                  />
                )}
              </div>
            ))}
          </div>
          <p className="input-mode-note">
            {inputMode === "exact"
              ? "Cada parámetro tiene un valor único."
              : inputMode === "range"
                ? "Cada parámetro admite un mínimo y un máximo; el mapa usa una muestra uniforme aleatoria."
                : "Cada parámetro admite un mínimo y un máximo y una distribución; se muestra el promedio y un intervalo del 95 %."}
          </p>
        </fieldset>

        <section className="parameter-list" aria-label="Parámetros de Drake">
          {PARAMETERS.map((parameter) => {
            const range = ranges[parameter.key];

            if (inputMode === "exact") {
              const value = values[parameter.key];
              const progress =
                ((value - parameter.min) / (parameter.max - parameter.min)) *
                100;

              return (
                <div className="parameter" key={parameter.key}>
                  <div className="parameter-heading">
                    <span className="parameter-symbol">{parameter.symbol}</span>
                    <ParameterLabelWithHelp
                      label={parameter.label}
                      parameterKey={parameter.key}
                      onOpenHelp={openParameterHelp}
                    />
                    <output htmlFor={`${parameter.key}-exact`}>
                      {parameter.format(value)}
                    </output>
                  </div>
                  <input
                    id={`${parameter.key}-exact`}
                    type="range"
                    min={parameter.min}
                    max={parameter.max}
                    step={parameter.step}
                    value={value}
                    style={
                      { "--range-progress": `${progress}%` } as React.CSSProperties
                    }
                    onInput={(event) =>
                      updateValue(parameter.key, Number(event.currentTarget.value))
                    }
                    onChange={(event) =>
                      updateValue(parameter.key, Number(event.currentTarget.value))
                    }
                    aria-label={`${parameter.symbol}: ${parameter.label}`}
                    aria-describedby={`${parameter.key}-description`}
                  />
                  <p id={`${parameter.key}-description`}>
                    {parameter.description}
                  </p>
                </div>
              );
            }

            if (inputMode === "range") {
              return (
                <div className="parameter parameter--range" key={parameter.key}>
                  <div className="parameter-heading">
                    <span className="parameter-symbol">{parameter.symbol}</span>
                    <ParameterLabelWithHelp
                      label={parameter.label}
                      parameterKey={parameter.key}
                      onOpenHelp={openParameterHelp}
                    />
                    <output htmlFor={`${parameter.key}-range`}>
                      {parameter.format(range.min)} – {parameter.format(range.max)}
                    </output>
                  </div>
                  <DualRangeSlider
                    id={`${parameter.key}-range`}
                    min={parameter.min}
                    max={parameter.max}
                    step={parameter.step}
                    minValue={range.min}
                    maxValue={range.max}
                    onMinChange={(value) => updateRange(parameter.key, "min", value)}
                    onMaxChange={(value) => updateRange(parameter.key, "max", value)}
                    ariaLabel={`${parameter.symbol}: ${parameter.label}`}
                  />
                  <p id={`${parameter.key}-description`}>
                    {parameter.description}
                  </p>
                </div>
              );
            }

            const distribution = parameterDistributions[parameter.key];

            return (
              <div
                className="parameter parameter--range parameter--distribution"
                key={parameter.key}
              >
                <div className="parameter-heading">
                  <span className="parameter-symbol">{parameter.symbol}</span>
                  <ParameterLabelWithHelp
                    label={parameter.label}
                    parameterKey={parameter.key}
                    onOpenHelp={openParameterHelp}
                  />
                  <output htmlFor={`${parameter.key}-distribution`}>
                    {parameter.format(range.min)} – {parameter.format(range.max)}
                  </output>
                </div>
                <label
                  className="parameter-distribution-field"
                  htmlFor={`${parameter.key}-distribution-kind`}
                >
                  <span>Distribución</span>
                  <select
                    id={`${parameter.key}-distribution-kind`}
                    value={distribution}
                    onChange={(event) =>
                      updateParameterDistribution(
                        parameter.key,
                        event.target.value as SamplingDistribution,
                      )
                    }
                  >
                    {(
                      Object.entries(SAMPLING_DISTRIBUTION_LABELS) as [
                        SamplingDistribution,
                        string,
                      ][]
                    ).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <DualRangeSlider
                  id={`${parameter.key}-distribution`}
                  min={parameter.min}
                  max={parameter.max}
                  step={parameter.step}
                  minValue={range.min}
                  maxValue={range.max}
                  onMinChange={(value) => updateRange(parameter.key, "min", value)}
                  onMaxChange={(value) => updateRange(parameter.key, "max", value)}
                  ariaLabel={`${parameter.symbol}: ${parameter.label}`}
                />
                {distribution === "gaussian" && (
                  <p className="parameter-distribution-hint">
                    La media coincide con el centro del intervalo; los límites
                    marcan ±1 σ (la mitad del ancho), igual que en uniforme y
                    triangular.
                  </p>
                )}
                <p id={`${parameter.key}-description`}>
                  {parameter.description}
                </p>
              </div>
            );
          })}
        </section>

        <div className="config-share">
          <button
            type="button"
            className="config-share-link"
            onClick={() => void handleCopyConfigLink()}
          >
            Copiar enlace de configuración
          </button>
          {copyLinkFeedback && (
            <p className="config-share-feedback" role="status">
              {copyLinkFeedback}
            </p>
          )}
        </div>

        <AcademyFooter variant="panel" />
      </aside>

      <section className="galaxy-panel" aria-labelledby="estimate-title">
        <EstimateHeader
          variant="desktop"
          inputMode={inputMode}
          civilizationBounds={civilizationBounds}
          distributionAnalysis={distributionAnalysis}
          civilizationEstimate={civilizationEstimate}
          estimateLabel={estimateLabel}
          onOpenConfidenceIntervalHelp={openConfidenceIntervalHelp}
        />

        <div className="galaxy-stage">
          <div className="galaxy-halo" />
          <div className="galaxy-map-wrap">
            <svg
              className="galaxy-map"
              viewBox="0 0 1000 1000"
              role="img"
              aria-label={`Mapa estimado de ${formatCivilizations(
                civilizationEstimate,
              )} civilizaciones en la Vía Láctea`}
            >
            <defs>
              <clipPath id="galaxy-clip">
                <circle cx="500" cy="500" r="474" />
              </clipPath>
              <filter id="civilization-glow" x="-200%" y="-200%" width="500%" height="500%">
                <feGaussianBlur stdDeviation="2.4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="sun-glow" x="-200%" y="-200%" width="500%" height="500%">
                <feGaussianBlur stdDeviation="7" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <image
              href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/milky-way-face-on.webp`}
              x="26"
              y="26"
              width="948"
              height="948"
              preserveAspectRatio="xMidYMid slice"
              clipPath="url(#galaxy-clip)"
            />

            {showGhzOverlay && (
              <g clipPath="url(#galaxy-clip)">
                <path
                  fill="#6fffe9"
                  fillOpacity="0.2"
                  fillRule="evenodd"
                  d={`M ${SVG_CENTER} ${SVG_CENTER - GHZ_OUTER_SVG_RADIUS} A ${GHZ_OUTER_SVG_RADIUS} ${GHZ_OUTER_SVG_RADIUS} 0 1 1 ${SVG_CENTER - 0.001} ${SVG_CENTER - GHZ_OUTER_SVG_RADIUS} Z M ${SVG_CENTER} ${SVG_CENTER - GHZ_INNER_SVG_RADIUS} A ${GHZ_INNER_SVG_RADIUS} ${GHZ_INNER_SVG_RADIUS} 0 1 0 ${SVG_CENTER + 0.001} ${SVG_CENTER - GHZ_INNER_SVG_RADIUS} Z`}
                />
                <circle
                  cx={SVG_CENTER}
                  cy={SVG_CENTER}
                  r={GHZ_INNER_SVG_RADIUS}
                  fill="none"
                  stroke="#6fffe9"
                  strokeWidth="1.5"
                  strokeDasharray="8 6"
                  opacity="0.55"
                />
                <circle
                  cx={SVG_CENTER}
                  cy={SVG_CENTER}
                  r={GHZ_OUTER_SVG_RADIUS}
                  fill="none"
                  stroke="#6fffe9"
                  strokeWidth="1.5"
                  strokeDasharray="8 6"
                  opacity="0.55"
                />
              </g>
            )}

            <g clipPath="url(#galaxy-clip)" filter="url(#civilization-glow)">
              {civilizationPositions.map((position, index) => (
                <g key={`${distributionSeed}-${index}`}>
                  <circle
                    cx={position.x}
                    cy={position.y}
                    r={position.radius}
                    fill="#6fffe9"
                    opacity={position.opacity}
                    pointerEvents={civilizationHoverEnabled ? "none" : "auto"}
                  />
                  {civilizationHoverEnabled && (
                    <circle
                      className="civilization-hit-target"
                      cx={position.x}
                      cy={position.y}
                      r={12}
                      fill="transparent"
                      onMouseEnter={() =>
                        setHoveredMapTarget({ kind: "civilization", index })
                      }
                      onMouseLeave={() => setHoveredMapTarget(null)}
                    />
                  )}
                </g>
              ))}
            </g>

            {showRadiosphere && derivedStats.radiosphereInGalaxy && (
              <g clipPath="url(#galaxy-clip)">
                <circle
                  cx={SUN_SVG.x}
                  cy={SUN_SVG.y}
                  r={
                    kpcToDiskSvgRadius(derivedStats.radiosphereRadiusKpc)
                  }
                  fill="none"
                  stroke="#ffca5c"
                  strokeWidth="1.5"
                  strokeDasharray="8 6"
                  opacity="0.45"
                />
              </g>
            )}

            <g className="sun-marker" transform="translate(683 500)">
              <circle r="19" fill="none" stroke="#ffca5c" strokeWidth="2" opacity=".5" />
              <circle r="7" fill="#ffe7a1" filter="url(#sun-glow)" />
              <line x1="0" y1="-31" x2="0" y2="-14" />
              <line x1="0" y1="14" x2="0" y2="31" />
              <line x1="-31" y1="0" x2="-14" y2="0" />
              <line x1="14" y1="0" x2="31" y2="0" />
              <text x="27" y="-25">El Sol</text>
            </g>
            {civilizationHoverEnabled && (
              <circle
                className="sun-hit-target"
                cx={SUN_SVG.x}
                cy={SUN_SVG.y}
                r={22}
                fill="transparent"
                onMouseEnter={() => setHoveredMapTarget({ kind: "sun" })}
                onMouseLeave={() => setHoveredMapTarget(null)}
              />
            )}
          </svg>
            {activeHoveredMapTarget && mapHoverStats && (
              <CivilizationMapTooltip
                stats={
                  activeHoveredMapTarget.kind === "sun"
                    ? mapHoverStats.sun
                    : mapHoverStats.civilizations[activeHoveredMapTarget.index]
                }
                anchorX={
                  activeHoveredMapTarget.kind === "sun"
                    ? SUN_SVG.x
                    : civilizationPositions[activeHoveredMapTarget.index].x
                }
                anchorY={
                  activeHoveredMapTarget.kind === "sun"
                    ? SUN_SVG.y
                    : civilizationPositions[activeHoveredMapTarget.index].y
                }
                formatDistance={formatDistance}
              />
            )}
          </div>

          <div className="map-caption" aria-label="Notas del mapa">
            <EstimateHeader
              variant="mobile"
              inputMode={inputMode}
              civilizationBounds={civilizationBounds}
              distributionAnalysis={distributionAnalysis}
              civilizationEstimate={civilizationEstimate}
              estimateLabel={estimateLabel}
              onOpenConfidenceIntervalHelp={openConfidenceIntervalHelp}
            />
            <MapSummary
              inputMode={inputMode}
              civilizationEstimate={civilizationEstimate}
              distributionAnalysis={distributionAnalysis}
              onOpenConfidenceIntervalHelp={openConfidenceIntervalHelp}
            />
            <MapAttributionNotes
              roundedEstimate={roundedEstimate}
              civilizationEstimate={civilizationEstimate}
            />
          </div>

          <div className="side-index" aria-label="Paneles laterales">
            {activeSidePanel !== null && (
              <div
                className="side-index-panel"
                id={`side-panel-${activeSidePanel}`}
              >
                {activeSidePanel === "stats" && (
                  <>
                    <SidePanelHeader
                      title="Estadísticas derivadas"
                      onClose={closeSidePanel}
                    />
                    <p className="side-index-intro">
                      {inputMode === "range"
                        ? "Rangos estimados a partir de los límites mínimo y máximo de cada parámetro."
                        : inputMode === "distribution"
                          ? "Promedio e intervalo del 95 % estimados por simulación Monte Carlo."
                          : "Estimaciones según N y la distribución espacial del mapa (disco, ZHG o brazos)."}
                    </p>

                    <dl className="stats-list">
                      <div className="stats-item">
                        <dt>Distancia media entre civilizaciones</dt>
                        <dd>
                          {distributionAnalysis?.meanSeparationKpc
                            ? formatDistance(
                                distributionAnalysis.meanSeparationKpc.mean,
                              )
                            : derivedStatsBounds
                              ? formatNullableRange(
                                  derivedStatsBounds.min.meanSeparationKpc,
                                  derivedStatsBounds.max.meanSeparationKpc,
                                  formatDistance,
                                )
                              : formatDistance(derivedStats.meanSeparationKpc)}
                        </dd>
                        {distributionAnalysis?.meanSeparationKpc && (
                          <dd className="stats-subvalue">
                            <ConfidenceIntervalLabel
                              onOpenHelp={openConfidenceIntervalHelp}
                            />
                            :{" "}
                            {formatDistributionInterval(
                              distributionAnalysis.meanSeparationKpc,
                              (value) => formatDistance(value),
                            )}
                          </dd>
                        )}
                        <dd className="stats-note">
                          {spatialDistributionStatsNote(distributionMode)}
                        </dd>
                      </div>

                      {derivedStats.sampleMeanSeparationKpc !== null && (
                        <div className="stats-item">
                          <dt>Distancia media en la muestra</dt>
                          <dd>
                            {formatDistance(derivedStats.sampleMeanSeparationKpc)}
                          </dd>
                          <dd className="stats-note">
                            {spatialDistributionSampleNote(distributionMode)}
                          </dd>
                        </div>
                      )}

                      <div className="stats-item">
                        <dt>Radio de la radiosfera</dt>
                        <dd>
                          {derivedStatsBounds
                            ? formatRange(
                                derivedStatsBounds.min.radiosphereRadiusKpc,
                                derivedStatsBounds.max.radiosphereRadiusKpc,
                                (value) => formatDistance(value),
                              )
                            : formatDistance(derivedStats.radiosphereRadiusKpc)}
                        </dd>
                        <dd className="stats-note">
                          Alcance de señales electromagnéticas durante <i>L</i>{" "}
                          años, asumiendo <i>c</i> ≈ 1 año-luz/año.
                        </dd>
                      </div>

                      <div className="stats-item">
                        <dt>Probabilidad dentro de la radiosfera</dt>
                        <dd>
                          {distributionAnalysis
                            ? formatPercent(
                                distributionAnalysis.probabilityWithinRadiosphere
                                  .mean,
                              )
                            : derivedStatsBounds
                              ? formatRange(
                                  derivedStatsBounds.min.probabilityWithinRadiosphere,
                                  derivedStatsBounds.max.probabilityWithinRadiosphere,
                                  formatPercent,
                                )
                              : formatPercent(derivedStats.probabilityWithinRadiosphere)}
                        </dd>
                        {distributionAnalysis && (
                          <dd className="stats-subvalue">
                            <ConfidenceIntervalLabel
                              onOpenHelp={openConfidenceIntervalHelp}
                            />
                            :{" "}
                            {formatDistributionInterval(
                              distributionAnalysis.probabilityWithinRadiosphere,
                              formatPercent,
                            )}
                          </dd>
                        )}
                        <dd className="stats-note">
                          Probabilidad de que al menos una civilización quede
                          dentro del radio de la radiosfera, según la
                          distribución espacial elegida (
                          {distributionMode === "ghz"
                            ? "ZHG"
                            : distributionMode === "disk"
                              ? "disco"
                              : "brazos"}
                          ).
                        </dd>
                      </div>

                      {derivedStats.nearestNeighborFromSunKpc !== null && (
                        <div className="stats-item">
                          <dt>Vecino más cercano al Sol</dt>
                          <dd>
                            {formatDistance(derivedStats.nearestNeighborFromSunKpc)}
                          </dd>
                          <dd className="stats-note">
                            Distancia al punto turquesa más próximo en la muestra
                            actual (
                            {distributionMode === "ghz"
                              ? "ZHG"
                              : distributionMode === "disk"
                                ? "disco"
                                : "brazos"}
                            ).
                          </dd>
                        </div>
                      )}
                    </dl>
                  </>
                )}

                {activeSidePanel === "config" && (
                  <>
                    <SidePanelHeader
                      title="Configuración"
                      onClose={closeSidePanel}
                    />
                    <p className="side-index-intro">
                      Opciones de visualización y distribución de las
                      civilizaciones en el mapa.
                    </p>

                    <div className="config-list">
                      <div className="config-field">
                        <div className="config-field-label-row">
                          <label htmlFor="distribution-mode">Distribución</label>
                          <InlineHelpButton
                            label="Distribución espacial en el mapa"
                            onClick={() => openHelpGuide("stellar-disk")}
                          />
                        </div>
                        <select
                          id="distribution-mode"
                          value={distributionMode}
                          onChange={(event) =>
                            setDistributionMode(
                              event.target.value as DistributionMode,
                            )
                          }
                        >
                          <option value="arms">Brazos</option>
                          <option value="disk">Disco</option>
                          <option value="ghz">ZHG</option>
                        </select>
                      </div>
                      <p className="config-note">
                        {distributionMode === "arms"
                          ? "Dentro del bulbo se usa densidad radial; fuera, los brazos espirales hasta el borde del disco."
                          : distributionMode === "ghz"
                            ? "Método disco con preferencia por la ZHG (7–10 kpc); dentro del borde interior, retención lineal del 10 % al 0 % hacia el centro; fuera del anillo solo el 10 % permanece."
                            : "Las civilizaciones siguen la densidad radial exponencial del disco galáctico."}
                      </p>

                      <label className="config-field" htmlFor="distance-unit">
                        <span>Unidades de distancia</span>
                        <select
                          id="distance-unit"
                          value={distanceUnit}
                          onChange={(event) =>
                            setDistanceUnit(event.target.value as DistanceUnit)
                          }
                        >
                          <option value="kpc">kpc</option>
                          <option value="kal">kal</option>
                          <option value="al">al</option>
                        </select>
                      </label>
                      <p className="config-note">
                        Unidad usada en las estadísticas de distancia: kiloparsecs
                        (kpc), kilo-años-luz (kal) o años-luz (al).
                      </p>

                      <label className="config-field" htmlFor="radiosphere-years">
                        <span>Radiósfera</span>
                        <input
                          id="radiosphere-years"
                          type="text"
                          inputMode="decimal"
                          value={radiosphereInput}
                          onChange={(event) =>
                            handleRadiosphereInputChange(event.target.value)
                          }
                          onBlur={handleRadiosphereInputBlur}
                          aria-describedby="radiosphere-years-note"
                        />
                      </label>
                      <p className="config-note" id="radiosphere-years-note">
                        Radio de detección en años. A la velocidad de la luz,
                        equivale al mismo número de años-luz.
                      </p>

                      <label className="config-toggle">
                        <input
                          type="checkbox"
                          checked={showGhzOverlay}
                          onChange={(event) =>
                            setShowGhzOverlay(event.target.checked)
                          }
                        />
                        <span>Dibujar ZHG</span>
                      </label>
                      <p className="config-note">
                        Muestra el anillo de la Zona de Habitabilidad Galáctica
                        (7–10 kpc): franja sombreada y límites punteados.
                      </p>

                      <label className="config-toggle">
                        <input
                          type="checkbox"
                          checked={showRadiosphere}
                          onChange={(event) =>
                            setShowRadiosphere(event.target.checked)
                          }
                        />
                        <span>Mostrar radiosfera</span>
                      </label>
                      <p className="config-note">
                        Dibuja alrededor del Sol el radio alcanzado por señales
                        electromagnéticas durante el tiempo indicado en
                        Radiósfera.
                      </p>

                      <button
                        className="config-action"
                        type="button"
                        onClick={handleNewDistribution}
                      >
                        ↻ Nueva distribución
                      </button>
                    </div>
                  </>
                )}

                {activeSidePanel === "help" && (
                  <>
                    <SidePanelHeader title="Ayuda" onClose={closeSidePanel} />
                    <p className="side-index-intro">
                      La{" "}
                      <a
                        href="https://es.wikipedia.org/wiki/Ecuaci%C3%B3n_de_Drake"
                        target="_blank"
                        rel="noreferrer"
                      >
                        ecuación de Drake
                      </a>{" "}
                      estima cuántas civilizaciones podrían estar comunicándose
                      en la galaxia:
                    </p>
                    <p className="help-equation" aria-label="Ecuación de Drake">
                      <i>N</i> = <i>R</i><sub>★</sub> · <i>f</i><sub>p</sub> ·{" "}
                      <i>n</i><sub>e</sub> · <i>f</i><sub>l</sub> · <i>f</i>
                      <sub>i</sub> · <i>f</i><sub>c</sub> · <i>L</i>
                    </p>

                    <div className="help-list">
                      {DRAKE_HELP_TERMS.map((term) => {
                        const termElementId = helpTermElementId(term.id);
                        return (
                          <article
                            className={`help-item${
                              focusedHelpTermId === termElementId
                                ? " help-item--focused"
                                : ""
                            }`}
                            id={termElementId}
                            key={term.id}
                          >
                            <h4>
                              <span className="help-symbol">{term.symbol}</span>
                              {term.name}
                            </h4>
                            <p>{term.description}</p>
                          </article>
                        );
                      })}
                    </div>

                    <h4 className="help-guide-heading">Conceptos del modelo</h4>

                    <div className="help-list help-list--guide">
                      {DRAKE_HELP_GUIDE_SECTIONS.map((section) => {
                        const sectionElementId = helpGuideElementId(section.id);
                        const afterListElementId =
                          "afterListId" in section && section.afterListId
                            ? helpGuideElementId(section.afterListId)
                            : null;
                        const isFocused =
                          focusedHelpTermId === sectionElementId ||
                          focusedHelpTermId === afterListElementId;

                        return (
                          <article
                            className={`help-item${
                              isFocused ? " help-item--focused" : ""
                            }`}
                            id={sectionElementId}
                            key={section.id}
                          >
                            <h4>{section.title}</h4>
                            {"paragraphs" in section &&
                              section.paragraphs.map((paragraph, index) => (
                                <p key={`${section.id}-p-${index}`}>
                                  {paragraph}
                                </p>
                              ))}
                            {"list" in section && section.list && (
                              <ul className="help-item-list">
                                {section.list.map((item, index) => (
                                  <li key={`${section.id}-l-${index}`}>
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {"afterList" in section && section.afterList && (
                              <p
                                id={afterListElementId ?? undefined}
                                className={
                                  focusedHelpTermId === afterListElementId
                                    ? "help-item-part--focused"
                                    : undefined
                                }
                              >
                                {section.afterList}
                              </p>
                            )}
                          </article>
                        );
                      })}
                    </div>

                    <h4 className="help-guide-heading">
                      Divulgación sobre inteligencia artificial (IA Disclosure)
                    </h4>

                    <article className="help-item help-item--disclosure">
                      {DRAKE_HELP_IA_DISCLOSURE.map((paragraph, index) => (
                        <p key={`ia-disclosure-${index}`}>{paragraph}</p>
                      ))}
                    </article>
                  </>
                )}
              </div>
            )}

            <div className="side-index-tabs">
              <button
                type="button"
                className={`side-index-tab${
                  activeSidePanel === "stats" ? " side-index-tab--active" : ""
                }`}
                aria-expanded={activeSidePanel === "stats"}
                aria-controls="side-panel-stats"
                onClick={() => toggleSidePanel("stats")}
              >
                Estadísticas
              </button>
              <button
                type="button"
                className={`side-index-tab${
                  activeSidePanel === "config" ? " side-index-tab--active" : ""
                }`}
                aria-expanded={activeSidePanel === "config"}
                aria-controls="side-panel-config"
                onClick={() => toggleSidePanel("config")}
              >
                Configuración
              </button>
              <button
                type="button"
                className={`side-index-tab${
                  activeSidePanel === "help" ? " side-index-tab--active" : ""
                }`}
                aria-expanded={activeSidePanel === "help"}
                aria-controls="side-panel-help"
                onClick={() => toggleSidePanel("help")}
              >
                Ayuda
              </button>
            </div>
          </div>

          <div className="map-legend">
            <span><i className="civilization-key" /> Civilización</span>
            <span><i className="sun-key" /> El Sol</span>
          </div>
        </div>

        <div className="map-note">
          <MapSummary
            inputMode={inputMode}
            civilizationEstimate={civilizationEstimate}
            distributionAnalysis={distributionAnalysis}
            onOpenConfidenceIntervalHelp={openConfidenceIntervalHelp}
          />
          <MapAttributionNotes
            roundedEstimate={roundedEstimate}
            civilizationEstimate={civilizationEstimate}
          />
        </div>
      </section>

      <AcademyFooter variant="site-end" />
    </div>
  );
}

export default function DrakeCalculator() {
  const locationSearch = useSyncExternalStore(
    subscribeToLocation,
    getLocationSearch,
    getServerLocationSearch,
  );
  const initialConfig = useMemo(
    () => resolveConfigFromSearch(locationSearch),
    [locationSearch],
  );

  return (
    <DrakeCalculatorView
      key={locationSearch || "default"}
      initialConfig={initialConfig}
    />
  );
}
