# PROMPT PARA CLAUDE — MERGE DASHBOARDS + SANEAMIENTO DEL REPO

> Prompt autocontenido. Ejecútalo en una sesión nueva de Claude Code
> apuntando al repo principal: `C:\Users\ASUS\Downloads\Lucebien\`

---

## CONTEXTO DEL PROYECTO

Estás trabajando en **LuceBien**, un sistema ERP interno para una empresa peruana de alquiler de ternos. Stack: Node.js + Express + SQLite (`better-sqlite3`), frontend HTML/JS clásico. El servidor corre en el puerto 7000.

**Reglas de oro que no puedes romper:**
- Nunca toques la BD destructivamente. Solo `ALTER TABLE ADD COLUMN` idempotente si acaso.
- Todo código nuevo que toque BD o I/O va dentro de `try/catch`.
- Si algo puede romper el boot del servidor, detente y reporta antes de continuar.
- Esta máquina es entorno de desarrollo/staging, NO producción real. Matar y rearrancar Node equivale a un F5 — no afecta operarios reales.

---

## ESTADO ACTUAL DEL REPO

**Repo principal:** `C:\Users\ASUS\Downloads\Lucebien\`
**Rama activa:** `feat/pipeline-feedback-iter`
**Último commit:** `cfec662`
**Servidor corriendo:** `node.exe` PID 5040, puerto 7000, iniciado manualmente (NO bajo PM2)

### Problema 1 — Rename a medias en el staging area

`git status` muestra esto:

```
Changes to be committed:
  renamed: public/js/pipeline-ui.js → public/js/pipeline-envios.js

Changes not staged for commit:
  modified: database/lucebien.db
  modified: database/lucebien.db-shm
```

El rename `pipeline-ui.js → pipeline-envios.js` está staged pero **nunca se completó**:
- `public/index.html` línea ~1955 todavía apunta al nombre viejo: `<script src="/js/pipeline-ui.js?v=...">`
- Si se mergea así o se reinicia el servidor, ese `<script>` dará 404.
- El archivo contiene lógica de kanban, ingreso de prendas, solicitudes Y envíos — no solo envíos. El nombre `pipeline-envios.js` sería semánticamente incorrecto.
- No hay commit ni mensaje que documente la intención — es trabajo interrumpido.

**Decisión tomada:** descartar el rename. El archivo se queda como `pipeline-ui.js`.

### Problema 2 — BD trackeada por Git

`database/lucebien.db` y `database/lucebien.db-shm` aparecen como modificados en git status. La BD viva no debe estar trackeada por Git.

### Commits pendientes de integrar

En la rama `claude/objective-vaughan-203c86` hay 2 commits listos para mergear a `feat/pipeline-feedback-iter`:

**Commit `37d0eeb`** — `feat(kanban-almacen): vistas Kanban / Mini / Lista en Prendas Recibidas`
- Nuevo `public/js/kanban-almacen.js` (módulo nativo JS, sin React)
- Reescritura de `page-kanban-almacen` en `index.html`
- Elimina referencias a React/Babel/ReactDOM CDN
- Funciones que consume del archivo pipeline: `avanzarPrenda`, `rechazarPrenda`, `abrirDetallePrenda`, `prepararEnvio`

**Commit `bba13b8`** — `feat(dashboards): dashboard gerencial enriquecido + dashboard por trabajador`
- Nuevo o modificado `routes/dashboard.js` con endpoints `/api/dashboard/admin` y `/api/dashboard/empleado`
- Markup nuevo en `page-dashboard` y nueva tab "Dashboard" en `page-evaluacion-mensual`
- CSS para gráficas / heatmap / scorecards

---

## TAREAS A EJECUTAR (EN ESTE ORDEN EXACTO)

### TAREA 1 — Verificar estado inicial

Antes de tocar nada, ejecuta y reporta el output de:

```bash
cd "C:\Users\ASUS\Downloads\Lucebien"
git status
git log --oneline -5
git branch
```

Confirma que estás en `feat/pipeline-feedback-iter` y que el estado coincide con lo descrito arriba.

---

### TAREA 2 — Descartar el rename a medias

El rename staged no fue intencional. Descártalo:

```bash
git restore --staged public/js/pipeline-ui.js
git restore --staged public/js/pipeline-envios.js 2>nul
```

Verifica que después de esto `git status` ya no muestra el rename en "Changes to be committed".

Si `pipeline-envios.js` llegó a existir físicamente como archivo (no solo en el index de git), elimínalo:

```bash
# Solo si el archivo existe físicamente:
if exist "public\js\pipeline-envios.js" del "public\js\pipeline-envios.js"
```

---

### TAREA 3 — Sacar la BD del tracking de Git

Verifica si la BD está siendo trackeada:

```bash
git check-ignore -v database/lucebien.db
```

**Si el comando no devuelve nada** (la BD NO está en .gitignore), entonces:

1. Agrega al `.gitignore` (incluye variantes WAL, journal y backups para prevenir futuros accidentes):
```
database/lucebien.db
database/lucebien.db-shm
database/lucebien.db-wal
database/lucebien.db-journal
database/backups/*.db
```

2. Saca los archivos del index de git (sin borrarlos del disco):
```bash
git rm --cached database/lucebien.db
git rm --cached database/lucebien.db-shm 2>nul
git rm --cached database/lucebien.db-wal 2>nul
git rm --cached database/lucebien.db-journal 2>nul
```

> Nota: el servidor puede estar corriendo con WAL activo, por lo que `-shm` y `-wal`
> existen en disco mientras node está vivo. El `git rm --cached` solo afecta el index
> de git, no borra los archivos — es seguro ejecutarlo con el servidor corriendo.

3. Commitea el cambio:
```bash
git add .gitignore
git commit -m "chore(git): sacar BD viva del tracking + reforzar .gitignore"
```

**Si el comando SÍ devuelve una regla** (ya está en .gitignore pero aparece modificado porque fue trackeado antes), ejecuta directamente los `git rm --cached` del paso 2 y commitea.

Después del commit, verifica que `git status` ya no muestra los archivos `.db` como modificados.

---

### TAREA 4 — Backup de la BD antes del merge

```bash
copy "database\lucebien.db" "database\backups\lucebien_pre_dashboards_2026-05-09.db"
```

Confirma que el archivo de backup existe y tiene un tamaño razonable (debería ser ~626 KB).

---

### TAREA 5 — Merge de los commits pendientes

```bash
git merge claude/objective-vaughan-203c86
```

**Si el merge es limpio:** continúa al paso siguiente.

**Si hay conflictos:**

Los conflictos en `public/index.html` pueden ser extensos porque los 2 commits tocan zonas grandes:
- `page-dashboard` fue rediseñado completamente
- `page-evaluacion-mensual` recibió una nueva tab "Dashboard"
- `page-kanban-almacen` fue reescrito de cero
- Se eliminaron los 3 `<script>` CDN de React/Babel/ReactDOM

Reglas para resolver cada zona conflictiva:

**Zona `page-kanban-almacen`:** Usar el markup de la rama entrante. El nuevo markup correcto tiene estructura con header + stats + filtros + view toggle + action bar. Si ves el markup viejo con `<div id="almacen-kanban-root">` (el root de React), es el que se debe descartar — ese ya no existe.

**Zona `page-dashboard`:** Usar el markup de la rama entrante íntegramente.

**Zona `page-evaluacion-mensual`:** Preservar la nueva tab "Dashboard" que viene de la rama entrante.

**Tag `<script>` del archivo pipeline:** Mantener `pipeline-ui.js`, nunca `pipeline-envios.js`.

**Scripts CDN de React/Babel/ReactDOM:** Si aparecen en el lado "actual" del conflicto, descartarlos — la rama entrante los elimina correctamente.

Después de resolver todos los conflictos: `git add public/index.html` y `git merge --continue`.

---

### TAREA 6 — Verificar que index.html referencia pipeline-ui.js correctamente

Después del merge, busca en `public/index.html` todas las referencias a ambos nombres:

```bash
findstr /n "pipeline-ui\|pipeline-envios" public\index.html
```

Revisa el output:
- El `<script src>` que carga el archivo JS debe apuntar a `pipeline-ui.js` (o el nombre que quedó físicamente en `public/js/`).
- Las referencias a `pipeline-envios` en `goTo(...)` y `id="page-pipeline-envios"` son correctas — esas son el nombre de la PÁGINA, no del archivo JS. No las cambies.

Si encuentras algún `<script src="/js/pipeline-envios.js...">` que apunte al nombre incorrecto, corrígelo a `pipeline-ui.js`.

---

### TAREA 7 — Validar sintaxis de archivos nuevos

```bash
node --check routes/dashboard.js
node --check public/js/kanban-almacen.js
node --check server.js
```

Si alguno falla, reporta el error exacto antes de continuar. No reinicies el servidor con un archivo roto.

---

### TAREA 8 — Matar el proceso manual y levantar con PM2

Primero confirma el PID actual del servidor:

```bash
netstat -ano | findstr :7000
```

Mata el proceso (usa el PID que encontraste, probablemente 5040):

```bash
taskkill /PID 5040 /F
```

Levanta con PM2 para que sobreviva reinicios de Windows.

> En Windows, `--cwd` con rutas largas puede fallar silenciosamente.
> Usa `cd` primero para garantizar que PM2 tome el directorio correcto:

```bash
cd /d "C:\Users\ASUS\Downloads\Lucebien"
pm2 start server.js --name lucebien
pm2 save
pm2 list
```

Si `pm2` no se reconoce como comando, prueba con la ruta completa:
```bash
npx pm2 start server.js --name lucebien
```

---

### TAREA 9 — Verificar que el servidor arrancó correctamente

```bash
curl http://localhost:7000/api/test
```

Debe responder `{"ok":true}`.

También verifica que los nuevos endpoints del dashboard respondan:

```bash
curl http://localhost:7000/api/dashboard/admin
curl http://localhost:7000/api/dashboard/empleado
```

Estos pueden responder 401 (sin token JWT) — eso es correcto y esperado. Lo que NO debe pasar es un 404 (ruta no registrada) o un 500 (error en el handler).

---

### TAREA 10 — Verificar estado final del repo

```bash
git status
git log --oneline -5
pm2 list
```

El estado esperado:
- `git status` → limpio, sin archivos staged ni modificados (excepto posiblemente los `.db` si ya están en gitignore)
- `git log` → muestra los 2 commits del merge al tope
- `pm2 list` → proceso `lucebien` en estado `online`

---

## REPORTE FINAL ESPERADO

Al terminar, entrega un resumen con este formato:

```
ESTADO FINAL
============
[ ] Rename descartado — pipeline-ui.js mantenido
[ ] BD sacada del tracking de Git
[ ] Backup creado en database/backups/
[ ] Merge completado (con/sin conflictos — cuáles)
[ ] index.html apunta al script correcto
[ ] Sintaxis validada sin errores
[ ] Servidor levantado bajo PM2 en puerto 7000
[ ] /api/test responde {"ok":true}
[ ] /api/dashboard/* responde (200 o 401, no 404/500)
[ ] git status limpio

PROBLEMAS ENCONTRADOS (si los hay)
====================================
[describir cualquier error, conflicto o comportamiento inesperado]
```

---

## REGLAS PARA ESTA SESIÓN

- Si en cualquier paso encuentras un error que no sabes resolver, **detente y reporta** en lugar de improvisar.
- No hagas commits extra innecesarios. Solo los mínimos para dejar el repo limpio.
- No modifiques lógica de negocio. Solo infraestructura de archivos y git.
- No instales paquetes nuevos.
- No toques `database/lucebien.db` directamente — solo el backup por copia.
