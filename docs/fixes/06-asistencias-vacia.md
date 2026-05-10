# FIX #06 · Tabla `asistencias` vacía pese a 96 reportes

## Contexto

La auto-asistencia se programó dentro de `POST /api/reportes` (manual)
para insertar filas en `asistencias` cada vez que se crea un reporte
con `encargado_id` y `b.trabajadores`. Pero:

- 96 reportes en BD
- 0 asistencias
- 54 reportes son `auto_enviado=1` (creados por cron sin encargado_id)
- Solo 6 reportes tienen `encargado_id` no nulo (creados ANTES de que
  se agregara la lógica de auto-asistencia → no la dispararon)

Resultado: ningún reporte ha generado asistencias nunca.

## Reproducción

```bash
node -e "
const db=require('better-sqlite3')('./database/lucebien.db');
console.log('Reportes:', db.prepare('SELECT COUNT(*) as n FROM reportes').get().n);
console.log('Asistencias:', db.prepare('SELECT COUNT(*) as n FROM asistencias').get().n);
console.log('Auto-enviados:', db.prepare('SELECT COUNT(*) as n FROM reportes WHERE auto_enviado=1').get().n);
console.log('Con encargado_id:', db.prepare('SELECT COUNT(*) as n FROM reportes WHERE encargado_id IS NOT NULL').get().n);
db.close();
"
```

## Causas probables

1. El cron `autoEnviarPendientes()` en `routes/reportes.js` crea reportes
   pero NO dispara el bloque de auto-asistencia (porque el bloque está
   en el handler manual, no compartido).
2. Los 6 reportes con `encargado_id` se crearon antes de la migración.
3. El draft puede no tener `encargado_id` poblado siempre.

## Fix sugerido

### Paso 1: extraer el bloque de auto-asistencia a una función reutilizable

```js
// routes/reportes.js
function generarAsistenciasDelReporte(db, reporte) {
  try {
    const insAsist = db.prepare(
      "INSERT OR IGNORE INTO asistencias " +
      "(emp_id, fecha, turno, hora_entrada, hora_salida, minutos_tardanza, fuente, obs) " +
      "VALUES (?,?,?,?,?,?,?,?)"
    );
    // Encargado del turno
    if (reporte.encargado_id) {
      insAsist.run(reporte.encargado_id, reporte.fecha, reporte.turno || 'M',
                   null, null, 0, 'reporte', 'auto: encargado del reporte ' + reporte.id);
    }
    // Trabajadores del reporte (lookup por nombre)
    const trabs = db.prepare('SELECT nombre FROM reporte_trabajadores WHERE reporte_id=?')
      .all(reporte.id);
    trabs.forEach(t => {
      const emp = db.prepare("SELECT id FROM empleados WHERE nombre=? AND activo=1 LIMIT 1").get(t.nombre);
      if (emp && emp.id) {
        insAsist.run(emp.id, reporte.fecha, reporte.turno || 'M',
                     null, null, 0, 'reporte', 'auto: trabajador del reporte ' + reporte.id);
      }
    });
  } catch (e) { console.warn('[reportes] auto-asistencia:', e.message); }
}
```

### Paso 2: invocarla desde POST manual y desde autoEnviarPendientes

```js
// En POST /api/reportes manual (después de insertar el reporte y trabajadores)
generarAsistenciasDelReporte(db, { id: b.id, fecha: fechaReal, turno: b.turno, encargado_id: b.encargado_id });

// En autoEnviarPendientes() (después del INSERT INTO reportes)
generarAsistenciasDelReporte(db, { id: idRep, fecha: hoy, turno: turno, encargado_id: encId });
```

### Paso 3: backfill de los reportes existentes (opcional)

```js
// Script único: scripts/backfill-asistencias.js
const db = require('better-sqlite3')('./database/lucebien.db');
const reps = db.prepare('SELECT id, fecha, turno, encargado_id FROM reportes WHERE encargado_id IS NOT NULL').all();
console.log('Procesando', reps.length, 'reportes con encargado_id...');
reps.forEach(r => generarAsistenciasDelReporte(db, r));
console.log('Asistencias creadas:', db.prepare('SELECT COUNT(*) as n FROM asistencias').get().n);
db.close();
```

## Validar

```bash
# Crear un reporte de prueba con encargado_id y verificar que se cree asistencia
TOKEN_ADMIN=$(curl -s -X POST http://localhost:7000/api/auth/login-code \
  -H "Content-Type: application/json" -d '{"cod":"8686","sede":"AL"}' | \
  node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).token))")

# Crear un reporte de prueba (id único de hoy)
HOY=$(date +%d-%m-%y)
curl -s -X POST -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" \
  -d "{\"id\":\"${HOY}_M-AL\",\"sede\":\"AL\",\"turno\":\"M\",\"encargado\":\"Alexander\",\"encargado_id\":\"E01\",\"trabajadores\":[\"Janet\"],\"actividades\":[]}" \
  http://localhost:7000/api/reportes

# Verificar asistencias
node -e "
const db=require('better-sqlite3')('./database/lucebien.db');
console.log(db.prepare('SELECT * FROM asistencias').all());
db.close();
"
# Debe mostrar 2 filas: E01 (Alexander) y E02 (Janet)
```

## Reglas

- BACKUP de BD antes del backfill.
- Probar el cron manualmente con `POST /api/reportes/auto-envio/run`.
- Commit: `fix(reportes): auto-asistencia dispara desde manual y cron`.
