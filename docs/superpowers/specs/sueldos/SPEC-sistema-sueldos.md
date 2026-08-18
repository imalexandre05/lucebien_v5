# SPEC — Sistema de cálculo de sueldos

Documento de especificación para reimplementar el sistema que hoy vive en el archivo
`13.-NOMBRE_2026_MES_VERSIÓN 20.0.xlsx` (en la raíz del repo).

> **Cómo leer este documento.** En el Excel original, las reglas de negocio y la estructura
> de datos viven en la misma celda: una fórmula es a la vez el dato, el cálculo y la regla.
> Este spec las separa a propósito. La sección 3 define **qué se guarda**, la sección 4 define
> **qué se calcula**. No implementes fórmulas de Excel — implementa las reglas.

> **Estado:** confirmada. La sección 5 (caso de prueba) contradecía a RN-08 y a RN-12 en dos
> puntos; Alexander los resolvió el 13-ago-2026 y la sección 9 deja escrito qué se decidió y por
> qué. El 14-ago el dueño precisó tres reglas más (§9.6). El total del caso de prueba quedó en
> **S/751.70**.

---

## 1. Contexto

Negocio de ternos en Huancayo con varias tiendas. El sistema calcula el pago de cada
colaborador combinando cuatro cosas: su asistencia real contra su horario pactado, sus ventas
contra sus metas, los adelantos y descuentos que le aplicó administración, y una serie de
beneficios (comisiones, almuerzos, capacitaciones, bonos).

Hoy es un archivo Excel por colaborador y por periodo. El objetivo es un sistema de control
interno que reemplace ese archivo.

### 1.1 Modalidades de pago

| Modalidad | Periodo | Notas |
|---|---|---|
| Mensual | ~30 días | Es el caso que está implementado en el Excel |
| Semanal | 7 días | **Misma lógica exactamente**, solo cambia la longitud del periodo |

La modalidad semanal no tiene reglas propias. Es el mismo motor con un periodo de 7 días:
las metas, los descuentos, los adelantos y la liquidación funcionan igual, solo que las sumas
recorren 7 días en vez de 30 y hay una sola semana de meta en vez de cuatro.

**Implementa el periodo como parámetro desde el inicio.** No asumas 30 días ni 4 semanas en
ningún lado.

---

## 2. Principio central del sistema

Todo el dinero del periodo se deriva de una sola cifra: **el valor por hora**.

```
valor_por_hora = sueldo_pactado / horas_contratadas_del_periodo
```

Esa cifra convierte cada minuto trabajado de más o de menos en soles. Si esa división cambia,
cambia todo lo demás: las horas extra, las horas en contra, el descuento por falta.

El Excel llega a este número por un camino más largo
(`sueldo ÷ días → sueldo diario ÷ horas por día → valor por hora`) pero los días se cancelan
algebraicamente y el resultado es idéntico. **Usa la división directa.**

El **sueldo por día** es un número distinto y **sólo informativo**: sirve para que el
administrador tenga una referencia de cuánto vale un día promedio.

```
sueldo_por_dia = sueldo_pactado / dias_contratados_del_periodo
```

`dias_contratados` = días del periodo que tienen horario asignado (ver RN-03).

**No se usa para descontar nada.** El castigo por falta se cobra sobre las horas del día que
efectivamente faltó, no sobre este promedio — ver RN-09 y §9.6.

---

## 3. Modelo de datos

### 3.1 Colaborador

Ficha permanente, independiente del periodo.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | int | |
| `nombre` | string | El Excel no lo guarda; vive en el nombre del archivo |
| `modalidad_pago` | enum | `mensual` \| `semanal` |
| `escala` | int 1-5 | Determina la tarifa sugerida (ver RN-14) |
| `fecha_ingreso` | date | Necesaria para calcular antigüedad |
| `activo` | bool | |

### 3.2 Horario contratado

Plantilla semanal. Cada día de la semana puede tener 0, 1 o 2 turnos.

| Campo | Tipo | Notas |
|---|---|---|
| `colaborador_id` | int | |
| `dia_semana` | int 1-7 | 1 = lunes … 7 = domingo (equivale a `WEEKDAY(fecha, 2)`) |
| `turno` | int 1-2 | 1 = primer turno, 2 = segundo turno |
| `hora_inicio` | time | |
| `hora_fin` | time | |

Un día sin filas tiene **0 horas contratadas** y funciona como máscara: ese día no genera
obligación ni penalidad. Ejemplo real del archivo v20: lunes a miércoles tienen dos turnos
(09:00-13:00 y 13:00-20:00 = 11 h), jueves a domingo no tienen ninguno.

### 3.3 Acuerdo del periodo

Lo pactado con el colaborador para un periodo concreto.

| Campo | Tipo | Notas |
|---|---|---|
| `colaborador_id` | int | |
| `fecha_inicio`, `fecha_fin` | date | Define el periodo completo |
| `sueldo_pactado` | decimal | **Input manual.** No se calcula |
| `tarifa_sugerida` | decimal | Calculada por el sistema (RN-14), solo informativa |
| `tolerancia_minutos` | int | Por defecto 10 |
| `tardanzas_libres` | int | Por defecto 3 |
| `penalidad_tardanza` | decimal | Por defecto 5.00 |
| `valor_almuerzo` | decimal | Por defecto 8.00 |
| `horas_minimas_almuerzo` | decimal | Por defecto 12: las horas de un día de tiempo completo (RN-15) |
| `valor_capacitacion` | decimal | Por defecto 25.00 |
| `bono_meta_semanal` | decimal | Por defecto 30.00 |
| `meta_semanal` | decimal \| null | **Lo pactado en el contrato** (RN-10). Null = usar la sugerencia por horas |
| `factor_meta` | decimal | Por defecto 1.00. Se aplica **sólo a la meta sugerida**, nunca a la pactada: el 0.85 del Excel existía para hacer alcanzable una meta derivada de una fórmula |
| `meta_por_hora` | decimal | Por defecto 1500/33 = S/45,4545. Sólo se usa para **sugerir** una meta cuando no hay pactada (RN-10) |
| `pausa_minima_minutos` | int | Por defecto 15 desde el 17-ago-2026 (RN-05, C-01): minutos a partir de los cuales un hueco cuenta como pausa y no se paga. Con 0 se descuenta cualquier hueco |
| `factor_hora_fuera_contrato` | decimal | Por defecto 1.00 desde el 17-ago-2026 (RN-17, C-03): multiplica el valor de la hora sólo en el bloque de trabajo fuera del horario |
| `meta_semanal_fija` | bool | Por defecto `false` desde el 17-ago-2026: la semana que absorbe días sobrantes sube su meta (RN-12, §9.2, C-02). En `true` la meta es igual todas las semanas |
| `pct_comision` | decimal | Por defecto 0.02 |
| `monto_minimo_comision` | decimal | Por defecto 120.00 |
| `dias_descuento_por_falta` | int | Por defecto 2. Son los días que la falta cuesta **en total** (RN-09) |

Todos estos valores tienen defaults globales pero deben poder sobrescribirse por colaborador.
En el Excel están quemados dentro de las fórmulas, que es la razón principal por la que el
archivo no se puede reutilizar.

### 3.4 Asistencia

Un registro por día del periodo. Todos los días existen, trabajados o no.

| Campo | Tipo | Notas |
|---|---|---|
| `fecha` | date | |
| `hora_ingreso` | time \| null | `null` = no se presentó |
| `hora_salida` | time \| null | |
| `tardanza_justificada` | bool | Marca del administrador: esta tardanza no se descuenta |
| `falta_justificada` | bool | Marca del administrador: esta falta cuesta 1 día en vez de 2 |
| `motivo_justificacion` | string | **No existe hoy.** Ver PEND-06 |
| `observacion` | string | |

### 3.5 Venta

**Un solo registro de venta.** En el Excel hay dos capturas separadas del mismo dato (por
tienda y por semana) que no cuadran entre sí: una da S/4,300 y la otra S/7,200 para el mismo
periodo. Eso es un error estructural. Aquí hay una sola tabla y los dos totales se derivan de
ella.

| Campo | Tipo | Notas |
|---|---|---|
| `fecha` | date | |
| `tienda_id` | int | |
| `tipo` | enum | `venta` \| `alquiler` |
| `monto` | decimal | |

Tiendas activas: Luce Bien 1 (Redentor), Luce Bien 2 (Esquina), Luce Bien 3 (Trece), Online,
Stan (101-102). **Feria queda fuera** — no se considera.

### 3.6 Movimientos administrativos

Una tabla por tipo, todas con la misma forma: `fecha`, `motivo`, `monto`.

- `adelanto` — dinero entregado antes del pago
- `reporte` — descuento por daño o incidencia (ej. "malogró plancha", S/20)
- `bono_extra` — pago fuera de lo acordado (ej. "pintado de habitación", S/20)
- `almuerzo_entregado` — almuerzos cubiertos en especie
- `capacitacion` — personas nuevas capacitadas por el colaborador

### 3.7 Cierre del periodo

Notas cualitativas que acompañan la liquidación.

| Campo | Tipo |
|---|---|
| `nota_desempeno` | int (0-20) |
| `consejo_mejora` | string |
| `pendientes_regularizar` | string[] |
| `observaciones` | string[] |

---

## 4. Reglas de negocio

### Base del periodo

**RN-01 — Horas contratadas del periodo.**
Por cada fecha del periodo, obtener su día de la semana y sumar las horas de sus turnos.
La suma de todos los días es `horas_contratadas`.

**RN-02 — Valor por hora.**
`valor_por_hora = sueldo_pactado / horas_contratadas`.
Si `horas_contratadas` es 0, el cálculo se detiene con error.

**RN-03 — Días contratados.**
Cantidad de fechas del periodo cuyo día de la semana tiene al menos un turno **con horas > 0**.

> Corrección respecto al Excel: hoy cuenta días de semana que existen en el calendario aunque
> tengan cero horas asignadas. En el archivo v20 eso da 27 días cuando en realidad solo 15
> tienen horario, y distorsiona el sueldo diario (S/22.22 en vez de S/40).

**RN-04 — Sueldo por día (informativo).**
`sueldo_por_dia = sueldo_pactado / dias_contratados` (RN-03). Es una referencia para el
administrador. Ningún descuento cuelga de este número.

### Asistencia

**RN-05 — Horas trabajadas por día.**
La **suma de los tramos continuos** del día: `Σ (salida_del_tramo − entrada_del_tramo)`. Un día
con un solo tramo se comporta como la resta de siempre. Una pausa —salir y volver— **no se paga**.

Cada fila de `asistencias` de esa fecha es un tramo; la clave `(empleado_id, fecha, turno)` ya lo
permitía desde la `0001`. Antes de fusionar se ordenan y se unen los que se pisan o los separados
por menos de `pausa_minima_minutos` (default 15): sin ese paso, dos filas que se pisan pagarían de
más y dos marcas del mismo momento pagarían de menos.

La **tardanza (RN-08) se mide contra el primer ingreso del día**, no contra el regreso de la pausa.

> ✅ **Cambió el 17-ago-2026 — ver [SPEC-cambios-reglas-2026-08-17.md](SPEC-cambios-reglas-2026-08-17.md)
> C-01.** Hasta entonces era `hora_salida − hora_ingreso` de punta a punta. Implementado en la
> migración 0078.

**RN-06 — Diferencia de horas.**
`horas_trabajadas − horas_contratadas_de_ese_dia_semana`.

Un día sin horario contratado tiene 0 de referencia, así que todo lo trabajado ese día cuenta
como diferencia positiva. Es intencional: un día extra se paga por hora, no por jornada.

**RN-07 — Valor de la diferencia de horas.**
`diferencia_horas × valor_por_hora`, sumado sobre todo el periodo. Puede ser positivo (a favor
del colaborador) o negativo (en contra). Entra a la liquidación como **ajuste**, con su signo.

**RN-08 — Tardanzas.**

```
es_tardanza = hora_ingreso > (hora_inicio_del_turno_1 + tolerancia_minutos)
```

- Solo aplica a días **con horario contratado**.
- `tardanzas_injustificadas = total_tardanzas − tardanzas_libres − tardanzas_justificadas`
- `descuento_tardanzas = tardanzas_injustificadas × penalidad_tardanza`
- Nunca puede ser negativo: si el resultado es menor a 0, es 0.

> Corrección: hoy la hora límite está quemada como texto (`">9:10"`). Debe derivarse del
> horario del día y de la tolerancia. Con el horario actual esto también cuenta como tardanza
> un jueves sin contrato, que no debería contar.
>
> **Confirmado por Alexander (13-ago-2026):** un día trabajado fuera del horario contratado no
> genera tardanza. *"Solo afecta en cuántas horas trabajó y eso en su pago del día"* — o sea,
> entra por RN-06 (diferencia de horas) y por nada más.

**RN-09 — Faltas.**

```
es_falta = dia_tiene_horario_contratado AND hora_ingreso is null
```

- `faltas_injustificadas = total_faltas − faltas_justificadas`
- `horas_faltadas` = suma de las horas **contratadas de cada día** que se faltó sin justificar
- `descuento_faltas = horas_faltadas × valor_por_hora × (dias_descuento_por_falta − 1)`

**La unidad es el día que faltó, no un día promedio** (decisión del dueño, 14-ago-2026 — ver
§9.6). Faltar a un sábado de 1 hora cuesta dos sábados; faltar a un lunes de 11 horas cuesta dos
lunes. El castigo es proporcional al compromiso de ese día.

**`dias_descuento_por_falta` son los días que la falta le cuesta EN TOTAL, no los días de castigo
encima.** Se resta 1 porque el día que no trabajó ya salió por RN-06: como el sueldo se paga por
horas, no presentarse ya vale un día sin necesidad de castigo.

| | Cuesta en total | Con jornadas de 11 h y valor hora S/3,64 |
|---|---|---|
| Falta **injustificada** (default 2) | 2 × las horas de ese día | −S/80 |
| Falta **justificada** | 1 × las horas de ese día | −S/40 |

Con jornadas de duración desigual (lunes 11 h, sábado 1 h, valor hora S/5,36):

| Falta a… | RN-06 se lleva | El castigo agrega | Total |
|---|---|---|---|
| el sábado de 1 h | S/5,36 | S/5,36 | **S/10,71** = 2 sábados |
| el lunes de 11 h | S/58,93 | S/58,93 | **S/117,86** = 2 lunes |

> Confirmado por el dueño el 14-ago-2026: *"si trabaja 3 días y cobra 40, y falta uno recibe 80 de
> dos días, pero al faltar un día se le quita de uno más, entonces solo cobra 40"*.

> Corrección: hoy la falta se detecta buscando el texto `0:00` en la hora de ingreso, así que
> un día simplemente vacío no cuenta como falta. Debe detectarse por ausencia de registro en un
> día con horario.

### Ventas y metas

**RN-10 — La meta semanal se acuerda, no se calcula.**

`meta_semanal` es un **monto pactado con cada colaborador en su contrato**. Varía por tienda,
temporada, experiencia y turno. Valores habituales: **S/3.000 tiempo completo** y **S/1.500 medio
tiempo**, por semana. Editable siempre.

Cuando no hay meta pactada, el sistema **sugiere** una con la fórmula del Excel:
`horas_contratadas_de_la_semana × meta_por_hora`, donde `meta_por_hora` = S/45,4545 (S/1.500 ÷ 33
horas del turno mañana). Es una sugerencia para negociar, igual que la escala salarial de RN-14 —
nunca reemplaza a lo pactado.

**RN-11 — Meta del periodo.**
`meta_periodo = suma de las metas semanales del periodo`

No se calcula aparte: es la suma de lo que ya se pactó semana a semana (confirmado por el dueño,
14-ago-2026). Un periodo de 4 semanas a S/1.500 tiene meta mensual de S/6.000.

**RN-12 — Semanas y meta semanal.**
El periodo se divide en semanas de 7 días desde `fecha_inicio`.

- **La última semana absorbe los días sobrantes.** Si el periodo tiene 31 días, la semana 4
  cubre los días 22 a 31, no solo hasta el 28. Ninguna venta queda fuera de una semana.
- Sin meta pactada, la meta sugerida sale de **las horas contratadas de cada tramo**: una semana
  que absorbe los días sobrantes del mes **sí** sube su meta (Alexander, 16-ago-2026 — ver §9.2 y
  C-02). Con `meta_semanal_fija = true` vuelve a salir del horario de una semana tipo y es igual
  todas las semanas, que fue el default entre el 13 y el 17-ago-2026.
- Una meta **pactada** en el contrato es la misma todas las semanas por definición: sobre ella
  este parámetro no hace nada.
- Una semana se considera cumplida si `ventas_de_la_semana > meta_semanal`.
- `bono_metas = semanas_cumplidas × bono_meta_semanal`, con `bono_meta_semanal` = S/30 editable.

El bono semanal y la comisión de RN-13 son **dos premios distintos por dos metas distintas**, no
uno que reemplazó al otro: el bono se gana semana a semana, la comisión se desbloquea al llegar a
la meta del mes (confirmado por el dueño, 14-ago-2026).

Para el caso contrario (meta igual todas las semanas) existe el parámetro
`meta_semanal_fija = true`, apagado por defecto.

> ✅ **Invertido el 17-ago-2026 — ver [SPEC-cambios-reglas-2026-08-17.md](SPEC-cambios-reglas-2026-08-17.md)
> C-02.** El default de `meta_semanal_fija` pasó de `true` a `false`. La lógica ya existía en las
> dos direcciones; cambió cuál es la de fábrica. **Cuesta S/76,40 en el caso de prueba**, no S/30:
> la meta del mes es la suma de las semanales (RN-11), así que subir la de la semana larga sube
> también la del mes y, en este caso, apaga la comisión entera. Implementado.

> Corrección: la fórmula actual `COUNTIF(Z20:AC20,">U7")` compara contra el texto "U7" en vez
> de contra la celda, así que siempre da 0. Hoy el administrador lo compensa escribiendo el
> número a mano — y en el archivo v20 escribió 3 cuando las cuatro semanas superaron la meta.

**RN-13 — Comisión por ventas.**

```
base_comision = suma de las ventas individuales cuyo monto > monto_minimo_comision
comision = base_comision × pct_comision   SI ventas_del_periodo >= meta_periodo
comision = 0                              EN CASO CONTRARIO
```

> Corrección: hoy la comisión se paga siempre, sin verificar la meta. En el archivo v20 se
> pagaron S/46.40 con ventas de S/7,200 contra una meta de S/7,500.

**RN-14 — Escala salarial (sugerencia, no obligación).**
El sistema **propone** una tarifa por hora según la antigüedad; el administrador la puede
sobrescribir y de hecho hoy siempre lo hace.

| Escala | Tarifa S//hora | Antigüedad |
|---|---|---|
| 1 | 2.90 | 1er mes |
| 2 | 3.20 | 1er mes |
| 3 | 3.50 | 1er a 3er mes |
| 4 | 3.80 | desde el 5to mes |
| 5 | 5.00 | desde el 9no mes |

`sueldo_sugerido = tarifa_de_la_escala × horas_contratadas`

Se muestra al lado del sueldo pactado como referencia para negociar. Nunca lo reemplaza.

> Las escalas 1, 2 y 3 se solapan en el rango "1er mes" y no hay criterio escrito para
> distinguirlas más allá de "va de acuerdo a evaluación". Ver PEND-07.

### Beneficios

**RN-15 — Almuerzos.**
El colaborador gana S/8 **por cada día de tiempo completo que hizo en el periodo**. Si el almuerzo
se le entregó en especie, no se le paga; si no, se le paga en dinero.

```
es_dia_de_tiempo_completo = horas_trabajadas >= horas_minimas_almuerzo
                            OR almuerzo_habilitado_por_admin

dias_con_derecho     = días de tiempo completo trabajados en el periodo
almuerzos_a_pagar    = dias_con_derecho − almuerzos_entregados
monto_almuerzos      = almuerzos_a_pagar × valor_almuerzo
```

**Se mira día por día, no el contrato de la persona.** Hay colaboradores que tienen días completos
y días de medio turno; sólo los completos ganan almuerzo. `horas_minimas_almuerzo` = **12 h** por
defecto (tiempo completo ≈ 12 h, medio tiempo ≈ 6 h), editable. El administrador puede además
habilitar los almuerzos de alguien a mano, sin importar las horas.

El colaborador elige cuándo cobrarlos: día a día conforme los va ganando, o acumulados a fin de
mes. Lo que ya recibió va en `almuerzos_entregados` y se resta. **El administrador necesita ver
esa cuenta corriente** — cuántos ganó, cuántos ya se le dieron y cuántos quedan.

Nunca puede ser negativo.

> Corrección importante: hoy la fórmula es `dias_laborables_del_calendario − entregados`, que en
> el archivo v20 da 19 almuerzos (S/152, casi un tercio del sueldo) cuando el colaborador solo
> trabajó 16 días. Debe contar días **efectivamente trabajados**, no días del calendario.

**RN-16 — Capacitaciones.**
`personas_capacitadas × valor_capacitacion`.

**RN-17 — Horas fuera de contrato.**
Bloque de registro separado para trabajo puntual que no forma parte del horario. Se valora con
`valor_por_hora` y entra como ingreso.

> ✅ **Ampliada el 17-ago-2026 — ver [SPEC-cambios-reglas-2026-08-17.md](SPEC-cambios-reglas-2026-08-17.md)
> C-03.** Parámetro `factor_hora_fuera_contrato`, default `1`: con el default nada cambia, y
> permite pactar esa hora a otro precio. Implementado en la migración 0077.

**Validación obligatoria:** una misma fecha no puede aparecer a la vez en la asistencia normal
con horas positivas y en este bloque. Hoy nada lo impide y se pagaría dos veces.

**RN-18 — Bonos extras.**
Monto libre con motivo obligatorio. No se calcula, se registra.

### Liquidación

**RN-19 — Orden de cálculo.**
El orden importa y no es un solo saco. Las tardanzas, los reportes y los bonos se aplican
**después** del subtotal:

```
ingresos   = sueldo_pactado
           + comision                    (RN-13)
           + bono_metas                  (RN-12)
           + monto_almuerzos             (RN-15)
           + horas_fuera_de_contrato     (RN-17)

descuentos = − descuento_faltas          (RN-09)
             − adelantos

ajustes    = valor_diferencia_horas      (RN-07, con su signo)
           + capacitaciones              (RN-16)

subtotal   = ingresos + descuentos + ajustes

TOTAL      = subtotal
           − descuento_tardanzas         (RN-08)
           − reportes
           + bonos_extras                (RN-18)
```

**RN-20 — Salida.**
El resultado es una sola cifra por colaborador y periodo, más el desglose completo de cada
línea. Toda línea debe poder rastrearse hasta los registros que la originaron.

---

## 5. Caso de prueba (golden test)

Datos reales del archivo `13.-NOMBRE_2026_MES_VERSIÓN 20.0.xlsx`, con las reglas ya corregidas.
Úsalo para validar la implementación.

> Los valores de abajo ya incorporan las dos decisiones que Alexander tomó el 13-ago-2026
> (§9). Antes de eso esta sección declaraba S/700.30, un número que no salía de ninguna
> combinación coherente de las reglas de la sección 4.

### Entradas

| Concepto | Valor |
|---|---|
| Periodo | 2025-06-16 a 2025-07-16 (31 días) |
| Horario | Lun/Mar/Mié: 09:00-13:00 + 13:00-20:00 (11 h). Jue-Dom: sin horario |
| Sueldo pactado | S/600.00 |
| Días trabajados | 15 días contratados + 1 jueves fuera de horario |
| Ingresos a las 09:11 | 11, de los cuales **10 caen en día con horario**. 3 libres + 4 justificadas |
| Faltas | 0 |
| Ventas del periodo | S/7,200 (S/1,800 por semana × 4) |
| Base de comisión | S/2,320 |
| Almuerzos entregados | 8 |
| Capacitaciones | 2 |
| Adelantos | S/190 (100 + 20 + 50 + 20) |
| Reportes | S/20 |
| Bonos extras | S/20 |
| Horas fuera de contrato | 6 h |

### Valores derivados esperados

| Concepto | Valor | Regla |
|---|---|---|
| Horas contratadas | 165.00 | RN-01 |
| Valor por hora | 3.6364 | RN-02 |
| Días contratados | **15** | RN-03 |
| Sueldo por día | **40.00** | RN-04 |
| Diferencia de horas | +14.9833 h | RN-06 |
| Tardanzas | **10** — el jueves sin horario no cuenta | RN-08 |
| Tardanzas injustificadas | **3** (10 − 3 libres − 4 justificadas) | RN-08 |
| Meta semanal sugerida | 1,500 las tres primeras y **3,000 la cuarta**, que dura 10 días | RN-10, RN-12 |
| Meta del periodo | **7,500.00** (1,500 × 3 + 3,000) | RN-11 |
| Semanas cumplidas | **3** — la cuarta vendió 1,800 contra una meta de 3,000 | RN-12 |
| Días de tiempo completo | **0** por horas (ninguno llega a 12 h) — el administrador tenía habilitados sus almuerzos, así que cuentan los **16** días trabajados | RN-15 |

### Liquidación esperada

| Línea | Monto |
|---|---|
| Sueldo | 600.00 |
| Comisión 2% | **0.00** — las ventas del mes (7,200) no llegan a la meta del mes (7,500). Con `meta_semanal_fija = true` serían 46.40 |
| Bono metas semanales | **90.00** (3 × 30) |
| Almuerzos | **64.00** (16 días − 8 entregados = 8 × 8) |
| Horas fuera de contrato | 21.82 |
| **Ingresos** | **775.82** |
| Faltas | 0.00 |
| Adelantos | −190.00 |
| **Descuentos** | **−190.00** |
| Diferencia de horas | +54.48 |
| Capacitaciones | +50.00 |
| **Ajustes** | **+104.48** |
| **Subtotal** | **690.30** |
| Tardanzas (3 × 5) | **−15.00** |
| Reportes | −20.00 |
| Bonos extras | +20.00 |
| **TOTAL A PAGAR** | **S/675.30** |

> El archivo Excel actual arroja **S/804.70** para estos mismos datos. Los S/129.40 de diferencia
> son cuatro correcciones: almuerzos contados sobre el calendario en vez de sobre días trabajados
> (−88.00), una meta semanal que el admin no reconoció porque la fórmula estaba rota (+30.00),
> una tardanza contada en un día sin horario (+5.00) y la meta proporcional de la semana larga
> (−76.40 = bono −30.00 y comisión −46.40, C-02 del 17-ago-2026).
>
> Las tres primeras son errores del Excel. **La cuarta no es un error de nadie**: es una regla que
> cambió. Hasta el 17-ago el total esperado de este caso era S/751.70 y sigue siendo reproducible
> con `meta_semanal_fija = true`.
>
> **El Excel es una plantilla de referencia**, no la planilla real de nadie. Sirve para validar
> que el motor recorre bien el flujo, no para tomar sus montos como verdad.

---

## 6. Validaciones

**Principio: un dato faltante y un dato en cero no son lo mismo.** Confundirlos le descuenta días
de sueldo a alguien en silencio. El motor prefiere fallar ruidosamente a liquidar con datos
incompletos.

### Cortan el cálculo con error

- `horas_contratadas > 0`, si no el periodo no se puede liquidar (RN-02).
- **Todo día contratado del periodo tiene que tener su registro de asistencia.** Una falta se
  declara con `hora_ingreso` en null; no se infiere de que falte la fila. Sin esto, "no cargué la
  asistencia" y "no vino nunca" dan el mismo resultado, y cada falta cuesta tres días de sueldo.
- `hora_salida > hora_ingreso` en todo registro.
- Toda fecha en formato exacto `YYYY-MM-DD` y existente en el calendario. Un `timestamptz` sin
  convertir o un `2025-6-17` sin pad no matchean contra el periodo, se descartarían en silencio y
  el día se volvería falta.
- Toda hora dentro de rango: `00:00` a `23:59`. Un `19:99` tipeado por `19:59` regala horas
  pagadas.
- **Dos turnos del mismo día no pueden solaparse.** Inflan `horas_contratadas` y con eso hunden
  el valor por hora de todo el periodo.
- Ninguna fecha repetida: ni en asistencia, ni en horas fuera de contrato.
- Una fecha con formato válido pero **inexistente** (`2025-06-31`, `2025-02-30`) también corta.
  El formato no alcanza: esas fechas pasan la expresión regular, no matchean contra ningún día
  del periodo, y según dónde caigan se descartan en silencio o se pagan de más.
- Una fecha no puede estar en asistencia normal y en horas fuera de contrato a la vez (RN-17).
- Todo descuento, adelanto y bono extra necesita motivo **y monto mayor a cero**. Un monto
  negativo invierte la línea: un adelanto de −100 pasaría de descontar a sumar.
- Los parámetros de §3.3 tienen que ser números finitos no negativos. Una clave con `undefined` o
  `null` **no pisa el default** — así una fila de `config` que todavía no existe deja el valor por
  defecto en vez de convertir el total en `NaN`, que serializa a `null` y guarda un pago vacío.

### Avisan sin cortar (`advertencias`)

- Un registro con ingreso pero sin salida, o al revés. Es el error de marcación más frecuente.
- Una justificación marcada en un día que no generó tardanza ni falta: no descuenta nada.
- El periodo tiene faltas.
- Se liquida sin ninguna venta cargada: no hay comisión ni bono, y hoy la grilla se llena a mano.
- `almuerzos_entregados > dias_con_derecho`.
- Registros de asistencia, ventas u horas fuera de contrato con fecha fuera del periodo. Esos
  **no se cuentan**: pertenecen a otra liquidación.
- Un adelanto, reporte o bono extra con fecha fuera del periodo **sí se cuenta**, y avisa. La
  diferencia es deliberada: una venta fuera del periodo pertenece a otra meta, pero un adelanto
  ya entregado hay que descontarlo aunque le hayan puesto mal la fecha.
- El total del periodo da negativo.

### Siempre

- El total debe poder recalcularse desde cero y dar el mismo resultado. Nada se guarda como valor
  fijo, todo se deriva.

---

## 7. Pendientes

Procesos que el dueño del negocio pidió pero que **no existen en el Excel actual**. Están fuera
del alcance del motor de cálculo y hay que construirlos desde cero.

### Módulo de admisión (bloque aparte)

Este bloque tiene una forma de dato distinta al resto del sistema: es información **permanente
del colaborador**, no de un periodo. Eso obliga a separar la ficha de personal del cálculo
mensual.

- **PEND-01 — Entrevista.** Registro y resultado.
- **PEND-02 — Prueba de 3 días.** Registro y resultado.
- **PEND-03 — Registro de datos de personal.** Hoy el archivo no guarda ni el nombre; vive en
  el nombre del archivo.
- **PEND-04 — Documentación de personal.** Adjuntos y vencimientos.
- **PEND-05 — Funciones del cargo.** Los acuerdos de contrato hoy cubren horarios, sueldos y
  metas, pero no funciones.

### Mejoras al motor

- **PEND-06 — Registro de justificaciones con detalle.** Hoy solo se guarda el número de
  tardanzas y faltas justificadas. No queda rastro de qué día se justificó ni por qué.
- **PEND-07 — Criterio de escala.** Las escalas 1, 2 y 3 se solapan en "1er mes" y la única
  guía escrita es "va de acuerdo a evaluación". Falta definir qué mueve a alguien de escala.
- **PEND-08 — Registro automático de ventas.** El dueño lo pidió como automático; hoy la
  grilla se llena a mano. Depende de si existe una fuente de datos de ventas a la que conectar.
- **PEND-09 — Resumen entregable.** La hoja `RESUMEN` del Excel calcula el total por su cuenta
  y da un número distinto al de `DASHWORD` (S/766 contra S/805 en el archivo v20). En el sistema
  nuevo debe ser una **vista de solo lectura** del resultado de la sección 4, sin lógica propia.
- **PEND-10 — Mínimos de venta para continuar.** `PARAMETROS` define umbrales (mañana medio
  tiempo S/4,000, tarde S/4,800, tiempo completo S/7,200) y `RESUMEN` los usa para decidir si
  el colaborador continúa. Falta definir qué efecto tiene ese resultado.

---

## 8. Notas de implementación

- **No portes fórmulas de Excel.** El archivo mezcla el dato, el cálculo y la presentación en
  la misma celda. Implementa las reglas de la sección 4 desde cero.
- **Nada de posiciones fijas.** El Excel referencia celdas concretas (`R67`, `Q49`, `AF60`).
  Esas referencias no significan nada fuera del archivo.
- **Todos los parámetros son configurables.** Los valores por defecto están en la sección 3.3.
  Ninguno debe quedar quemado en el código.
- **El periodo es un parámetro.** Mensual y semanal son el mismo motor.
- **Guarda el desglose, no solo el total.** El administrador necesita explicarle al colaborador
  de dónde sale cada sol.

---

## 9. Contradicciones detectadas y resueltas — 13 de agosto de 2026

Verificado ejecutando el motor contra los datos de la sección 5 (no contra otro documento).
Aplicando las reglas de la sección 4 **al pie de la letra**, el caso de prueba daba **S/675.30**
y no los S/700.30 que la sección 5 declaraba. La diferencia eran dos puntos donde la sección 5
se contradecía con la sección 4. Ninguno se resolvía sin decisión de negocio, y se llevaron a
Alexander antes de tocar el código (no-negociable 6: la spec primero).

**Resultado:** se confirmó RN-08 tal como estaba escrita (−S/5 respecto a §5) y se cambió RN-12
por la meta fija (+S/30 respecto a lo que salía del texto anterior). El total quedó en
**S/705.30** en ese momento; con las reglas del 14-ago (§9.6) quedó en **S/751.70**. Los S/700.30
originales no correspondían a ninguna combinación coherente: mezclaban
la tardanza del Excel con la meta semanal corregida a medias.

### 9.1 — Tardanzas: ¿10 u 11? → **10** (RN-08)

RN-08 dice, textual: *"Solo aplica a días **con horario contratado**"*, y su propia nota de
corrección aclara que el Excel *"también cuenta como tardanza un jueves sin contrato, que no
debería contar"*.

En los datos del periodo hay **11 ingresos a las 09:11**: cinco lunes, cinco martes y el
jueves 2025-06-19, que no tiene horario contratado.

- Aplicando RN-08: **10 tardanzas** → 10 − 3 libres − 4 justificadas = **3 injustificadas** →
  descuento **S/15.00**.
- La sección 5 declara 11 tardanzas y un descuento de S/20.00, es decir, el número del Excel
  **sin** la corrección que la propia RN-08 ordena.

**Decidido por Alexander (13-ago-2026, en conversación — ⚠️ pendiente de confirmar con el dueño,
ver §9.5 V-03): NO.** Textual: *"no, solo afecta en cuántas horas trabajó y eso en su pago del
día"*. Un día trabajado fuera del horario entra por RN-06 (diferencia de horas, que se le paga) y
por nada más. El descuento del caso de prueba queda en **S/15.00**.

RN-08 ya decía esto, así que no hubo que cambiar la regla: se corrigió la sección 5, que
arrastraba el número del Excel.

### 9.2 — Semana 4: la meta que absorbe días también sube (RN-12) → **meta fija**

RN-12 introduce dos cambios a la vez y solo uno se reflejó en el caso de prueba:

1. La meta semanal se calcula sobre **las horas contratadas de esa semana**.
2. **La última semana absorbe los días sobrantes** del periodo.

Con el periodo de 31 días desde el lunes 2025-06-16:

| Semana | Rango | Días contratados | Horas | Meta (h × 45.4545 × 0.85) | Ventas | ¿Cumple? |
|---|---|---|---|---|---|---|
| 1 | 06-16 a 06-22 | 3 | 33 | 1,275.00 | 1,800 | Sí |
| 2 | 06-23 a 06-29 | 3 | 33 | 1,275.00 | 1,800 | Sí |
| 3 | 06-30 a 07-06 | 3 | 33 | 1,275.00 | 1,800 | Sí |
| 4 | **07-07 a 07-16** | **6** | **66** | **2,550.00** | 1,800 | **No** |

La semana 4 dura 10 días y contiene **6 días contratados**, el doble que las otras. Su meta
también se duplica. Con S/1,800 de venta no la alcanza.

- Aplicando RN-12: **3 semanas cumplidas** → bono **S/90.00**.
- La sección 5 declara 4 semanas y S/120.00, que es el resultado de usar la meta fija de
  S/1,275 para las cuatro — exactamente lo que RN-12 vino a corregir.

Había tres salidas posibles, todas decisiones del dueño y no técnicas:

| Opción | Qué implica | Bono en el caso de prueba |
|---|---|---|
| **A** — Dejar RN-12 como estaba | La semana larga tiene meta proporcionalmente mayor. Coherente, pero castiga al colaborador por un periodo de 31 días | S/90 |
| **B** ✅ — La meta semanal es fija: horas de la plantilla semanal × meta_por_hora × factor, sin importar cuántos días absorba el tramo | Simple de explicar y estable mes a mes | S/120 |
| **C** — Los días sobrantes forman una 5ta semana con su propia meta proporcional | Lo más justo si casi todos los meses sobran días, pero agrega una semana parcial cada mes y nadie lo pidió | S/90 + posible 5ta |

**Decidido el 13-ago-2026: opción B.** El bono es un premio semanal fijo de S/30 y el colaborador
no elige que su mes tenga 31 días. RN-12 se reescribió en consecuencia.

**Revertido el 16/17-ago-2026: vuelve la opción A.** Preguntado de nuevo —*«si dura 10 días en vez
de 7, ¿su meta sigue siendo S/1.500 o sube proporcionalmente?»*— Alexander respondió **«exacto,
sube»**. El default de `meta_semanal_fija` pasó a `false` (C-02). El razonamiento del 13-ago sigue
en pie; simplemente no es el que se eligió, y la conducta anterior sigue a un clic en
/configuracion.

Lo que la tabla de arriba no decía y conviene tener a la vista: la opción A no cuesta sólo los
S/30 del bono. Como la meta del mes es la suma de las semanales (RN-11), sube también el umbral de
la comisión — en este caso de prueba lo sube de 6.000 a 7.500 y las ventas de 7.200 dejan de
alcanzarlo, así que se pierden además los S/46,40 de comisión. **S/76,40 en total.**

La opción C exigiría cambiar `tramosSemanales()` y nadie la pidió.

### 9.4 — Lo que confirmó y lo que cambió el dueño (13-ago-2026)

Respuestas de la segunda ronda (`docs/respuestas-dueno-2.md` §8). **Confirman el diseño en lo
esencial** y abren cuatro huecos.

**Confirmado:**

| Lo que dijo | Qué valida |
|---|---|
| *"Usualmente es por horas trabajadas y eso se traduce en sueldo fijo mensual, semana trabajada o día trabajada"* (S1) | El principio central de §2: todo el dinero cuelga del valor por hora |
| *"Depende de cada trabajador y su entrada"* (S2) | El periodo es por persona y arranca en su fecha de ingreso, no en el 1° del mes |
| *"Cada uno tiene su acuerdo"* (S3) | `acuerdo_periodo` por colaborador, con todos los parámetros sobrescribibles |
| *"Se paga por horas, por ende, cuando se llega tarde se hace un descuento y además se pagan menos horas"* (N5) | El castigo por tardanza es doble y por dos caminos separados: RN-08 (la multa) y RN-06 (las horas que no trabajó). No es una duplicación por error |
| Comisiones y bonos (S5) | RN-13 y RN-18. No mencionó horas extra ni puntos: RN-17 y la meta de puntos no salen de él |

**Huecos abiertos:**

- **HUE-01 — Modalidad "por día trabajado".** S1 la menciona y §1.1 sólo contempla mensual y
  semanal. Con el motor actual se cubre poniendo un periodo de 1 día, pero no está pensado ni
  probado así.
- **HUE-02 — Garantía para el adelanto.** S9: *"debe haber mínimo semana de trabajo ese mes como
  garantía"*. Hoy §3.6 registra el adelanto sin ninguna condición. Falta la validación.
- **HUE-03 — Sanciones revocables.** N2 y N3: la sanción por prenda no devuelta o perdida se
  descuenta del sueldo, la decide el administrador, y **si la prenda aparece la sanción se
  revoca**. Hoy el tipo `reporte` de §3.6 sólo registra el descuento; no hay forma de deshacerlo
  ni de dejar rastro de por qué se deshizo.
- **HUE-04 — ¿La comisión va acá o no?** N1 dice que la comisión por ticket *"se seguirá llevando
  aparte"*, pero también que es el 2% sobre boletas de venta y alquiler — que es exactamente
  RN-13. O son la misma cosa y RN-13 se queda, o son dos cosas distintas y falta entender la
  segunda. **Preguntar antes de construir la pantalla de ventas.**

Y una que no es hueco sino un dato faltante: **S4 quedó sin responder** (qué se le descuenta a
alguien del sueldo). Es la pregunta que valida los descuentos de RN-08, RN-09 y §3.6.

### 9.5 — Lo que encontró el verificador (13-ago-2026)

El subagente verificador revisó el motor antes de mergear. **El caso feliz estaba bien**: el
golden reproducía su total del momento, la aritmética cuadra, no hay pérdida por coma flotante, el orden de
RN-19 coincide, y los resultados son idénticos corriendo en UTC, Lima, UTC+14 y UTC−12. Los 15
hallazgos estaban todos en **qué hace el motor cuando el dato de entrada no es perfecto**.

Once se arreglaron y quedaron cubiertos por tests de regresión (§6). **Tres exigen decisión y
siguen abiertos:**

**V-01 🔴 — Una falta cuesta tres días de sueldo, no dos.**
RN-09 descuenta `sueldo_por_dia × 2`, y RN-06 ya había restado el día de horas que no trabajó.
Total: **3 días de sueldo por 1 día de ausencia**. Con 3 días contratados y S/120 de sueldo, una
falta deja el pago del periodo en **S/16**.

Ni la spec ni el dueño dicen que sea así. §9.4 documenta el castigo doble sólo para **tardanzas**
(cita textual del dueño en N5), y **S4 —*"¿qué se le descuenta a alguien del sueldo?"*— quedó sin
responder**, que es justo la pregunta que validaría esto.

**Resuelto por el dueño el 14-ago-2026: incluyéndolo.** Son 2 días en total, no 3. RN-09 ahora
descuenta `(dias_descuento_por_falta − 1)`.

**V-02 — La meta semanal fija también aplica hacia abajo.**
La decisión de §9.2 fue sobre la semana que *absorbe días de más*. El código la aplica igual
cuando el tramo es **más corto** que una semana: un periodo de 1 día (la modalidad "por día
trabajado" de HUE-01) o el primer periodo de alguien que entra a mitad de semana tiene meta del
periodo proporcional (alcanzable) pero meta semanal completa (S/1.275, inalcanzable). Las dos
metas del mismo motor escalan con criterios opuestos.

*Decisión pendiente:* ¿la meta fija aplica también a tramos de menos de 7 días, o se prorratea
sólo hacia abajo?

**V-03 — Las dos decisiones de §9.1 y §9.2 son de Alexander, no del dueño.**
Se tomaron en conversación el 13-ago-2026, no están en `docs/respuestas-dueno-2.md` ni en ningún
cuestionario respondido por el dueño. **Mueven S/25 por persona por mes** en el caso de prueba.
Alexander es locador de servicios, no el dueño del negocio: quedan como decisión suya **pendiente
de confirmación**, no como regla del dueño. Cita textual de Alexander en §9.1: *"no, solo afecta
en cuántas horas trabajó y eso en su pago del día"*.

Y una mejora que se aplicó sin necesitar decisión: **la escala salarial de RN-14 dejó de estar
quemada en el código.** `sueldoSugerido()` ahora acepta la tabla como parámetro, con
`ESCALAS_SUELDO_DEFAULT` como valor por defecto.

### 9.6 — Segunda ronda del verificador (14-ago-2026)

Cinco revisores en paralelo con lentes distintas —aritmética, casos de borde, coherencia
spec ↔ código, las reglas nuevas y cobertura de tests— y un escéptico por hallazgo con la carga
de la prueba invertida. **35 hallazgos crudos, 6 refutados por no reproducirse, 3 confirmados de
severidad alta.** Los otros 26 quedaron fuera del tope de verificación y se revisaron a mano
después; los reales están abajo.

**Corregidos sin necesitar decisión:**

- **Una fecha inexistente sólo se validaba en los extremos del periodo.** `2025-06-31` pasa la
  expresión regular. Según dónde caiga: una venta con esa fecha sumaba S/100 de comisión, una
  jornada se descartaba en silencio perdiendo 11 h, y unas horas fuera de contrato se pagaban
  enteras. Cero advertencias en los tres casos. Ahora `validarFecha()` comprueba también el
  calendario, así que las cuatro rutas de datos quedan cubiertas de una vez.
- **`factor_meta` se aplicaba también a la meta pactada**, cuando §3.3 dice que no. Hoy es
  inocuo porque el default es 1.00, pero el día que alguien lo baje descontaría un número ya
  negociado. Ahora sólo afecta a la meta sugerida.
- **La spec se contradecía a sí misma en cuatro lugares**: el encabezado, §9 y §9.5 declaraban
  un total del caso de prueba que el motor ya no producía, y §3.4 describía un campo
  `justificada` que el código parte en dos marcas. Es exactamente la trampa del no-negociable 7,
  cometida dentro de esta misma sesión.
- **`meta_por_hora` no figuraba en la tabla de parámetros** de §3.3 aunque es configurable.
- **Faltaban tests en los filos**: el empate exacto contra la meta semanal y contra la mensual
  (las dos comparaciones son opuestas a propósito y ninguna estaba fijada — voltear la del bono
  paga S/30 de una semana que no se ganó), la boleta de exactamente S/120, el minuto exacto de
  la tolerancia, y el umbral de horas del almuerzo.

**V2-01 ✅ — Resuelto: la unidad del castigo por falta es el día real, no el promedio.**

**Decidido por el dueño el 14-ago-2026: opción B.** Faltar a un sábado de 1 hora cuesta dos
sábados; faltar a un lunes de 11 horas cuesta dos lunes. El castigo es proporcional al compromiso
de ese día, igual que el resto del sistema, que ya cobra todo por horas.

Consecuencia: `sueldo_por_dia` (RN-04) deja de usarse para descontar y queda **sólo informativo**.
RN-09 pasa a `horas_faltadas × valor_por_hora × (dias_descuento_por_falta − 1)`. El caso de prueba
no cambia —sus jornadas son todas de 11 h— así que no hay regresión.

El planteo original del hallazgo, que se conserva porque explica por qué era un problema:

RN-09 descuenta el castigo en **días promedio** (`sueldo_por_dia` = sueldo ÷ días contratados)
mientras que el día no trabajado ya salió en **horas reales** por RN-06. Con jornadas iguales las
dos unidades coinciden y la falta cuesta exactamente 2 días. Con jornadas desiguales divergen:

| Horario | Falta a… | Cuesta | En días de ese día |
|---|---|---|---|
| Lun–vie 11 h + sáb 1 h, sueldo S/1.200 | el sábado | S/55,36 | **10,3 sábados** |
| Lun 11 h + sáb 2 h, sueldo S/520 | el sábado | S/85 | 4,25 sábados |
| Lun 11 h + sáb 2 h, sueldo S/520 | el lunes | S/175 | 1,59 lunes |

Ninguno daba los 2 días que pide la regla. Las tres salidas que se plantearon:

| Opción | Qué implica | Faltar al sábado de 1 h |
|---|---|---|
| **A** — El día promedio | Faltar cuesta siempre `2 × sueldo_por_dia`, sea el sábado corto o el lunes largo | S/100 |
| **B** ✅ — El día real | Proporcional al compromiso de ese día | S/10,71 |
| **C** — Dejarlo como estaba | El castigo queda plano en soles y sólo cuadra con jornadas uniformes | S/55,36 |

La falta **justificada** ya funcionaba por el día real, así que con la opción B las dos quedan
coherentes: la justificada cuesta 1 día de ese día, la injustificada cuesta 2.

### 9.3 — Definiciones que la spec no fija (defaults tomados, editables)

Ninguna de estas altera el resultado del caso de prueba, pero hubo que elegir algo:

| Punto | Qué dice la spec | Default tomado |
|---|---|---|
| "Jornada completa" para almuerzo (RN-15) | No lo define | **Cualquier día con ingreso y salida registrados**, con un mínimo de horas configurable en 0. Es lo único que da los 16 días del caso de prueba; exigir cumplir las horas contratadas daría 12 |
| Meta por hora (RN-10) | "S/45.4545" | **1500 / 33 exacto**. El 45.4545 es el valor mostrado redondeado; con él la meta del periodo daría 7,499.99 en vez de 7,500.00 |
| Redondeo | No lo menciona | **Cada línea del desglose se redondea a 2 decimales y el total es la suma de las líneas redondeadas.** Así el desglose que ve el colaborador suma exactamente el total. `valor_por_hora` **no** se redondea (redondearlo a 3.64 movería el total ~S/0.06) |
| Comparación de meta semanal | `ventas > meta` | Estricto, tal cual. Empatar la meta no la cumple |

Las tres primeras van también a `docs/pendientes-negocio.md`.
