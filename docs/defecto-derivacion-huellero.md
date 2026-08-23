# Defecto en `huellero_derivar_asistencia()` — pendiente para la sesión de `packages/db`

> **Encontrado:** 19-ago-2026, derivando las 3.084 marcas reales del huellero en producción.
> **Estado:** sin corregir. **No hay datos malos en la base**: la restricción
> `asistencias_trabajado_chk` (migración `0073`) aborta la transacción antes de escribir.
> **Zona:** crítica — es la función que convierte marcas en días pagados.

---

## Qué pasa

De los 222 días con marcas, **15 no se pudieron derivar**. Los 15 abortaron con:

```
new row for relation "asistencias" violates check constraint "asistencias_trabajado_chk"
Failing row: fecha 2026-06-11, turno M, hora_entrada 16:05:07, hora_salida null,
             condicion 'trabajado', fuente 'huellero'
```

Los 15 son días con un número **impar** de marcas (3 ó 5), o con 4 marcas repartidas de modo que
el emparejado deja una suelta. **Trece de los quince son de Jordan**, que es exactamente el caso
que la spec §6 describe: entra y sale varias veces al día.

| Persona | Fechas |
|---|---|
| Jordan | 22-ene, 28-ene, 30-ene, 3-feb, 7-feb, 24-feb, 5-mar, 3-jun, 9-jun, 22-jun, 24-jun, 27-jun |
| Elthom | 11-jun, 15-jun |
| Sheyla | 16-abr |

## Los dos problemas, y el segundo es el grave

**1. Escribe `'trabajado'` sin hora de salida.** La spec §6 dice que esa condición se escribe
**sólo** cuando la fila tiene entrada y salida, las dos cargadas. La restricción de la `0073`
existe precisamente para atajar esto, y lo está atajando.

**2. Borra una hora de salida declarada por una persona.** En la rama de `update` (línea ~199 de
`0075_huellero_asistencias.sql`) hace:

```sql
set hora_entrada = v_nueva_ent,
    hora_salida  = v_nueva_sal
```

sin condicionar a que el valor nuevo no sea nulo. Si la fila existente la declaró alguien con sus
dos horas y el huellero ese día tiene una sola marca, `v_nueva_sal` es `null` y **la hora
declarada se pierde**. Eso contradice la primera salvaguarda de la spec §6: *"Nunca sobreescribe
una hora cargada"*.

Hoy no llega a ocurrir porque la restricción aborta la transacción antes. Pero la restricción sólo
mira las filas en `'trabajado'`: **si la fila estuviera en `'sin_dato'`, el borrado pasa en
silencio.**

## Cómo reproducirlo

```sql
select huellero_derivar_asistencia(
  (select id from empleados where nombre = 'Jordan'),
  date '2026-02-07');   -- 5 marcas ese día
```

Otras fechas que sirven: 2026-01-22 (4 marcas), 2026-01-28, 2026-06-03, 2026-06-27.

## Qué exige el arreglo

Zona crítica (no-negociable 1): spec corregida antes que el código, y un test que cubra los dos
casos que hoy no cubre ninguno de los 40 de `packages/core/src/huellero.test.ts`:

1. Día con número impar de marcas: la fila resultante no puede quedar en `'trabajado'`.
2. Fila previa declarada con las dos horas + una sola marca del huellero ese día: las horas
   declaradas tienen que sobrevivir intactas.

Verificador antes de mergear.
