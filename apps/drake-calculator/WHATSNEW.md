# Novedades — La calculadora de Drake

Registro de cambios por versión. La app está en [seap-udea.github.io/apps/drake-calculator](https://seap-udea.github.io/apps/drake-calculator/).

---

## 0.3.0

### Compartir configuración por URL

- Los parámetros de la calculadora pueden codificarse en la **URL** (modo de entrada, valores Drake, mapa, unidades, radiosfera, semilla, capas visibles).
- Al abrir un enlace con esos parámetros, la app **carga la configuración** automáticamente.
- Nuevo botón **Copiar enlace de configuración** al final del panel de parámetros.
- Implementación en `src/lib/drakeConfigUrl.ts`; documentación en el README (secciones *Compartir configuración* y *Configuración por URL*).

### Escenarios de ejemplo

- El README incluye una tabla de **escenarios listos para usar**: Drake 1961, modos Rango y Distribución, estimaciones con **η⊕** (Kepler), una sola civilización, Tierra rara, optimista SETI y galaxia muy poblada.
- Enlace en la introducción de la app: *Prueba algunos escenarios interesantes.*

### Mapa e interfaz

- **Tooltips al pasar el cursor** sobre civilizaciones (y sobre el Sol) cuando **N ≤ 250**: distancia al Sol, vecino más cercano y distancia al centro galáctico, en la unidad elegida.
- Botón **×** para cerrar los paneles laterales (Estadísticas, Configuración, Ayuda).
- Galaxia al **100 %** del ancho del contenedor del mapa.

---

## 0.2.0

### Pie de página y transparencia

- El footer muestra la **versión** de la app y la **fecha del último despliegue** (generada en CI o, en desarrollo, desde `git log`).
- Enlace **Código y README en GitHub** al repositorio de la app.
- Sección **Divulgación sobre inteligencia artificial (IA Disclosure)** al final del panel de Ayuda.

### Documentación

- **README** reescrito: ciencia de la ecuación, modos Exacto/Rango/Distribución, Monte Carlo, distribución espacial en el disco, ZHG y guía para desarrolladores.

---

## 0.1.5

Primera versión pública desplegada en GitHub Pages.

### Modelo y cálculo

- Ecuación de Drake completa con modos **Exacto**, **Rango** y **Distribución** (uniforme, triangular, gaussiana truncada).
- Simulación **Monte Carlo** (1 024 muestras) e intervalo del 95 % en modo Distribución.
- Valores por defecto inspirados en las estimaciones de **Drake 1961** (*L* = 100 años como valor central).
- Estadísticas derivadas: distancia media entre civilizaciones, vecino más cercano al Sol, radiosfera y probabilidad de detección dentro de ella.

### Mapa galáctico

- Visualización cenital de la Vía Láctea (imagen [mw-plot](https://milkyway-plot.readthedocs.io/); NASA/JPL-Caltech/R. Hurt).
- Tres distribuciones espaciales: **Disco**, **Brazos** y **ZHG** (zona de habitabilidad galáctica, 7–10 kpc).
- Superposición opcional del anillo ZHG y de la **radiosfera** alrededor del Sol.
- Unidades de distancia: kpc, kal y al.

### Interfaz

- Panel de **Ayuda** con definición de términos, botones **?** contextuales y guías (unidades, ZHG, distribuciones, disco galáctico).
- Diseño **responsive**: cabecera de estimación adaptada a móvil, correcciones en deslizadores y modos de entrada en pantallas pequeñas.
- Footer **Dr. Z Academy** unificado (`AcademyFooter`) y créditos del mapa.

---

## Licencia y contacto

Proyecto académico/divulgativo del grupo [SEAP](https://seap-udea.github.io) (Universidad de Antioquia).  
Autor: [Jorge I. Zuluaga](https://jorgezuluaga.github.io).
