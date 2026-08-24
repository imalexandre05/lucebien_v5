# SPEC — Con qué nace marcado el reporte del turno

> **Qué es.** Un cambio de una línea con consecuencias en el sueldo: al abrir un turno nuevo, las
> actividades del catálogo llegaban **todas marcadas como hechas**. Ahora llegan sin marcar.
>
> **Zona de rigor:** spec corta, pero obligatoria. No toca el motor ni la base, y aun así entra
> directo a la cadena del sueldo: marcado → puntaje del turno → nota mensual → pago. El
> no-negociable 6 pide que quede escrito antes que el código, y esta spec se escribió **después**
> —un verificador adversarial lo señaló— así que el cambio queda a la espera de que Alexander lo
> confirme.
>
> **Estado:** escrita el 23-ago-2026. Código en `apps/erp-web/app/reportes/nuevo/form.tsx:184`.

---

## 1. Lo que pasaba

```ts
initDone[a.cod] = p ? Boolean(p.realizada) : true;
```

Cuando el turno ya tenía un borrador se respetaba lo guardado. Cuando no lo tenía —o sea, siempre
que alguien abre un turno por primera vez— **todas** las actividades del catálogo quedaban marcadas
como realizadas.

Al enviar, `submit()` manda sólo las marcadas (`cat.filter(a => done[a.cod])`), y el puntaje del
turno sale de ellas. Es decir: **enviar sin tocar nada declaraba el catálogo entero como cumplido.**

Comprobado en la base: los once borradores guardados tienen el 100 % de sus actividades en
`realizada = true`.

## 2. Por qué importa

De ahí sale el puntaje del turno; del puntaje, la nota mensual; de la nota, el pago. Un default que
declara de más no se nota: nadie reclama por un punto que le sobra. Un default que declara de menos
lo nota la propia persona en el acto, y lo corrige.

Esa asimetría es la que decide: **el error silencioso es peor que el error visible**, aunque cueste
más clics.

## 3. Lo que se hace

Las actividades nacen **sin marcar**. Quien levanta el turno marca lo que hizo.

Es, además, lo que el equipo ya conoce: el sistema viejo —el que usan hoy— dibuja las casillas sin
marcar (`public/js/app.js:512`). La disposición que el equipo ya usa no es deuda, es conocimiento.

## 4. El costo, dicho sin adornos

Un turno tiene decenas de actividades. Marcarlas una por una, todos los días, es trabajo real que
antes no existía. Si el equipo lo rechaza, hay tres salidas, en orden de preferencia:

1. **Un botón «Todas»** bien a mano, que marque el catálogo de un golpe. Sigue siendo una decisión
   de la persona, no un default del sistema, y es la diferencia que importa.
2. **Recordar lo del turno anterior**: abrir el turno con lo que se marcó la última vez en esa sede.
   Acierta casi siempre y sigue siendo revisable.
3. **Volver al default de antes**, aceptando por escrito que el puntaje del turno es «todo hecho
   salvo que alguien desmarque».

## 5. Lo que queda anotado

- **La prueba de escritura E2E perdió cobertura en silencio.** `write-flows.spec.ts` creaba el
  reporte sin marcar nada; con el default viejo quedaba evaluable y el recorrido seguía por
  evaluar → anular. Con el nuevo, ese tramo se saltea solo por el `isEnabled()`: la prueba sigue en
  verde y ya no prueba lo que dice probar. Se corrige haciendo clic en «Todas» antes de enviar.
- **Confirmación pendiente de Alexander.** Es su decisión, no la de quien escribió el código.
