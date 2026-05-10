# FIX #01 · `/api/pagos` y `/api/valores/seguimiento` revientan con 500

## Contexto

Sistema LuceBien (Node.js + Express + better-sqlite3). El módulo de Pagos
no funciona porque las queries usan una columna `empleados.sede` que NO
existe — las sedes están en otra tabla `empleado_tiendas` (relación N:M).
Mismo problema afecta `routes/valores.js`.

## Reproducción

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:7000/api/pagos
# {"error":"no such column: e.sede"}

curl -H "Authorization: Bearer $TOKEN" "http://localhost:7000/api/pagos/sugerir?emp_id=E02&mes=2026-05"
# {"error":"no such column: sede"}

curl -H "Authorization: Bearer $TOKEN" http://localhost:7000/api/valores/seguimiento/2026-05
# {"error":"no such column: sede"}
```

## Schema real

```
empleados: id, cod, nombre, iniciales, rol, activo, cod_hash, estado,
           nombre_completo, password_hash, dni, telefono, direccion,
           fecha_nacimiento, fecha_ingreso, contacto_emergencia,
           tel_emergencia, notas, salario_base, tipo_jornada,
           pass_plain, cod_plain, tipo_contrato, vencimiento_contrato

empleado_tiendas: emp_id, tienda
```

NO hay columna `sede`. Las sedes son rows en `empleado_tiendas` con la
columna `tienda` (valores: AL, LB, ST, TR).

## Ubicaciones a corregir

`routes/pagos.js`:
- Línea 78: `SELECT p.*, e.nombre as emp_nombre, e.sede as emp_sede, e.rol as emp_rol`
- Línea 84: `if (req.query.sede) { sql += ' AND e.sede=?'; params.push(req.query.sede); }`
- Línea 102: `SELECT id, nombre, salario_base, sede, rol FROM empleados WHERE id=?`
- Línea 129: `empleado: { id: emp.id, nombre: emp.nombre, sede: emp.sede, ...}`
- Línea 147: `SELECT p.*, e.nombre as emp_nombre, e.sede as emp_sede, e.rol as emp_rol, e.dni as emp_dni FROM pagos p LEFT JOIN empleados e ON e.id=p.emp_id WHERE p.id=?`
- Línea 221: query similar de comprobante
- Línea 277: `<div class="row"><span class="lbl">Sede</span><span class="val">${p.emp_sede || '—'}</span></div>`

`routes/valores.js`:
- Línea 141: `SELECT id, nombre, iniciales, rol, sede, fecha_ingreso FROM empleados WHERE activo=1 ORDER BY nombre`
- Línea 173: `sede: emp.sede,`

## Fix sugerido

Para cada query, reemplazar la mención a `e.sede` o `empleados.sede` por
una concatenación de tiendas desde `empleado_tiendas`:

```sql
-- Antes
SELECT e.sede as emp_sede FROM empleados e WHERE ...

-- Después
SELECT (
  SELECT GROUP_CONCAT(tienda, ',') FROM empleado_tiendas WHERE emp_id = e.id
) as emp_sede
FROM empleados e WHERE ...
```

O mejor aún, hacer un helper:

```js
function sedesDe(db, empId) {
  return db.prepare('SELECT tienda FROM empleado_tiendas WHERE emp_id=?')
    .all(empId).map(r => r.tienda).join(',');
}
```

y llamarlo en cada handler tras obtener el empleado.

## Validar el fix

```bash
# Login admin
LOGIN=$(curl -s -X POST http://localhost:7000/api/auth/login-code \
  -H "Content-Type: application/json" -d '{"cod":"8686","sede":"AL"}')
TOKEN=$(echo "$LOGIN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).token))")

# Probar todos los endpoints — esperar 200 (no 500)
for ep in /api/pagos /api/pagos/sugerir?emp_id=E02&mes=2026-05 /api/valores/seguimiento/2026-05; do
  curl -s -o /dev/null -w "%{http_code} $ep\n" -H "Authorization: Bearer $TOKEN" "http://localhost:7000$ep"
done

# Restart PM2
pm2 restart lucebien
```

## Reglas

- No tocar la BD destructivamente. NO hacer migraciones que copien `empleado_tiendas` a una nueva columna `sede`.
- Solo cambiar las queries.
- Mantener el shape de respuesta (campo `emp_sede` o `sede` sigue existiendo, solo se calcula desde otra tabla).
- Wrap en try/catch como el resto del código.
- Después de fix, restart PM2 y verificar.
- Commit con mensaje: `fix(pagos+valores): empleado.sede → empleado_tiendas (schema correcto)`.
