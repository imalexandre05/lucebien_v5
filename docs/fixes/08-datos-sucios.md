# FIX #08 · Datos sucios y huérfanos

## Hallazgos

1. **`reporte_trabajadores.nombre = "Marylin"`** — empleado que no existe en `empleados`. Posible borrado o nombre tipeado libre.
2. **3 envíos huérfanos** en `envios_prendas` sin prendas asignadas.
3. **2 prendas activas en kanban** con código `PRUEBA-01` y `PRUEBA-02` en etapa `refacción` (visibles en producción).
4. **14 prendas `PRUEBA*` ya enviadas** (no estorban operativamente, pero ensucian historial).

## Reproducción

```bash
node -e "
const db = require('better-sqlite3')('./database/lucebien.db');
console.log('Marylin?:', db.prepare(\"SELECT * FROM reporte_trabajadores WHERE nombre='Marylin'\").all());
console.log('Envios huérfanos:', db.prepare('SELECT id FROM envios_prendas WHERE id NOT IN (SELECT DISTINCT envio_id FROM prendas WHERE envio_id IS NOT NULL)').all());
console.log('Prendas PRUEBA activas:', db.prepare(\"SELECT id, codigo, etapa FROM prendas WHERE codigo LIKE 'PRUEBA%' AND etapa != 'enviado'\").all());
console.log('Prendas PRUEBA enviadas:', db.prepare(\"SELECT COUNT(*) as n FROM prendas WHERE codigo LIKE 'PRUEBA%' AND etapa='enviado'\").get().n);
db.close();
"
```

## Fix sugerido

ANTES de cualquier cambio: backup BD.

```bash
copy database\lucebien.db database\backups\lucebien_pre_cleanup_2026-05-10.db
```

### Decisión 1: "Marylin"

- Opción A: si era un empleado que existió y se borró, decidir si re-crearlo o dejar el dato como histórico.
- Opción B: si fue un nombre tipeado por error, corregirlo:
  ```sql
  -- Si Marylin debería ser "Maritza" por ejemplo:
  UPDATE reporte_trabajadores SET nombre='Maritza' WHERE nombre='Marylin';
  ```
- Opción C: dejar como está, pero hacer que el FR-01 valide nombres contra la lista de empleados (fix UX en frontend).

**Pregunta al usuario antes de tocar.**

### Decisión 2: envíos huérfanos

```sql
-- Ver detalles primero
SELECT * FROM envios_prendas WHERE id NOT IN (SELECT DISTINCT envio_id FROM prendas WHERE envio_id IS NOT NULL);

-- Si son cancelaciones, marcarlos:
ALTER TABLE envios_prendas ADD COLUMN cancelado INTEGER DEFAULT 0;
UPDATE envios_prendas SET cancelado=1 WHERE id NOT IN (SELECT DISTINCT envio_id FROM prendas WHERE envio_id IS NOT NULL);

-- Y filtrarlos en /api/pipeline/envios
```

### Decisión 3: prendas PRUEBA activas

Las 2 PRUEBA en refacción ensucian el kanban operativo. Borrarlas:
```sql
DELETE FROM prenda_historial WHERE prenda_id IN (469, 470);
DELETE FROM prenda_calificacion WHERE prenda_id IN (469, 470);
DELETE FROM prendas WHERE id IN (469, 470);
```

Las 14 PRUEBA enviadas: dejar (son histórico).

## Validar

```bash
node -e "
const db = require('better-sqlite3')('./database/lucebien.db');
console.log('Quedan PRUEBA activas:', db.prepare(\"SELECT COUNT(*) as n FROM prendas WHERE codigo LIKE 'PRUEBA%' AND etapa != 'enviado'\").get().n);
db.close();
"
# Debe dar 0
```

## Reglas

- BACKUP de BD ANTES de cualquier DELETE.
- Confirmar con usuario antes de borrar (#1 especialmente — Marylin puede ser dato real).
- Commit: `chore(db): cleanup datos de prueba y huérfanos en pipeline`.
