# SPEC — Que el sistema avise lo que hay que revisar, y sepa retirar el aviso

> **Qué es.** El ítem B-9 de [la hoja de ruta](../2026-08-25-reunion-admin-hoja-de-ruta.md)
> —*«notificaciones en caso de declaraciones falla»*— junto con la respuesta de Alexander del
> 25-ago: *«se debe avisar visualmente todas esas cosas por revisar»*.
>
> **Zona de rigor: spec completa.** Los avisos nuevos nombran a personas y dicen cosas sobre su
> asistencia. Eso cae de lleno en el no-negociable 3, y al medir el módulo aparecieron **dos agujeros
> de aislamiento ya abiertos** (§2). Se cierran primero.

---

## 1. Notificaciones no es un módulo nuevo. Existe, corre, y apunta a lo que ya nadie usa

Se anotó como «módulo a construir en paralelo». **No hay nada que construir desde cero.** Medido
contra `scilb` el 6-sep-2026:

| | |
|---|---|
| Tabla | `notificaciones` + `alertas_reglas` (migración `0041`) |
| Motor | `generar_alertas()` en SQL (migración `0042`) **y** `packages/core/src/alertas.ts` en TypeScript |
| Automático | Dos cron: `generar-alertas-am` (13:00 UTC = 8 h Perú) y `generar-alertas-pm` (01:00 UTC = 20 h Perú) |
| Estado de los cron | **Corren y terminan bien todos los días.** Última corrida correcta: 6-sep |
| Pantalla | `/notificaciones` + el popover de la barra superior |
| Filas | 43, de las cuales **22 sin leer** |
| Última notificación creada | **26-ago-2026** — once días sin una sola nueva |

Los cinco tipos de regla que trae la `0041` son: `devolucion_vencida`, `devolucion_proxima`,
`stock_bajo`, `caja_sin_cerrar` y `reporte_sin_evaluar`. **Los cuatro primeros son del módulo
comercial**, que está fuera del menú desde el 20-ago. Es decir: la máquina funciona, se enciende dos
veces por día, y mira un edificio vacío.

**Ésa es la única razón por la que «no hay notificaciones»**, y explica los once días de silencio: no
es que esté rota, es que no se le dio nada del control interno para mirar.

## 2. Dos agujeros de aislamiento, medidos, que hay que cerrar antes de tocar nada más

La política de lectura de `notificaciones`, tal como está viva hoy:

```sql
using (
  private.app_es_admin()
  or destinatario_sede is null          -- <- cualquiera con sesión
  or destinatario_sede in (select private.app_sedes())
  or destinatario_id = auth.uid()
)
```

**A-1 — `destinatario_rol` no lo mira nadie.** La columna existe, las reglas la llenan
(`'admin'`, `'encargado_tienda'`…) y la RLS **nunca la consulta**. Un aviso declarado «para el
administrador» con sede nula lo lee **todo el mundo**.

Hoy no hay fuga: los avisos vivos nombran sede y fecha, no personas. Pero la primera regla nueva que
diga *«a Marylin le faltan 3 días por revisar»* se la muestra a los once. El agujero no está en lo
que hay: está en el paso siguiente, y ese paso es esta misma spec.

**A-2 — Cualquiera con sesión puede crear un aviso que ven todos.** El `with check` de `notif_rw`
—que cubre `all`, no sólo `insert`— admite `destinatario_sede is null`. Un colaborador puede insertar
una notificación global. Después no puede borrarla, porque el `using` de esa misma política **sí**
omite la cláusula del nulo: queda para siempre y sólo el administrador la puede sacar.

**Ninguno de los dos se arregla con la regla nueva. Van primero, en su propia migración.**

## 3. Los otros tres defectos, de comportamiento

**D-1 — Un aviso nunca se retira.** Las cinco reglas terminan en
`on conflict (dedup_key) do nothing`, y **no hay una sola sentencia en todo el módulo que borre una
notificación cuando su condición deja de ser cierta**. Un reporte se evalúa y su
`reporte_sin_evaluar` sigue ahí. Hoy hay 22 sin leer y no hay forma de saber cuántas siguen siendo
verdad.

Un aviso que no se puede retirar deja de leerse, y entonces el módulo entero no sirve para nada.
**Éste es el defecto que hay que arreglar antes de agregar una sola regla más**: sumar seis fuentes
nuevas a una lista que sólo crece la vuelve ruido más rápido.

**D-2 — El mensaje se congela.** El texto se escribe una vez y no se vuelve a tocar. *«La devolución
venció hace 1 día»* sigue diciendo *«1 día»* tres semanas después. El encabezado de la `0041` promete
otra cosa —*«el UPSERT refresca en vez de duplicar»*— y el código hace `do nothing`. Entre el
documento y el código gana el código (no-negociable 7); acá se corrige el código, que es el que está
mal.

**D-3 — Dos motores para las mismas reglas.** `generar_alertas()` en SQL (lo que corre el cron) y
`packages/core/src/alertas.ts` en TypeScript (lo que corre el botón manual del administrador). Se
mantienen iguales a mano, y está escrito así en `apps/erp-web/lib/notificaciones-repo.ts:14`:

> *«espejo de esta lógica y del mismo dedup_key, ambos son idempotentes entre sí. Si cambian las
> reglas aquí o en core/alertas.ts, actualizar también 0042.»*

Es exactamente el patrón que ya se pagó con `packages/core/src/huellero.ts`: dos copias de la misma
regla sincronizadas por un comentario, que divergieron en silencio hasta que se borró la copia
muerta. Acá todavía no divergieron. **Se resuelve antes de que lo hagan.**

---

## 4. Lo que se decide acá, y por qué

Alexander pidió avanzar sin esperar respuesta. Estas dos decisiones son mías y quedan anotadas como
tales:

**El canal es dentro del sistema.** No WhatsApp, no correo, todavía. Las razones son verificables:
sólo una parte de las personas tiene `telefono` cargado; mandar un mensaje al celular de alguien
diciendo qué días trabajó necesita su consentimiento, que no está pedido; y hace falta un proveedor
con su costo. La campana de la barra superior y `/notificaciones` **ya existen y ya funcionan**.
Se usan ésas. El canal externo queda anotado en la hoja de ruta como un paso posterior, no
descartado.

**Las reglas comerciales se apagan, no se borran.** `devolucion_vencida`, `devolucion_proxima`,
`stock_bajo` y `caja_sin_cerrar` pasan a `activa = false`. Borrarlas obligaría a reescribirlas si el
sistema del otro programador cambia el alcance; apagarlas es una fila que se vuelve a poner en `true`
en un clic. Se conserva `reporte_sin_evaluar`, que sí es del control interno.

---

## 5. El diseño

### C-1 — Un aviso se retira solo cuando su condición se termina

Cada regla, en la misma corrida, hace dos cosas: inserta las condiciones que son ciertas **ahora**, y
**borra las notificaciones vivas de su propio tipo cuyo `dedup_key` no salió en esa lista**.

```
por cada regla activa:
    calcular el conjunto de dedup_key ciertos hoy
    insertar los que falten
    borrar de `notificaciones` las de este tipo que no estén en ese conjunto
```

**Sólo borra las de los tipos que evaluó.** Una regla apagada no toca sus filas: si mañana se vuelve
a encender, siguen ahí. Y si una regla falla, no se lleva por delante los avisos de las otras.

**Se borra la fila, no se marca «resuelta».** `notificaciones` es una lista de pendientes, no un
registro histórico — el registro histórico es `audit_log`, que ya existe. Guardar avisos resueltos
convertiría la lista en el archivo que nadie mira, que es el problema que se está arreglando.

### C-2 — El mensaje se refresca

`on conflict (dedup_key) do nothing` pasa a `do update`, actualizando `mensaje`, `severidad` y
`updated_at`. **`leida` no se toca**: refrescar el texto no vuelve a marcar como no leído algo que la
persona ya vio. Que un número cambie no es una novedad.

### C-3 — Un solo motor

El botón manual del administrador deja de recalcular en TypeScript y llama a `generar_alertas()`, la
misma función que corre el cron. Con eso `packages/core/src/alertas.ts` y `alertas.test.ts` se
quedan sin ningún consumidor y **se borran**, igual que se hizo con `huellero.ts`.

Es una pérdida real de tests unitarios, y hay que decirlo: la lógica pasa a comprobarse desde
`packages/db/pruebas/`, contra la base, que es donde de verdad corre. Un test verde sobre la copia
que nadie ejecuta vale menos que ninguno, porque da confianza falsa.

**Addendum (8-sep-2026) — cómo se autoriza el llamado.** `generar_alertas()` (0107) está
`revoke ... from public, anon, authenticated; grant ... to service_role` — a propósito, porque hasta
ahora sólo la llamaba el cron (que corre como `postgres`, superusuario, y no necesita ningún grant).
Un botón de PostgREST corre como `authenticated`, así que llamarla tal cual hoy falla con
`permission denied`.

La opción **no** es `getAdminClient()` (no-negociable 3: bypassa RLS, restringido a los 6 archivos
que hoy lo usan, y esto no es una de esas seis razones). La opción es el mismo patrón que ya usan
`empleado_borrar_alta`/`sueldo_entrada`/`huellero_declarar_faltas_del_dia`: el guard vive **adentro**
de la función (`private.app_es_admin()`, `raise exception 'PERMISO:...'` si no), y **entonces** se
puede otorgar `grant execute ... to authenticated` sin abrir la puerta a nadie más — el guard de
`generarAlertasAction()` en TS (`sesion.usuario.rol !== 'admin' && !== 'dueno'`) queda como cinturón,
la función como tirantes. `service_role` se mantiene además (no hace daño, y cubre un cron
reconfigurado a futuro que no corra como superusuario).

### C-4 — Las reglas nuevas

Las seis, todas con su `activa` y su `umbral` en `alertas_reglas`, todas apuntando al control
interno:

| `tipo` | Cuándo avisa | Severidad | Umbral configurable |
|---|---|---|---|
| `declaracion_incompleta` | Liquidación abierta con días sin declarar dentro de su período. **Es el B-9 literal** | crítica | — |
| `periodo_liquidable` | Contrato cuyo tramo ya venció y todavía no tiene liquidación | warn | días de gracia (3) |
| `dia_con_hora_estimada` | Días `trabajado` cuya entrada o salida la puso el sistema (`0096`/`0097`) | warn | — |
| `dia_sin_marca` | Día laborable pasado, sin ninguna marca y sin declarar: candidato a falta | warn | días hacia atrás (7) |
| `extra_sin_valor` | `reporte_extras` con `puntos_total = 0`: trabajo extra registrado que no vale nada | warn | — |
| `falta_fecha_ingreso` | Persona activa sin `fecha_ingreso`. Son 9 hoy, y bloquean su ciclo de pago y toda la spec A-8 | warn | — |

**Se agrupan por persona y período, no por día.** Un aviso por cada día con hora estimada, por once
personas, sería una lista que nadie abre dos veces. El texto dice *«Marylin: 3 días del período
1-jul a 31-jul tienen la hora puesta por el sistema»*, y el `dedup_key` lleva persona y período — así
el número se refresca solo por C-2 a medida que se corrigen.

**Los umbrales van a `alertas_reglas.umbral`, que ya existe**, y quedan anotados como provisionales
en `docs/pendientes-negocio.md`. Ninguno se hardcodea (no-negociable 5).

### C-5 — Quién ve cada aviso

Éste es el punto donde el módulo toca el no-negociable 3, y la regla es una sola:

> **Un aviso que nombra a una persona es del administrador y de esa persona. De nadie más.**

Se implementa con `destinatario_rol = 'admin'`, `destinatario_sede = null` y `destinatario_id` en la
propia persona **una vez que A-1 esté cerrado** — antes de eso, `destinatario_sede = null` significa
«lo ve todo el mundo» y la regla se leería al revés.

`declaracion_incompleta`, `periodo_liquidable`, `extra_sin_valor` y `falta_fecha_ingreso` son sólo
para el administrador: hablan de plata y de datos de la empresa.
`dia_con_hora_estimada` y `dia_sin_marca` van al administrador **y** a la persona: es su asistencia,
y es ella quien puede corregirla.

### C-6 — Editable desde Configuración

`alertas_reglas` dice desde la `0041` que es *«editable desde Configuración a futuro»*. Ese futuro no
llegó: `notificaciones-repo.ts:85` la lee, y no hay una sola pantalla que la escriba. Se agrega la
sección en `/configuracion` para encender, apagar y ajustar el umbral de cada regla, con efecto
inmediato — el mismo criterio que el resto de los parámetros, y la corrección de la revalidación del
25-ago ya hace que el cambio se vea en todas las pantallas.

## 6. Lo que esta spec NO hace

- **No** manda nada fuera del sistema. Sin WhatsApp, sin correo, sin push.
- **No** toca la cadena del sueldo. Un aviso mira y cuenta; no calcula ni paga.
- **No** borra las reglas comerciales: las apaga.
- **No** cambia los horarios de los dos cron, que funcionan.
- **No** inventa ningún parámetro fuera de `alertas_reglas.umbral`.

## 7. Cómo se comprueba

| # | Caso | Esperado |
|---|---|---|
| 1 | Regla activa, condición cierta, sin aviso previo | Se crea uno |
| 2 | La misma condición, segunda corrida | **No** se duplica; se refresca `mensaje` y `updated_at` |
| 3 | Aviso ya leído, condición sigue cierta | Se refresca el texto y **sigue leído** |
| 4 | La condición deja de ser cierta | El aviso **desaparece**, leído o no |
| 5 | Regla apagada | Sus avisos existentes **no se tocan** |
| 6 | Regla apagada y vuelta a encender | Los avisos vuelven a mantenerse, sin duplicar |
| 7 | Un colaborador intenta insertar un aviso global | **Se niega** (cierra A-2) |
| 8 | Aviso `destinatario_rol='admin'`, `sede` nula | Lo ve el administrador. **Un colaborador no** (cierra A-1) |
| 9 | Aviso de `dia_con_hora_estimada` de la persona P | Lo ven el administrador y P. **Otro colaborador no** |
| 10 | Persona con 3 días estimados en un período | **Un** aviso que dice 3, no tres avisos |
| 11 | Se corrige uno de esos días | El mismo aviso pasa a decir 2 |
| 12 | Se corrigen los tres | El aviso desaparece |
| 13 | Las 4 reglas comerciales | Quedan `activa = false` y no generan nada |

## 8. Orden de implementación

1. ✅ **La RLS: A-1 y A-2.** Migración `0100`, aplicada y verificada contra `scilb` el 8-sep — los
   casos 7, 8 y el extra de marcar-leído dan `[ok]`. Nuevo helper `private.app_mi_rol()`.
2. ✅ **C-1 y C-2** —retirar y refrescar— sobre las reglas que ya existen. Migración `0101`, aplicada
   y verificada — casos 1 a 6 y 13 dan `[ok]`. Las cuatro comerciales quedaron `activa = false`,
   `reporte_sin_evaluar` sigue activa.
3. ✅ **C-4**: las seis reglas nuevas, con su alcance de C-5. Migración `0107`, aplicada y verificada
   contra `scilb` el 8-sep — casos 9 a 12 dan `[ok]`. **Al probar el caso 9 apareció un agujero real
   en la RLS de la propia `0100`** (la rama de "aviso global" no excluía `destinatario_id`, así que
   un aviso personal se colaba para cualquiera con sesión) — cerrado en la migración `0108`,
   verificado el mismo caso pasando a `[ok]` y sin regresión sobre los casos de la `0100`. Detalle en
   `docs/aprendizajes.md`.
4. ✅ **C-3**: el botón manual pasa a llamar `generar_alertas()`; `core/alertas.ts` borrado. Migración
   `0109`, aplicada y verificada contra `scilb` el 8-sep. **Al escribirla apareció que el Addendum
   del propio C-3 tenía un error**: el guard `private.app_es_admin()` tal cual se pidió habría
   bloqueado también al cron (depende de `auth.uid()` ← `request.jwt.claims`, un GUC que una
   conexión directa nunca fija). Corregido: el guard sólo rige cuando existe un contexto de
   PostgREST (`current_setting('request.jwt.claims', true) is not null`). Los tres casos —
   no-admin bloqueado, admin permitido, sin impersonar (el camino del cron) permitido — dan `[ok]`.
   Detalle en `docs/aprendizajes.md`.
5. ✅ **C-6**: la sección en `/configuracion`. `/configuracion/notificaciones` — 11 reglas
   agrupadas en "Control interno" (las 6 de la 0107) y "Módulo comercial" (las 5 de la 0041/0046),
   toggle `activa` y campo `umbral` (donde la regla lo usa) con efecto inmediato, sin migración
   nueva. `destinatario_rol` se muestra de sólo lectura, nunca editable — ver el porqué en el
   comentario de `notificaciones-repo.ts`. La policy `reglas_rw` (`0041`) ya cubre `update` para
   admin, verificado contra `scilb`. **Verificación parcial**: el `implementador` no probó en
   navegador; la sesión principal confirmó contra `erp-dev` (PM2, puerto 3005) que la ruta compila y
   el gate de admin redirige a `/login` sin sesión (307, no un 500) — falta la comprobación visual
   completa (clickear un toggle, ver el número guardarse) con una sesión de administrador real.

Los pasos 1 y 2 valen por sí solos aunque no se haga ninguno de los demás: uno cierra dos fugas y el
otro convierte una lista que sólo crece en una que dice la verdad.
