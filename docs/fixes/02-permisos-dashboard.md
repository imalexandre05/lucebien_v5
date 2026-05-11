# FIX #02 · Encargados pueden llamar `/api/dashboard/admin` y `/empleado`

## Contexto

`routes/dashboard.js` línea 21-25 define `esSupervisor()` que considera
supervisores a `admin`, `dueno`, `dueño`, `encargado_almacen` y
`encargado_tienda`. Eso permite que cualquier encargado consulte el
dashboard administrativo completo y el dashboard personal de cualquier
trabajador.

El frontend `public/js/app.js:1684` define `DEFAULT_PERMS` que NO da
acceso a 'dashboard' a esos roles. Inconsistencia frontend ↔ backend.

## Reproducción

```bash
# JWT manual de Janet (encargado_tienda)
TOKEN=$(node -e "
const jwt=require('jsonwebtoken');
console.log(jwt.sign(
  {id:'E02',cod:'9247',nombre:'Janet',rol:'encargado_tienda',
   tiendas:['LB','ST','TR'],sede:'ST'},
  'lucebien-secret-2026-xK9mP3qR',{expiresIn:'12h'}
));")

curl -H "Authorization: Bearer $TOKEN" http://localhost:7000/api/dashboard/admin
# 200 — devuelve KPIs gerenciales completos

curl -H "Authorization: Bearer $TOKEN" "http://localhost:7000/api/dashboard/empleado?emp_id=E04"
# 200 — devuelve dashboard de Cesar (no es Janet)
```

## Fix sugerido

Decidir UNA de estas estrategias (preguntar al usuario si no está claro):

### Opción A — restringir backend al frontend (más estricta)

```js
// routes/dashboard.js
function esSupervisor(u) {
  if (!u) return false;
  const r = (u.rol || '').toLowerCase();
  return r === 'admin' || r === 'dueno' || r === 'dueño';
}
```

Pros: alinea con DEFAULT_PERMS. Contras: si el día de mañana un
encargado quiere ver el dashboard general, no puede.

### Opción B — actualizar DEFAULT_PERMS para que incluya 'dashboard'

```js
// public/js/app.js:1686
encargado_tienda:   ['reporte','evaluacion',...,'dashboard'],
encargado_almacen:  ['reporte','evaluacion',...,'dashboard'],
```

Pros: explicito. Contras: encargados verán métricas de OTRAS sedes.

### Opción C — backend respeta sede del usuario

`/dashboard/admin?sede=X` → si el usuario es encargado_X, fuerza el filtro
a su sede. Solo admin/dueno puede pasar otra sede o ver sin filtro.

`/dashboard/empleado?emp_id=Y` → si el usuario es encargado, solo puede
ver empleados de su misma sede; si es admin/dueno, cualquiera.

Más complejo pero más correcto.

## Validar

```bash
# Como Janet (encargado_tienda)
curl -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_JANET" \
  http://localhost:7000/api/dashboard/admin
# Esperar: 403 (Opción A) o 200 con sede=ST (Opción C)

# Como Alexander (admin) sigue funcionando
curl -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN_ADMIN" \
  http://localhost:7000/api/dashboard/admin
# 200
```

## Reglas

- NO romper acceso del admin/dueño.
- Si vas a actualizar DEFAULT_PERMS, también revisar `applyPermissions()` en app.js.
- Commit: `fix(dashboard): permisos coherentes frontend ↔ backend`.
