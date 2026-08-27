import type { FlightLeg, FlightPlan, StopMode } from "./relativity";

/** Aceleración por defecto: 0,2 g. */
export const DEFAULT_ACCEL_G = 0.2;

/** Distancia por defecto: Próxima Centauri. */
export const DEFAULT_DISTANCE_LY = 4.2;

let legCounter = 0;

export function newLegId(): string {
  legCounter += 1;
  return `leg-${legCounter}`;
}

export function makeLeg(partial: Partial<FlightLeg> = {}): FlightLeg {
  return {
    id: newLegId(),
    kind: "burn",
    accelG: DEFAULT_ACCEL_G,
    speedC: 0.5,
    inheritSpeed: true,
    stopMode: "remaining",
    stopValue: 0,
    ...partial,
  };
}

export type Destination = {
  name: string;
  distanceLy: number;
  note: string;
};

export const DESTINATIONS: Destination[] = [
  { name: "Próxima Centauri", distanceLy: 4.2, note: "la estrella más cercana" },
  { name: "Estrella de Barnard", distanceLy: 5.96, note: "enana roja veloz" },
  { name: "Sirio", distanceLy: 8.6, note: "la más brillante del cielo" },
  { name: "Tau Ceti", distanceLy: 11.9, note: "análoga solar con planetas" },
  { name: "TRAPPIST-1", distanceLy: 40.7, note: "siete planetas rocosos" },
  { name: "Cúmulo de las Pléyades", distanceLy: 444, note: "cúmulo abierto joven" },
  { name: "Nebulosa de Orión", distanceLy: 1344, note: "vivero de estrellas" },
  { name: "Centro galáctico", distanceLy: 26000, note: "Sgr A*" },
  { name: "Gran Nube de Magallanes", distanceLy: 163000, note: "galaxia satélite" },
  { name: "Galaxia de Andrómeda", distanceLy: 2537000, note: "la espiral vecina" },
];

export type Preset = {
  id: string;
  name: string;
  summary: string;
  build: () => FlightPlan;
};

export const PRESETS: Preset[] = [
  {
    id: "continuous",
    name: "Impulso continuo",
    summary:
      "Un solo tramo a 0,2 g durante todo el trayecto. Llegada a máxima velocidad: un sobrevuelo.",
    build: () => ({
      targetDistanceLy: DEFAULT_DISTANCE_LY,
      legs: [makeLeg({ accelG: DEFAULT_ACCEL_G, stopMode: "remaining" })],
    }),
  },
  {
    id: "flip-and-burn",
    name: "Giro a mitad de camino",
    summary:
      "Acelera 0,2 g la primera mitad, gira la nave y frena a −0,2 g la segunda. Llega en reposo.",
    build: () => ({
      targetDistanceLy: DEFAULT_DISTANCE_LY,
      legs: [
        makeLeg({ accelG: DEFAULT_ACCEL_G, stopMode: "fraction", stopValue: 50 }),
        makeLeg({ accelG: -DEFAULT_ACCEL_G, stopMode: "remaining" }),
      ],
    }),
  },
  {
    id: "burn-and-coast",
    name: "Un año de impulso",
    summary:
      "Enciende motores un año de tiempo propio y deja que la inercia haga el resto.",
    build: () => ({
      targetDistanceLy: DEFAULT_DISTANCE_LY,
      legs: [
        makeLeg({
          accelG: DEFAULT_ACCEL_G,
          stopMode: "shipTime",
          stopValue: 1,
        }),
        makeLeg({ kind: "coast", inheritSpeed: true, stopMode: "remaining" }),
      ],
    }),
  },
  {
    id: "burn-coast-brake",
    name: "Impulso · crucero · frenado",
    summary:
      "Acelera el primer cuarto, navega en caída libre la mitad central y frena el último cuarto.",
    build: () => ({
      targetDistanceLy: DEFAULT_DISTANCE_LY,
      legs: [
        makeLeg({ accelG: DEFAULT_ACCEL_G, stopMode: "fraction", stopValue: 25 }),
        makeLeg({
          kind: "coast",
          inheritSpeed: true,
          stopMode: "fraction",
          stopValue: 50,
        }),
        makeLeg({ accelG: -DEFAULT_ACCEL_G, stopMode: "remaining" }),
      ],
    }),
  },
  {
    id: "torch-ship",
    name: "Nave antorcha a 1 g",
    summary:
      "Un g todo el viaje, con giro a mitad de camino: gravedad artificial y dilatación extrema.",
    build: () => ({
      targetDistanceLy: DEFAULT_DISTANCE_LY,
      legs: [
        makeLeg({ accelG: 1, stopMode: "fraction", stopValue: 50 }),
        makeLeg({ accelG: -1, stopMode: "remaining" }),
      ],
    }),
  },
  {
    id: "half-light",
    name: "Crucero a 0,5 c",
    summary:
      "Sin motores: la nave ya viaja a media luz. El caso newtoniano de referencia.",
    build: () => ({
      targetDistanceLy: DEFAULT_DISTANCE_LY,
      legs: [
        makeLeg({
          kind: "coast",
          inheritSpeed: false,
          speedC: 0.5,
          stopMode: "remaining",
        }),
      ],
    }),
  },
];

export const STOP_MODE_LABELS: Record<StopMode, string> = {
  remaining: "Lo que falte del viaje",
  distance: "Una distancia dada",
  fraction: "Un % del viaje",
  shipTime: "Un tiempo en la nave",
  earthTime: "Un tiempo en el planeta",
};

export const STOP_MODE_UNITS: Record<StopMode, string> = {
  remaining: "",
  distance: "a-l",
  fraction: "%",
  shipTime: "a",
  earthTime: "a",
};

/* -------------------------------------------------------------------------- */
/* Serialización del plan en la URL, para compartir un vuelo con el curso.     */
/* -------------------------------------------------------------------------- */

const STOP_CODES: Record<StopMode, string> = {
  remaining: "r",
  distance: "d",
  fraction: "f",
  shipTime: "s",
  earthTime: "e",
};

const STOP_FROM_CODE = Object.fromEntries(
  Object.entries(STOP_CODES).map(([mode, code]) => [code, mode as StopMode]),
) as Record<string, StopMode>;

/** Misma precisión que muestran los campos del tablero, para que el enlace
 *  compartido y la interfaz coincidan dígito a dígito. Punto decimal, nunca
 *  coma: la coma separaba tramos y rompía el plan al copiar o abrir el URL. */
function trimNumber(value: number): string {
  return Number.parseFloat(value.toPrecision(10)).toString();
}

function parseNum(raw: string): number {
  return Number(raw.trim().replace(",", "."));
}

function encodeLeg(leg: FlightLeg): string {
  const stop =
    leg.stopMode === "remaining"
      ? "r"
      : `${STOP_CODES[leg.stopMode]}${trimNumber(leg.stopValue)}`;
  if (leg.kind === "burn") return `b${trimNumber(leg.accelG)}:${stop}`;
  const speed = leg.inheritSpeed ? "i" : trimNumber(leg.speedC);
  return `c${speed}:${stop}`;
}

export function encodePlan(plan: FlightPlan): string {
  const params = new URLSearchParams();
  params.set("d", trimNumber(plan.targetDistanceLy));
  params.set("p", plan.legs.map(encodeLeg).join("~"));
  return params.toString();
}

function decodeLeg(chunk: string): FlightLeg | null {
  const [head, stop] = chunk.split(":");
  if (!head || !stop) return null;

  const stopMode = STOP_FROM_CODE[stop[0]];
  if (!stopMode) return null;
  const stopValue = stopMode === "remaining" ? 0 : parseNum(stop.slice(1));
  if (stopMode !== "remaining" && !Number.isFinite(stopValue)) return null;

  if (head[0] === "b") {
    const accelG = parseNum(head.slice(1));
    if (!Number.isFinite(accelG)) return null;
    return makeLeg({ kind: "burn", accelG, stopMode, stopValue });
  }
  if (head[0] === "c") {
    const body = head.slice(1);
    const inheritSpeed = body === "i";
    const speedC = inheritSpeed ? 0.5 : parseNum(body);
    if (!inheritSpeed && !Number.isFinite(speedC)) return null;
    return makeLeg({ kind: "coast", inheritSpeed, speedC, stopMode, stopValue });
  }
  return null;
}

export function decodePlan(search: string): FlightPlan | null {
  const query = search.startsWith("http")
    ? new URL(search).search
    : search;
  const params = new URLSearchParams(query);
  const rawDistance = params.get("d");
  const rawPlan = params.get("p");
  if (!rawDistance || !rawPlan) return null;

  const targetDistanceLy = parseNum(rawDistance);
  if (!Number.isFinite(targetDistanceLy) || targetDistanceLy <= 0) return null;

  const chunks = rawPlan.includes("~")
    ? rawPlan.split("~")
    : rawPlan.split(",");
  const legs: FlightLeg[] = [];
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const leg = decodeLeg(trimmed);
    if (!leg) return null;
    legs.push(leg);
  }

  if (legs.length === 0) return null;
  return { targetDistanceLy, legs };
}
