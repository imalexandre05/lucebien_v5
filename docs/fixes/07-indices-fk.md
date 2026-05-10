# FIX #07 · Crear índices en columnas FK críticas

## Contexto

Tablas con columnas FK sin índice. La más crítica es
`reporte_actividades.reporte_id` con 1.679 filas — esa tabla la consulta
el dashboard por trabajador, mi-desempeño, evaluación mensual, ranking,
etc. Conforme crecen los reportes, la performance se degrada.

## Reproducción

```sql
EXPLAIN QUERY PLAN
SELECT cat, SUM(peso) as p FROM reporte_actividades
WHERE reporte_id IN ('29-04-26_M-ST', '28-04-26_T-ST') AND realizada=1
GROUP BY cat;
-- SCAN reporte_actividades  ← full scan, sin índice
```

## Fix sugerido

Crear los índices faltantes. Idempotente con `IF NOT EXISTS`. Ningún
riesgo, sin downtime.

```sql
CREATE INDEX IF NOT EXISTS idx_rep_act_repid     ON reporte_actividades(reporte_id);
CREATE INDEX IF NOT EXISTS idx_rep_trab_repid    ON reporte_trabajadores(reporte_id);
CREATE INDEX IF NOT EXISTS idx_rep_extras_repid  ON reporte_extras(reporte_id);
CREATE INDEX IF NOT EXISTS idx_lista_items_lid   ON lista_items(lista_id);
CREATE INDEX IF NOT EXISTS idx_envio_acc_items_eid ON envio_accesorios_items(envio_id);
CREATE INDEX IF NOT EXISTS idx_solic_items_sid   ON solicitud_items(solicitud_id);

-- Bonus: índices útiles para filtros frecuentes
CREATE INDEX IF NOT EXISTS idx_reportes_fecha    ON reportes(fecha);
CREATE INDEX IF NOT EXISTS idx_reportes_sede     ON reportes(sede);
CREATE INDEX IF NOT EXISTS idx_rep_trab_nombre   ON reporte_trabajadores(nombre);
CREATE INDEX IF NOT EXISTS idx_incidencias_fecha ON incidencias(fecha);
CREATE INDEX IF NOT EXISTS idx_incidencias_resp  ON incidencias(responsable);
```

Aplicar dentro de un script idempotente que se ejecute en boot:

```js
// database/seed-config.js o similar — agregar en ensureTables
function ensureIndexes(db) {
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_rep_act_repid ON reporte_actividades(reporte_id)',
    // ...
  ];
  indexes.forEach(sql => { try { db.exec(sql); } catch(e) {} });
}
```

## Validar

```bash
# 1. Aplicar
node -e "
const db=require('better-sqlite3')('./database/lucebien.db');
const sqls = [
  'CREATE INDEX IF NOT EXISTS idx_rep_act_repid ON reporte_actividades(reporte_id)',
  'CREATE INDEX IF NOT EXISTS idx_rep_trab_repid ON reporte_trabajadores(reporte_id)',
  // ... resto
];
sqls.forEach(s => { try { db.exec(s); console.log('OK:', s.slice(0,60)); } catch(e) { console.log('ERR:', e.message); }});
db.close();
"

# 2. Verificar EXPLAIN QUERY PLAN ahora usa índice
node -e "
const db=require('better-sqlite3')('./database/lucebien.db');
console.log(db.prepare('EXPLAIN QUERY PLAN SELECT * FROM reporte_actividades WHERE reporte_id=?').all('29-04-26_M-ST'));
db.close();
"
# Debe decir 'SEARCH ... USING INDEX idx_rep_act_repid'
```

## Reglas

- Solo índices, no tocar datos.
- BACKUP previo (cuesta 1 segundo).
- Sin downtime.
- Commit: `perf(db): índices en FKs de tablas hijas grandes`.
