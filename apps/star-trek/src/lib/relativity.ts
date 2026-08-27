/**
 * Cinemática relativista 1D con aceleración propia constante por tramos.
 *
 * Todo se calcula en "unidades luz": distancias en años-luz (a-l), tiempos en
 * años (a) y velocidades en fracciones de c. En estas unidades c = 1.
 *
 * Para un tramo con aceleración propia constante alpha_L y condiciones
 * iniciales arbitrarias (x_L0, t_0, v_L0) la solución general es
 *
 *   x_L(tau) = x_L0 + (g0 v_L0 / a) sinh(a tau) + (g0 / a) (cosh(a tau) - 1)
 *   t(tau)   = t_0  + (g0 / a) sinh(a tau) + (g0 v_L0 / a) (cosh(a tau) - 1)
 *   v_L(tau) = (v_L0 + tanh(a tau)) / (1 + v_L0 tanh(a tau))
 *
 * Escribiendo la rapidez inicial theta_0 = artanh(v_L0) (de modo que
 * g0 = cosh theta_0 y g0 v_L0 = sinh theta_0) las tres expresiones colapsan en
 *
 *   theta(tau) = theta_0 + a tau
 *   x_L(tau)   = x_L0 + [cosh theta(tau) - cosh theta_0] / a
 *   t(tau)     = t_0   + [sinh theta(tau) - sinh theta_0] / a
 *   v_L(tau)   = tanh theta(tau)
 *
 * El módulo integra en rapidez porque es la variable que se mantiene finita y
 * bien condicionada incluso cuando v_L es indistinguible de 1 en punto flotante.
 */

export const C_M_S = 299792458;
export const G_M_S2 = 9.80665;
export const YEAR_S = 365.25 * 24 * 3600;

/** 1 g terrestre expresado en unidades luz (a-l / a²). */
export const G_LIGHT = (G_M_S2 * YEAR_S) / C_M_S;

/** Rapidez máxima admitida, para evitar infinitos al fijar velocidades. */
const MAX_RAPIDITY = 30;

export type LegKind = "burn" | "coast";

/** Condición que determina dónde termina un tramo. */
export type StopMode =
  | "remaining"
  | "distance"
  | "fraction"
  | "shipTime"
  | "earthTime";

export type FlightLeg = {
  id: string;
  kind: LegKind;
  /** Aceleración propia en g terrestres (con signo). Solo para "burn". */
  accelG: number;
  /** Velocidad de crucero en fracciones de c. Solo para "coast". */
  speedC: number;
  /** Si es true el tramo de crucero hereda la velocidad alcanzada. */
  inheritSpeed: boolean;
  stopMode: StopMode;
  stopValue: number;
};

export type FlightPlan = {
  targetDistanceLy: number;
  legs: FlightLeg[];
};

export type FlightSample = {
  /** Tiempo propio acumulado de la nave, en años. */
  tau: number;
  /** Tiempo coordenado acumulado (planeta de salida), en años. */
  t: number;
  /** Distancia recorrida acumulada, en años-luz. */
  x: number;
  /** Velocidad instantánea en unidades de c. */
  v: number;
  /** Factor de Lorentz. */
  gamma: number;
  /** Aceleración propia instantánea en g, la que siente la tripulación. */
  accelG: number;
  /** Índice del tramo al que pertenece la muestra. */
  legIndex: number;
};

export type LegStatus = "ok" | "warning" | "failed";

export type LegResult = {
  index: number;
  kind: LegKind;
  status: LegStatus;
  /** Mensaje corto que explica un recorte o una falla. */
  note: string | null;
  /** Aceleración propia efectiva en g (0 para crucero). */
  accelG: number;
  distanceLy: number;
  earthYears: number;
  shipYears: number;
  vStart: number;
  vEnd: number;
  vMin: number;
  vMax: number;
  gammaMax: number;
  /** 1 - |v| al final del tramo, útil cuando v es indistinguible de 1. */
  oneMinusVEnd: number;
  startX: number;
  endX: number;
  startTau: number;
  endTau: number;
  startT: number;
  endT: number;
};

export type FlightResult = {
  legs: LegResult[];
  samples: FlightSample[];
  totals: {
    distanceLy: number;
    earthYears: number;
    shipYears: number;
    vMax: number;
    oneMinusVMax: number;
    gammaMax: number;
    vArrival: number;
    dilation: number;
  };
  targetDistanceLy: number;
  /** Diferencia entre la distancia alcanzada y el objetivo del comandante. */
  distanceGapLy: number;
  warnings: string[];
  failed: boolean;
};

type State = {
  tau: number;
  t: number;
  x: number;
  theta: number;
};

/** 1 - tanh(theta), estable para rapideces grandes. */
function oneMinusTanh(theta: number): number {
  const a = Math.abs(theta);
  if (a > 350) return 0;
  return 2 / (Math.exp(2 * a) + 1);
}

function clampRapidity(theta: number): number {
  if (!Number.isFinite(theta)) return theta > 0 ? MAX_RAPIDITY : -MAX_RAPIDITY;
  return Math.max(-MAX_RAPIDITY, Math.min(MAX_RAPIDITY, theta));
}

function rapidityFromSpeed(v: number): number {
  const clamped = Math.max(-0.999999999999, Math.min(0.999999999999, v));
  return clampRapidity(Math.atanh(clamped));
}

/** Posición y tiempo coordenado a un tiempo propio dtau dentro de un tramo. */
function burnAdvance(start: State, alpha: number, dtau: number): State {
  const theta = start.theta + alpha * dtau;
  return {
    tau: start.tau + dtau,
    t: start.t + (Math.sinh(theta) - Math.sinh(start.theta)) / alpha,
    x: start.x + (Math.cosh(theta) - Math.cosh(start.theta)) / alpha,
    theta,
  };
}

function coastAdvance(start: State, dtau: number): State {
  const gamma = Math.cosh(start.theta);
  const dt = gamma * dtau;
  return {
    tau: start.tau + dtau,
    t: start.t + dt,
    x: start.x + Math.tanh(start.theta) * dt,
    theta: start.theta,
  };
}

type Solved = { dtau: number; note: string | null; status: LegStatus };

const FAILED: (note: string) => Solved = (note) => ({
  dtau: 0,
  note,
  status: "failed",
});

/** Tiempo propio necesario para cubrir una distancia dada acelerando. */
function burnDtauForDistance(
  theta0: number,
  alpha: number,
  distance: number,
): Solved {
  if (distance <= 0) {
    return FAILED("La distancia del tramo debe ser mayor que cero.");
  }

  const cosh0 = Math.cosh(theta0);
  const coshTarget = alpha * distance + cosh0;

  // Un frenado exactamente simétrico deja cosh(theta1) = 1 y el redondeo puede
  // dejarlo apenas por debajo; se rescata antes de declarar el tramo imposible.
  const tolerance = 1e-9 * Math.max(1, cosh0);
  if (coshTarget < 1 - tolerance) {
    const reach = (cosh0 - 1) / Math.abs(alpha);
    if (reach < 1e-6) {
      return FAILED(
        "Con una aceleración negativa y la nave en reposo el impulso apunta al lado contrario: la nave se aleja del destino.",
      );
    }
    return FAILED(
      `Frenando así la nave se detiene tras ${formatDecimal(reach, 3)} a-l y nunca cubre ${formatDecimal(distance, 3)} a-l.`,
    );
  }

  const magnitude = Math.acosh(Math.max(1, coshTarget));
  const candidates = [magnitude, -magnitude]
    .map((theta1) => (theta1 - theta0) / alpha)
    .filter((dtau) => dtau > 0)
    .sort((a, b) => a - b);

  if (candidates.length === 0) {
    return FAILED("Con esa aceleración la nave se aleja del destino.");
  }

  return { dtau: candidates[0], note: null, status: "ok" };
}

/**
 * Aceleración con signo que cubre la distancia restante. Si frenar con |g|
 * alcanza, se frena (llegada en reposo o casi); si el frenado se queda
 * corto, se impulsa hacia el destino.
 */
export function signedAccelGToCoverRemaining(
  speedC: number,
  remainingLy: number,
  preferredAbsG: number,
): number {
  const g = Math.abs(preferredAbsG) > 1e-9 ? Math.abs(preferredAbsG) : 0.2;
  if (!(remainingLy > 0)) return g;

  const theta = rapidityFromSpeed(speedC);
  const alpha = g * G_LIGHT;
  if (burnDtauForDistance(theta, -alpha, remainingLy).status !== "failed") {
    return -g;
  }
  return g;
}

/**
 * Aceleración propia (con signo) que detiene la nave exactamente en
 * `remainingLy`: la distancia de frenado (cosh θ − 1)/|α| coincide con lo
 * que falta. Null si no hay velocidad hacia el destino o no queda distancia.
 */
export function brakeAccelGToStop(
  speedC: number,
  remainingLy: number,
): number | null {
  if (!(remainingLy > 0) || !(speedC > 1e-9)) return null;

  const theta = rapidityFromSpeed(speedC);
  const g = (Math.cosh(theta) - 1) / (remainingLy * G_LIGHT);
  if (!(g > 0) || !Number.isFinite(g)) return null;

  // Un frenado un pelo más suave evita que el redondeo deje cosh(θ₁) < 1
  // y el tramo se marque imposible.
  const mag = Number(g.toPrecision(6));
  const safe = mag <= g ? mag : Number((g * (1 - 2e-6)).toPrecision(6));
  return -(safe > 0 ? Math.min(g, safe) : g);
}

/** Tiempo propio necesario para consumir un tiempo coordenado dado. */
function burnDtauForEarthTime(
  theta0: number,
  alpha: number,
  earthTime: number,
): Solved {
  if (earthTime <= 0) {
    return FAILED("El tiempo del tramo debe ser mayor que cero.");
  }

  const theta1 = Math.asinh(alpha * earthTime + Math.sinh(theta0));
  const dtau = (theta1 - theta0) / alpha;
  if (!(dtau > 0)) {
    return FAILED("El tramo no avanza en el tiempo coordenado.");
  }

  return { dtau, note: null, status: "ok" };
}

function resolveTargetDistance(
  leg: FlightLeg,
  state: State,
  targetDistanceLy: number,
): number {
  if (leg.stopMode === "remaining") return targetDistanceLy - state.x;
  if (leg.stopMode === "fraction") {
    return (leg.stopValue / 100) * targetDistanceLy;
  }
  return leg.stopValue;
}

function solveLeg(
  leg: FlightLeg,
  state: State,
  alpha: number,
  targetDistanceLy: number,
): Solved {
  const isBurn = leg.kind === "burn";

  if (
    leg.stopMode === "distance" ||
    leg.stopMode === "fraction" ||
    leg.stopMode === "remaining"
  ) {
    const distance = resolveTargetDistance(leg, state, targetDistanceLy);
    if (distance <= 1e-12) {
      return FAILED(
        leg.stopMode === "remaining"
          ? "La nave ya había alcanzado (o superado) el destino antes de este tramo."
          : "La distancia del tramo debe ser mayor que cero.",
      );
    }

    if (isBurn) return burnDtauForDistance(state.theta, alpha, distance);

    const v = Math.tanh(state.theta);
    if (v <= 0) {
      return FAILED("Un crucero con velocidad nula o negativa nunca llega.");
    }
    const dt = distance / v;
    return { dtau: dt / Math.cosh(state.theta), note: null, status: "ok" };
  }

  if (leg.stopValue <= 0) {
    return FAILED("La duración del tramo debe ser mayor que cero.");
  }

  if (leg.stopMode === "shipTime") {
    return { dtau: leg.stopValue, note: null, status: "ok" };
  }

  // earthTime
  if (isBurn) return burnDtauForEarthTime(state.theta, alpha, leg.stopValue);
  return {
    dtau: leg.stopValue / Math.cosh(state.theta),
    note: null,
    status: "ok",
  };
}

const SAMPLES_PER_LEG = 140;

export function computeFlight(plan: FlightPlan): FlightResult {
  const target = plan.targetDistanceLy;
  const legs: LegResult[] = [];
  const samples: FlightSample[] = [];
  const warnings: string[] = [];

  let state: State = { tau: 0, t: 0, x: 0, theta: 0 };
  let failed = false;
  let maxAbsRapidity = 0;

  samples.push({
    tau: 0,
    t: 0,
    x: 0,
    v: 0,
    gamma: 1,
    accelG: plan.legs[0]?.kind === "burn" ? plan.legs[0].accelG : 0,
    legIndex: 0,
  });

  for (let index = 0; index < plan.legs.length; index += 1) {
    const leg = plan.legs[index];
    const isBurn = leg.kind === "burn";
    const alpha = leg.accelG * G_LIGHT;

    if (isBurn && Math.abs(alpha) < 1e-9) {
      legs.push(
        emptyLegResult(
          index,
          leg,
          state,
          "Una aceleración de 0 g no impulsa la nave; usa un tramo de crucero.",
        ),
      );
      failed = true;
      break;
    }

    let entryNote: string | null = null;
    let startState = state;

    if (!isBurn && !leg.inheritSpeed) {
      const requested = rapidityFromSpeed(leg.speedC);
      const currentV = Math.tanh(state.theta);
      if (Math.abs(leg.speedC - currentV) > 1e-6) {
        entryNote = `Salto instantáneo de ${formatSpeed(currentV, oneMinusTanh(state.theta))} a ${formatSpeed(leg.speedC)} c: fija la velocidad sin gastar tiempo propio.`;
      }
      startState = { ...state, theta: requested };
    }

    const solved = solveLeg(leg, startState, alpha, target);

    if (solved.status === "failed") {
      legs.push(emptyLegResult(index, leg, startState, solved.note));
      failed = true;
      break;
    }

    const dtau = solved.dtau;
    const advance = isBurn
      ? (dt: number) => burnAdvance(startState, alpha, dt)
      : (dt: number) => coastAdvance(startState, dt);

    const endState = advance(dtau);
    const vStart = Math.tanh(startState.theta);
    const vEnd = Math.tanh(endState.theta);

    for (let k = 1; k <= SAMPLES_PER_LEG; k += 1) {
      const s = advance((dtau * k) / SAMPLES_PER_LEG);
      samples.push({
        tau: s.tau,
        t: s.t,
        x: s.x,
        v: Math.tanh(s.theta),
        gamma: Math.cosh(s.theta),
        accelG: isBurn ? leg.accelG : 0,
        legIndex: index,
      });
    }

    const legMaxRapidity = Math.max(
      Math.abs(startState.theta),
      Math.abs(endState.theta),
    );
    maxAbsRapidity = Math.max(maxAbsRapidity, legMaxRapidity);

    const notes = [entryNote, solved.note].filter(Boolean) as string[];

    legs.push({
      index,
      kind: leg.kind,
      status: notes.length > 0 ? "warning" : "ok",
      note: notes.length > 0 ? notes.join(" ") : null,
      accelG: isBurn ? leg.accelG : 0,
      distanceLy: endState.x - startState.x,
      earthYears: endState.t - startState.t,
      shipYears: dtau,
      vStart,
      vEnd,
      vMin: Math.min(vStart, vEnd),
      vMax: Math.max(vStart, vEnd),
      gammaMax: Math.cosh(legMaxRapidity),
      oneMinusVEnd: oneMinusTanh(endState.theta),
      startX: startState.x,
      endX: endState.x,
      startTau: startState.tau,
      endTau: endState.tau,
      startT: startState.t,
      endT: endState.t,
    });

    state = endState;
  }

  const distanceGap = state.x - target;
  const vArrival = Math.tanh(state.theta);

  if (failed) {
    warnings.push(
      "El plan de vuelo se interrumpió: revisa el tramo marcado en rojo.",
    );
  } else if (Math.abs(distanceGap) > Math.max(1e-6, 1e-6 * target)) {
    warnings.push(
      distanceGap < 0
        ? `El plan se queda ${Math.abs(distanceGap).toPrecision(3)} a-l corto del destino.`
        : `El plan sobrepasa el destino en ${distanceGap.toPrecision(3)} a-l.`,
    );
  }

  if (!failed && Math.abs(vArrival) > 0.01) {
    warnings.push(
      `La nave llega a ${formatSpeed(vArrival, oneMinusTanh(state.theta))} c: sin un tramo de frenado sería un sobrevuelo, no un aterrizaje.`,
    );
  }

  return {
    legs,
    samples,
    totals: {
      distanceLy: state.x,
      earthYears: state.t,
      shipYears: state.tau,
      vMax: Math.tanh(maxAbsRapidity),
      oneMinusVMax: oneMinusTanh(maxAbsRapidity),
      gammaMax: Math.cosh(maxAbsRapidity),
      vArrival,
      dilation: state.tau > 0 ? state.t / state.tau : 1,
    },
    targetDistanceLy: target,
    distanceGapLy: distanceGap,
    warnings,
    failed,
  };
}

/**
 * Estado interpolado del vuelo a un tiempo propio dado. Las muestras están
 * ordenadas por tau, así que basta una búsqueda binaria.
 */
export function sampleFlightAt(
  samples: FlightSample[],
  tau: number,
): FlightSample {
  if (samples.length === 0) {
    return { tau: 0, t: 0, x: 0, v: 0, gamma: 1, accelG: 0, legIndex: 0 };
  }

  const first = samples[0];
  const last = samples[samples.length - 1];
  if (tau <= first.tau) return first;
  if (tau >= last.tau) return last;

  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].tau <= tau) lo = mid;
    else hi = mid;
  }

  const a = samples[lo];
  const b = samples[hi];
  const span = b.tau - a.tau;
  const f = span > 0 ? (tau - a.tau) / span : 0;

  return {
    tau,
    t: a.t + (b.t - a.t) * f,
    x: a.x + (b.x - a.x) * f,
    v: a.v + (b.v - a.v) * f,
    gamma: a.gamma + (b.gamma - a.gamma) * f,
    accelG: f < 0.5 ? a.accelG : b.accelG,
    legIndex: f < 0.5 ? a.legIndex : b.legIndex,
  };
}

function emptyLegResult(
  index: number,
  leg: FlightLeg,
  state: State,
  note: string | null,
): LegResult {
  const v = Math.tanh(state.theta);
  return {
    index,
    kind: leg.kind,
    status: "failed",
    note,
    accelG: leg.kind === "burn" ? leg.accelG : 0,
    distanceLy: 0,
    earthYears: 0,
    shipYears: 0,
    vStart: v,
    vEnd: v,
    vMin: v,
    vMax: v,
    gammaMax: Math.cosh(state.theta),
    oneMinusVEnd: oneMinusTanh(state.theta),
    startX: state.x,
    endX: state.x,
    startTau: state.tau,
    endTau: state.tau,
    startT: state.t,
    endT: state.t,
  };
}

/**
 * Formatea una velocidad en unidades de c mostrando "1 − ε" cuando la nave es
 * ultrarrelativista y los dígitos decimales dejarían de ser informativos.
 */
export function formatSpeed(v: number, oneMinusV?: number): string {
  const sign = v < 0 ? "−" : "";
  const a = Math.abs(v);
  if (a < 0.99999) return `${sign}${formatDecimal(a, 5)}`;

  const eps =
    oneMinusV !== undefined && oneMinusV > 0 ? oneMinusV : Math.max(1 - a, 0);
  if (eps <= 0) return `${sign}1`;
  return `${sign}1 − ${formatExponential(eps)}`;
}

/**
 * Número en locale es-CO: coma decimal y punto de miles.
 * Se arma a mano para que el HTML del servidor y el del navegador coincidan;
 * toLocaleString("es-CO") cambia de ICU a ICU (p. ej. 4,00 vs 4,0).
 */
export function formatDecimal(
  value: number,
  digits: number,
  grouping?: boolean,
): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 || Object.is(value, -0) ? "−" : "";
  const abs = Math.abs(value);
  const fixed = abs.toFixed(digits);
  const [intRaw, fracRaw] = fixed.split(".");
  const useGrouping = grouping ?? abs >= 1000;
  const intPart = useGrouping
    ? intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
    : intRaw;
  if (digits === 0) return `${sign}${intPart}`;
  return `${sign}${intPart},${fracRaw}`;
}

export function formatExponential(value: number, digits = 2): string {
  if (value === 0) return "0";
  const sign = value < 0 ? "−" : "";
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  const mantissa = value / 10 ** exponent;
  return `${sign}${formatDecimal(Math.abs(mantissa), digits)}×10${toSuperscript(exponent)}`;
}

const SUPERSCRIPTS: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "-": "⁻",
};

function toSuperscript(value: number): string {
  return String(value)
    .split("")
    .map((char) => SUPERSCRIPTS[char] ?? char)
    .join("");
}

/** Formatea un número de años con una precisión adaptada a su magnitud. */
export function formatYears(value: number): string {
  const a = Math.abs(value);
  if (a === 0) return "0";
  if (a < 1e-3) return formatExponential(value);
  if (a < 1) return formatDecimal(value, 4);
  if (a < 100) return formatDecimal(value, 3);
  if (a < 1e6) return formatDecimal(value, 1, true);
  return formatExponential(value);
}

/**
 * Cifras del visor: precisión fija para que, en fuente monoespaciada, el
 * tablero no baile cuando el valor cruza 1 o cambia de orden de magnitud.
 */
export function formatHudSpeed(v: number): string {
  const sign = v < 0 ? "−" : "";
  return `${sign}${formatDecimal(Math.abs(v), 5)}`;
}

export function formatHudYears(value: number): string {
  return formatDecimal(value, 3, Math.abs(value) >= 1000);
}

export function formatHudDistance(value: number): string {
  return formatDecimal(value, 3, Math.abs(value) >= 1000);
}

export function formatHudGamma(gamma: number): string {
  if (gamma >= 1000) return formatExponential(gamma);
  return formatDecimal(gamma, 3);
}

export function formatDistance(value: number): string {
  const a = Math.abs(value);
  if (a === 0) return "0";
  if (a < 1e-3) return formatExponential(value);
  if (a < 100) return formatDecimal(value, 3);
  if (a < 1e6) return formatDecimal(value, 1, true);
  return formatExponential(value);
}

/**
 * Convierte una duración en años a una etiqueta legible ("3,2 a", "8 meses",
 * "12 días") para las cifras pequeñas del reporte.
 */
export function humanizeYears(value: number): string {
  const a = Math.abs(value);
  if (a >= 1) return `${formatYears(value)} a`;
  const days = a * 365.25;
  if (days >= 1) return `${formatDecimal(days, 1)} d`;
  const hours = days * 24;
  if (hours >= 1) return `${formatDecimal(hours, 1)} h`;
  return `${formatDecimal(hours * 60, 1)} min`;
}
