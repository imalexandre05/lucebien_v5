# FIX #04 · Eliminar `cod_plain` y `pass_plain` de la tabla `empleados`

## Contexto

La tabla `empleados` tiene 2 columnas que almacenan el código y la
contraseña EN PLANO: `cod_plain` y `pass_plain`. 18 de 18 empleados las
tienen pobladas. Combinado con #03 (cualquier usuario lista empleados),
es una escalada de privilegios trivial: un confeccionista puede leer la
contraseña de Alexander.

## Reproducción

```sql
SELECT id, cod, cod_plain, pass_plain FROM empleados WHERE rol='admin';
```

Devuelve cada admin con su código en plano.

## Fix sugerido (en 2 pasos seguros)

### Paso 1: dejar de DEVOLVER esos campos en el API

Aplicar PRIMERO el fix #03 (filtrar campos en `GET /api/empleados`).
Eso ya cierra la fuga inmediata aunque las columnas sigan en BD.

### Paso 2: vaciar las columnas (NO borrarlas todavía — riesgo bajo, beneficio alto)

```sql
-- Verificar que la auth NO depende de cod_plain ni pass_plain
-- (debe usar cod_hash y password_hash con bcrypt)
-- Lo confirmé en routes/auth.js:30,34,56 — usa bcrypt.compareSync
-- Es seguro vaciar las columnas

UPDATE empleados SET cod_plain = NULL, pass_plain = NULL;
```

Hacer **backup de la BD ANTES**:
```bash
copy database\lucebien.db database\backups\lucebien_pre_clear_plain_2026-05-10.db
```

### Paso 3 (opcional, futuro): borrar las columnas

```sql
-- SQLite no soporta DROP COLUMN nativo, hay que recrear la tabla.
-- Esto requiere downtime. Postergar hasta que sea estrictamente necesario.
```

## Validar

```bash
# 1. La auth debe seguir funcionando con bcrypt
curl -X POST http://localhost:7000/api/auth/login-code \
  -H "Content-Type: application/json" -d '{"cod":"8686","sede":"AL"}'
# Debe devolver token (no error)

# 2. La columna ya no debe tener valores
node -e "
const db=require('better-sqlite3')('./database/lucebien.db');
console.log('Con cod_plain:', db.prepare(\"SELECT COUNT(*) as n FROM empleados WHERE cod_plain IS NOT NULL\").get().n);
console.log('Con pass_plain:', db.prepare(\"SELECT COUNT(*) as n FROM empleados WHERE pass_plain IS NOT NULL\").get().n);
db.close();
"
# Esperar 0 y 0
```

## Reglas

- BACKUP de BD antes de cualquier UPDATE.
- Verificar que `routes/auth.js` NO use `cod_plain` ni `pass_plain` antes de vaciarlas (yo confirmé: usa cod_hash + password_hash).
- Aplicar el fix #03 PRIMERO (cierra la fuga aunque las columnas sigan).
- Commit: `chore(security): vaciar empleados.cod_plain y pass_plain`.
