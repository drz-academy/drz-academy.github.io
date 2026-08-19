# La calculadora de Drake

Aplicación web interactiva para explorar la [ecuación de Drake](https://es.wikipedia.org/wiki/Ecuaci%C3%B3n_de_Drake), estimar cuántas civilizaciones podrían estar comunicándose hoy en la Vía Láctea y visualizarlas sobre un mapa galáctico.

**Autor:** [Jorge I. Zuluaga](https://jorgezuluaga.github.io)  
**Demostración:** [seap-udea.github.io/apps/drake-calculator/](https://seap-udea.github.io/apps/drake-calculator/)  
**Novedades:** [WHATSNEW.md](./WHATSNEW.md)

---

## ¿Qué es esta aplicación?

La calculadora permite ajustar cada factor de la ecuación de Drake mediante deslizadores, elegir cómo tratar la incertidumbre (valor exacto, rango o distribución de probabilidad) y ver el resultado **N** como número estimado de civilizaciones comunicantes. Además:

- Dibuja las civilizaciones sobre una vista cenital de la Vía Láctea.
- Calcula estadísticas espaciales: distancia media entre civilizaciones, vecino más cercano al Sol, radio de la radiosfera y probabilidad de que alguna civilización quede dentro de ese radio.
- Ofrece tres modos de distribución espacial en el disco: **Disco**, **Brazos** y **ZHG** (zona de habitabilidad galáctica).
- Incluye un panel de **Ayuda** contextual con enlaces a Wikipedia y explicaciones del modelo.
- Permite **compartir o guardar** una configuración concreta mediante un enlace (parámetros en la URL).

Todo el cálculo se ejecuta en el navegador; no hay servidor ni base de datos en tiempo de ejecución.

---

## Breve historia de la ecuación de Drake

En 1961, el radioastrónomo Frank Drake organizó la primera reunión científica dedicada a la búsqueda de inteligencia extraterrestre, en el Observatorio de Green Bank (Virginia Occidental). Para guiar la conversación, escribió una ecuación que descompone el problema en factores observables o estimables.

La ecuación no predice *dónde* está una civilización concreta, sino cuántas podrían existir **simultáneamente** en un momento dado, bajo supuestos sobre la formación estelar, la aparición de vida, la tecnología y la longevidad de las señales detectables. Desde entonces se ha convertido en una herramienta pedagógica y de orden de magnitud en astrobiología y SETI, más que en una fórmula con constantes bien medidas.

Los valores por defecto de esta calculadora toman como referencia las estimaciones originales de Drake y sus colegas en aquella conferencia ([Wikipedia: Original estimates](https://en.wikipedia.org/wiki/Drake_equation#Original_estimates)), con **L = 100 años** como valor central de trabajo (aunque el rango histórico abarca de 10³ a 10⁸ años).

---

## La ciencia: la ecuación y sus términos

La forma clásica es:

**N = R★ · fₚ · nₑ · fₗ · fᵢ · f𝒸 · L**

| Símbolo | Nombre en la app | Significado |
|---------|------------------|-------------|
| **N** | Civilizaciones comunicantes | Resultado: cuántas civilizaciones emiten señales detectables *ahora* |
| **R★** | Tasa de formación estelar | Estrellas nuevas por año en la galaxia |
| **fₚ** | Fracción de estrellas con planetas | Fracción de estrellas con al menos un planeta |
| **nₑ** | Mundos habitables | Planetas potencialmente habitables por sistema |
| **fₗ** | Probabilidad de abiogénesis | Fracción de esos mundos donde aparece la vida |
| **fᵢ** | Probabilidad de inteligencia | Fracción de mundos con vida que desarrollan inteligencia tecnológica |
| **f𝒸** | Probabilidad de tecnología de comunicaciones | Fracción que produce señales detectables a distancia |
| **L** | Tiempo comunicándose | Años durante los cuales una civilización mantiene señales detectables |

**N** es el producto de todos los factores. Intuitivamente: cuántas estrellas “arrancan” el pipeline cada año, multiplicado por las fracciones de éxito en cada etapa, multiplicado por cuánto tiempo permanecen “encendidas” en radio.

En la interfaz, **L** se controla en escala logarítmica (el deslizador mueve log₁₀ L); internamente la app calcula **L = 10^exponente** años.

---

## Qué puedes hacer con la app

### Modos de entrada de parámetros

1. **Exacto** — Un valor fijo por parámetro. **N** es determinista.
2. **Rango** — Mínimo y máximo por parámetro. La app muestra el rango de **N** (evaluando los extremos del producto) y coloca en el mapa una **muestra aleatoria uniforme** dentro de esos intervalos.
3. **Distribución** — Igual que rango, pero cada parámetro sigue una distribución **uniforme**, **triangular** o **gaussiana (normal truncada)**. La app reporta el **promedio** de **N** y un **intervalo del 95 %** obtenido por simulación Monte Carlo.

### Configuración del mapa

- **Distribución espacial:** Disco (solo perfil radial), Brazos (espirales fuera del bulbo) o ZHG (preferencia por el anillo 7–10 kpc).
- **Unidades de distancia:** kpc, kal (kilo-años-luz) o al (años-luz).
- **Radiósfera:** radio en años (≈ años-luz a velocidad *c*); opción de dibujarlo alrededor del Sol.
- **Dibujar ZHG:** superpone el anillo de habitabilidad galáctica.
- **Reorganizar civilizaciones:** nueva semilla aleatoria para las posiciones del mapa.

### Paneles laterales

- **Estadísticas** — Distancias, radiosfera, probabilidades (con intervalos en modo Distribución).
- **Configuración** — Opciones anteriores.
- **Ayuda** — Definición de términos y conceptos del modelo (unidades, ZHG, distribuciones, disco galáctico). Los botones **?** junto a parámetros y controles abren la sección correspondiente.

### Compartir configuración

Al final del panel de parámetros aparece el enlace **Copiar enlace de configuración**. Al pulsarlo se copia al portapapeles la URL de la página con el estado actual codificado en los parámetros de consulta (modo de entrada, valores Drake, distribución espacial, unidades, radiosfera, semilla del mapa, capas visibles, etc.).

- **Compartir:** envía el enlace a otra persona o pégalo en material de clase; al abrirlo, la calculadora carga esa configuración automáticamente.
- **Guardar:** marca la URL en el navegador o en un documento para volver más tarde al mismo escenario.

La referencia técnica de todos los parámetros URL está en [Configuración por URL (GET)](#configuración-por-url-get) (sección para desarrolladores).

### Escenarios de ejemplo

Enlaces listos para abrir en [seap-udea.github.io/apps/drake-calculator](https://seap-udea.github.io/apps/drake-calculator/). **N** es el valor mostrado por la app (redondeo al entero más cercano en modo exacto).

#### Modos de entrada

| Escenario | Modo | N (aprox.) | Descripción |
|-----------|------|------------|-------------|
| [Drake 1961](https://seap-udea.github.io/apps/drake-calculator/?mode=exact&starRate=1&planetFraction=0.35&habitablePlanets=3&lifeFraction=1&intelligenceFraction=1&communicationFraction=0.15&lifetimeYears=100&spatial=ghz&unit=al&radio=100&seed=2026&showRadio=1&showGhz=1) | Exacto | 16 | Valores originales de la conferencia de Green Bank (*L* = 100 años). |
| [Incertidumbre histórica](https://seap-udea.github.io/apps/drake-calculator/?mode=range&starRateMin=1&starRateMax=1&planetFractionMin=0.2&planetFractionMax=0.5&habitablePlanetsMin=1&habitablePlanetsMax=5&lifeFractionMin=1&lifeFractionMax=1&intelligenceFractionMin=1&intelligenceFractionMax=1&communicationFractionMin=0.1&communicationFractionMax=0.2&lifetimeYearsMin=1000&lifetimeYearsMax=100000000&spatial=ghz&unit=al&radio=100&seed=2026&showRadio=1&showGhz=1) | Rango | 20 – 50 M | Rangos amplios de Drake; *L* entre 10³ y 10⁸ años domina el intervalo de **N**. |
| [Monte Carlo pedagógico](https://seap-udea.github.io/apps/drake-calculator/?mode=distribution&starRateMin=1&starRateMax=1&starRateDist=uniform&planetFractionMin=0.2&planetFractionMax=0.8&planetFractionDist=gaussian&habitablePlanetsMin=0.5&habitablePlanetsMax=5&habitablePlanetsDist=triangular&lifeFractionMin=1&lifeFractionMax=1&lifeFractionDist=uniform&intelligenceFractionMin=1&intelligenceFractionMax=1&intelligenceFractionDist=uniform&communicationFractionMin=0.05&communicationFractionMax=0.3&communicationFractionDist=gaussian&lifetimeYearsMin=100&lifetimeYearsMax=1000000&lifetimeYearsDist=triangular&spatial=ghz&unit=al&radio=100&seed=2026&showRadio=1&showGhz=1) | Distribución | variable | Mismos órdenes de magnitud que Drake 1961, pero con distribuciones gaussiana/triangular en *fₚ*, *nₑ*, *f𝒸* y *L*; muestra promedio e intervalo del 95 %. |

#### Astrofísica reciente (η⊕)

Tras Kepler, muchos autores fijan **fₚ ≈ 1** (casi todas las estrellas con planetas) y usan **η⊕** — la fracción de estrellas con planetas rocosos en la zona habitable — en lugar del producto *fₚ nₑ*. En esta app, con **fₚ = 1**, se identifica **nₑ ≈ η⊕**.

| Escenario | Modo | N (aprox.) | Parámetros clave |
|-----------|------|------------|------------------|
| [Kepler / η⊕ (punto)](https://seap-udea.github.io/apps/drake-calculator/?mode=exact&starRate=1.5&planetFraction=1&habitablePlanets=0.24&lifeFraction=0.1&intelligenceFraction=0.01&communicationFraction=0.1&lifetimeYears=10000&spatial=ghz&unit=al&radio=100&seed=2026&showRadio=1&showGhz=1) | Exacto | ≈ 0 | **R★** = 1,5 /año; **fₚ** = 1; **nₑ** = **η⊕** ≈ 0,24 ([Petigura et al. 2013](https://www.pnas.org/doi/10.1073/pnas.1219909110)); factores biológicos conservadores (*fₗ*, *fᵢ*, *f𝒸* bajos); *L* = 10⁴ años. |
| [Kepler / η⊕ (incertidumbre)](https://seap-udea.github.io/apps/drake-calculator/?mode=range&starRateMin=1&starRateMax=3&planetFractionMin=0.9&planetFractionMax=1&habitablePlanetsMin=0.1&habitablePlanetsMax=0.5&lifeFractionMin=0.01&lifeFractionMax=1&intelligenceFractionMin=0.001&intelligenceFractionMax=0.1&communicationFractionMin=0.01&communicationFractionMax=0.5&lifetimeYearsMin=100&lifetimeYearsMax=1000000&spatial=ghz&unit=al&radio=100&seed=2026&showRadio=1&showGhz=1) | Rango | amplio | Incertidumbre en **R★**, **η⊕** ∈ [0,1; 0,5], factores biológicos y *L*; útil para ver cómo domina la bioincertidumbre. |

#### Escenarios extremos y pedagógicos

| Escenario | Modo | N (aprox.) | Descripción |
|-----------|------|------------|-------------|
| [Una sola civilización](https://seap-udea.github.io/apps/drake-calculator/?mode=exact&starRate=1&planetFraction=0.1&habitablePlanets=0.5&lifeFraction=1&intelligenceFraction=1&communicationFraction=0.2&lifetimeYears=100&spatial=disk&unit=al&radio=100&seed=2026&showRadio=1&showGhz=0) | Exacto | 1 | *fₚ* y *nₑ* bajos, *f𝒸* = 0,2; mapa en modo **Disco** con un solo punto. |
| [Una civilización (solo *f𝒸*)](https://seap-udea.github.io/apps/drake-calculator/?mode=exact&starRate=1&planetFraction=0.35&habitablePlanets=3&lifeFraction=1&intelligenceFraction=1&communicationFraction=0.01&lifetimeYears=100&spatial=ghz&unit=al&radio=100&seed=2026&showRadio=1&showGhz=1) | Exacto | 1 | Resto en valores Drake 1961; solo **f𝒸** ≈ 1 % para que **N** ≈ 1. |
| [Tierra rara](https://seap-udea.github.io/apps/drake-calculator/?mode=exact&starRate=1&planetFraction=0.5&habitablePlanets=0.1&lifeFraction=0.01&intelligenceFraction=0.001&communicationFraction=0.01&lifetimeYears=1000&spatial=ghz&unit=al&radio=100&seed=2026&showRadio=1&showGhz=1) | Exacto | 0 | Hipótesis pesimista: vida e inteligencia muy raras; galaxia efectivamente vacía. |
| [Optimista SETI](https://seap-udea.github.io/apps/drake-calculator/?mode=exact&starRate=3&planetFraction=1&habitablePlanets=0.5&lifeFraction=0.5&intelligenceFraction=0.5&communicationFraction=0.5&lifetimeYears=100000&spatial=ghz&unit=al&radio=100&seed=2026&showRadio=1&showGhz=1) | Exacto | 18 750 | Muchas civilizaciones longevas; mapa saturado (máx. 3 000 puntos visibles). |
| [Galaxia muy poblada (brazos)](https://seap-udea.github.io/apps/drake-calculator/?mode=exact&starRate=2&planetFraction=1&habitablePlanets=2&lifeFraction=1&intelligenceFraction=0.5&communicationFraction=0.3&lifetimeYears=10000&spatial=arms&unit=al&radio=100&seed=42&showRadio=1&showGhz=1) | Exacto | 6 000 | **N** alto con distribución espacial en **Brazos** espirales (semilla fija 42). |

---

## Cómo se hacen los cálculos

### Modo exacto

Se evalúa directamente:

```
N = R★ × fₚ × nₑ × fₗ × fᵢ × f𝒸 × L
```

**Ejemplo con los valores por defecto:**

| Parámetro | Valor |
|-----------|-------|
| R★ | 1 / año |
| fₚ | 0,35 |
| nₑ | 3 |
| fₗ | 1 |
| fᵢ | 1 |
| f𝒸 | 0,15 |
| L | 100 años |

```
N = 1 × 0,35 × 3 × 1 × 1 × 0,15 × 100 = 15,75 → 16 civilizaciones
```

(el mapa muestra 16 puntos; el encabezado redondea **N** al entero más cercano).

### Modo rango

Para cada parámetro se definen **mínimo** y **máximo**. La app calcula:

- **N_mín** = producto evaluado con todos los mínimos.
- **N_máx** = producto evaluado con todos los máximos.

**Ejemplo con los rangos por defecto** (entre otros):

| Parámetro | Mín | Máx |
|-----------|-----|-----|
| fₚ | 0,2 | 0,5 |
| nₑ | 1 | 5 |
| f𝒸 | 0,1 | 0,2 |
| L | 10³ años | 10⁸ años |

```
N_mín = 1 × 0,2 × 1 × 1 × 1 × 0,1 × 1 000 = 20
N_máx = 1 × 0,5 × 5 × 1 × 1 × 0,2 × 100 000 000 = 50 000 000
```

La interfaz muestra ese rango posible. Para el mapa, en cada actualización se **muestrea cada parámetro de forma uniforme** en su intervalo (generador pseudoaleatorio reproducible por semilla) y se calcula una realización de **N**; las posiciones galácticas corresponden a esa muestra.

> **Nota:** El rango del producto no es simétrico ni garantiza que todos los valores intermedios sean igualmente probables; solo acota los extremos cuando se varían todos los factores a la vez en sus límites.

### Modo distribución y Monte Carlo

Cuando hay incertidumbre estructurada, muestrear solo extremos es insuficiente. En modo **Distribución** la app ejecuta **1 024 simulaciones Monte Carlo**:

1. Para la simulación *i*, se sortea un valor de cada parámetro según su distribución elegida dentro del intervalo del deslizador:
   - **Uniforme:** equiprobable en [mín, máx].
   - **Triangular:** moda en el centro; densidad lineal hacia los extremos.
   - **Gaussiana truncada:** media en el centro, σ = mitad del ancho del intervalo; valores fuera del rango se descartan (muestreo por rechazo, Box–Muller).
2. Se calcula **Nᵢ** para esa tirada.
3. Con las 1 024 realizaciones se obtiene:
   - **Promedio** de **N** (media muestral).
   - **Intervalo del 95 %:** percentiles 2,5 y 97,5 de la muestra.

**Ejemplo conceptual:** si fₚ ~ Uniforme(0,2, 0,5), nₑ ~ Uniforme(1, 5) y el resto fijo en los valores centrales, cada tirada produce un **N** distinto; tras 1 024 tiradas la media podría acercarse al producto de medias univariadas, pero en general **no** coincide con evaluar el producto en las medias porque los factores se multiplican (hay correlación inducida en **N** aunque los parámetros se muestreen de forma independiente).

Las estadísticas espaciales en modo Distribución (distancia media, probabilidad en la radiosfera) se resumen también con intervalos: la media se evalúa en **N** redondeado de la media Monte Carlo, y los extremos del 95 % se propagan evaluando esas métricas en **N** mínimo y máximo del intervalo.

El mapa muestra una **única muestra** aleatoria (una tirada de parámetros), no el promedio.

---

## Cómo se distribuyen las civilizaciones en el disco

Las posiciones **no** son uniformes en el área del mapa. El modelo sigue un **disco exponencial** con densidad superficial radial:

```
Σ(R) ∝ R · e^(−R / h)
```

donde **R** es el radio galactocéntrico en kpc y **h ≈ 3,5 kpc** es la escala de longitud (`MILKY_WAY_SCALE_LENGTH_KPC`). Hay más estrellas — y por tanto más puntos — hacia el interior que hacia el borde (hasta **R_máx ≈ 21,1 kpc**).

### Muestreo de posiciones

Para cada civilización:

1. Se elige **R** por **muestreo por rechazo** acorde a la ley radial *R e^(−R/h)* (normalizada en el disco).
2. Se elige un **ángulo** uniforme en [0, 2π).
3. Se convierten a coordenadas del SVG del mapa (el Sol está en ~8,5 kpc, marcado en la imagen).

### Modos espaciales

| Modo | Comportamiento |
|------|----------------|
| **Disco** | Solo perfil radial exponencial en todo el disco. |
| **Brazos** | Dentro del bulbo (~4 kpc): solo perfil radial. Fuera del bulbo: los puntos se agrupan en **cuatro brazos espirales logarítmicos** superpuestos al perfil radial. |
| **ZHG** | Parte del perfil radial, pero con **filtrado por habitabilidad galáctica:** dentro del anillo 7–10 kpc se aceptan todos los candidatos; fuera del anillo solo el **10 %**; hacia el centro la retención baja **linealmente** del 10 % en 7 kpc al 0 % en el centro. |

La imagen de fondo proviene de [`mw-plot`](https://milkyway-plot.readthedocs.io/) (NASA/JPL-Caltech/R. Hurt). El mapa limita la visualización a **3 000** civilizaciones aunque **N** sea mayor.

### Estadísticas espaciales derivadas

- **Distancia media entre civilizaciones:** media del vecino más cercino en una muestra de posiciones (con escalado √(N_muestra/N) cuando **N** es grande).
- **Probabilidad dentro de la radiosfera:** modelada como **1 − exp(−N · p)** donde *p* es la probabilidad de que una civilización caiga dentro del círculo de la radiosfera centrado en el Sol, calculada analíticamente con la densidad radial (en modo ZHG se combina densidad local en el Sol dentro del anillo con una contribución del disco completo).
- **Radiósfera:** el usuario define un tiempo en años; a velocidad *c* equivale al mismo número de años-luz.

---

## Divulgación sobre inteligencia artificial (IA Disclosure)

Esta aplicación fue **desarrollada con asistencia de agentes de inteligencia artificial** (codificación, documentación, iteración de interfaz y corrección de errores).

Sin embargo, el **diseño conceptual**, la **concepción de las opciones** (modos Exacto/Rango/Distribución, distribuciones espaciales Disco/Brazos/ZHG, tipos de distribución de parámetros, estadísticas mostradas, panel de ayuda contextual), las **decisiones científicas y pedagógicas** y la **interpretación de los resultados** son responsabilidad del autor, **Jorge I. Zuluaga**.

Los agentes de IA actuaron como herramientas de implementación bajo dirección humana; no sustituyen el criterio del autor sobre el modelo ni sobre la experiencia de uso.

---

## Para los desarrolladores

### Pila tecnológica

- **Next.js 16** (App Router) con **React 19** y **TypeScript**
- Estilos con **Tailwind CSS 4** y CSS personalizado (`src/app/globals.css`)
- Exportación **estática** (`output: "export"`) para GitHub Pages
- Sin backend: toda la lógica en `src/components/DrakeCalculator.tsx`

### Estructura relevante

```
apps/drake-calculator/
├── src/
│   ├── app/              # layout, globals.css, metadatos
│   ├── lib/
│   │   └── drakeConfigUrl.ts     # serialización de configuración en la URL
│   └── components/
│       ├── DrakeCalculator.tsx   # lógica principal, UI y estadísticas
│       └── DualRangeSlider.tsx   # deslizador de rango doble
├── public/               # imagen galáctica, ATTRIBUTION.md
├── WHATSNEW.md           # registro de cambios por versión
├── next.config.ts        # basePath /apps/drake-calculator
├── Dockerfile            # build standalone (DOCKER_BUILD=1)
└── package.json
```

### Configuración por URL (GET)

La calculadora no tiene backend: la «API» de configuración son los **parámetros de consulta** de la propia página. Al abrir un enlace con esos parámetros, la app carga automáticamente los valores; el botón **Copiar enlace de configuración** (al final del panel de parámetros) genera la URL con el estado actual.

| Parámetro | Valores | Descripción |
|-----------|---------|-------------|
| `mode` | `exact`, `range`, `distribution` | Modo de entrada |
| `starRate`, `planetFraction`, … | número | En modo exacto |
| `{param}Min`, `{param}Max` | número | En modo rango o distribución |
| `{param}Dist` | `uniform`, `gaussian`, `triangular` | Solo en modo distribución |
| `lifetimeYears` | número | Vida media *L* (años); en rango/distribución usar `lifetimeYearsMin` / `lifetimeYearsMax` |
| `spatial` | `arms`, `disk`, `ghz` | Distribución espacial en el mapa |
| `unit` | `kpc`, `al`, `kal` | Unidad de distancia |
| `radio` | número | Años de la radiosfera |
| `seed` | entero | Semilla del mapa |
| `showRadio`, `showGhz` | `0` o `1` | Capas del mapa |

Ejemplo (modo exacto con valores Drake 1961 y mapa en ZHG):

```
/apps/drake-calculator/?mode=exact&starRate=1&planetFraction=0.35&habitablePlanets=3&lifeFraction=1&intelligenceFraction=1&communicationFraction=0.15&lifetimeYears=100&spatial=ghz&unit=al&radio=100&seed=2026&showRadio=1&showGhz=0
```

Implementación: `src/lib/drakeConfigUrl.ts` (`parseDrakeConfigFromSearch`, `buildDrakeConfigUrl`).

### Comandos

```bash
npm install
npm run dev      # desarrollo local (Turbopack)
npm run build    # genera out/ para export estático
npm run lint
```

### Publicación

- **GitHub Pages:** la app se despliega en `/apps/drake-calculator/` del sitio [seap-udea.github.io](https://seap-udea.github.io).
- Desde la raíz del repositorio: `make build` (o el flujo en `.github/workflows/deploy.yml`).
- **Docker:** con `DOCKER_BUILD=1` el build produce salida `standalone` servible con Node en el puerto 3000.

### Constantes clave del modelo (referencia rápida)

| Constante | Valor |
|-----------|-------|
| Escala del disco *h* | 3,5 kpc |
| Radio del disco | 21,1 kpc |
| Bulbo | ~4 kpc |
| ZHG | 7–10 kpc (10 % retención fuera) |
| Muestras Monte Carlo | 1 024 |
| Máx. puntos en mapa | 3 000 |
| 1 kpc | ≈ 3 262 al |

### Créditos de imagen

Mapa galáctico generado con [mw-plot](https://milkyway-plot.readthedocs.io/); crédito **NASA/JPL-Caltech/R. Hurt (SSC/Caltech)**. Ver también `public/ATTRIBUTION.md`.

---

## Licencia y contacto

Proyecto académico/divulgativo asociado al grupo [SEAP](https://seap-udea.github.io) (Universidad de Antioquia). Para consultas sobre el contenido científico o el diseño de la herramienta, contactar al autor vía [jorgezuluaga.github.io](https://jorgezuluaga.github.io).
