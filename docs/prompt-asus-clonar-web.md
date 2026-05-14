# PROMPT PARA ASUS (DEV) — CLONAR WEB Y CORRER TODO LOCAL

> Ejecutar este prompt en la PC ASUS (desarrollo, en casa)
> DESPUÉS de que PC01 haya subido el proyecto a GitHub.
> Necesitas tener la URL del repo GitHub antes de empezar.

---

## OBJETIVO

Tener el proyecto web (`LuceBienWeb`) corriendo en la PC ASUS junto al ERP,
para poder desarrollar y ver todo localmente sin depender de la PC de producción.

Al terminar:
- ERP interno: http://localhost:7000
- Web e-commerce: http://localhost:3000

---

## PREREQUISITO — Verificar que el ERP sigue corriendo

```bash
curl http://localhost:7000/api/test
```

Si responde `{"ok":true}` → perfecto, continúa.
Si no responde → levantarlo:

```bash
cd "C:\Users\ASUS\Downloads\Lucebien"
pm2 start server.js --name lucebien 2>/dev/null || node server.js
```

---

## TAREA 1 — Clonar el proyecto web desde GitHub

```bash
cd "C:\Users\ASUS\Downloads"
git clone https://github.com/USUARIO/lucebien-web.git LuceBienWeb
cd LuceBienWeb
```

Reemplaza `USUARIO` con el usuario real de GitHub.

---

## TAREA 2 — Instalar dependencias

```bash
cd "C:\Users\ASUS\Downloads\LuceBienWeb"
npm install
```

Confirma que termina sin errores. Si hay errores de versión de Node:

```bash
node --version   # debe ser >= 18.0.0
npm --version    # debe ser >= 8.0.0
```

---

## TAREA 3 — Configurar variables de entorno

Crea el archivo `.env.local` en la raíz del proyecto web:

```bash
# Crear .env.local
```

Contenido del archivo:

```
# URL del ERP local — para cuando la web conecte con el backend
NEXT_PUBLIC_ERP_URL=http://localhost:7000

# Entorno
NODE_ENV=development
```

Este archivo NO se commitea (ya está en .gitignore).

---

## TAREA 4 — Verificar que el proyecto compila

```bash
cd "C:\Users\ASUS\Downloads\LuceBienWeb"
npm run build
```

Si el build pasa sin errores → perfecto.
Si hay errores de TypeScript o módulos faltantes → reporta el error exacto.

---

## TAREA 5 — Levantar el dev server de la web

```bash
npm run dev
```

Verifica que responde en http://localhost:3000:

```bash
curl http://localhost:3000
```

Debe devolver HTML (código 200).

---

## TAREA 6 — Verificar rutas principales

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/coleccion
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/nosotros
```

Todas deben responder 200.

---

## TAREA 7 — Verificar assets (logos)

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/assets/logo_full_color.png
```

Si responde 404 → los logos no se copiaron en el clone. Verificar:

```bash
ls "C:\Users\ASUS\Downloads\LuceBienWeb\public\assets\"
```

Si la carpeta está vacía o no existe, los logos se perdieron en el push
(puede pasar si estaban en .gitignore por error). Copiarlos manualmente:

```bash
xcopy "C:\Users\ASUS\Downloads\Lucebien\public\assets\*" "C:\Users\ASUS\Downloads\LuceBienWeb\public\assets\" /E /I /Y
```

Los logos originales están en el ERP en `C:\Users\ASUS\Downloads\Lucebien\public\assets\`.

---

## TAREA 8 — OPCIONAL: Importar BD del ERP desde pendrive

> Solo si tienes el pendrive con la BD de producción.
> Si no, salta esta tarea — el ERP ya tiene su propia BD local.

```bash
# Hacer backup de la BD actual antes de reemplazar
copy "C:\Users\ASUS\Downloads\Lucebien\database\lucebien.db" ^
     "C:\Users\ASUS\Downloads\Lucebien\database\backups\lucebien_pre_import_%date:~-4,4%%date:~-7,2%%date:~0,2%.db"

# Copiar la BD del pendrive (ajusta la letra del pendrive: D:, E:, F:)
copy "D:\lucebien.db" "C:\Users\ASUS\Downloads\Lucebien\database\lucebien.db"

# Reiniciar el ERP para que use la nueva BD
pm2 restart lucebien
```

---

## TAREA 9 — Estado final: todo corriendo

Verifica el estado completo:

```bash
pm2 list
curl http://localhost:7000/api/test
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
```

Estado esperado:
```
PM2: proceso "lucebien" → online
ERP:  http://localhost:7000 → {"ok":true}
Web:  http://localhost:3000 → 200 OK
```

---

## TAREA 10 — Configurar el dev server de la web en PM2 (opcional)

Si quieres que la web también sobreviva reinicios en modo dev:

```bash
cd "C:\Users\ASUS\Downloads\LuceBienWeb"
pm2 start npm --name lucebien-web -- run dev
pm2 save
pm2 list
```

Ahora ambos procesos quedan bajo PM2 y arrancan automáticamente.

---

## REPORTE FINAL

```
ESTADO
======
[ ] Repo clonado desde GitHub en C:\Users\ASUS\Downloads\LuceBienWeb\
[ ] npm install completado sin errores
[ ] .env.local creado con NEXT_PUBLIC_ERP_URL=http://localhost:7000
[ ] npm run build exitoso
[ ] Web corriendo en http://localhost:3000
[ ] Logos visibles (assets respondiendo 200)
[ ] ERP corriendo en http://localhost:7000
[ ] (opcional) BD de producción importada desde pendrive
[ ] (opcional) Web bajo PM2

URLs LOCALES:
  ERP interno:    http://localhost:7000
  Web e-commerce: http://localhost:3000

PENDIENTE:
[ describir cualquier problema encontrado ]
```
