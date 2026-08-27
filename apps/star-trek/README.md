# Star trek

Simulador interactivo de **cinemática relativista en una dimensión**: el puente
de mando de una nave que viaja entre las estrellas con aceleración propia
constante por tramos.

Por [Jorge I. Zuluaga](https://jorgezuluaga.github.io) · [Dr. Z Academy](https://drz.academy)

> Basado en Jorge I. Zuluaga, *Relatividad y Gravitación: teoría, algoritmos y
> problemas*, sección 1.11.5 «Movimiento con cuadriaceleración constante»
> ([libro en línea](https://seap-udea.github.io/books/Relatividad-Zuluaga/)).

## Qué hace

El comandante indica **hasta dónde quiere ir** (en años-luz) y divide el viaje en
**tramos**. Cada tramo puede ser:

- **Impulso** — aceleración propia constante, dada en *g* (la gravedad
  terrestre). Puede ser negativa: eso es frenar.
- **Crucero** — velocidad constante (*free coasting*), dada en fracciones de *c*,
  o simplemente manteniendo la velocidad que ya se traía.

Y cada tramo termina cuando se cumple una condición a elección:

| Condición | Significado |
| --- | --- |
| Lo que falte del viaje | Se extiende hasta completar la distancia al destino |
| Una distancia dada | En años-luz |
| Un % del viaje | Fracción de la distancia total |
| Un tiempo en la nave | Tiempo propio $\tau$, en años |
| Un tiempo en el planeta | Tiempo coordenado $t$, en años |

El tablero devuelve, **para cada tramo y para el total**: distancia recorrida,
tiempo coordenado (el del planeta de salida o de llegada), tiempo propio de la
nave, y velocidad mínima y máxima. Además grafica el perfil de vuelo (distancia,
tiempo coordenado y velocidad) y el diagrama de espacio-tiempo con el cono de
luz.

El plan por defecto es un solo tramo a **0,2 g** hasta **4,2 años-luz**
(Próxima Centauri).

## Planes de vuelo incluidos

- **Impulso continuo** — 0,2 g durante todo el trayecto; se llega a máxima
  velocidad, es decir, de sobrevuelo.
- **Giro a mitad de camino** — 0,2 g la primera mitad y −0,2 g la segunda. Se
  llega en reposo.
- **Un año de impulso** — un año de tiempo propio con motores y el resto en
  caída libre.
- **Impulso · crucero · frenado** — acelera el primer cuarto, navega la mitad
  central y frena el último cuarto.
- **Nave antorcha a 1 g** — gravedad artificial permanente y dilatación
  temporal extrema.
- **Crucero a 0,5 c** — sin motores, como referencia.

Cualquier combinación es posible: se pueden añadir, reordenar y eliminar tramos
libremente. El botón **Compartir plan** copia un enlace que reproduce el plan
completo, útil para dejar un ejercicio al curso.

## La física

Todo se calcula en **unidades luz**: distancias en años-luz (a-l), tiempos en
años (a) y velocidades en fracciones de $c$, de modo que $c = 1$. En esas
unidades una aceleración de $1\,g$ vale

$$
\alpha = 1\,g \cdot \frac{1\,\mathrm{a}}{c} = 1{,}0323\,\mathrm{a\text{-}l}/\mathrm{a}^{2}.
$$

Para un tramo con aceleración propia constante $\alpha$ y **condiciones
iniciales arbitrarias**, la solución general es

$$
\begin{aligned}
x_{L}(\tau)
  &= x_{L0} + \frac{\gamma_{0} v_{L0}}{\alpha}\sinh(\alpha\tau)
     + \frac{\gamma_{0}}{\alpha}\bigl[\cosh(\alpha\tau) - 1\bigr], \\
t(\tau)
  &= t_{0} + \frac{\gamma_{0}}{\alpha}\sinh(\alpha\tau)
     + \frac{\gamma_{0} v_{L0}}{\alpha}\bigl[\cosh(\alpha\tau) - 1\bigr], \\
v_{L}(\tau)
  &= \frac{v_{L0} + \tanh(\alpha\tau)}{1 + v_{L0}\tanh(\alpha\tau)}.
\end{aligned}
$$

Introduciendo la **rapidez** $\theta = \operatorname{artanh}(v_{L})$, con
$\gamma_{0} = \cosh\theta_{0}$ y $\gamma_{0} v_{L0} = \sinh\theta_{0}$, las tres
expresiones colapsan: la rapidez crece linealmente con el tiempo propio,

$$
\begin{aligned}
\theta(\tau) &= \theta_{0} + \alpha\tau, \\
x_{L}(\tau)  &= x_{L0} + \frac{\cosh\theta(\tau) - \cosh\theta_{0}}{\alpha}, \\
t(\tau)      &= t_{0} + \frac{\sinh\theta(\tau) - \sinh\theta_{0}}{\alpha}, \\
v_{L}(\tau)  &= \tanh\theta(\tau).
\end{aligned}
$$

`src/lib/relativity.ts` integra en $\theta$ y no en $v_{L}$: es la variable que
se mantiene finita y bien condicionada aun cuando la velocidad es
indistinguible de $1$ en punto flotante (viajar a Andrómeda a $1\,g$ da
$\gamma \approx 1{,}3\times 10^{6}$). Por eso el reporte puede mostrar
velocidades como $1 - 2{,}92\times 10^{-13}\,c$ sin perder cifras.

Invertir las ecuaciones para saber cuánto dura un tramo también es directo en
esta variable:

- **Hasta una distancia** $\Delta x$: $\cosh\theta_{1} = \alpha\Delta x + \cosh\theta_{0}$.
- **Hasta un tiempo coordenado** $\Delta t$: $\sinh\theta_{1} = \alpha\Delta t + \sinh\theta_{0}$.
- **Hasta un tiempo propio** $\Delta\tau$: $\theta_{1} = \theta_{0} + \alpha\Delta\tau$.

Un tramo de crucero es el caso $\alpha = 0$, donde simplemente $\Delta t = \gamma\Delta\tau$.

Cuando un tramo pide algo imposible —frenar más de lo que la distancia
permite, por ejemplo— la computadora de a bordo lo marca en rojo y explica por
qué, en vez de devolver un `NaN`.

### Ejemplo: $0{,}2\,g$ hasta Próxima Centauri

Un solo tramo de impulso desde el reposo, el plan por defecto de la app:
$g = 0{,}2$, $\Delta x = 4{,}2\,\mathrm{a\text{-}l}$, $\theta_{0} = 0$
($v_{L0} = 0$, $\gamma_{0} = 1$).

**1. Aceleración en unidades luz**

$$
\alpha = 0{,}2 \times 1{,}0323\,\mathrm{a\text{-}l}/\mathrm{a}^{2}
       = 0{,}2065\,\mathrm{a\text{-}l}/\mathrm{a}^{2}.
$$

**2. Rapidez al llegar** (el tramo cubre toda la distancia)

$$
\cosh\theta_{1} = 1 + \alpha\Delta x = 1 + 0{,}2065\times 4{,}2 = 1{,}867,
\qquad
\theta_{1} = \operatorname{arcosh}(1{,}867) = 1{,}237.
$$

**3. Todas las cantidades del reporte**

| Cantidad | Fórmula | Valor |
| --- | --- | --- |
| Distancia (planeta) | $\Delta x = (\cosh\theta_{1} - 1)/\alpha$ | $4{,}200\,\mathrm{a\text{-}l}$ |
| Duración (tripulantes) | $\tau = \theta_{1}/\alpha$ | $5{,}990\,\mathrm{a}$ |
| Duración (planeta) | $t = \sinh\theta_{1}/\alpha$ | $7{,}637\,\mathrm{a}$ |
| Diferencia (planeta − nave) | $t - \tau$ | $1{,}648\,\mathrm{a}$ |
| Dilatación | $t/\tau = \sinh\theta_{1}/\theta_{1}$ | $1{,}275$ |
| Velocidad máxima | $v_{L} = \tanh\theta_{1}$ | $0{,}84448\,c$ |
| Factor de Lorentz | $\gamma = \cosh\theta_{1}$ | $1{,}867$ |

Como no hay tramo de frenado, la nave **sobrevuela** el destino a esa
velocidad: no llega en reposo. El perfil de vuelo con giro a mitad de camino
($+0{,}2\,g$ la primera mitad y $-0{,}2\,g$ la segunda) usa las mismas
fórmulas en cada tramo y sí aterriza con $v_{L} = 0$.

### El cielo por la ventana

El visor no es decorativo: aplica las dos consecuencias ópticas de viajar cerca
de $c$.

- **Aberración relativista**,
  $\cos\theta' = (\cos\theta + v)/(1 + v\cos\theta)$:
  las estrellas se apiñan hacia la proa a medida que la nave acelera.
- **Efecto Doppler**,
  $D = 1\big/\bigl[\gamma(1 - v\cos\theta')\bigr]$:
  la luz de proa se corre al azul y la de popa al rojo.

## Desarrollo

```bash
npm install
npm run dev     # http://localhost:3000/apps/star-trek/
npm run build   # exporta a out/
npm run lint
```

La app se publica como export estático bajo `/apps/star-trek/` en
[seap-udea.github.io](https://seap-udea.github.io/apps/star-trek/).

## Estructura

```
src/
  app/
    globals.css              Tema del puente de mando
    layout.tsx  page.tsx
  components/
    StarshipBridge.tsx       Tablero completo: plan, reporte y reproductor
    Starfield.tsx            Campo estelar con aberración y Doppler
    FlightCharts.tsx         Perfil de vuelo y diagrama de espacio-tiempo
    NumberField.tsx          Campo numérico tolerante a lo que se escribe
  lib/
    relativity.ts            Motor de cinemática relativista
    flightPlans.ts           Destinos, planes típicos y enlaces compartibles
```

---

## Divulgación sobre inteligencia artificial (IA Disclosure)

Esta aplicación fue **desarrollada con asistencia de agentes de inteligencia artificial** (codificación, documentación, iteración de interfaz y corrección de errores).

Sin embargo, el **diseño conceptual**, la **concepción de las opciones** (tramos de impulso y crucero, condiciones de parada, planes de vuelo típicos, visor con aberración y Doppler, reporte de a bordo), las **decisiones científicas y pedagógicas** y la **interpretación de los resultados** son responsabilidad del autor, **Jorge I. Zuluaga**.

Los agentes de IA actuaron como herramientas de implementación bajo dirección humana; no sustituyen el criterio del autor sobre el modelo ni sobre la experiencia de uso.

---

## Licencia

Este código se publica bajo la licencia [MIT](LICENSE). Copyright © 2026 Jorge I. Zuluaga.
