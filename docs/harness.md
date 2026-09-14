# El harness: cómo trabajar en varias secciones a la vez

Qué existe para que el trabajo salga bien sin que nadie se acuerde de todo, y **el protocolo para
que dos secciones avancen en paralelo sin pisarse.**

> Armado el 14-ago-2026. Antes de esto el repo tenía CI, guard y specs, y eso alcanzaba para
> trabajar **de a una cosa por vez**. No alcanzaba para paralelo: el mismo día que se instaló el
> guard de números de migración, encontró que dos ramas habían reservado los mismos `0068` y
> `0069`, con las cuatro migraciones ya aplicadas en producción.

---

## 1. Las cuatro redes, de más barata a más cara

| Red | Cuándo salta | Qué cuesta |
|---|---|---|
| **Hook `migracion-reservada.sh`** | Al intentar escribir una migración sin reserva | Instantáneo. **Bloquea**, no avisa |
| **`tools/guard-reglas.sh`** | Antes de commitear y en CI | Segundos |
| **`tools/verificar-local.sh`** | Antes de commitear | ~1 minuto |
| **`tools/probar-migracion.sh`** | Después de aplicar una migración | Segundos, contra la base |
| **`pnpm --filter erp-web test:e2e`** | Después de desplegar | Un minuto, con la aplicación levantada |
| **CI** (GitHub Actions) | En cada push y cada PR | Minutos, y ya commiteaste |
| **Subagente `verificador`** | Antes de mergear algo de zona crítica | Caro, pero encuentra lo que ninguna máquina puede |

La regla: **cuanto antes salte, más barato sale.** Un error de tipos encontrado en local cuesta
treinta segundos; el mismo error encontrado en CI cuesta un push, una espera y un commit de
arreglo.

### `tools/verificar-local.sh`

```bash
bash tools/verificar-local.sh            # guard + typecheck + tests
bash tools/verificar-local.sh --rapido   # saltea el typecheck
```

Corre exactamente lo que corre CI. Existe porque `pnpm --filter erp-web exec tsc` **no funciona en
esta máquina**: el `node_modules/` de la raíz está versionado en git —1084 archivos, las
dependencias del Express viejo, commiteadas antes de que existiera el `.gitignore`— y le tapa a
pnpm el lugar donde enlaza binarios. CI no lo sufre porque hace `rm -rf node_modules` antes de
instalar; en local no se puede hacer eso, porque ese directorio es el que usa el sistema que la
gente usa hoy.

Si dice que no encuentra `typescript` o `vitest`: `pnpm install --force`.

> ### ⚠️ `pnpm install --force` borra archivos del sistema viejo
>
> Comprobado el 14-ago-2026: el `--force` **eliminó 43 archivos rastreados** de
> `node_modules/better-sqlite3` y `node_modules/jsonwebtoken`, incluido
> `better_sqlite3.node`, el binario compilado sin el cual `server.js` **no arranca**. pnpm hace
> su limpieza sin saber que ese directorio está bajo control de versiones.
>
> Después de cualquier `pnpm install`, siempre:
>
> ```bash
> git status --short node_modules    # ¿hay borrados?
> git checkout -- node_modules/      # devolvelos
> node -e "require('better-sqlite3')" # que cargue de verdad
> ```
>
> Es la misma raíz que el problema de `tsc`: un `node_modules/` versionado y un gestor de
> paquetes moderno peleando por el mismo directorio. Mientras esa decisión no se tome a
> propósito, esto hay que hacerlo a mano.

### Qué comprueba el guard

| Regla | Qué busca |
|---|---|
| 2 | `update`/`delete` directos sobre `prenda_pasada` |
| 3 | `getAdminClient()` fuera de los 6 archivos permitidos |
| 3 | Policies RLS con `using (true)` sin justificar |
| 3 | Tablas con RLS activa y **sin policy de escritura** |
| 4 | `new Date()` dentro de `packages/core/` |
| 6 | Un commit que mezcle spec y código (sólo en CI, sobre un PR) |
| — | Números de migración repetidos **entre ramas** |

La deuda que ya existía vive en `tools/guard-baseline.txt` y no rompe el build; una violación nueva
sí. **Nunca agregues una línea al baseline para hacer pasar un cambio tuyo** — eso es exactamente
lo que el guard existe para impedir.

---

### El hook que bloquea: `migracion-reservada.sh`

Es la única red que **impide** en vez de avisar. Corre antes de cada `Write` o `Edit`, y si el
archivo es una migración comprueba dos cosas:

1. Que el número **no esté tomado por otra rama** — te dice cuál y con qué nombre.
2. Que el archivo esté **commiteado**. Reservar sin commitear no reserva nada: la siguiente sección
   no lo ve y va a elegir el mismo número.

Cualquier archivo que no sea `packages/db/migrations/*.sql` pasa sin que el hook haga nada.

> El guard ya detectaba el choque, pero lo detectaba **tarde**: con la migración ya escrita. El
> hook lo detecta antes de la primera línea. Es la diferencia entre corregir un nombre y renumerar
> una migración de 800 líneas que ya está aplicada.

### Las pruebas de migración: `tools/probar-migracion.sh`

Verificar una migración **no es mirar que las tablas existan**. Es intentar romper lo que promete.

Cada migración de zona crítica tiene su archivo en `packages/db/pruebas/`. Monta un caso completo
y después lo ataca. La de la `0072` tiene 18 pasos: crea contrato, horario, adelanto, liquidación
y cierre, y después intenta editar el pago cerrado, agregarle líneas falsas, sacarle las que tiene,
tocar un movimiento sellado, borrarla, revivirla, y reemitirla.

**Se descartan solas.** Cada prueba termina lanzando una excepción con el resultado, y eso aborta
la transacción: no queda ni una fila. El "error" final **es** la salida esperada.

```bash
bash tools/probar-migracion.sh 0072      # una
bash tools/probar-migracion.sh           # todas
```

Con `psql` y `SUPABASE_DB_URL` las corre solo. Sin eso, imprime qué archivos pasarle al MCP de
Supabase.

### E2E: qué es y qué cubre hoy

**Todo lo demás mira el código.** Los tests unitarios prueban funciones sueltas, el typecheck
prueba que los tipos cierren, las pruebas de migración prueban la base. **Ninguno abre la
aplicación.**

Un E2E —*end to end*, de punta a punta— abre un navegador de verdad, entra a la pantalla, hace clic
donde haría clic una persona, y comprueba lo que esa persona vería. Es la única red que atrapa
*"compila, los tests pasan, y la pantalla está en blanco"*.

```bash
pnpm --filter erp-web dev            # en una terminal
pnpm --filter erp-web test:e2e       # en otra

E2E_URL=https://<preview>.vercel.app pnpm --filter erp-web test:e2e   # contra un despliegue
```

Hoy hay **tres pruebas de humo**, elegidas porque no necesitan sesión iniciada y por lo tanto se
pueden correr de verdad:

| Prueba | Qué atrapa |
|---|---|
| El login se dibuja | Que la aplicación levante y la pantalla tenga dónde escribir y qué apretar |
| La página no quedó en blanco | Un error de JavaScript sin capturar: el HTML llega y no se ve nada |
| `/empleados` sin sesión manda al login | **El no-negociable 3 desde afuera.** Si el middleware dejara de redirigir, cualquiera vería datos de personas sin estar logueado, y ningún test unitario lo notaría |

**Lo que falta y por qué.** Probar un flujo real —entrar, liquidar un sueldo, cerrarlo— necesita
dos cosas que no existen: un usuario de prueba con contraseña conocida, y **una base aparte**.
Contra `scilb` un E2E escribiría datos reales, y borrarlos después no alcanza: el trigger de
inmutabilidad impide borrar una liquidación cerrada, **a propósito**. Una rama de Supabase resuelve
las dos cosas y es el próximo paso.

---

## 2. Los tres agentes

| Agente | Para qué | Cuándo |
|---|---|---|
| **`explorador`** | Ubicar cosas: dónde vive X, qué toca Y, cómo se conectan A y B | Antes de diseñar, para no gastar la ventana de la sesión principal leyendo a ciegas |
| **`implementador`** | Ejecutar un cambio **ya especificado**, de punta a punta | Cuando hay spec y el trabajo cabe en una sección |
| **`verificador`** | Buscar el fallo de un cambio ya escrito | Antes de mergear zona crítica. **Su objetivo es encontrar el fallo, no aprobar** |

El `verificador` no es una formalidad: el 14-ago-2026 encontró **diez defectos con consecuencia
concreta** en una migración que ya parecía terminada, seis de ellos en el congelado de las
liquidaciones. Corría en una ventana propia, así que la sesión principal no pagó el costo de la
búsqueda.

### Lo que los agentes aprenden queda escrito

Un agente empieza cada sesión **sin memoria**. Sin nada que lo guarde, el mismo error se comete de
nuevo cada vez y la única defensa es que alguien se acuerde.

**[`docs/aprendizajes.md`](aprendizajes.md)** es ese registro. Cada fila tiene tres columnas: qué
se hizo mal, qué costó, y **cómo se detecta ahora**. La tercera es la que importa: un error anotado
sin cómo detectarlo es una anécdota.

- El `implementador` y el `verificador` lo leen como **paso 0**, la sección de su área.
- El hook de cierre lo recuerda cuando hay código tocado sin documentar.
- La regla de cierre de `CLAUDE.md` lo pide.

**Y cuando el aprendizaje se puede convertir en una comprobación automática, se convierte.** Ese es
el criterio que impide que el archivo se vuelva un cementerio de párrafos: de las 26 filas iniciales,
9 ya tienen su regla en el guard o su hook. El archivo no es el objetivo — es la sala de espera de
la próxima comprobación automática.

### Qué afecta que dos `implementador` no se vean

Corren en ventanas separadas. Ninguno ve el trabajo **sin commitear** del otro. Concretamente:

| Riesgo | Qué lo tapa |
|---|---|
| Los dos eligen el mismo número de migración | El hook bloquea, y sólo ve reservas **commiteadas** — por eso el protocolo exige commitear la reserva antes de escribir |
| Los dos editan el mismo archivo | Una sección, una rama, y **archivos distintos por sección**. Si dos secciones necesitan el mismo repo o la misma pantalla, no son dos secciones |
| Los dos agregan filas al mismo documento | `merge=union` en los cuatro compartidos |
| Los dos inventan el mismo default con distinto valor | Nada lo tapa hoy. Los dos lo anotan en `pendientes-negocio.md` y se ve al revisar |
| Uno rompe algo que el otro usa | Nada lo tapa **hasta el merge**, donde CI corre typecheck y tests sobre las dos partes juntas |

Las dos últimas filas son el límite real del paralelismo: **cuanto más se tocan dos secciones, menos
sirve separarlas.** El reparto que funciona es por frontera de datos —sueldos, pipeline, evaluación—
no por "vos hacé el backend y yo el frontend de lo mismo".

---

## 3. Protocolo para trabajar en paralelo

### Regla 1 — Una sección, una rama, un tema

Nombre `feat/<tema>`. Nada de ramas que tocan dos temas: el conflicto no está en el código, está en
las decisiones.

### Regla 2 — El número de migración se reserva, no se elige

```bash
bash tools/reservar-migracion.sh mi_tema_nuevo
git add packages/db/migrations/00NN_mi_tema_nuevo.sql
git commit -m "chore(migration): reserva 00NN para mi_tema_nuevo"
git push
```

**Reservá y pusheá ANTES de escribir la migración.** El script mira todas las ramas, locales y
remotas, así que sólo funciona si las demás secciones pushearon su reserva.

> **El número es un identificador único, no una fecha.** Con ramas en paralelo no puede ser las dos
> cosas. El orden real de aplicación vive en `supabase_migrations.schema_migrations`, no en el
> nombre del archivo.

Si el guard te avisa de un choque: **renumerá la que se aplicó ÚLTIMA**, no la primera.

### Regla 3 — Los tres documentos compartidos son append-only

`docs/pendientes-negocio.md`, `docs/mapa-verificado.md` y `docs/INDEX.md` los toca toda sección.
Están marcados `merge=union` en `.gitattributes`, así que dos ramas que agregan filas distintas
**no producen conflicto**.

A cambio, tres cosas que no se hacen:

- **No reordenes** una tabla existente.
- **No reescribas** una línea que ya estaba, salvo que sea el punto del cambio.
- **No reflowees** un párrafo entero para que entre en 100 columnas.

Si dos ramas editan la misma línea, `union` deja **las dos pegadas, sin marcador de conflicto y sin
avisar**. Ese es el precio de no tener conflictos por filas independientes, y se paga sólo si se
respetan las tres reglas de arriba.

Cuando de verdad haya que corregir una línea existente: commit propio, que no toque nada más.

### Regla 4 — Las specs no se comparten entre secciones

Cada sección tiene su carpeta en `docs/superpowers/specs/<tema>/`. Dos secciones no editan la misma
spec. Si una decisión afecta a las dos, va al documento compartido, no a la spec de la otra.

### Regla 5 — Zone Guard sigue valiendo, y CI lo comprueba

Spec y código **nunca** en el mismo commit. Primero la spec, confirmada; después el código. CI
recorre todos los commits del PR y falla si alguno mezcla.

Es la regla que más incomoda y la que más protege: sin ella, el camino de menor resistencia ante un
test rojo es aflojar la spec hasta que pase, y así se cuela un error de sueldo.

### Regla 6 — Migraciones: aplicar es un acto, no un efecto

Una migración se aplica a mano contra `scilb`, y **después** se anota en la spec que quedó aplicada
y verificada, con qué se comprobó. Nunca al revés: escribir "aplicada" antes de aplicarla es
exactamente la trampa documental del no-negociable 7.

Y verificar no es mirar que las tablas existan. Es **intentar romper lo que la migración promete**:
si prometía que un pago cerrado no se puede modificar, hay que intentar modificarlo y ver que
falle.

---

## 4. El ciclo, completo

```
1. Explorar        →  subagente explorador (o graphify directo)
2. Diseñar         →  spec en docs/superpowers/specs/<tema>/
3. Confirmar       →  con Alexander, si toca una regla de negocio
4. Commit de spec  →  sola, sin código
5. Reservar número →  si hay migración
6. Implementar     →  código
7. Verificar local →  bash tools/verificar-local.sh
8. Commit de código→  solo, sin spec
9. Aplicar         →  la migración, a mano, contra scilb
10. Romper         →  intentar violar lo que la migración promete
11. Verificador    →  subagente, si es zona crítica
12. Documentar     →  lo aprendido, en el documento que corresponda
```

Los pasos 4 y 8 separados son el Zone Guard. El paso 10 es lo que distingue "aplicada" de
"aplicada y verificada". El paso 12 no es opcional: **ninguna tarea está terminada hasta que lo
aprendido esté escrito**, porque el grafo de código se actualiza solo y la semántica no.

---

## 5. Lo que este harness todavía NO cubre

Escrito acá para que nadie lo descubra tarde:

- **Las pruebas de migración no corren en CI.** Existen y se pueden volver a correr, pero necesitan
  credenciales de la base y CI no tiene secretos **a propósito** (así siempre es reproducible). Hoy
  se corren a mano antes de mergear. Automatizarlas exige una rama de Supabase con su URL en los
  secretos del repositorio.
- **Corregido el 09-sep-2026 — el E2E SÍ prueba flujos con sesión, desde hace un tiempo.** Esta
  línea quedó vieja: `e2e/sesiones.ts` ya tiene dos cuentas dedicadas («Prueba Admin»/«Prueba
  Colaborador», cod `9901`/`9902`) con contraseña por variable de entorno
  (`E2E_ADMIN_PASSWORD`/`E2E_COLAB_PASSWORD`, nunca en el repo), y hay specs de sesión real
  (`admin.navegacion`, `colaborador.aislamiento`, `admin.dashboard-personal`, etc.). Sigue habiendo
  un hueco real: los flujos de ESCRITURA sólo corren opt-in (`E2E_WRITE=1`, `E2E_CONTRATO=1`,
  `E2E_SUSPENSION=1`) contra `scilb` de verdad, y se limitan a lo que se puede auto-limpiar o a
  cuentas de prueba dedicadas — nunca a una persona real. **Esas dos cuentas ahora son
  infraestructura de prueba, no basura**: si algo (como la `0099`, borrar-alta-por-error) las
  toca alguna vez, hay que avisar antes, porque `Prueba Admin`/`Prueba Colaborador` sostienen media
  suite de E2E.
- **Correr el E2E con el servidor de desarrollo compartido puede levantar un SEGUNDO servidor sin
  querer.** `playwright.config.ts` arranca `pnpm dev` si no ve nada respondiendo en `E2E_URL` (por
  defecto `localhost:3000`) — pero el `pnpm dev` de PM2 de esta máquina corre en el **3005**
  (`dev -p 3005`). Sin `E2E_URL`, Playwright no lo encuentra y levanta una SEGUNDA instancia de
  Next, que comparte el mismo `.next/` en disco con la de PM2: las dos recompilando al mismo tiempo
  —más los hot-reloads de cualquier otra sesión editando código en paralelo— produce exactamente
  los síntomas de una base corrupta (`ENOENT ... edge-instrumentation.js`, páginas en blanco,
  redirecciones que no llegan a tiempo) sin que el código tenga ningún defecto real. La solución no
  es reintentar: es `E2E_URL=http://localhost:3005 npx playwright test` para que reuse el servidor
  que ya está corriendo, y `pm2 restart erp-dev` si de todos modos quedó en un estado raro.
- **El `node_modules/` versionado sigue ahí, y es una mina.** `tools/verificar-local.sh` lo
  esquiva, no lo resuelve. Ya rompió dos cosas el mismo día: el `tsc` que no se encuentra, y un
  `pnpm install --force` que borró el binario compilado de `better-sqlite3`.

  **Sacarlo del control de versiones** —`git rm -r --cached node_modules`, que no borra nada del
  disco— es la solución de fondo. El sistema viejo **no corre en esta PC**: acá hay una copia para
  analizarlo, y lo que la gente usa corre en otra máquina. Eso quita el motivo que había para no
  hacerlo, pero deja uno nuevo y concreto: **cuando esa otra PC haga `git pull`, git le va a borrar
  `node_modules/` del disco** y PM2 se queda sin dependencias. Se arregla corriendo `npm install`
  ahí, pero hay que hacerlo **antes** de que nadie lo note. Es una decisión de Alexander con un
  paso obligatorio, no un cambio que se hace de paso.
- **Los agentes no comparten estado.** Dos `implementador` en paralelo no saben uno del otro; lo
  único que los coordina es este protocolo, el hook y el guard. El detalle de qué tapa cada cosa
  está en §2.
- **Nada impide que dos secciones inventen el mismo default con distinto valor.** Los dos lo
  anotan en `pendientes-negocio.md` y se ve al revisar, pero nadie avisa en el momento.

---

## 6. Qué se comprobó de este documento

No alcanza con escribirlo. Cada afirmación de acá se verificó corriéndola:

| Afirmación | Cómo se comprobó |
|---|---|
| El guard detecta números repetidos entre ramas | Encontró el choque real `0068`/`0069` entre `feat/mi-talla-db` y `feat/sueldos-motor`, y volvió a verde al renumerar. 9 segundos |
| El guard detecta tablas con RLS sin escritura | Barrió las 73 migraciones; la única sin escritura es `audit_log`, que es a propósito |
| `verificar-local.sh` corre lo mismo que CI | Encontró un error de tipos real en `sueldos.ts` que habría puesto CI en rojo. 331 tests en verde |
| `merge=union` no produce conflicto | Dos ramas de prueba agregaron una fila cada una a `pendientes-negocio.md`: el merge pasó solo y quedaron las dos |
| `graphify-out/graph.json merge=graphify` sigue vivo | `git check-attr merge` sobre los cuatro archivos |
| `reservar-migracion.sh` da el número libre | Creó la `0074` con su encabezado, sabiendo de la `0073` local y de la `0071` de otra rama |
| `pnpm install --force` borra archivos del sistema viejo | Pasó: 43 archivos rastreados borrados, restaurados con `git checkout`, y `require('better-sqlite3')` vuelve a cargar |
| El hook bloquea una migración sin reservar | Cinco casos probados: archivo que no es migración pasa · migración nueva sin reserva deniega · número de otra rama deniega **nombrando la rama** · reserva sin commitear deniega pidiendo el commit · migración commiteada pasa. Y la salida se validó con `JSON.parse`, porque la primera versión emitía JSON roto |
| Las pruebas de migración guardadas siguen pasando | `0072` con sus 18 pasos y `0073` con sus 12, corridas contra `scilb`. Ninguna dejó filas |
| El E2E compila y entra en el typecheck | `tsc --noEmit` sobre `apps/erp-web` incluye `e2e/**` y `playwright.config.ts` |

---

_Verificado corriendo cada herramienta que menciona. 14 de agosto de 2026._
