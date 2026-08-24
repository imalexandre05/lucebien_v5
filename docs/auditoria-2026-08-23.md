# Auditoría del 23-ago-2026 — poner el sistema en condiciones de que lo use gente

> **Qué fue.** Una revisión de punta a punta del ERP antes de ponerlo en manos de las once personas
> de LuceBien: recorrer cada módulo como lo recorrería un colaborador y como lo recorrería el
> administrador, encontrar lo que está roto, y arreglarlo.
>
> **Por qué ahora.** El sistema estaba desplegado y nadie lo usaba todavía. Ese es el único momento
> en que se puede romper cosas sin que le cueste a nadie: la base tenía 0 liquidaciones y 0 pagos,
> o sea que **la cadena del sueldo nunca se había corrido entera contra datos reales**.

---

## 1. Cómo se hizo

Tres capas, cada una comprobando a la anterior:

| Capa | Qué hace | Cuántos |
|---|---|---|
| **Cartografía** | Un agente por módulo: recorre el código, dibuja los flujos reales con archivo y línea, y escribe casuísticas de LuceBien («Nicol llega tarde tres veces y la cuarta…») | 9 |
| **Refutación** | Otro agente por módulo, con una sola instrucción: *tumbar* los hallazgos del anterior. En caso de duda, refutado | 9 |
| **Corrección** | Un agente por lote de archivos disjuntos, con su spec cuando la zona lo exige | 13 |
| **Verificación** | Un agente adversarial por ola, que revisa el diff real y busca qué se rompió | 3 |

Más el arnés que no existía: pruebas de punta a punta con dos sesiones —administrador y
colaborador— que abren las 57 pantallas del menú, y una prueba que corre la cadena del sueldo
completa contra la base y borra todo al terminar.

**Los números.** 125 hallazgos de la cartografía → 58 críticos y altos pasaron por refutación → 2
refutados, 22 bajados de severidad, 34 confirmados → 22 lotes de corrección.

## 2. Lo que estaba roto y ya no

Ordenado por lo que le costaba a una persona real.

### Le pagaba de menos, en silencio

**El día a medio declarar.** Desde que el huellero escribe una fila por tramo, un día podía llegar
con la mañana emparejada y la tarde sin cerrar. La función que arma la liquidación descartaba la
fila incompleta *antes* de agrupar por día: el día llegaba al motor con cuatro horas en vez de once,
y ninguna pantalla lo decía. Era el único camino de todo el sistema que pagaba de menos sin avisar
—todos los demás cortan y nombran lo que falta. Ahora corta y nombra la fecha. *(migración 0085)*

### Dejaba a cualquiera tocar lo que decide un sueldo

**El puntaje del turno.** Las cuatro tablas de reportes tenían una sola regla, «para todo», con la
misma condición para leer y para escribir. Como todas las personas tienen las cuatro sedes,
cualquiera podía abrir la consola del navegador y ponerse 100, o borrar reportes. Se reprodujo: 18
actualizados y 6 borrados. Ese puntaje alimenta la nota mensual, y la nota decide el pago. Apareció
además un permiso de `TRUNCATE` —vaciar la tabla entera, y las reglas de fila no le aplican— para
cualquier sesión. *(migración 0081)*

**Las solicitudes al almacén.** Toda la autoridad de quién aprueba y quién entrega vivía en las
RPC; un `update` plano dejaba una solicitud en «confirmada» sin pasar por ninguna. *(0087)*

**El pipeline.** Cualquiera podía llevar una prenda de refacción a «listo» saltando planchado y
control de calidad, o dejarla en una etapa inventada, fuera de las nueve columnas del tablero.
*(0086)*

### Mostraba lo que no debía

**Valores 360° no era anónimo en la base.** La política dejaba leer la fila completa a la persona
evaluada, y la fila trae quién la evaluó. El anonimato lo sostenía únicamente que la aplicación no
pidiera esa columna: cualquiera con su sesión podía pedirla. En un equipo de once, saber quién te
puntuó identifica a la persona sin margen. *(0082)*

**Una tabla de respaldo con asistencias reales** estaba expuesta sin ninguna protección: se leyeron
sus filas **sin sesión**, con fecha, turno y horas de cinco personas. *(0082)*

**La nota mensual** colgaba de un helper que devuelve verdadero también para el rol de
confeccionista. Hoy no hay nadie con ese rol; el día que se contrate a alguien para el pipeline,
habría visto la nota de las once. *(0082)*

### Prometía cosas que no cumplía

**Suspender a alguien no cerraba ninguna puerta.** El botón escribía dos columnas y nadie las
miraba: ni el login, ni la sesión, ni el middleware, ni los tres helpers de permisos. Quien era
despedido entraba esa misma tarde, enviaba reportes que sumaban puntos y consultaba su liquidación.
El diálogo, mientras tanto, prometía que «deja de poder entrar al sistema». Ahora hay tres
cerraduras y ninguna depende de las otras. *(0083 + aplicación)*

**El auto-cierre de reportes estaba «apagado»** y seguía respondiendo: la clave anónima que viaja
en cada página alcanzaba para invocarlo. Cualquiera podía crear reportes de turno que nadie levantó
y dejar a una encargada sin poder registrar el suyo. *(Edge Function desactivada)*

**El reporte del turno nacía con todo marcado como hecho.** Enviar sin tocar nada declaraba el
catálogo entero como cumplido. Los once borradores de la base tienen el 100 % de sus actividades en
«realizada». *(pendiente de que Alexander confirme el nuevo default)*

### Estorbaba el trabajo

`/asistencias` no tenía control de acceso y le mostraba a un colaborador una pantalla de
administración con todos los contadores en cero, sin explicación. La lista de tablas auditadas
estaba en cinco cuando la base ya escribe ocho: elegir «Pedidos» devolvía vacío con el rastro
entero guardado. El pie de todas las pantallas decía «Fase 1 · demo». La comisión del contrato se
rotulaba como porcentaje y se guardaba como fracción, sin mínimo ni máximo: una pulsación de flecha
sobre el campo vacío deja 50 % de comisión, un sobrepago perfectamente creíble.

## 3. Lo que el ciclo atrapó, y que sin él habría entrado

Vale la pena dejarlo escrito, porque es el argumento de por qué el proceso cuesta lo que cuesta.

- **Un arreglo peor que el defecto.** La primera versión de la corrección de reportes forzaba el
  turno «día completo» en la asistencia derivada. Pero el huellero rescata esa fila buscándola *por
  turno*, y sólo usa mañana y tarde: con «completo» no se rescataba nunca, y —por el arreglo del día
  mixto aplicado horas antes— el día habría bloqueado el periodo entero. El verificador lo frenó
  antes de aplicar nada.
- **Una afirmación falsa a punto de quedar escrita.** El informe de ese mismo lote decía que el
  cambio reducía «de once personas a los dos administradores» quiénes pueden tocar un puntaje. No es
  cierto: evaluar sigue abierto a las once. Lo que se ganó es atribución, no exclusividad. Creerlo
  habría dado por cerrado un agujero que sigue abierto.
- **Dos hallazgos refutados** y veintidós bajados de severidad: sin la capa de refutación, veinticuatro
  cambios se habrían hecho sobre código que funcionaba.

## 4. Lo que queda abierto

Las decisiones que el sistema no podía tomar solo están en
[docs/pendientes-negocio.md](pendientes-negocio.md). **Actualización del 24-ago:** Alexander
contestó las dos más caras de esta lista al día siguiente —«todo el equipo del turno recibe los
puntos, no sólo el encargado» y «el acceso a las cuatro sedes es intencional, es cómo rota el
equipo»— y quedaron migradas o cerradas sin código, según correspondía. El detalle vive en
`pendientes-negocio.md` §«Preguntas contestadas el 24-ago-2026».

Esa misma conversación abrió una pregunta más grande de lo que parecía: cómo se paga un contrato
que dura varios meses. Sigue en diseño — ver `pendientes-negocio.md` §«Contratos de varios meses».

Y una deuda técnica que no alcanzó esta tanda: `prenda_pasada` sigue con escritura directa abierta,
como estaban reportes y solicitudes antes de esta auditoría. El CHECK de etapa que agregó la 0086 le
pone un techo, pero la puerta sigue ahí.

## 5. Cómo comprobar que sigue sano

```bash
bash tools/verificar-local.sh          # guard + typecheck + 393 tests. Es lo que corre CI
bash tools/probar-migracion.sh         # las pruebas de ataque de cada migración
E2E_ADMIN_PASSWORD=… E2E_COLAB_PASSWORD=… \
  bash tools/probar-cadena-sueldo.sh   # la cadena del sueldo contra la base, sin dejar rastro

cd apps/erp-web
E2E_URL=http://localhost:3005 npx playwright test --project=admin        # las 57 pantallas
E2E_URL=http://localhost:3005 npx playwright test --project=colaborador  # el no-negociable 3
```

---

## 6. Segunda ola — cerrada el 24-ago-2026

Diez lotes más, con el mismo ciclo. El verificador dio **listo con reparos**, y su único hallazgo
fue del tipo que este repositorio ya pagó caro: un comentario afirmaba «trece triggers de
auditoría» y la base tiene catorce. Corregido contra `pg_trigger`, no contra el documento.

### Lo que entró

**El dinero.** Los puntos del pipeline estaban corridos cinco horas: se comparaba una columna con
hora contra una fecha pelada, y el último día del período se perdía casi entero — donde había
70,50 puntos, la pantalla mostraba 38,50. El indicador de días sin declarar pasó a medir con el
mismo criterio que el motor (el calendario del contrato, no las filas que existen), así que dejó de
pintarse verde justo antes de que Calcular cortara.

**La nota mensual.** `calcularNotaMensual` tenía dos maneras de estar mal sin avisar: `(c[key] ||
0)` convertía un dato roto en un cero indistinguible de un cero merecido, y nadie comprobaba que los
siete pesos sumaran 100 %. Ahora corta nombrando qué está roto, y la desviación de los pesos se ve
en pantalla. La decisión de qué hacer con esa desviación quedó contestada: avisar ahora, bloquear
cuando se rehaga la pantalla de pesos (spec de evaluaciones §6).

**El trabajo humano.** Una corrección de hora hecha a mano se deshacía sola en el siguiente lote del
colector, porque nadie bajaba las banderas que marcan que esa hora la puso la máquina. Y el colector
descartaba en silencio las derivaciones que fallaban: el log decía «insertadas 48» aunque ninguna
hubiera llegado a una asistencia.

**Los permisos.** La matriz de `/configuración` borraba en silencio las filas de los módulos que la
pantalla no muestra: un solo Guardar se llevaba 18, entre ellas la de solicitudes, que deja a los
diez no-administradores sin esa pantalla.

**El rastro.** La configuración no dejaba ninguno, pese a que la migración que la tipó se llama
`config_tipado_auditoria`: quién movió un parámetro de sueldo era una pregunta con tres respuestas
posibles y ninguna evidencia. Y el filtro de la pantalla de auditoría subió al servidor — antes se
traían 200 filas y se filtraba sobre esas, así que elegir «Pedidos» devolvía vacío con 138
movimientos guardados.

**Lo que se hacía y no se podía deshacer.** Dar de baja un activo lo borraba físicamente; ahora
queda en estado `baja`, que ya existía sin usarse. Suspender a una persona la sacaba de todas las
listas, incluida la única desde donde se la puede reactivar o terminar de pagarle.

### Migraciones aplicadas y verificadas

`0084` (el huellero respeta el dato humano, 8/8), `0088` (auditoría de configuración, 9/9) y `0089`
(pts_recepcion, el único peso del pipeline que vivía como default silencioso dentro de una RPC).
Las dos primeras con su prueba de ataque corrida contra la base real, en verde y sin dejar una fila.

### Un hallazgo verificado y descartado

El agente que aplicó las migraciones reportó que varias funciones `security definer` del esquema
`private` tienen `execute` concedido a `anon` — el mismo patrón que motivó la migración 0090.
Hizo bien en reportarlo y no tocarlo.

**Comprobado: no hay puerta detrás.** PostgREST sólo expone el esquema `public`. Un `POST` a
`/rest/v1/rpc/app_es_admin`, `/app_es_colector_huellero` y `/audit_log_trigger` con la clave anónima
devuelve `404 PGRST202 — Searched for the function public.<nombre>`: ni siquiera busca en `private`.
Además, catorce de esas funciones devuelven `trigger`, un tipo que PostgREST no expone como ruta
invocable en ningún caso.

Revocar el privilegio sería higiene sin efecto. Queda anotado en vez de escrito: si algún día
alguien agrega `private` a los esquemas expuestos en la configuración de la API, esto pasa a
importar — y en ese momento habrá cosas peores expuestas que estas funciones.
