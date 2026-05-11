# FIX #03 (+ #15) · `/api/empleados` expone campos sensibles a todos

## Contexto

`routes/empleados.js` línea 7 expone `GET /api/empleados` con auth pero
sin filtro de rol. Cualquier usuario logueado (incluyendo
`confeccionista`, `ventas_junior`) recibe lista completa con:
`dni, telefono, direccion, salario_base, fecha_ingreso, fecha_nacimiento,
contacto_emergencia, tipo_contrato, vencimiento_contrato, pass_plain, cod_plain`.

## Reproducción

```bash
TOKEN=$(node -e "
const jwt=require('jsonwebtoken');
console.log(jwt.sign(
  {id:'E11',cod:'4620',nombre:'Remy',rol:'confeccionista',
   tiendas:['AL'],sede:'AL'},
  'lucebien-secret-2026-xK9mP3qR',{expiresIn:'12h'}
));")

curl -H "Authorization: Bearer $TOKEN" http://localhost:7000/api/empleados | head -c 500
# Devuelve dni, telefono, salario_base, etc. de TODOS
```

## Fix sugerido

El endpoint debe:
1. Mantener el listado para que dropdowns del FR-01 funcionen
2. Filtrar campos según rol del solicitante

```js
router.get('/', auth, function(req, res) {
  try {
    const db = getDB();
    const isAdmin = req.user.rol === 'admin' || req.user.rol === 'dueno' || req.user.rol === 'dueño';

    // Campos públicos (visibles para cualquier usuario logueado)
    const publicFields = 'id, cod, nombre, iniciales, rol, activo, estado';

    // Admin ve todo
    const fields = isAdmin
      ? '*'
      : publicFields;

    const rows = db.prepare(`SELECT ${fields} FROM empleados ORDER BY nombre`).all();

    // Adjuntar tiendas (lista de sedes asignadas)
    rows.forEach(r => {
      r.tiendas = db.prepare('SELECT tienda FROM empleado_tiendas WHERE emp_id=?')
        .all(r.id).map(t => t.tienda);
    });

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

**NUNCA devolver `cod_plain`, `pass_plain`, `password_hash`, `cod_hash`** en NINGÚN caso (ni siquiera para admin — usar UI de gestión de empleados que ya tiene su propia query).

## Validar

```bash
# Como confeccionista
curl -H "Authorization: Bearer $TOKEN_REMY" http://localhost:7000/api/empleados | \
  node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
    const arr=JSON.parse(d);
    const e=arr[0];
    const sensibles=['dni','telefono','direccion','salario_base','pass_plain','cod_plain','password_hash'];
    sensibles.forEach(f=>{
      if(e[f]!==undefined)console.log('FUGA:',f,'=',e[f]);
    });
    console.log('OK si no hubo FUGA arriba');
  });"
```

## Reglas

- No romper el frontend que usa `e.nombre`, `e.id`, `e.tiendas`.
- Verificar que `populateIncResp` (admin.js:206) y otros que usan empleadosCache sigan funcionando.
- Commit: `fix(empleados): filtrar campos sensibles según rol`.
