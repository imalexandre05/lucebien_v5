# PROMPT PARA CLAUDE — RESCATE Y COMMIT DEL TRABAJO HUÉRFANO

> Situación nueva descubierta durante el intento de merge.
> El repo principal tiene ~22 archivos modificados + ~20 untracked sin commitear.
> Este prompt reemplaza al anterior (prompt-merge-dashboards.md).

---

## CONTEXTO

Estás trabajando en **LuceBien**, ERP interno para empresa peruana de alquiler de ternos.
Stack: Node.js + Express + SQLite, frontend HTML/JS clásico. Servidor en puerto 7000.

**Reglas de oro:**
- No toques la BD destructivamente.
- `try/catch` en todo código que toque BD o I/O.
- No hagas nada irreversible sin reportar primero.
- Esta máquina es desarrollo/staging, no producción real.

---

## SITUACIÓN ACTUAL

El repo principal (`C:\Users\ASUS\Downloads\Lucebien\`, rama `feat/pipeline-feedback-iter`) tiene una cantidad grande de trabajo sin commitear que parece ser trabajo real del Claude anterior — no basura, no archivos temporales. Incluye:

- Modificaciones a: `admin.js`, `app.js`, `server.js`, rutas, CSS, HTML y más
- Archivo borrado: `public/js/pipeline-historial.js`
- Archivos untracked nuevos: `routes/dashboard.js`, `routes/pagos.js`, `routes/notificaciones.js`, `routes/ventas.js`, `_env-loader.js`, `_backup-bd.js`, `public/js/header.js`, `public/js/pagos.js`, `public/js/asistencia-dia.js`, `public/js/almacen-kanban.jsx`, `public/js/pipeline-ui.js`, `public/css/kanban-almacen.css`, `database/seed-config.js`, `database/seed-layout.js`, `.gitignore`, `.env.example`, `docs/`, y otros.

**Este trabajo no puede perderse.** El objetivo de esta sesión es commitear todo de forma ordenada y con historia git limpia.

---

## TAREAS A EJECUTAR (EN ESTE ORDEN EXACTO)

---

### TAREA 1 — Fotografía del estado real

Ejecuta y muéstrame el output completo de:

```bash
git status
git diff --stat HEAD
git log --oneline -8
```

Necesito ver exactamente qué hay antes de tocar nada.

---

### TAREA 2 — Inspección rápida de archivos clave

Lee y resume brevemente el contenido de estos archivos (solo las primeras 40-60 líneas de cada uno para entender de qué tratan):

- `routes/dashboard.js` (el untracked — ¿qué endpoints define?)
- `_env-loader.js` (¿qué hace?)
- `_backup-bd.js` (¿qué hace?)
- `public/js/header.js` (¿qué hace?)
- `.gitignore` (¿qué excluye ya?)

El objetivo es entender si son archivos completos y funcionales, o fragmentos a medio hacer.

---

### TAREA 3 — Clasificar el trabajo en grupos lógicos

Basándote en lo que viste, agrupa los archivos en commits temáticos. La estructura sugerida es la siguiente (ajusta si los archivos reales no encajan):

**Grupo 1 — Infraestructura base**
Candidatos: `_env-loader.js`, `_backup-bd.js`, `.gitignore`, `.env.example`

**Grupo 2 — Backend: rutas nuevas**
Candidatos: `routes/dashboard.js`, `routes/pagos.js`, `routes/notificaciones.js`, `routes/ventas.js`, `auditoria.js` (si existe), `server.js` (modificado para registrar rutas nuevas)

**Grupo 3 — Frontend: módulos JS nuevos**
Candidatos: `public/js/header.js`, `public/js/pagos.js`, `public/js/asistencia-dia.js`, `public/js/pipeline-ui.js`, `public/js/almacen-kanban.jsx`

**Grupo 4 — Frontend: estilos y HTML**
Candidatos: `public/css/kanban-almacen.css`, cambios en `public/index.html`, cambios en `public/js/app.js`, `public/js/admin.js`

**Grupo 5 — Base de datos y seeds**
Candidatos: `database/seed-config.js`, `database/seed-layout.js`, `migracion_produccion.js` (si existe)

**Grupo 6 — Documentación**
Candidatos: `docs/`, `CONTEXTO-PROYECTO.md`

> Si un archivo no encaja en ningún grupo, dímelo antes de commitear y decidimos juntos.
> Si `routes/dashboard.js` que ya existe en disco parece más completo que el que iba a venir del merge, lo documentamos en el commit message.

---

### TAREA 4 — Validar sintaxis antes de commitear

Para cada archivo JS/JSX que sea nuevo (untracked), verifica que no tiene errores de sintaxis:

```bash
node --check routes/dashboard.js
node --check routes/pagos.js
node --check routes/notificaciones.js
node --check routes/ventas.js
node --check _env-loader.js
node --check _backup-bd.js
node --check public/js/header.js
node --check public/js/pagos.js
node --check public/js/asistencia-dia.js
node --check public/js/pipeline-ui.js
```

Para el `.jsx` (Babel, no Node puro), omite la validación con node — solo verifica que no esté vacío.

Si alguno falla, repórtalo. No lo incluyas en el commit hasta que esté resuelto o lo excluyas explícitamente.

---

### TAREA 5 — Commitear grupo por grupo

Commitea en el orden de los grupos definidos en la Tarea 3. Para cada commit:

```bash
git add <archivos del grupo>
git commit -m "<mensaje descriptivo>"
```

Mensajes de commit sugeridos (ajusta según lo que realmente encontraste):

```
chore(infra): env-loader + backup automático + gitignore reforzado
feat(backend): rutas dashboard, pagos, notificaciones y ventas
feat(frontend-js): header global + módulos pagos, asistencia, pipeline, kanban
feat(frontend-css): estilos kanban almacén + ajustes HTML/app
feat(db): seeds de config y layout
docs: contexto del proyecto + documentación inicial
```

**Regla importante:** El archivo `database/lucebien.db` y sus variantes `-shm`, `-wal`, `-journal` NO deben commitearse nunca. Si aparecen como staged, sácalos:

```bash
git reset HEAD database/lucebien.db
git reset HEAD database/lucebien.db-shm
git reset HEAD database/lucebien.db-wal
```

---

### TAREA 6 — Verificar que el servidor sigue vivo

Después de los commits (que no tocan archivos en ejecución en caliente), confirma que el servidor sigue respondiendo:

```bash
curl http://localhost:7000/api/test
```

Debe devolver `{"ok":true}`. Si no responde, reporta sin hacer nada más.

---

### TAREA 7 — Evaluar si el merge de `objective-vaughan` sigue siendo necesario

Ahora que el trabajo huérfano está commiteado, compara qué hay en disco vs lo que traería el merge:

```bash
git log --oneline claude/objective-vaughan-203c86 ^feat/pipeline-feedback-iter
```

Esto muestra los commits de esa rama que NO están en la rama actual.

Luego revisa qué archivos tocarían:

```bash
git diff --name-only feat/pipeline-feedback-iter claude/objective-vaughan-203c86
```

Reporta:
- ¿El `routes/dashboard.js` que ya commiteamos cubre lo mismo que el commit `bba13b8`?
- ¿El `public/js/kanban-almacen.js` del commit `37d0eeb` es diferente al `almacen-kanban.jsx` que ya commiteamos?
- ¿Hay algo en `objective-vaughan` que no esté ya en el repo?

Con esa información, decidiremos si hacer el merge, cherry-pick selectivo, o descartarlo.

---

### TAREA 8 — Sacar la BD del tracking (si aún no está en .gitignore)

```bash
git check-ignore -v database/lucebien.db
```

Si no devuelve nada (no está ignorada), agrega al `.gitignore`:

```
database/lucebien.db
database/lucebien.db-shm
database/lucebien.db-wal
database/lucebien.db-journal
database/backups/*.db
```

Luego:

```bash
git rm --cached database/lucebien.db 2>/dev/null
git rm --cached database/lucebien.db-shm 2>/dev/null
git add .gitignore
git commit -m "chore(git): sacar BD viva del tracking de git"
```

> Esto es seguro con el servidor corriendo — `git rm --cached` no borra el archivo del disco.

---

### TAREA 9 — Levantar el servidor bajo PM2

Solo si el servidor manual (PID ~5040) sigue corriendo después de todos los commits:

```bash
netstat -ano | findstr :7000
```

Si hay proceso, mátalo:

```bash
taskkill /PID <PID_ENCONTRADO> /F
```

Levanta con PM2 (usando `cd` primero para evitar problemas de ruta en Windows):

```bash
cd /d "C:\Users\ASUS\Downloads\Lucebien"
pm2 start server.js --name lucebien
pm2 save
pm2 list
```

Verifica:
```bash
curl http://localhost:7000/api/test
```

---

## REPORTE FINAL ESPERADO

```
ESTADO FINAL
============
[ ] Archivos huérfanos clasificados en N grupos
[ ] Sintaxis validada en todos los JS nuevos
[ ] N commits creados (listar hashes y mensajes)
[ ] BD fuera del tracking de git
[ ] Servidor bajo PM2, respondiendo en puerto 7000
[ ] Evaluación del merge: necesario / parcialmente / ya redundante

ARCHIVOS CON PROBLEMAS (si los hay)
=====================================
[archivo] — [motivo por el que no se commiteó o requiere decisión]

DECISIÓN PENDIENTE SOBRE EL MERGE
====================================
[resumen de qué aporta objective-vaughan que no está ya en el repo]
```

---

## REGLAS PARA ESTA SESIÓN

- Detente y reporta si algo no cuadra con lo descrito.
- No hagas `git stash` — puede ocultar trabajo real.
- No hagas `git reset --hard` — destruye trabajo sin recuperación.
- No mergees `objective-vaughan-203c86` hasta que la Tarea 7 confirme que conviene.
- No commites `lucebien.db` ni sus variantes bajo ningún concepto.
- Si un archivo tiene errores de sintaxis, repórtalo en lugar de commitearlo roto.
