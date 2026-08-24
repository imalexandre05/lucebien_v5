# SPEC — Reportes: cerrar la escritura directa, el turno C duplicado y la asistencia derivada

> **Qué es.** Tres agujeros del módulo Reportes que encontró la auditoría del 23-ago-2026 y que un
> agente verificador reprodujo uno por uno contra la base viva. Los tres terminan en el mismo
> lugar: el puntaje del reporte, que es el primer eslabón de la cadena del sueldo
> (`puntos → reportes → evaluación /20 → pago`).
>
> **Zona de rigor:** spec completa. Toca permisos, aislamiento y la cadena del sueldo — tres de
> los siete no-negociables. Exige migración numerada, prueba de ataque y verificador adversarial
> antes de mergear.
>
> **Hermana mayor:** [2026-08-23-escritura-directa-y-anonimato-design.md](2026-08-23-escritura-directa-y-anonimato-design.md)
> es la spec paraguas de los cinco agujeros de escritura directa; su §1 A-1 es el hallazgo F50 que
> esta spec resuelve. Aquélla enuncia el principio; ésta escribe el diseño del caso reportes y no
> la modifica.
>
> **Estado:** escrita el 23-ago-2026 a partir de los hallazgos F50, F51, F55, F49 y F56.
> Implementación en `packages/db/migrations/0081_reportes_escritura_directa.sql` y su prueba.

---

## 0. El principio

El no-negociable 3 dice que toda lectura de datos de personas pasa por RLS. La mitad que falta
importa igual: **toda escritura tiene que pasar por una regla, y la regla no puede vivir sólo en
la pantalla.** La clave anónima de Supabase viaja dentro de cada página —es su función, el
navegador la necesita—, así que cualquiera con sesión iniciada puede hablarle a PostgREST desde la
consola del navegador. Hasta hoy eso no era un riesgo real porque nadie usa el ERP. A partir de que
se use, sí lo es.

---

## 1. Lo que pasa hoy

### F50 — Cualquiera se pone 100 en su propio reporte (crítico)

Verificado contra `pg_policies` el 23-ago-2026: las cuatro tablas del módulo tienen una sola
política, `FOR ALL`, con la **misma** expresión en `USING` y en `WITH CHECK`.

| Tabla | Política | Comando | Condición (idéntica en USING y WITH CHECK) |
|---|---|---|---|
| `reportes` | `rep_rw` | ALL | `app_es_admin() OR app_es_almacen() OR sede_cod IN app_sedes()` |
| `reporte_actividades` | `rep_act_rw` | ALL | lo mismo, por la sede del reporte padre |
| `reporte_trabajadores` | `rep_trab_rw` | ALL | ídem |
| `reporte_extras` | `rep_extras_rw` | ALL | ídem |

Como las once personas tienen AL, LB y ST en `empleado_tiendas`, la condición es verdadera para
todas ellas en casi todos los reportes. **Reproducido en vivo** suplantando a Nicol
(`ventas_junior`, sin ninguna autoridad): un `PATCH` directo a PostgREST actualizó **18 reportes**
a `puntaje=100`, `puntaje_eval=100`, `evaluado=true`, y un `DELETE` borró **6**. Ninguna RPC lo
miró.

Además, las cuatro tablas tienen privilegios de `INSERT`, `UPDATE`, `DELETE` y `TRUNCATE`
concedidos a `anon` **y** a `authenticated`. `TRUNCATE` merece renglón propio: **la RLS no se
aplica a `TRUNCATE`**. Basta el privilegio para vaciar la tabla entera, y las políticas de fila no
intervienen. Con las cuatro tablas así, cualquier sesión iniciada podía borrar el historial
completo de reportes de la empresa.

### F51 — El auto-cierre monta un turno C sobre el trabajo de la gente (alto)

`reportes_auto_cierre` comprueba la ocupación del horario mirando **sólo el mismo turno**:

```sql
if exists (select 1 from reportes where sede_cod = v_sede and fecha = v_hoy and turno = v_turno)
  then continue; end if;
```

`reportes_crear`, en cambio, sí aplica exclusividad cruzada (0053): C bloquea contra M y T, y M o T
bloquean contra C. La consecuencia está en producción: **5 días** con un reporte C automático
montado encima de reportes que enviaron personas, los cinco con `puntaje=100` —
`28-06-26_C-LB`, `29-06-26_C-LB`, `06-08-26_C-LB`, `06-08-26_C-ST`, `06-08-26_C-AL`.

### F55 — La asistencia derivada del reporte duplica el día (medio)

`reportes_marcar_asistencia` inserta con **el turno del reporte** (`M`, `T` o `C`) y sin condición,
o sea que el día queda en `sin_dato`. La declaración manual (`declararDia`,
`asistencias-repo.ts:252`) usa `TURNO_DIA_COMPLETO = 'C'`. Cuando el reporte fue de mañana, el día
termina con dos filas: la `M` en `sin_dato` que dejó el reporte, y la `C` que escribe el
administrador al declarar. Medido hoy: 4 filas con `fuente='reporte'` y turno `M` o `T`.

El motor de sueldos exige que el día contratado esté declarado. Una fila fantasma en `sin_dato`
para el mismo día lo corta igual —y con el arreglo del lote L09
(`having bool_and(condicion <> 'sin_dato')`) lo va a cortar siempre.

### F49 y F56 — El auto-cierre puede volver a encenderse solo (crítico / medio)

`CLAUDE.md`, sección «No tocar», dice que el cron de auto-cierre está desprogramado **a propósito**
y no se reactiva hasta que exista el sistema de horarios. La base viva le da la razón: `cron.job`
sólo tiene `generar-alertas-am` y `generar-alertas-pm`. Pero el repositorio dice lo contrario: una
aplicación limpia de las migraciones deja **tres** jobs encendidos —`reportes-auto-cierre`
(0052:300) y `reportes-auto-cierre-M` / `-TC`, que la 0052 había desagendado y la 0064:93-101
volvió a agendar.

La otra mitad de F49 —la Edge Function `auto-cierre-reportes`, `ACTIVE` con `verify_jwt=true`, que
la clave anónima del bundle atraviesa (POST real: HTTP 200)— **no es parte de esta migración**: se
da de baja desde la consola de Supabase. Ver §6.

---

## 2. Lo que eso significa un lunes cualquiera

Alguien de ventas abre la consola del navegador —no hace falta más que eso— y se pone 100 en sus
propios reportes del mes. Nadie lo ve: el puntaje que muestra la pantalla es el mismo campo que
acaba de escribir. Ese puntaje entra a la nota mensual sobre 20, y la nota decide cuánto se le
paga. La persona a la que le sacan la diferencia es otra persona real de las once.

La variante del turno C es peor, porque no la hace nadie a propósito: la encargada manda su reporte
de la mañana, el auto-cierre monta un C con 100 encima, y el crédito del turno se lo lleva un
reporte que nadie escribió.

---

## 3. El diseño

### 3.1 — F50: lectura para todos, escritura sólo por RPC

**La regla nueva, en una línea:** sobre las cuatro tablas, `authenticated` conserva la lectura por
sede que ya tenía; **toda escritura entra por una RPC**, y las dos RPC que dejarían de poder
escribir pasan a `SECURITY DEFINER` con su guard adentro.

Políticas que quedan (las cuatro tablas, mismo patrón):

| Política | Comando | Condición |
|---|---|---|
| `rep_select` (y `rep_act_select`, `rep_trab_select`, `rep_extras_select`) | SELECT | la de hoy: `app_es_admin()` o `app_es_almacen()` o la sede propia |
| `rep_admin_update` (y sus tres hermanas) | UPDATE | `private.app_es_admin()` |
| `rep_admin_delete` (y sus tres hermanas) | DELETE | `private.app_es_admin()` |
| — | INSERT | **ninguna**: sólo las RPC `definer` insertan |

Los cuatro `*_rw` `FOR ALL` se borran.

**Por qué UPDATE y DELETE conservan una puerta de administrador** en vez de cerrarse del todo:
`reportes_anular` y `reportes_anular_eval` (0037) son `security invoker` y ya exigen
`private.app_es_admin()` por dentro. Dejarles abierta exactamente la condición que ellas exigen las
mantiene funcionando sin convertirlas, y no afloja nada respecto de lo que esas RPC ya declaran.

> **Lo que este cambio NO consigue, y conviene no creer que sí.** Una primera versión de esta spec
> decía que «el universo de quien puede escribir un puntaje pasa de once personas a los dos
> administradores». Es falso, y un verificador adversarial lo frenó antes de aplicar nada.
>
> `reportes_evaluar` sigue siendo llamable por cualquier persona con sesión: sus únicos filtros son
> que el reporte sea de una de sus sedes —y las once tienen las cuatro— y no haber trabajado ese
> turno. Con eso, cualquiera de las nueve personas de ventas puede calificar todas las actividades
> con la nota máxima y dejar el reporte en 100, y puede volver a evaluarlo cuantas veces quiera.
>
> Lo que esta migración sí gana es real y vale la pena: se cierra el `UPDATE`/`DELETE` anónimo por
> PostgREST, y toda evaluación queda con su `evaluador_id` puesto. Pero eso es **atribución**, no
> exclusividad.
>
> **Decisión pendiente del dueño:** ¿quién evalúa un turno? Si la respuesta es «sólo el
> administrador», el cambio es agregarle a `reportes_evaluar` el mismo `private.app_es_admin()` que
> ya exigen las dos de anular — con su spec y su prueba. Si la respuesta es «cualquiera que no haya
> estado en ese turno», entonces falta lo otro: que un reporte ya evaluado no se pueda volver a
> evaluar sin anular primero la evaluación anterior.

Caminos de escritura, después del cambio:

| Camino | Quién lo usa | Cómo escribe |
|---|---|---|
| `reportes_crear` | cualquier colaborador de la sede | `definer` + guard de sede |
| `reportes_evaluar` | quien no trabajó ese turno | `definer` + guard de sede + guard de evaluador externo |
| `reportes_auto_cierre` | `service_role` (hoy desagendado) | ya era `definer` |
| `reportes_auto_evaluar_vencidos` | `service_role` | ya era `definer` |
| `reportes_anular` y `reportes_anular_eval` | administrador | `invoker` + política de administrador |
| `reportes_marcar_asistencia` | la aplicación, tras crear el reporte | ya era `definer` (escribe `asistencias`) |

**La trampa de convertir a `definer`, y cómo se evita.** Hoy `reportes_crear` y `reportes_evaluar`
no comprueban la sede: no les hace falta, porque corren como el llamante y la RLS los frena. Al
pasar a `definer` corren como `postgres`, dueño de las tablas y sin `FORCE ROW LEVEL SECURITY`
(verificado contra `pg_class`: `relforcerowsecurity = false`), así que **la RLS deja de aplicarles**
y con ella desaparecería el único control de sede que existía. Convertirlas sin más habría cambiado
un agujero por otro peor: crear o evaluar reportes de una sede ajena. Por eso las dos llevan,
adentro y como primer paso, el guard que la política les daba:

```sql
if not (private.app_es_admin() or private.app_es_almacen()
        or p_sede in (select private.app_sedes())) then
  raise exception 'PERMISO: no perteneces a la sede %', p_sede;
end if;
```

`reportes_evaluar` hace lo mismo con la sede leída del reporte, y conserva intacta su regla de que
el evaluador no puede haber estado en el turno.

**El `search_path`.** Es el otro error clásico de esta conversión: una función `definer` sin
`search_path` fijo ejecuta lo que el llamante le ponga delante. Las dos ya traen
`set search_path = public`; se les agrega `pg_temp` **al final**
(`set search_path = public, pg_temp`), que es la receta documentada para que ningún objeto temporal
del llamante pueda suplantar a uno de `public`. Los helpers de RLS se siguen llamando con el
prefijo `private.` explícito, que es lo que ese schema exige desde la 0037.

**Privilegios de tabla.** Las políticas no alcanzan solas:

- `anon`: se le revocan `INSERT`, `UPDATE`, `DELETE` y `TRUNCATE` en las cuatro tablas. Conserva
  `SELECT`, que la RLS le niega igual por no tener sesión.
- `authenticated`: se le revocan `INSERT` —ya no hay política que lo permita, y un privilegio sin
  política es un estado confuso que invita a «arreglarlo» agregando la política— y **`TRUNCATE`**,
  que es el único privilegio que la RLS no puede frenar. Conserva `UPDATE` y `DELETE`, ahora
  gobernados por las políticas de administrador.

### 3.2 — F51: la misma exclusividad que ya usa `reportes_crear`

`create or replace` de `reportes_auto_cierre`, idéntica a la 0053 salvo el `if exists` de la
ocupación, que pasa a usar la lista de bloqueo cruzada:

```sql
if exists (
  select 1 from reportes
  where sede_cod = v_sede and fecha = v_hoy
    and turno = any(case when v_turno = 'C' then array['C','M','T'] else array[v_turno,'C'] end)
    and not coalesce(no_evaluable, false)
) then continue; end if;
```

Dos detalles que hacen falta para leerlo bien:

- La lista incluye al **propio turno**, así que no se pierde el chequeo que había.
- Se agrega `and not coalesce(no_evaluable, false)`, que la condición vieja no tenía, por el mismo
  motivo por el que lo tiene `reportes_crear`: un reporte `no_evaluable` es el sello vacío que el
  propio auto-cierre deja cuando nadie reportó, y no cubre ningún horario. Como consecuencia, un
  sello vacío del mismo turno ya no frena en este `if`; lo frena el `if exists (… where id = v_id)`
  de la línea siguiente, porque el identificador es determinista
  (`DD-MM-YY_TURNO-SEDE`). No hay camino a un identificador duplicado.

### 3.3 — F55: una sola fila por día, con el turno que usa la declaración

`create or replace` de `reportes_marcar_asistencia` con dos cambios:

1. Escribe **siempre `turno = 'C'`**, el mismo que usa `declararDia`. Así la declaración manual
   completa la fila que dejó el reporte en vez de agregar una segunda.
2. Sólo inserta **si esa persona no tiene ninguna fila ese día**. El `on conflict do nothing` que
   ya existía cubre nada más la colisión exacta de `(empleado_id, fecha, turno)`; no alcanza,
   porque el huellero escribe una fila por tramo con turno `M` o `T` (0079) y hoy son 1.105 de las
   1.118 filas. Sin este guard, cambiar a `'C'` habría **agregado** una fila a cada día que el
   huellero ya cubre: el arreglo habría producido más duplicados que el defecto. El `on conflict`
   se conserva de todos modos como cinturón ante concurrencia.

**Lo que deliberadamente NO cambia:** la fila sigue naciendo en `condicion = 'sin_dato'`. Ponerle
`'trabajado'` es la decisión 12 del dueño y, sin horas, haría que el motor tratara el día como una
jornada de cero horas — un pago de menos silencioso, que es justo lo que esta ola viene a cerrar.
Queda anotado como pendiente de negocio.

### 3.4 — F49 y F56: desagendar lo que la 0064 vuelve a agendar

La migración cierra desagendando los **tres** nombres de job que una aplicación limpia del
repositorio dejaría puestos —`reportes-auto-cierre` (0052:300), `reportes-auto-cierre-M` y
`reportes-auto-cierre-TC` (0064:93-101)—, cada uno envuelto en el mismo
`do $$ … exception when others then null; end $$` que ya usa la 0052:297-299, porque
`cron.unschedule` de un job inexistente lanza excepción y hoy no existe ninguno de los tres.

Se desagenda desde la 0081 y **no** se edita la 0064: una migración ya aplicada no se reescribe, y
el orden de aplicación (0064 antes que 0081) hace que una reconstrucción limpia termine igual, con
los tres apagados. Queda en el repositorio la incomodidad de que la 0064 agenda algo que la 0081
desagenda tres archivos después; el comentario de la 0081 lo dice con todas las letras para que
nadie lo lea como un descuido.

---

## 4. Lo que esta spec NO cambia

- **No** toca el motor de sueldos, ni la fórmula de la nota, ni `packages/core/`.
- **No** cambia quién puede hacer qué desde la interfaz: lo que la pantalla permitía sigue
  permitido y lo que negaba sigue negado. Lo único nuevo es que ahora la base también lo niega.
- **No** toca `reporte_drafts` ni su política `drafts_rw` (`FOR ALL` por sede), que
  `reportes-repo.ts:480-511` escribe con un `upsert` directo. Es un borrador por sede, sin puntaje,
  que se borra al enviar el turno, y su único consumidor de riesgo es el auto-cierre, que está
  apagado. Cerrarlo exigiría una RPC nueva para un camino que hoy no le paga a nadie: queda
  anotado, no arreglado.
- **No** resuelve que las once personas tengan las cuatro sedes (§4 de la spec paraguas): eso es un
  dato y la decisión es del dueño. Este diseño no depende de ello — con sedes compartidas o sin
  ellas, ahora nadie que no sea administrador puede escribir un puntaje.
- **No** da de baja la Edge Function: es una acción de consola, no de base.

---

## 5. Cómo se comprueba

`packages/db/pruebas/0081_reportes_escritura_directa.prueba.sql`, con el molde de la prueba de la
0080: monta el escenario, ataca cada promesa, y termina lanzando una excepción con el resultado
para que la transacción se aborte y no quede ni una fila.

Ataques que tiene que resistir (suplantando a un empleado **sin** rol administrador, con
`set_config('request.jwt.claims', …)` y `set local role authenticated` — sin las dos cosas la
prueba no comprueba nada):

| # | Ataque | Resultado esperado |
|---|---|---|
| A | `update reportes set puntaje=100, evaluado=true` | 0 filas tocadas |
| B | `delete from reportes` | 0 filas |
| C | `update reporte_actividades set calificacion=1` | 0 filas |
| D | `delete` sobre las tres tablas hijas | 0 filas |
| E | `insert into reportes` a mano | error de RLS o de privilegio |
| F | `select` de los reportes de su sede | los sigue viendo |
| G | `reportes_crear` en su sede | funciona |
| H | `reportes_crear` en una sede ajena | `PERMISO:` |
| I | `reportes_evaluar` de un turno en el que estuvo | error de evaluador |
| J | `reportes_evaluar` de un turno ajeno de su sede | funciona y escribe el puntaje |
| K | `reportes_evaluar` de un reporte de sede ajena | `PERMISO:` |
| L | administrador: `update` y `delete` directos | siguen funcionando |
| M | `reportes_auto_cierre` no pisa un turno M o T con un C | el C no se crea |
| N | `reportes_marcar_asistencia` escribe turno `'C'` | una sola fila |
| O | `reportes_marcar_asistencia` sobre un día que ya tiene fila del huellero | no agrega ninguna |

Y, fuera de la prueba, contra la base después de aplicar:
`select jobname from cron.job;` tiene que devolver sólo `generar-alertas-am` y `generar-alertas-pm`.

---

## 6. Lo que queda para el dueño, y lo que queda para otra mano

1. **Los 5 reportes C espurios** (`28-06-26_C-LB`, `29-06-26_C-LB`, `06-08-26_C-LB`,
   `06-08-26_C-ST`, `06-08-26_C-AL`) siguen en la base con `puntaje=100`. La migración impide que
   se creen más; **no los borra**, porque borrar datos de producción no es trabajo de una
   migración. Hay que anularlos con `reportes_anular` antes de cerrar cualquier mes de junio o de
   agosto.
2. **La Edge Function `auto-cierre-reportes`** se da de baja desde la consola de Supabase. Mientras
   viva, el auto-cierre se puede disparar por HTTP con la clave anónima aunque el cron esté
   apagado.
3. **Decisión 12** — ¿la asistencia derivada de un reporte debería nacer en `trabajado` en vez de
   `sin_dato`? Hoy no, porque sin horas el motor pagaría un día de cero horas. La respuesta
   necesita antes el sistema de horarios.
4. **`reporte_drafts`** queda con escritura directa por sede (§4). Si el auto-cierre alguna vez se
   reactiva, el borrador pasa a ser insumo de puntaje y ese camino hay que cerrarlo primero.
