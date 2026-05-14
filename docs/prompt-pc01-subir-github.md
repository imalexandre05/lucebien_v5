# PROMPT PARA PC01 (PRODUCCIÓN) — SUBIR WEB A GITHUB

> Ejecutar este prompt en la PC de producción (PC01)
> en la sesión de Claude Code que tiene el proyecto LuceBienWeb.

---

## OBJETIVO

Subir el proyecto `LuceBienWeb` a GitHub para que pueda ser clonado
en la PC de desarrollo (ASUS). La BD NO sube a GitHub — solo el código.

---

## TAREA 1 — Verificar estado actual de git en LuceBienWeb

```bash
cd "C:\Users\PC01\Documents\LuceBienWeb"
git status
git remote -v
git log --oneline -3
```

Reporta exactamente:
- ¿Tiene git inicializado? (si `git status` da error → no tiene)
- ¿Tiene remote configurado? (si `git remote -v` da vacío → no tiene GitHub)
- ¿Tiene commits? (cuántos y cuál es el último)

---

## TAREA 2 — Verificar que .gitignore es correcto

Lee el `.gitignore` actual. Debe contener al menos:

```
node_modules/
.next/
.env
.env.local
.env*.local
out/
```

Si falta alguna de esas líneas, agrégalas antes de continuar.
El objetivo es que `node_modules/` y `.next/` nunca suban a GitHub.

---

## TAREA 3 — Según el resultado de la Tarea 1, ejecuta el camino correcto

### CAMINO A: No tiene git inicializado

```bash
cd "C:\Users\PC01\Documents\LuceBienWeb"
git init
git add .
git commit -m "feat: sitio web LuceBien 360 — build inicial completo"
```

Luego sigue a la Tarea 4.

### CAMINO B: Tiene git pero sin remote

```bash
# Verificar que todos los cambios están commiteados
git add .
git status
# Si hay cambios sin commit:
git commit -m "feat: web LuceBien — estado actual"
```

Luego sigue a la Tarea 4.

### CAMINO C: Tiene git Y tiene remote configurado

```bash
git add .
git commit -m "feat: web LuceBien — estado actual" 2>/dev/null || echo "nada que commitear"
git push
```

Si el push fue exitoso → **misión cumplida**, reporta la URL del repo.
Si falló → reporta el error exacto y espera instrucciones.

---

## TAREA 4 — Conectar con GitHub (solo si no había remote)

Antes de ejecutar esto, el usuario debe:
1. Entrar a github.com
2. Crear un repo nuevo privado llamado `lucebien-web`
3. NO marcar "Initialize with README"
4. Copiar la URL del repo (formato: `https://github.com/USUARIO/lucebien-web.git`)

Cuando tenga la URL, ejecutar:

```bash
git remote add origin https://github.com/USUARIO/lucebien-web.git
git branch -M main
git push -u origin main
```

Si pide usuario/contraseña de GitHub:
- Usuario: el de GitHub
- Contraseña: usar un **Personal Access Token** (no la contraseña de la cuenta)
  → Obtenerlo en: github.com → Settings → Developer settings → Personal access tokens → Tokens (classic) → New token → marcar "repo" → Generate

---

## TAREA 5 — Verificar que subió correctamente

```bash
git log --oneline -5
git remote -v
```

Reporta:
- La URL del remote origin
- Cuántos commits subieron
- Cualquier archivo grande que haya dado problema

---

## TAREA 6 — OPCIONAL: Empaquetar la BD para pendrive

La BD NO va a GitHub. Para transferirla manualmente:

```bash
# Ver dónde está la BD del ERP (si aplica)
# La BD de la WEB no existe (usa datos mock por ahora)
# Solo hay que transferir la BD del ERP si el usuario lo pide

echo "La web usa datos mock. No hay BD que transferir para el proyecto web."
echo "Si el usuario quiere la BD del ERP, está en C:\LuceBien\database\lucebien.db"
```

---

## REPORTE FINAL

```
ESTADO
======
[ ] git inicializado en LuceBienWeb
[ ] .gitignore correcto (node_modules/ y .next/ excluidos)
[ ] Código commiteado
[ ] Remote origin apuntando a GitHub
[ ] Push exitoso a main

URL DEL REPO: https://github.com/___/lucebien-web
COMMITS SUBIDOS: N
TAMAÑO APROXIMADO: X MB

PENDIENTE MANUAL (pendrive):
[ ] BD del ERP: C:\LuceBien\database\lucebien.db → copiar a pendrive
```
