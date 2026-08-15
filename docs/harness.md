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
| **`tools/guard-reglas.sh`** | Antes de commitear y en CI | Segundos |
| **`tools/verificar-local.sh`** | Antes de commitear | ~1 minuto |
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

- **No hay tests de la base.** Las migraciones se verifican a mano, con escenarios dentro de una
  transacción que se descarta. Funciona y encuentra cosas, pero no queda corriendo: si alguien
  rompe un trigger dentro de tres meses, nadie se entera.
- **No hay E2E.** CI corre guard, typecheck y tests unitarios. Nadie comprueba que una pantalla
  cargue.
- **El `node_modules/` versionado sigue ahí, y es una mina.** `tools/verificar-local.sh` lo
  esquiva, no lo resuelve. Ya rompió dos cosas el mismo día: el `tsc` que no se encuentra, y un
  `pnpm install --force` que borró el binario compilado de `better-sqlite3` y habría dejado el
  sistema viejo sin arrancar. **Sacarlo del control de versiones** (`git rm -r --cached
  node_modules`, que no borra nada del disco) es la solución de fondo, pero cambia lo que recibe
  quien clone el repo para correr el Express viejo, así que es una decisión de Alexander y no se
  toma de paso.
- **Los agentes no comparten estado.** Dos `implementador` en paralelo no saben uno del otro; lo
  único que los coordina es este protocolo y el guard.

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

---

_Verificado corriendo cada herramienta que menciona. 14 de agosto de 2026._
