# SPEC — El tablero avanza sólo por donde el pipeline permite, y dividir un terno no pierde datos

> **Qué es.** Dos defectos del pipeline de prendas que encontró la auditoría del 23-ago-2026 y que
> un agente adversarial confirmó contra la base viva (proyecto `scilb`):
>
> - **F22 (alto).** `pipeline_avanzar` acepta *cualquier* destino. Suplantando a una colaboradora
>   de ventas se llevó una prenda de `refaccion` directo a `listo` con `aprobada = true` —saltando
>   planchado y control de calidad— y con un destino inventado la dejó en la etapa
>   `etapa_inventada_xyz`, fuera de las nueve columnas del tablero.
> - **F23 (medio).** `pipeline_dividir` crea las dos piezas hijas sin copiarles
>   `necesita_compostura`: el saco y el pantalón de un terno que sí la necesitaba salen del corte
>   sin la marca, y el operario de refacción los manda a planchado.
>
> **Por qué importa ahora.** `pipeline_avanzar` es el primer eslabón de la cadena del sueldo:
> escribe en `pipeline_puntos`, que alimenta los reportes, la evaluación sobre 20 y el pago. Un
> avance que no debería existir es un punto que no debería pagarse. El ERP está por entrar en
> producción con las once personas de LuceBien; hasta hoy nada de esto era un riesgo real porque
> nadie lo usaba.
>
> **Zona de rigor:** spec completa. Toca la cadena del sueldo (no-negociable 1) y el avance de
> prendas (no-negociable 2). Exige migración numerada, prueba de ataque, y verificador adversarial
> antes de mergear.
>
> **Spec hermana:** [`../permisos/2026-08-23-escritura-directa-y-anonimato-design.md`](../permisos/2026-08-23-escritura-directa-y-anonimato-design.md)
> — misma auditoría, mismo principio, otro conjunto de tablas. Esta spec **no** cierra la escritura
> directa sobre `prenda_pasada`; eso vive allá.

---

## 0. El principio que se rompe

El no-negociable 2 dice: *«todo avance de prenda pasa por una RPC»*. Y pasa: el tablero no hace
`update` plano, llama a `pipeline_avanzar`. Lo que falta es la otra mitad de la frase —
**la RPC tiene que saber cuáles son los avances válidos**.

Hoy el único lugar donde vive esa regla es el navegador:

```
packages/core/src/pipeline.ts:23-33   ← la constante TRANSICIONES
apps/erp-web/app/pipeline/tablero.tsx:280   ← su único consumidor
```

El tablero calcula con ella qué botones dibujar. Nadie más la mira. Ni la server action
(`apps/erp-web/app/pipeline/actions.ts:19-24`, que sólo comprueba que los dos argumentos no estén
vacíos), ni la RPC (`0009_pipeline_rpc.sql`), ni un `check` del esquema, ni la RLS.

La clave anónima de Supabase viaja dentro de cada página —es su función, el navegador la
necesita— así que cualquiera con sesión iniciada puede llamar a `pipeline_avanzar` desde la
consola del navegador con los argumentos que quiera. **Una pantalla es una sugerencia; la base es
la ley.**

---

## 1. F22 — Lo que está abierto hoy

Verificado el 23-ago-2026 contra la definición viva de la función (`pg_get_functiondef`, idéntica
a la de `0009_pipeline_rpc.sql`) y contra el esquema (`pg_constraint` sobre `prenda_pasada`: ocho
restricciones, todas claves foráneas y la primaria — **ninguna sobre `etapa`**).

Las dos consecuencias son distintas y las dos importan:

### 1.1 Saltarse etapas cobra los puntos y aprueba la prenda

`pipeline_avanzar` escribe `aprobada = true` cuando el destino es `'listo'`, sin mirar de dónde
viene la prenda:

```sql
aprobada = case when p_destino = 'listo' then true else aprobada end
```

Una prenda que va de `refaccion` a `listo` sale del taller marcada como aprobada en control de
calidad sin que nadie la haya mirado, y de paso deja una fila en `pipeline_puntos` con el peso de
`pts_refaccion`. Es a la vez un defecto de calidad (un terno sin planchar sale a la tienda) y un
defecto de la cadena del sueldo (puntos por trabajo no hecho).

### 1.2 Un destino inventado saca la prenda del tablero

`etapa` es `text` sin restricción. Una llamada con `p_destino = 'etapa_inventada_xyz'` deja la
fila en un estado que ninguna de las nueve columnas del tablero muestra: la prenda desaparece de
la vista, sigue existiendo en la tabla, y nadie la vuelve a tocar. Es una prenda perdida —
exactamente lo que el no-negociable 2 quiere evitar.

Esta segunda mitad no la causa sólo `pipeline_avanzar`. `pipeline_deshacer` (0010) y
`pipeline_calificar` (0013) también escriben `etapa = <texto que les llega>`; y `calificarPasada`
(`apps/erp-web/lib/pipeline-repo.ts:279`) tiene `destino = ''` por defecto en la firma.

---

## 2. F22 — El cambio: dos capas, las dos en la base

### 2.1 Capa 1 — La lista blanca de transiciones, dentro de `pipeline_avanzar`

`create or replace` de la función, con el cuerpo de 0009 intacto y un bloque de validación nuevo
inmediatamente después de los guardas que ya existían (`not found`, `dividida`). La tabla es la
misma que declara `packages/core/src/pipeline.ts:23-33`, transcrita a SQL:

| Desde | Destinos permitidos |
|---|---|
| `recepcion` | `lavado`, `refaccion` |
| `lavado` | `empatado` |
| `empatado` | `refaccion` |
| `vacio` | — |
| `refaccion` | `compostura`, `planchado` |
| `compostura` | `planchado` |
| `planchado` | `control_calidad` |
| `control_calidad` | `listo` |
| `listo` | — |
| `enviado`, `recibido`, `dividido` | — |

Cualquier otro par corta con excepción y la transacción entera se aborta: no se mueve la prenda,
no se escribe historial y **no se otorgan puntos**.

Mensaje de error, con prefijo para que la prueba pueda verificar por código y no sólo por «lanzó
algo»:

```
TRANSICION: no se puede pasar de "refaccion" a "listo"
```

**Por qué en la RPC y no en la server action.** Porque la server action se puede saltear: la
sesión del navegador habla con PostgREST directamente. La server action puede seguir siendo la
primera línea de defensa, pero no puede ser la única.

**Por qué se duplica la constante del core en SQL.** Ya hay precedente deliberado: `0009` replica
la regla del ½ punto (`esMediaPrenda`) en plpgsql por la misma razón —el cálculo tiene que vivir
junto a la base, donde no se puede saltear—. La duplicación se paga con el riesgo de que las dos
copias se separen; la mitiga la prueba de la migración, que ataca exactamente los pares de la
tabla de arriba. Si mañana el negocio agrega una transición, hay que tocar los dos lados: la
cabecera de la migración lo dice y apunta a `pipeline.ts:23-33`. El puntero recíproco —una
línea en `pipeline.ts` que avise que la regla también vive en la RPC— queda pendiente: ese
archivo no es de este lote (§7).

**Por qué no una tabla `pipeline_transicion` editable desde `/configuracion`.** La filosofía del
proyecto es que todo *parámetro de negocio* sea editable por el administrador, y esto no es un
parámetro: es la forma del proceso. Las nueve etapas están cableadas en el tablero (nueve
columnas), en los nombres de las claves de puntos (`pts_<etapa>`) y en el tipo `EtapaPipeline`
del core. Una tabla editable daría la ilusión de poder agregar una etapa que el resto del sistema
no sabría dibujar ni pagar. Queda anotado como pendiente si algún día el proceso cambia de verdad.

### 2.2 Capa 2 — `check` de esquema sobre `prenda_pasada.etapa`

La lista blanca arregla `pipeline_avanzar`. El `check` arregla el resto: `pipeline_deshacer`,
`pipeline_calificar`, y cualquier `update` directo que hoy la RLS deja pasar. Doce valores, que
son los nueve del pipeline más los tres estados de fuera (`EstadoPasada` del core,
`packages/core/src/pipeline.ts:58`):

```
recepcion · lavado · empatado · vacio · refaccion · compostura · planchado ·
control_calidad · listo · enviado · recibido · dividido
```

Verificado contra la base viva antes de escribirlo: las 81 filas de `prenda_pasada` usan hoy seis
valores (`refaccion` 34, `planchado` 22, `enviado` 19, `control_calidad` 3, `dividido` 2,
`listo` 1) y **todos están dentro de la lista**. No hay fila que la restricción rechace, así que
entra validada, no `not valid`.

La migración comprueba eso antes de intentar el `alter` y, si encontrara una fila fuera de la
lista, corta con un mensaje que dice qué valores sobran — en vez de fallar con un error de
Postgres que no explica nada, o peor, de reescribir datos por su cuenta.

### 2.3 Lo que no cambia

- La server action y el tablero quedan como están. El tablero ya ofrece sólo transiciones
  válidas (usa `TRANSICIONES`), así que la excepción nueva no se puede disparar desde la
  interfaz: sólo desde una llamada hecha a mano.
- `pipeline_avanzar_tanda` (0011) traga las excepciones de cada prenda y sigue con la siguiente
  (`exception when others then null`). Ese comportamiento existía antes para omitir prendas
  divididas; ahora también omite las que no pueden avanzar a ese destino. Es lo correcto para una
  tanda: se avanza lo que se puede y el total de puntos devuelto refleja sólo eso.
- `pipeline_rechazar` no se toca. El rechazo es el flujo inverso y tiene su propia semántica
  (devolver a una etapa anterior y descontarle los puntos al culpable); validarlo con la misma
  tabla lo rompería. Queda anotado como pendiente aparte.

---

## 3. F23 — Dividir un terno pierde la marca de compostura

`pipeline_dividir` (`0012_pipeline_dividir.sql:20`, verificado idéntico contra la función viva)
inserta las dos hijas con diez columnas: `codigo`, `tipo`, `color`, `talla`, `sede_origen_cod`,
`etapa`, `tipo_lavado`, `fecha_ingreso`, `lista_lavanderia_id`, `obs_general`.

Falta `necesita_compostura`, y la columna tiene `default false`.

**Qué se pierde, en concreto.** `necesita_compostura` se dibuja como una etiqueta ámbar
«compostura» en la tarjeta del tablero (`apps/erp-web/app/pipeline/tablero.tsx:651`). Es la señal
de que esa prenda tiene que pasar por compostura antes de planchado — el único destino de
`refaccion` que no es planchado directo. Al dividir un terno marcado, las dos piezas nacen sin la
etiqueta: el operario de refacción no ve nada raro y las manda a planchado. La compostura no se
hace, y el terno vuelve a la tienda con el desperfecto que había que arreglar.

**El cambio.** Agregar `necesita_compostura` a las dos listas de `insert`, copiando
`v_pr.necesita_compostura`. La marca del padre se hereda a las dos piezas: si el terno necesitaba
compostura, cada mitad entra al taller con la advertencia. Es la opción conservadora — puede
sobrar en la pieza que estaba sana, y sobrar cuesta una mirada de más; faltar cuesta una prenda
mal entregada.

---

## 4. Decisión 13 — `activo_id` **no** se copia a las hijas

`pipeline_dividir` tampoco copia `activo_id`. Esto es distinto de `necesita_compostura`: no es un
olvido que se arregla copiando la columna, es una pregunta de negocio.

**Por qué hoy es latente y mañana no.** Las 81 pasadas de la base tienen `activo_id` nulo (medido:
`count(activo_id) = 0`). Pero `registrarPasada` (`apps/erp-web/lib/pipeline-repo.ts:113-147`)
*siempre* resuelve o crea el activo antes de insertar la pasada, así que toda prenda registrada de
aquí en adelante lo lleva.

**La pregunta.** Cuando un terno se parte en saco y pantalón, ¿las dos piezas apuntan al mismo
activo de inventario? Si la respuesta fuera «sí», `pipeline_enviar` (ampliada en `0055`) liberaría
el activo —lo pasa a `disponible`— **al despachar la primera de las dos piezas**, con la otra
todavía en el taller. El inventario diría que hay un terno completo disponible para alquilar
cuando en realidad falta el pantalón. Eso es peor que el defecto que se quiere arreglar.

**La decisión conservadora, que es la que se implementa:** no copiar `activo_id`. El vínculo con
el inventario se queda en la madre, que es la que representa al terno como unidad. Consecuencia
conocida y aceptada: mientras el terno esté dividido, su activo se queda en `en_pipeline` y no
vuelve solo a `disponible` — hay que moverlo a mano cuando las dos piezas terminen.

**Por qué esa consecuencia es el modo de falla correcto.** Un terno cuyo saco está en el taller
*no debe* poder alquilarse. Que el activo quede bloqueado en `en_pipeline` es exactamente lo que
protege al negocio; el costo es un paso manual, no una prenda alquilada a medias.

**Lo que queda abierto para el dueño** (va a `docs/pendientes-negocio.md` como PEND, decisión 13):

> Cuando un terno dividido termina —sus dos piezas enviadas a tienda—, ¿quién y cuándo devuelve su
> activo de inventario a `disponible`? Tres caminos posibles, ninguno elegido:
> **(a)** manual, desde `/inventario` (es lo que pasa hoy con este cambio);
> **(b)** automático: `pipeline_enviar` libera el activo de la madre sólo cuando **ninguna** otra
> pasada del mismo activo sigue dentro del pipeline;
> **(c)** el terno deja de ser una unidad: al dividir la pasada se llama también a
> `inventario_despiece` (0055) y cada pieza queda ligada a su propio activo `A…`/`B…`, con precios
> repartidos.
> La (b) es un guarda de tres líneas y no inventa reglas; la (c) es un cambio de modelo comercial
> y decide cómo se alquila. Esta spec no elige: sin respuesta del dueño, cualquiera de las dos
> sería una regla de negocio inventada (no-negociable 5).

**Lo que tampoco se copia:** `pedido_id`. Es del módulo comercial, que está fuera de alcance desde
el 13-ago-2026.

---

## 5. Lo que esta spec NO hace

- **No cierra la escritura directa sobre `prenda_pasada`.** Las políticas `for all` de
  `0006_pipeline_rls.sql` siguen permitiendo `PATCH /rest/v1/prenda_pasada` desde el navegador.
  Después de este cambio ese `PATCH` ya no puede inventar una etapa (lo frena el `check`), pero sí
  puede seguir saltándose etapas válidas. Eso es de la spec de permisos.
- **No toca la server action ni el tablero.** El cliente ya se comporta bien; el agujero estaba
  del lado del servidor.
- **No valida `pipeline_rechazar`, `pipeline_deshacer` ni `pipeline_calificar`** más allá del
  `check` de esquema. Ver §7.
- **No cambia el reparto de puntos.** Ni los pesos, ni la regla del ½, ni quién los cobra.

---

## 6. Cómo se comprueba

`packages/db/pruebas/0086_pipeline_transiciones_dividir.prueba.sql` monta el escenario, ataca cada
promesa y termina lanzando una excepción con el resultado, para que la transacción se aborte y no
quede ni una fila. Se corre con `bash tools/probar-migracion.sh 0086` o pegándola entera en el
editor SQL de Supabase.

Cada falla se verifica **por el código del error** (`TRANSICION:`), no sólo por «lanzó algo».

| # | Ataque | Esperado |
|---|---|---|
| A | `pipeline_avanzar(refaccion → listo)` | `TRANSICION:` — sin puntos, sin historial, `aprobada` sigue en false |
| B | `pipeline_avanzar(refaccion → etapa_inventada_xyz)` | `TRANSICION:` |
| C | `pipeline_avanzar(recepcion → lavado)` | pasa; deja 1 fila en `pipeline_puntos` |
| D | `pipeline_avanzar(control_calidad → listo)` | pasa; `aprobada = true` |
| E | `pipeline_avanzar(listo → enviado)` | `TRANSICION:` — el envío es `pipeline_enviar`, no un avance |
| F | `pipeline_avanzar(<prenda>, null)` | `TRANSICION:` |
| G | `update prenda_pasada set etapa = 'etapa_inventada_xyz'` | violación del `check` (`23514`) |
| H | `pipeline_dividir` de un terno con `necesita_compostura = true` | las dos hijas la heredan |
| I | las mismas dos hijas | `activo_id` nulo (decisión 13) |
| J | reaplicar la migración entera dos veces seguidas | sin error |

Además, el camino feliz completo de una prenda —`recepcion → lavado → empatado → refaccion →
compostura → planchado → control_calidad → listo`— tiene que seguir andando entero después del
cambio; la prueba lo recorre paso a paso.

---

## 7. Pendientes que deja

| # | Qué | Dónde |
|---|---|---|
| 1 | Decisión 13: cuándo vuelve a `disponible` el activo de un terno dividido | `docs/pendientes-negocio.md` |
| 2 | `pipeline_rechazar` y `pipeline_deshacer` aceptan cualquier etapa de la lista de doce como destino, en cualquier orden. El `check` frena los inventos; el orden sigue libre | auditoría posterior |
| 3 | `calificarPasada` tiene `destino = ''` por defecto en la firma (`pipeline-repo.ts:279`); con el `check` puesto, una observación sin destino ahora falla en la base en vez de escribir `etapa = ''`. Convendría un default explícito del lado del repo | `apps/erp-web/lib/pipeline-repo.ts` |
| 4 | `packages/core/src/pipeline.ts` no avisa que `TRANSICIONES` está replicada en `pipeline_avanzar`. Una línea de comentario, que este lote no puede escribir | `packages/core/src/pipeline.ts` |
| 5 | `packages/core/src/puntos.ts` es código muerto cuyo `puntosDeEtapa` contradice la regla vigente (`puntosAvance`, `pipeline.ts:51`): divide por dos cualquier pieza, sin la lista blanca de tipos de `esMediaPrenda` (`pipeline.ts:44`) y sin redondear. Esta spec le deja una cabecera que lo aclara; borrarlo exige tocar `index.ts` y su test | `packages/core/src/puntos.ts` |
