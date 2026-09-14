# Huellero — 880 marcas sin asignar, y una persona activa marcando hoy sin que se cuente

> **Qué es esto.** Medido contra `scilb` el 6/8-sep-2026 para B-8/B-11 de
> [la hoja de ruta](superpowers/specs/2026-08-25-reunion-admin-hoja-de-ruta.md) —*«mejorar el
> reconocimiento del huellero»* y *«cómo registrar persona y conectar huellero»*—. **No es código.**
> Es el mismo tipo de hallazgo que ya documenta
> [puesta-en-marcha-huellero.md §7](puesta-en-marcha-huellero.md): la cola de identificadores sin
> asignar existe y funciona (**Asistencias → Huellero**), y esto es lo que hay hoy en esa cola,
> medido y explicado para decidir con el costo a la vista — el mismo criterio del 14-ago para
> «eliminar personal».

---

## 0. Lo que estaba en la lista y ya no aplica

`defecto-derivacion-huellero.md` (19-ago) quedó **resuelto**, sin que nadie lo haya perseguido a
propósito: las migraciones `0096` y `0097` (25-ago), escritas para otra cosa —que el huellero
decida solo si una marca es entrada o salida—, reescribieron `huellero_derivar_asistencia()` de
punta a punta y de paso corrigieron los dos problemas que ese documento describía.

Verificado el 8-sep contra la definición viva de la función:

- **Ya no inserta `'trabajado'` sin las dos horas.** La condición se decide con
  `case when v_ent is not null and v_sal is not null and v_motivo is null then 'trabajado' else
  'sin_dato' end` — exactamente lo que pedía la spec y lo que la restricción `asistencias_trabajado_chk`
  (0073) venía frenando.
- **Ya no borra una hora declarada por una persona.** La `SALVAGUARDA (b)` sólo completa lo que está
  vacío (`case when v_fila.huellero_puso_entrada then v_ent else coalesce(v_fila.hora_entrada, v_ent)
  end`), y la `REGLA 2` (0079) nunca deja en null una hora que ya estaba cargada.

Los 15 días que abortaban en agosto (13 de Jordan, 2 de Elthom, 1 de Sheyla) hoy están en la base,
derivados sin error — se comprobó releyéndolos: quedan en `'sin_dato'` con la hora que sí se pudo
capturar, no abortan la transacción. **`defecto-derivacion-huellero.md` se marca resuelto** al pie de
este documento en vez de borrarse, para que quede el rastro de qué migración lo cerró y por qué.

---

## 1. Lo urgente: alguien está marcando HOY y no se está contando

`marcas_huellero` tiene **880 filas sin `empleado_id`** — el 27% de las 3.249 marcas históricas.
La mayoría es data vieja de enero-febrero que probablemente ya no importa. **Trece identificadores
siguen sin asignar**, y dos de ellos están vivos ahora mismo:

| `employee_no` | Nombre en el equipo | Marcas | Desde | Hasta |
|---|---|---|---|---|
| `00000039` | **KURT** | 13 | 1-sep-2026 | **8-sep-2026, 07:36 hora Perú — hoy mismo** |
| `00000025` | GUILLERMO | 30 | 17-mar-2026 | 27-ago-2026 |

**KURT marcó esta mañana y ese día, como todos los de la última quincena, no se va a contar en
ninguna liquidación hasta que alguien lo asigne.** No es un problema de reconocimiento del equipo:
el huellero identificó la huella perfectamente — el problema es que nadie completó el paso de
`puesta-en-marcha-huellero.md §7` para este identificador.

## 2. Cinco personas activas del sistema con meses de marcas sin asignar

Cruzando el nombre que el equipo Hikvision ya tiene guardado contra los nombres de `empleados`
activos **sin ninguna fila en `huellero_mapeos`**, aparecen cinco coincidencias exactas:

| Persona (activa en SCI-LB) | Código | Sede | `employee_no` | Marcas sin asignar | Rango |
|---|---|---|---|---|---|
| **Remy** | 4620 | AL | `00000001` | **214** | 13-ene → 15-may-2026 |
| **Cesar** | 1562 | ST | `00000055` | **256** | 14-ene → 1-ago-2026 |
| **Maritza** | 2493 | ST | `00000010` | 82 | 15-ene → 18-abr-2026 |
| **NOHELY** | 1022 | ST | `00000049` | 35 | 2-jul → 7-ago-2026 |
| **Leonel** | 3559 | ST | `00000060` | 35 | 30-may → 18-jun-2026 |

**622 marcas de cinco personas que hoy trabajan en LuceBien**, algunas con meses de antigüedad.
Ninguna se perdió — están todas en la base, con su hora exacta— pero **ninguna se está contando**
en ninguna liquidación, porque `huellero_derivar_asistencia()` sólo procesa marcas que ya tienen
`empleado_id`.

**El emparejamiento por nombre de esta tabla es una pista, no una asignación.** Lo hice leyendo
`nombre_equipo` contra `empleados.nombre` — es fuerte (coincide exacto, salvo mayúsculas) pero **no
reemplaza la confirmación humana** que ya exige `puesta-en-marcha-huellero.md §7`: quien asigna en la
pantalla tiene que confirmar que es la persona correcta antes de guardar. Cesar, por ejemplo, tiene un
`Cesar2` inactivo en la misma sede — un nombre parecido no es prueba suficiente por sí sola.

## 3. Ocho identificadores que no coinciden con nadie del sistema

`RICARDO` (67 marcas), `JEFFREY` (51), `DAYRON` (52), `HEIDI` (30), `NATALY` (12), `FERNANDO` (6) —
además de KURT y GUILLERMO de la §1— **no coinciden con ningún nombre de `empleados`, activo ni
inactivo.** Dos lecturas posibles, y sólo el administrador sabe cuál es:

- Son personas que trabajaron o trabajan en LuceBien y **nunca llegaron a tener una ficha en el
  sistema nuevo** — sólo existen en el huellero.
- Son huellas enroladas por error o de alguien ajeno a la empresa (visitas, personal de otra
  sede física, un contratista puntual).

Ninguna de las dos se decide por código: es la pregunta que corresponde hacerle al administrador
antes de tocar nada. La más urgente de las dos es **KURT**, porque está marcando hoy.

## 4. Lo que sí es del equipo (Hikvision), no del ERP — B-8

*«Tratar de mejorar el reconocimiento del huellero para que no tenga tantos errores»* /
*«entrenar al huellero para reconocer marcas, a veces los colaboradores fallan»*. Medido: **de
2.369 marcas ya asignadas, cero llegaron con nombre ambiguo o con más de una persona el mismo día**
(el `v_motivo` de "revisar: el identificador tiene más de un nombre" no aparece en ningún día real
del histórico). El reconocimiento en sí —la huella contra la huella— no muestra fallas medibles
desde acá: lo que falla es el paso posterior, humano, de asignar el identificador a la persona.

Reentrenar huellas dactilares, limpiar el sensor o revisar el enrolamiento de gente a la que le
cuesta marcar es configuración del equipo (`https://192.168.1.220`), no algo que el ERP pueda tocar.
**Va a la lista de Jordan**, como ya decía la hoja de ruta.

---

## 5. Qué hacer, en orden

1. **Hoy: asignar `00000039` (KURT)** desde **Asistencias → Huellero → Identificadores sin
   asignar**, aunque sea por ahora sin saber quién es —o mejor, confirmando con el administrador
   quién es antes del cierre del período— para que sus próximos días no se sigan perdiendo.
2. **Confirmar y asignar las cinco de la §2** (Remy, Cesar, Maritza, NOHELY, Leonel). La pantalla ya
   soporta asignar por tramos de fecha si hiciera falta (§7 de `puesta-en-marcha-huellero.md`).
3. **Preguntarle al administrador quiénes son los ocho de la §3**, antes de asignar nada a nadie:
   crear una ficha nueva si corresponde, o dejarlos sin asignar si no son de la empresa.
4. **B-8 queda anotado para Jordan**, sin cambio de código de este lado.

## 6. Lo que esto no toca

- No se escribió ninguna fila en `huellero_mapeos`. Es una decisión del administrador, con la
  persona correcta confirmada — no una que un agente deba tomar por su cuenta.
- No se tocó `huellero_derivar_asistencia()` ni ninguna migración: el defecto de agosto ya está
  cerrado por otro camino (§0).
