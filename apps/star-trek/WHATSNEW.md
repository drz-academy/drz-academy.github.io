# Novedades — Viaje a las estrellas

Registro de cambios por versión. La app está en [seap-udea.github.io/apps/star-trek](https://seap-udea.github.io/apps/star-trek/).

---

## 0.2.0

Iteración sobre el puente de mando: el plan se puede completar solo, el reporte
dice a dónde se llegó de verdad, y el tablero deja de hablar de «la Tierra» y
del «capitán».

### Ajuste automático del plan

- **Ajustar crucero** añade un tramo final a la velocidad ya alcanzada que cubre
  lo que falte. Se desactiva si la nave está en reposo o retrocede.
- **Ajustar impulso** añade un tramo de aceleración hasta el destino. Si con la
  última *g* se puede frenar y alcanzar, frena; si no, impulsa hacia adelante.
- **Ajustar frenado** calcula la desaceleración para llegar **en reposo**. Si el
  plan era un sobrevuelo desde el reposo, lo convierte en giro a mitad de camino
  (+*g* y luego −*g*).
- **Reiniciar** y **Compartir plan** viven bajo el título Tramos; abajo quedan
  Añadir tramo y los tres ajustes.

### Reporte y lenguaje

- **Distancia (planeta)** y el resto de casillas muestran el final del plan
  actual, no el destino del selector. Si el viaje se queda corto aparece
  *alcanzada · faltan … a-l*.
- Las etiquetas **Tierra** pasan a **planeta** (duración, ejes de los gráficos,
  bitácora). El tiempo de la nave va antes que el del planeta.
- El tablero habla de **comandante** (*tiempo de comandante*, *entrada
  comandante*) en lugar del masculino genérico «capitán».

### Puente de mando

- Cabecera en dos columnas: silueta **Daedalus** a la izquierda, título en
  cursiva, byline e introducción. Se quitó el cinto «Cinemática relativista
  interactiva».
- La teoría queda **plegada** hasta que se pide; la cita del libro va antes de
  la nota sobre Daedalus.
- Pie en una línea: versión, fecha, GitHub y WHATSNEW.
- El reproductor carga a **mitad de viaje, en pausa**, con el cielo animado; al
  llegar no se congela.
- **G a bordo** en la esquina del visor: aceleración propia con signo (cero en
  crucero).
- En pantallas estrechas el reporte va justo bajo el visor y el plan, antes de
  la teoría.

### Enlaces y números

- Los planes compartidos usan `URLSearchParams` y tramos unidos con `~`, de modo
  que un vuelo de varios tramos sobrevive al primer pintado. Al compartir, la
  barra de direcciones se actualiza.
- Cifras y fechas **deterministas** (sin `Intl`) para que el HTML del servidor y
  el del navegador coincidan; las coordenadas SVG se redondean igual en ambos.

### Documentación

- README con las ecuaciones en LaTeX y un ejemplo numérico completo (0,2 g hasta
  Próxima). Divulgación de IA y licencia MIT.

---

## 0.1.0

Primera versión.

### Plan de vuelo

- El capitán fija el **destino** en años-luz, con una lista de objetivos reales
  desde Próxima Centauri (4.2 a-l, el valor por defecto) hasta Andrómeda.
- El viaje se divide en **tramos** de dos tipos: **impulso** con aceleración
  propia constante en *g* (positiva o negativa) y **crucero** a velocidad
  constante en fracciones de *c*, que puede heredar la velocidad ya alcanzada.
- Cada tramo termina según una de cinco condiciones: lo que falte del viaje, una
  distancia, un porcentaje del trayecto, un tiempo propio de la nave o un tiempo
  coordenado en la Tierra.
- Seis **planes de vuelo típicos** listos para usar, empezando por el tramo
  único a 1/6 g.
- Los tramos se pueden añadir, reordenar y eliminar; **Compartir plan** copia un
  enlace que reproduce el vuelo completo.

### Reporte de vuelo

- Totales del viaje: distancia cubierta, reloj en la Tierra, reloj de la nave,
  tiempo que la tripulación no envejece, velocidad máxima y factor de Lorentz
  máximo.
- **Bitácora por tramo** con distancia, tiempo coordenado, tiempo propio y
  velocidad mínima y máxima de cada etapa.
- Avisos cuando el plan se queda corto, se pasa de largo o llega a velocidad de
  sobrevuelo; los tramos imposibles (frenar más de lo que la distancia permite)
  se marcan y se explican.
- **Perfil de vuelo** con distancia, tiempo coordenado y velocidad, graficables
  contra el tiempo de la nave o el de la Tierra, y **diagrama de espacio-tiempo**
  con el cono de luz.

### Puente de mando

- Ventanal con campo estelar y nebulosas que aplica **aberración relativista** y
  **efecto Doppler** reales: las estrellas se apiñan hacia la proa y se corren al
  azul a medida que la nave acelera.
- Reproductor del viaje con lectura en vivo de velocidad, factor de Lorentz,
  distancia recorrida y ambos relojes.
- Diseño adaptado a teléfonos: la bitácora se convierte en tarjetas y los
  gráficos se redibujan al ancho disponible.

### Motor de cálculo

- Solución exacta del movimiento con aceleración propia constante y condiciones
  iniciales arbitrarias, integrada en **rapidez** para no perder precisión a
  velocidades ultrarrelativistas.
