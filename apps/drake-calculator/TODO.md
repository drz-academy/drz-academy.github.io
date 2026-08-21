# La calculadora de Drake por Jorge I. Zuluaga

En esta lista incluyo algunas ideas de facilidades que se podrían implementar y otras que ya se han implementado.

## Implementaciones pendientes y posibles

- [ ] Crear una versión bilingüe.

- [ ] Versiones alternativas de la ecuación de Drake: por ejemplo fi*fl se pueden poner una sola opción fb; se puede por ejemplo agregar una opción para tener en cuenta exolunas habitables.

- [ ] Agregar una opción que muestre expansión de las civilizaciones por la Galaxia usando un modelo de percolación.

- [ ] Agregar a cada civilización un valor de L diferente.

- [ ] Crear una versión en el universo observable en lugar de en la Galaxia. En este caso no mostrar puntos indicando donde están las civilizaciones sino un mapa de calor indicando la densidad de civilizaciones; las estadísticas también cambiarían.

- [ ] Hacer un modelo de aparición de civilizaciones que calcule N en un proceso de Monte Carlo dinámico y no con una fórmula sencilla a la Drake.

## Implementaciones realizadas

- [X] Crear una API para peticiones get que permita guardar escenarios (valores de los parámetros).
   
   - En la versión 0.3.0 se puede guardar escenarios en el URL como: https://seap-udea.github.io/apps/drake-calculator/?mode=exact&starRate=1&planetFraction=0.1&habitablePlanets=0.5&lifeFraction=1&intelligenceFraction=1&communicationFraction=0.2&lifetimeYears=100&spatial=disk&unit=al&radio=100&seed=2026&showRadio=1&showGhz=0.
