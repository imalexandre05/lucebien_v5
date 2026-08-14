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
| Migraciones aplicadas | **Las 66** (`0001`–`0066`) |
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

### Ciclo de evaluación — regla confirmada por el dueño

Del día de ingreso al día anterior del mes siguiente. Quien ingresó un día 5 se evalúa del 5 al 4.
La evaluación ocurre el día anterior al cumplimiento.

**Verificado ejecutando `calcularCiclo()`:** la regla ya está bien implementada para los días 1 al
28. Falla sólo para los días 29, 30 y 31 cuando el mes siguiente es más corto — devuelve un ciclo
que todavía no empezó. Hipótesis del dueño (sin confirmar): recortar al último día del mes.

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
| Tardanza en día sin horario | **No cuenta.** Ese día sólo suma horas trabajadas a su pago | Alexander ⚠️ falta confirmar con el dueño |
| Meta semanal en meses de 31 días | **Fija.** La semana que absorbe días sobrantes no sube su meta | Alexander ⚠️ falta confirmar con el dueño |
| Tipo de lavado (normal / seco / especializado) | Lo decide el propio operario al hacerlo | Dueño |
| Despiece 60/40 saco-pantalón | Aplica a **todos** los trabajos por igual | Dueño |
| Evaluar antes de terminar el ciclo | **No se puede.** Tiene que cumplir su mes | Dueño |
| Ventana de Valores 360° | 3 días, la misma para todos. Sin completarla, sistema bloqueado; si ni así, le baja la nota hasta el mes siguiente | Dueño |
| A quién evalúa cada persona en 360° | A **todos** sus compañeros, no sólo a los de su sede o turno | Dueño |
| Horarios | Los arma sólo el administrador, hoy en Excel. Son **por persona**, no por puesto. Cambian cada mes o dos | Dueño |
| Prenda urgente | Automático: a menos de 3 días de su fecha de entrega. Sólo se resalta, no avisa | Dueño |
| Sanción por prenda perdida o no devuelta | Costo completo, del sueldo. La decide el administrador. **Se revoca si la prenda aparece** | Dueño |
| Numeración de pedidos | **Por tienda**, no una cuenta única. Hoy está al revés | Dueño |
| Auditoría | *"Todo debe registrarse"*. Hoy sólo 5 lugares | Dueño |
| Tienda Trece | **Entra al sistema nuevo** como tienda normal | Dueño |
| Adelantos | Exigen mínimo una semana trabajada ese mes como garantía | Dueño |

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
