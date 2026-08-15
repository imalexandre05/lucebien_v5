# Mapa verificado del sistema — 13 de agosto de 2026

> **Qué es este documento.** El estado real del proyecto, verificado contra el código y contra la
> base de datos viva, no contra otros documentos.
>
> **Regla de este archivo:** todo dato acá tiene que poder comprobarse ejecutando algo. Si una
> afirmación no se puede verificar, se marca como *sin verificar*. Nunca se copia un dato de otro
> documento sin volver a comprobarlo — ese error ya se cometió en este proyecto (ver §6).

---

## 1. Alcance del proyecto

**Lo que este sistema hace:** control interno — procesos, colaboradores, recursos humanos,
sueldos, evaluación de desempeño, pipeline de prendas.

**Lo que NO hace:** dinero, ventas, POS, inventario comercial, clientes. Eso queda a cargo de otro
programador en un sistema aparte.

**Frontera:** sin definir. El otro sistema estaría en `tuxedo.psk.com.pe:8055` (puerto por defecto
de Directus). *Sin verificar:* ese dominio no resuelve públicamente — es interno a la red de la
empresa o la dirección está mal.

**Excepción que se conserva:** el envío de prendas de tienda a almacén sigue en este sistema aunque
llegue el otro, porque le sirve al administrador para mapear el trabajo de las personas. Se
automatizará recién cuando el inventario del otro sistema esté completo.

---

## 2. Estado verificado de la base de datos

Verificado el 13-ago-2026 contra el proyecto Supabase `scilb` (`lszrvbfkgsdyvhyxcslw`).

| Dato | Valor |
|---|---|
| Migraciones aplicadas | **Hasta la `0073`**, contando dos ramas. En `feat/sueldos-motor`: `0067` (aislamiento), `0072` (tablas de sueldos) y `0073` (RPC de sueldos), las tres aplicadas y verificadas el 14-ago-2026. En `feat/mi-talla-db`: `0068`–`0071`, también aplicadas. **El número ya no dice el orden en que se aplicaron** — ver abajo |
| Tablas | 53 |
| Funciones en `public` | 53 |
| Empleados | 18 |
| Reportes | 1.078 |
| Pasadas de pipeline | 83 |
| Activos de inventario | 4 |
| Pedidos | 0 |

### Adopción real

```
Reportes totales:            1.078   (07-abr a 13-ago, 4 meses)
  generados por el cron:     1.031   ← 95,6%
  hechos por una persona:       47   ←  4,4%
  evaluados:                    69
```

**Nadie usa el ERP nuevo.** La gente sigue trabajando con el sistema Express + SQLite, que corre
con PM2 en una PC de la empresa. Los 12 reportes diarios que aparecían en la base eran el cron de
auto-cierre generando filas vacías (4 sedes × 3 turnos), todas las noches, desde abril.

### 🔴 El número de migración dejó de significar "orden de aplicación"

Encontrado el 14-ago-2026 al instalar el guard de números de migración, que fue lo primero que
hizo apenas se escribió.

Dos ramas paralelas —`feat/mi-talla-db` y `feat/sueldos-motor`— reservaron **los mismos números**,
y las cuatro migraciones **ya estaban aplicadas en producción** cuando se descubrió:

| Número | En `feat/mi-talla-db` | En `feat/sueldos-motor` |
|---|---|---|
| `0068` | `mi_talla_esquema` | `sueldos_esquema` ← renumerada a `0072` |
| `0069` | `mi_talla_storage` | `sueldos_rpc` ← renumerada a `0073` |

**Por qué no reventó:** las de sueldos se registraron en Supabase con el nombre sin número
(`sueldos_esquema`, `sueldos_rpc`, `aislamiento_datos_personas`), así que el historial de
`schema_migrations` no tuvo colisión de claves. Fue suerte, no diseño.

El orden real de aplicación fue: mi-talla `0068`, `0069`, `0070` → aislamiento (`0067`) →
mi-talla `0071` → sueldos `0072`, `0073`. **El número es un identificador único, no una fecha.**
Con ramas en paralelo no puede ser las dos cosas.

**Qué lo impide de acá en adelante:** `bash tools/reservar-migracion.sh <slug>` mira todas las
ramas antes de darte un número, y el guard falla si dos ramas comparten uno. Ver
[harness.md](harness.md).

---

## 3. La cadena que termina en el sueldo (zona crítica)

```
pasada de prenda → puntos → reporte diario → evaluación mensual /20 → decisión de pago
```

Un error en cualquier eslabón le paga de menos a una persona real. Esta es la zona que exige el
mayor rigor.

### Puntos por trabajo (valores reales en `config`, verificados)

| Clave | Puntos |
|---|---|
| `pts_compostura` | 5 |
| `pts_lavado_especializado` | 5 |
| `pts_lavado_seco` | 3 |
| `pts_planchado` | 3 |
| `pts_control_calidad` | 2 |
| `pts_refaccion` | 2 |
| `pts_lavado_normal` | 1 |
| `pts_empatado` | 0.5 |
| `pts_accesorio` | 0.5 |

No existen `pts_recepcion`, `pts_vacio`, `pts_codificacion` ni `pts_listo_envio`: esos pasos del
pipeline no otorgan puntos. Pendiente de confirmar si deberían.

### Pesos de la nota mensual (verificados en `config`, suman 1.00)

`competencias` 0.25 · `valores` 0.25 · `examenes` 0.15 · `operaciones` 0.10 · `software` 0.10 ·
`limpieza` 0.10 · `tardanza` 0.05

Tardanza: `eval_tardanza_min_por_punto = 15` (se pierde 1 punto cada 15 minutos acumulados).

### 🔴 El modelo implementado NO es el que describe Alexander

Esto es lo más grande que quedó abierto y merece su propia sesión. Lo dijo el 14-ago-2026 y
**contradice lo que hay en el código**.

**Lo que hace hoy `calcularNotaMensual()`** (`packages/core/src/evaluaciones.ts:41`): cada
componente entra en escala /20, se multiplica por su peso, y la suma da la nota. Los pesos suman
1.00 y la nota nunca pasa de 20.

**Lo que Alexander describe:**

> *"cada aspecto como los valores o examen o pipeline te dan puntos, y otras cosas como incidencias
> y tardanzas descuentan puntos, no la nota general. Esa nota de 0 a 20 sale de una transformación
> a base 20 de los puntos, que pueden llegar a ser centenas o miles."*

Son **dos modelos distintos**, no dos formas de decir lo mismo:

| | Implementado | Descrito |
|---|---|---|
| Unidad | Componentes en escala /20 | **Puntos acumulados**, centenas o miles |
| Cómo se combina | Suma ponderada por pesos | **Suma de puntos**, y después una transformación a base 20 |
| Qué hace una tardanza | Baja el componente `tardanza`, que pesa 0.05 | **Resta puntos** del total |
| Techo | 20 por construcción | El techo sale de la transformación |

**No se toca nada hasta tener la explicación completa.** Alexander avisó que es largo y va en una
sesión aparte con su propia spec. Lo que sí queda claro y ya está decidido: la tardanza **descuenta
plata y descuenta puntos**, son la misma tardanza, y descontar puntos no es lo mismo que bajar la
nota.

### Ciclo de evaluación — regla completa, confirmada el 13-ago-2026

**La regla, en una línea:** el ciclo termina el día anterior al próximo aniversario de ingreso; si
ese aniversario no existe en el mes siguiente, termina el último día de ese mes.

```
hasta = próximo_aniversario − 1 día
        si el aniversario no existe (entró 29/30/31 y el mes siguiente es más corto)
        → hasta = último día de ese mes
```

| Entra el | Mes siguiente | Se evalúa el | Por qué |
|---|---|---|---|
| 1 | cualquiera | último día del mes | el día antes del 1 del próximo |
| 5 | cualquiera | 4 | aniversario − 1 |
| 29 | 30 o 31 días | 28 | aniversario − 1 |
| 30 | 30 días | 29 | aniversario − 1 |
| 31 | 30 días | **30** | el 31 no existe → último día |
| 31 | 28 días | **28** | el 31 no existe → último día |

**Además:** el administrador puede fijar el periodo a mano (de qué día a qué día) y el sistema
adapta todo a esa cantidad de días. La regla automática es sólo el default.

**Estado del código:** `calcularCiclo()` está bien para los días 1 al 28. Para 29, 30 y 31 hereda
el "rollover" de calendario de JavaScript (31 de febrero → 3 de marzo) en vez de recortar al
último día. **Es un defecto y ahora sí hay regla escrita para arreglarlo.**

---

## 4. Decisiones tomadas

| Tema | Decisión | Quién |
|---|---|---|
| Módulo comercial (20 pantallas) | **No se borra:** queda como código muerto e inaccesible desde la navegación | Alexander |
| Cronograma de 96 semanas | Se descarta. Cambio de enfoque | Alexander |
| Commits huérfanos (`claude/awesome-blackburn-9763c4`) | Se descartan | Alexander |
| Despliegue | Producción directa mientras no haya usuarios. Con usuarios reales: preview y pruebas antes de subir | Alexander |
| Cron de auto-cierre | Desprogramado el 13-ago. No se reactiva hasta que exista el sistema de horarios | Alexander |
| Reportes basura (1.005 filas) | Se borran. Pendiente de ejecutar — bloqueado por permisos | Alexander |
| Sistema viejo | Se apaga cuando el nuevo esté validado. Migrar sus datos al nuevo | Alexander |
| Pesos, tramos y puntos | Todos editables por el administrador | Dueño |
| Notas ya cerradas | No se recalculan si cambian los pesos. Sólo aplica hacia adelante | Dueño |
| Pagos por actividad extra | **Se eliminan.** Las actividades extra dan sólo puntos | Dueño |
| Reporte no enviado a tiempo | Se envía solo, marcado como no enviado, con puntaje cero | Dueño |
| Quién evalúa un reporte | El turno siguiente evalúa al anterior. Si son las mismas personas, lo hace otra sede | Dueño |
| Bloqueo por reporte sin evaluar | Se mantiene, sin margen de gracia | Dueño |
| Valores 360° | Sólo el administrador ve quién puntuó a quién | Dueño |
| Sueldos y notas | Sólo el administrador, y cada colaborador lo suyo con autenticación | Dueño |
| Encargado de sede | Ve sólo su sede | Dueño |
| Puntos de un terno | Por conjunto. Si se despieza, 60% saco / 40% pantalón, editable | Dueño |
| Tardanza en día sin horario | **No cuenta.** Sólo se le paga el tiempo que estuvo | **Confirmado** 14-ago |
| Meta semanal en meses de 31 días | **Fija.** La misma meta pactada para todas las semanas — funciona como periodo de gracia | **Confirmado por el dueño** 14-ago |
| Licencia y descanso | **No son estados nuevos.** Una licencia es una falta que el administrador marca como justificada, con evidencia que aporta el colaborador; si no la marca, queda injustificada. El descanso semanal no necesita registro: no es día contratado | **Confirmado** 14-ago |
| Jornada habitual | 6 días de trabajo y 1 de descanso; a veces trabajan todos. El modelo es **por horas** y muy variable | Alexander |
| Contratos de pocos días (sólo domingos, sólo fines de semana) | Existen, pero **el contrato mínimo es de un mes**. Por eso se paga a fin de mes y no por día | Alexander |
| Los 3 días de gracia de tardanza | El administrador decide **por contrato** si ese acuerdo los tiene habilitados. Con pocos días de trabajo al mes, no se justifican | Alexander |
| Colaborador que deja de trabajar | Se **suspende, nunca se elimina**: sus métricas y su historial de rendimiento quedan para cuando vuelva a contratarse | Alexander |
| Las dos tardanzas | **Son la misma.** Descuenta plata Y descuenta puntos de la evaluación. No baja la nota directamente: baja los puntos, y la nota sale de los puntos | Alexander |
| Fecha de ingreso | Se cargan desde el huellero hasta el inicio de año. El inicio de cada periodo lo pone el administrador, en el **módulo de contratos** | Alexander |
| Módulo de contratos | Es **parte del sistema de sueldos**: asigna usuario, rol, horas de trabajo, datos personales, y con eso estima sueldo y condiciones | Alexander |
| Escala salarial | Sube con experiencia, confiabilidad y responsabilidad en tienda. El administrador ve la sugerencia y decide, pero **lo ideal es seguirla** por transparencia con la persona | Alexander |
| Tipo de lavado (normal / seco / especializado) | Lo decide el propio operario al hacerlo | Dueño |
| Despiece 60/40 saco-pantalón | Aplica a **todos** los trabajos por igual | Dueño |
| Evaluar antes de terminar el ciclo | **No se puede.** Tiene que cumplir su mes | Dueño |
| Ventana de Valores 360° | 3 días, la misma para todos. Sin completarla, sistema bloqueado; si ni así, le baja la nota hasta el mes siguiente | Dueño |
| A quién evalúa cada persona en 360° | A **todos** sus compañeros, no sólo a los de su sede o turno | Dueño |
| Horarios | Los arma sólo el administrador, hoy en Excel. Son **por persona**, no por puesto. Cambian cada mes o dos | Dueño |
| Prenda urgente | Automático: a menos de 3 días de su fecha de entrega. Sólo se resalta, no avisa | Dueño |
| Sanción por prenda perdida o no devuelta | Costo completo, del sueldo. La decide el administrador. Se revoca si la prenda aparece, **pero sólo mientras el mes esté abierto** | Dueño |
| Corregir un mes ya cerrado | **No se vuelve atrás.** Lo que se hizo en el mes se arregla en el mes; una vez cerrado y pagado, se olvida | Alexander |
| Adelanto sin la semana de garantía | **Se bloquea**, y el sistema avisa el motivo. No es sólo una advertencia | Dueño |
| Numeración de pedidos | **Por tienda**, no una cuenta única. Hoy está al revés | Dueño |
| Auditoría | *"Todo debe registrarse"*. Hoy sólo 5 lugares | Dueño |
| Tienda Trece | **Entra al sistema nuevo** como tienda normal | Dueño |
| Adelantos | Exigen mínimo una semana trabajada ese mes como garantía | Dueño |
| Descuento por tardanza | S/5, editable. 3 libres. Las justificadas no descuentan; el admin decide qué se justifica | Dueño |
| Falta **injustificada** | Pierde **2 días en total**: el día que no trabajó más 1 de castigo. Con sueldo diario S/40 y 3 días contratados, cobra S/40 | Dueño |
| Falta **justificada** | Pierde **1 día en total**: sólo el que no trabajó, sin castigo. Preferiblemente se recupera | Dueño |
| Bono por meta semanal | **Existe.** S/30 por cada semana cumplida, editable | Dueño |
| Comisión | Se habilita **sólo al llegar a la meta mensual**. Recién ahí se paga el 2% | Dueño |
| Base de la comisión | El **total de la boleta** cuando supera S/120, no cada producto por separado | Dueño |
| Ventas que cuentan | Las que hizo **cada persona**, sumadas entre todas las tiendas por las que rotó. No las de la tienda | Dueño |
| Metas de venta | Se **acuerdan en el contrato**, por persona. Varían por tienda, temporada, experiencia y turno. Editables siempre | Dueño |
| Horas extra | Valen lo mismo que la hora normal, sin recargo | Dueño |
| Bonos extras | Los pone el administrador a mano, con su descripción y motivo. **No** salen de las actividades extra de los reportes | Dueño |
| Almuerzo de S/8 | Sólo para **tiempo completo**, no medio turno. Se entregan día a día o todos a fin de mes | Dueño |
| Semana del ciclo | Arranca el día de ingreso y termina el mismo día de la semana siguiente. Quien entra un jueves, su semana va de jueves a jueves | Dueño |
| Ciclo de evaluación con ingreso 29/30/31 | Se recorta al último día del mes cuando el aniversario no existe. El admin además puede fijar el periodo a mano | Dueño |
| Horas de cierre de turno | Se quedan como están: 15:00 mañana, 23:00 tarde, 23:00 cierre | Dueño |
| Margen de gracia para reporte sin evaluar | **No hay.** Se evalúa sí o sí antes de crear otro | Dueño |
| Bono por metas de venta en la evaluación | Lo pone el **administrador a mano**. Depende de temporada, tienda, turno y tipo de contrato | Dueño |
| Meta de puntos que paga dinero | Se define después de medir cuántos puntos junta la gente | Dueño |
| El Excel de sueldos | Es una **plantilla de referencia**, no la planilla real. Sirve para entender el flujo, no para copiar sus valores | Alexander |

---

## 5. Meta de fin de agosto de 2026

Todo el control interno funcionando en producción, validado por colaboradores y administrador,
demostrando la mejora del flujo de trabajo.

**Alcance de "todo":**
1. Reporte de actividades
2. Pipeline
3. Envío a lavandería
4. Mi desempeño
5. Evaluación mensual
6. **Sistema de sueldos** (no existe)
7. **Horarios** (no existe)
8. Solicitudes
9. Capacidad del administrador de editar y configurar todo

**Riesgo principal:** el cuello de botella no es el código, es la adopción. Hoy es 4,4%. Seis de
los nueve puntos existen; los otros tres hay que construirlos desde cero.

---

## 6. La trampa documental que ya ocurrió acá

`docs/pendientes-negocio.md` afirma en tres lugares distintos que las migraciones `0050`–`0058`
nunca se aplicaron contra `scilb`, y que `SUPABASE_DB_URL` no existía en `.env.local`.

**Ambas afirmaciones son falsas.** Se verificó objeto por objeto contra la base: las 66 migraciones
están aplicadas. La variable existía.

El error se propagó porque las fases 11, 12 y 13 copiaron la afirmación entre sí sin volver a
comprobarla. Consecuencia: durante meses se creyó que producción corría degradada, y se escribieron
avisos de "falta aplicar la migración" en pantallas que en realidad funcionaban.

**Regla derivada:** lo que se escribe se verifica contra el código o contra la base. Nunca contra
otro documento. Coincidencia entre documentos no es evidencia.

---

## 7. Lo que falta definir

### Bloquea el diseño
- **La frontera con el otro sistema.** Qué es exactamente, quién manda sobre el código de prenda,
  si hay una o dos bases de datos, y cómo se sincronizan.
- ~~**El sistema de sueldos.**~~ **Resuelto el 13-ago-2026.** Hay spec completa
  (`docs/superpowers/specs/sueldos/SPEC-sistema-sueldos.md`) y motor implementado
  (`packages/core/src/sueldos.ts`, 26 tests). Todo cuelga del **valor por hora** =
  `sueldo_pactado / horas_contratadas`. Falta la capa de datos (tablas, RPC) y la pantalla.

### Bloquea el pipeline
- Si los pasos sin puntos (recepción, codificación, listo para envío) deberían otorgarlos.
- Los flujos cortos por tipo de prenda: zapatos, camisas y corbatas no siguen los 9 pasos.
- Niveles de urgencia y quién los marca.

### Bloquea la evaluación
- Qué pasa con quien ingresó los días 29, 30 o 31.
- Si se puede evaluar antes de que termine el ciclo.
- La ventana de Valores 360° y qué ocurre si alguien no la completa.

### Reglas que hoy no existen en el sistema
- **Comisión por ticket** al vendedor que vende varios productos juntos.
- **Sanción al cajero** cuando un cliente no devuelve un alquiler: paga el costo del terno.
- **Sanción por prenda perdida**, ajustable por el administrador.
- **Meta de puntos** por encima de la cual cada punto vale dinero.

### Dispositivos
La regla del negocio es más fina que el interruptor que existe: cualquier equipo sirve para entrar
con una cuenta habilitada, pero pipeline, envíos y cambios de base sólo desde un dispositivo
autorizado. Hoy `DEVICE_GATE` es un interruptor global y está apagado. Hay que rehacerlo como
permiso por operación.

---

## 8. Deuda técnica encontrada por el guard

El guard de no-negociables (`tools/guard-reglas.sh`) encontró esto en su primera corrida. Está en
`tools/guard-baseline.txt` para no romper el build, pero es deuda real:

**`estadisticas.ts:19` — bug de zona horaria.** `normalizarRango()` hace `const hoy = new Date()`
y después lee `getUTCFullYear()`. En Perú (UTC−5), entre las 19:00 y medianoche UTC ya está en el
día siguiente: el rango "últimos N días hasta hoy" incluye mañana durante cinco horas cada día.
Afecta lo que muestra `/estadisticas`. Arreglo: recibir `hoyPeru()` del caller, como hace
`evaluaciones.ts`.

**`crm.ts:23,42` — fecha por defecto.** `hoy: Date = new Date()` como parámetro opcional. Menos
grave porque el caller puede pasarla, pero si se olvida hereda la zona del proceso. `crm.ts` es
del módulo comercial, hoy fuera de alcance.

**`registrarPasada()` en `pipeline-repo.ts:95` — dos escrituras sin transacción.** Crea el activo
de inventario y la pasada del pipeline por separado. Si la segunda falla queda un activo huérfano,
o una prenda en el pipeline sin su vínculo al inventario. El propio comentario del código lo
declara: *"Dos escrituras secuenciales (sin RPC): mismo patrón que el resto de este archivo"*.
Es el riesgo exacto que cubre el no-negociable 2 — una prenda mal mapeada es una prenda perdida.
Arreglo: una RPC que haga las dos escrituras en una transacción.

Los tres son nivel 3 en la matriz de rigor: exigen spec antes de tocarlos.

---

_Verificado contra código y base de datos. Última actualización: 13 de agosto de 2026._
