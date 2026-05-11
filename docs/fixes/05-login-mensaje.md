# FIX #05 · Mensaje de login confunde empleado deshabilitado vs código mal

## Contexto

`routes/auth.js:54-57` (`/login-code`) y `routes/auth.js:23-25` (`/login`)
filtran por `WHERE activo=1`. Si el empleado está suspendido o
deshabilitado (`activo=0`), recibe el mismo mensaje que un código mal
escrito: "Código incorrecto".

Probado:
- Heidy (cod 2730, deshabilitado) → "Código incorrecto"
- Jazmín (cod 6285, suspendido) → "Código incorrecto"

## Fix sugerido

```js
// routes/auth.js — login-code
router.post('/login-code', (req, res) => {
  const { cod } = req.body || {};
  const sede = (req.body && req.body.sede) || 'AL';
  if (!cod) return res.status(400).json({ error: 'Código requerido' });
  const db = getDB();
  // Buscar SIN filtro activo, para distinguir
  const emp = db.prepare('SELECT * FROM empleados WHERE cod=?').get(cod);
  if (!emp) return res.status(401).json({ error: 'Código no encontrado' });
  const ok = bcrypt.compareSync(String(cod), emp.cod_hash);
  if (!ok) return res.status(401).json({ error: 'Código incorrecto' });
  // Ahora chequear estado y dar mensaje específico
  if (emp.activo !== 1) {
    const estado = (emp.estado || '').toLowerCase();
    if (estado === 'suspendido') return res.status(403).json({ error: 'Tu cuenta está suspendida. Contacta al administrador.' });
    if (estado === 'deshabilitado') return res.status(403).json({ error: 'Tu cuenta está deshabilitada. Contacta al administrador.' });
    return res.status(403).json({ error: 'Tu cuenta no está activa. Contacta al administrador.' });
  }
  // ... resto del flujo de tokens
});
```

Aplicar el mismo cambio en `/login` (por nombre+password).

## Validar

```bash
# Heidy deshabilitado
curl -s -X POST http://localhost:7000/api/auth/login-code \
  -H "Content-Type: application/json" -d '{"cod":"2730","sede":"AL"}'
# Esperar: 403 con "deshabilitada" en mensaje

# Jazmín suspendida
curl -s -X POST http://localhost:7000/api/auth/login-code \
  -H "Content-Type: application/json" -d '{"cod":"6285","sede":"LB"}'
# Esperar: 403 con "suspendida" en mensaje

# Alexander activo
curl -s -X POST http://localhost:7000/api/auth/login-code \
  -H "Content-Type: application/json" -d '{"cod":"8686","sede":"AL"}'
# Esperar: 200 con token
```

## Reglas

- Conservar el comportamiento de rechazo (no logear deshab/susp).
- Solo cambiar el MENSAJE, no la lógica.
- Commit: `fix(auth): mensaje claro para empleado suspendido/deshabilitado`.
