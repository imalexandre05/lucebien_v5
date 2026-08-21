# Aprendizajes — errores cometidos y por qué no se repiten

Cada línea de este archivo la puso un error real. **Ninguna es teoría.**

> **Para qué existe.** Un agente empieza cada sesión sin memoria. Sin este archivo, el mismo error
> se comete de nuevo cada vez, y la única defensa es que alguien se acuerde. Con él, el error se
> comete **una vez**.
>
> **Cómo se usa.** Leelo al empezar algo del área que te toca. No hace falta leerlo entero: buscá
> tu área.
>
> **Cómo se escribe.** Cuando algo salga mal —tuyo, de un test, de una revisión— sumá una fila al
> final de la tabla que corresponda. Es **append-only** y está en `merge=union`: agregá abajo,
> nunca reordenes ni reescribas lo de otro. Una fila necesita las tres columnas; sin "cómo se
> detecta", el aprendizaje no sirve la próxima vez.
>
> Si el aprendizaje se puede convertir en una comprobación automática, **convertilo** y anotá acá
> cuál. Una regla en `tools/guard-reglas.sh` o un hook valen más que un párrafo que alguien tiene
> que acordarse de leer.

---

## Base de datos y migraciones

| El error | Qué costó | Cómo se detecta ahora |
|---|---|---|
| Elegir el número de migración mirando el directorio | `feat/mi-talla-db` y `feat/sueldos-motor` reservaron los mismos `0068` y `0069`, con las cuatro **ya aplicadas en producción** | `bash tools/reservar-migracion.sh` mira todas las ramas · el guard falla si dos ramas comparten número · el hook `migracion-reservada.sh` **bloquea** escribir una migración sin reserva commiteada |
| Copiar una policy de RLS de una migración vieja | Los helpers se movieron al schema `private` en la `0037`. Copiar `app_es_admin()` sin prefijo hace fallar la migración con *"function does not exist"* | Está en la plantilla que crea el reservador |
| Usar `private.app_es_almacen()` sobre datos de personas | Devuelve `true` también para `confeccionista`, no sólo para `encargado_almacen`. Estuvo meses en producción dejando que una confeccionista leyera el sueldo, la asistencia y los votos de sus 17 compañeros | Corregido en la `0067`. Está en la plantilla del reservador y en el prompt del `implementador` |
| Crear una tabla con RLS y sólo policy de `select` | Las escrituras fallan con 42501 y los borrados quitan cero filas, **en silencio**: la pantalla dice que guardó. Le pasó a `empleado_tiendas` | Regla del guard: toda tabla con RLS necesita policy de escritura |
| Suponer que un tipo de Postgres existe | `timerange` **no existe** — Postgres trae `int4range`, `numrange`, `daterange`, `tsrange` y `tstzrange`, ninguno de `time`. La migración habría fallado al aplicarse | Se prueba el pedazo dudoso contra la base **antes** de escribir la migración entera |
| Congelar la cabecera y dejar sueltas sus partes | Con el trigger sólo sobre `sueldo_liquidaciones`, las líneas del desglose se reescribían enteras y el total quedaba intacto: el recibo decía una cosa y la suma otra | El verificador lo encontró. Ahora son cuatro guardas, y `truncate` también |
| Tratar `'anulada'` como un estado cualquiera | Dos `UPDATE` alcanzaban para romper el congelado entero: anular (permitido) y desde ahí reescribir todo, incluido volver a `'cerrada'` con otro total | Los estados terminales se comparan con `to_jsonb(new) - <campos permitidos>`, así cualquier columna futura queda protegida sola |
| Contar sólo una parte de lo que se sella | El cierre sellaba los cinco tipos de movimiento pero la comprobación anti-carrera contaba tres: un almuerzo cargado entre el cálculo y el cierre se sellaba sin estar en el pago | Se comparan los cinco. Salió de leer los números que devolvía la propia prueba, no de revisar el código |
| Verificar una migración mirando que las tablas existan | Eso comprueba que corrió, no que **funcione**. Los diez defectos del congelado habrían pasado esa revisión | Verificar es **intentar romper lo que la migración promete**, en una transacción que se descarta |
| Deduplicar en el cliente con una clave más estricta que la de la base | El colector descartaba por `evento_serial` solo, pero el índice único es `(dispositivo_id, evento_serial, marcada_en)`. Un Hikvision reinicia el contador al resetearse: ese serial repetido con fecha nueva es una marca legítima que la base habría aceptado y el colector nunca le habría mandado | La clave de deduplicación del cliente se copia del índice de la base, verificada con `pg_indexes`, no del recuerdo de cómo era |

## El motor de sueldos y la lógica de negocio

| El error | Qué costó | Cómo se detecta ahora |
|---|---|---|
| Tratar "no vino" y "nadie cargó el dato" como lo mismo | `asistencias` tenía 13 filas con la hora en NULL. Liquidar así habría cobrado **13 faltas inventadas**, a dos días de sueldo cada una | Columna `condicion` con default `sin_dato`, y la RPC **corta nombrando las fechas** que faltan declarar |
| Guardar un parámetro redondeado | `metaPorHora` cortado en `45.4545` deja la meta del periodo en 7.499,99 en vez de 7.500, y el bono de S/30 no se paga | El default trae los 16 dígitos de `1500/33`, y el control de la UI va sin `step` |
| Confiar en `Number(valor)` para leer `config` | `Number('')` es `0` y es finito. Una fila vacía en `montoMinimoComision` comisiona **todas** las boletas; en `toleranciaMinutos`, cada minuto es tardanza | Vacío cae al default; basura **corta con error** |
| Usar `Boolean(valor)` para un booleano de `config` | `Boolean('false')` es `true` | Se compara contra `'false'` explícito |
| Meter dos unidades distintas en la misma columna | `capacitacion` y `almuerzo_entregado` son **conteos**, no montos. Compartir `monto` invitaba a `sum(monto)` en vez de `sum(cantidad)`, y eso le quita a la persona el reintegro de todos los almuerzos | Columnas `monto` y `cantidad` excluyentes por tipo, con `check` |
| Agregar un estado que el motor no sabe leer | Un día contratado marcado `'licencia'` costaba **dos días de sueldo** o cortaba la liquidación | El `check` sólo admite lo que el motor representa. Una licencia es una falta justificada |
| Ajustar el número esperado de un test para que pase | El caso de prueba daba 675,30 en vez de 700,30, y la tentación era corregir el test. El desacuerdo era real: la spec se contradecía en dos lugares | Zone Guard. Primero se corrige la spec y se confirma con Alexander; después el código |

## Documentación

| El error | Qué costó | Cómo se detecta ahora |
|---|---|---|
| Verificar un documento contra otro documento | Tres fases repitieron que faltaban 9 migraciones que **estaban aplicadas**, y se escribieron avisos de "falta migrar" en pantallas que funcionaban | No-negociable 7. Se verifica contra el código o contra la base |
| Dejar un número viejo en otros documentos después de cambiar una regla | El caso de prueba pasó de S/705,30 a S/751,70 y quedaron cuatro documentos con el número viejo — en la misma sesión en la que se estaban corrigiendo copias de otra afirmación falsa | Al cambiar una cifra, se busca esa cifra en todo `docs/` antes de cerrar |
| Escribir "aplicada" antes de aplicarla | Es la misma trampa del no-negociable 7, con la migración en el lugar del documento | Aplicar es un acto: primero se aplica, después se anota **con qué se comprobó** |
| Explicar un mecanismo por la razón equivocada | Un comentario decía que los triggers bloquean al administrador *porque* son `security definer`. Es falso: un trigger `before` dispara para cualquier rol. Quien lo lea puede creer que el congelado depende de esa palabra | Si un comentario explica **por qué** funciona algo, hay que poder demostrarlo |

## Entorno de esta PC

| El error | Qué costó | Cómo se detecta ahora |
|---|---|---|
| Correr `pnpm install --force` | Borró **43 archivos rastreados** de `node_modules`, incluido `better_sqlite3.node`. En la PC donde corre el sistema viejo, eso lo deja sin arrancar | Después de cualquier install: `git status --short node_modules` y `git checkout -- node_modules/` |
| Suponer que `pnpm exec tsc` funciona | Falla con *"Command tsc not found"*: el `node_modules/` versionado le tapa a pnpm el lugar donde enlaza binarios. **El error de tipos estuvo invisible hasta que hubo un script que lo buscara** | `bash tools/verificar-local.sh` busca el binario donde pnpm lo dejó |
| Usar `@'...'@` de PowerShell dentro de una herramienta bash | El commit quedó con el asunto `@ docs(sueldos): ...` | Los mensajes largos van por `git commit -F -` con heredoc de bash |
| Escribir un JSON a mano en un hook | Una comilla doble sin escapar dentro del mensaje rompe el objeto, y el hook queda **mudo justo cuando tenía algo que decir** | Se valida la salida del hook con `JSON.parse` antes de darlo por bueno |

## Coordinación entre agentes

| El error | Qué costó | Cómo se detecta ahora |
|---|---|---|
| Ponerle un tope a una revisión sin decirlo | Una revisión devolvió 35 hallazgos y el orquestador se quedó con 9. Los 26 descartados incluían defectos reales | Si un trabajo recorta la cobertura —top-N, sin reintento, muestreo— **se dice cuánto se dejó afuera** |
| Dejar que quien implementa escriba la spec | Una spec escrita por quien va a implementarla se acomoda sola a lo que el código ya hace | El prompt del `implementador` se lo prohíbe: si falta la spec, para y lo dice |
| Creerle a otra sesión el estado de las ramas | El aviso del huellero daba por libres cuatro números de migración que estaban tomados, y por libre uno que no lo estaba. Eran correctos para lo que esa sesión veía: la otra rama no está en su copia de trabajo | `bash tools/reservar-migracion.sh` mira todas las ramas, y el hook `PreToolUse` deniega escribir una migración con número ajeno |
| El guard no ve una policy creada con `execute format` | Las cuatro tablas del huellero (0075) tienen su policy `for all` creada dentro de un `do $$ ... execute format(...)`, y el guard las reporta como "RLS activa y ninguna policy de escritura". Cuatro violaciones nuevas en verde falso rojo: el riesgo real es que alguien las dé por conocidas y deje de mirar la regla | Resuelto: `tiene_policy_escritura()` en `tools/guard-reglas.sh` acepta la forma generada (`create policy %I ... for all`). Probado en las dos direcciones: la tabla con policy dinámica pasa, y una tabla sin ninguna policy de escritura sigue cayendo |
| Un guard que castiga la documentación | La regla del `getAdminClient()` miraba archivos, no líneas: marcó como violación un comentario que explicaba **por qué no** se usaba el cliente admin. El camino corto era borrar la explicación | La regla filtra líneas de comentario. Probado que una llamada real sigue cayendo, incluso con comentario al final de la línea |
| Estimar el costo de un cambio de regla mirando sólo la línea que toca | Se escribió que invertir `meta_semanal_fija` costaba S/30 por persona por mes. Al correr el motor daba S/76,40: la meta del mes es la **suma** de las semanales, así que subir la de la semana larga sube también el umbral de la comisión y en el caso de prueba la apaga entera. La cifra equivocada ya estaba en la spec | Antes de escribir cuánto cuesta un cambio de regla, **correrlo**. Un parámetro de sueldo casi nunca toca una sola línea: hay que buscar quién más lo lee |
| Sumar lo que antes se colapsaba, sin fusionar primero | Al pasar RN-05 de `min`/`max` a suma de tramos, dos filas del mismo día que se pisan —una cargada a mano de punta a punta, otra dejada por un reporte— daban 18 horas de un día de 11. El `min`/`max` anterior daba 11 y estaba bien: la "mejora" habría pagado de más | Un test fija los dos casos opuestos: tramos que se pisan no duplican, y tramos pegados no se parten. Cualquier cambio de agregación sobre datos con más de una fuente se prueba con las fuentes pisándose |
| Dar por aplicada una migración porque el archivo está en el repo | La `0075` estaba editada en disco para emitir tramos y **sí** estaba aplicada; la `0076`, `0077` y `0078` no. Se descubrió consultando la base: `config.sueldo_pausa_minima_minutos` no existe y `sueldo_entrada` todavía colapsa con `min`/`max`, así que C-01 —las pausas no se pagan— no está vigente aunque el huellero ya escriba tramos | Antes de razonar sobre el comportamiento de producción, preguntarle a la base: `pg_get_functiondef()` para una función, un `select` sobre `config` para un parámetro. El archivo dice lo que alguien quiso, no lo que corre |
| Reabrir un tramo y quedarse sin la marca que lo cerraba | El emparejado del huellero descarta el cierre cuando llega una marca dentro de la pausa mínima, para esperar la salida de verdad. Si esa marca era la última del día, el tramo quedaba abierto y la salida volvía a `null`: 15 días abortaron contra `asistencias_trabajado_chk` y 38 jornadas completas se habrían quedado en `'sin_dato'`, cortando la liquidación del período | Migración `0079` y su prueba. La regla general que dejó: **una escritura nunca puede dejar en `null` un dato que ya estaba cargado**. Recalcular está bien; recalcular a nada, no |
| Confiar en el diagnóstico de otra sesión sin volver a la fuente | El informe decía que el `update` borraba la hora de salida **declarada por una persona**. No: en esa fila `huellero_puso_salida` es `false` y el `coalesce` la protege. Lo que se borraba era la hora que había derivado la máquina, por otro camino. El defecto era real, la explicación no, y arreglar lo que decía el informe no habría arreglado nada | Un informe de otra sesión es una pista, no un hallazgo. Se reproduce contra la base —o contra la función desplegada— antes de escribir la corrección |
| Escribir un guard desde un script y darlo por bueno porque pasa | La regla nueva de diseño usaba la secuencia de borde de palabra en su patrón. Escrita desde un script, esa secuencia se convirtió en un carácter de retroceso (0x08): el patrón no coincidía con nada, la regla pasó en verde sin mirar un solo archivo, y el guard quedó mintiendo | **Un guard nuevo se prueba en las dos direcciones antes de commitearlo**: se inyecta una violación a propósito y tiene que fallar con código 1, y al revertirla tiene que pasar. Una regla en verde no es prueba de nada: puede estar apagada |
| Usar un color semántico para decir identidad | Los chips de rol pintaban a los encargados con el verde de éxito. Verde ya quiere decir «correcto» en todo el resto del sistema, así que la pantalla afirmaba algo que nadie quiso decir: que ser encargado es un acierto | Los tokens están separados por intención: `exito`/`aviso`/`error`/`info` son estado, `cat-*` es identidad. La regla `diseno` del guard impide volver a la paleta suelta, y docs/sistema-de-diseno.md §2 explica cuál usar |
| Barrer por nombre y creer que se barrió el problema | Se unificaron 27 constantes `fieldCls` y dos tandas después el módulo nuevo tenía tres copias más del mismo estilo de campo: dos escritas en línea y una llamada `campo`. El barrido encontró lo que se llamaba así, no lo que hacía lo mismo | Después de unificar algo, buscar por lo que **hace** —el string de clases, la forma— y no por el nombre de la variable. Y convertirlo en regla del guard: la regla `campo` falla si el estilo de campo aparece fuera de `components/ui`, con la deuda existente en el baseline para que esté contada y no crezca |

---

_Empezado el 14 de agosto de 2026 con los errores de la primera semana de trabajo sobre sueldos.
Se suma una fila cada vez que algo sale mal._
