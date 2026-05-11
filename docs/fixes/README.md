# Prompts de fix · Auditoría 2026-05-10

Cada `.md` es un prompt autocontenido para meterlo en una sesión nueva
de Claude Code. Diseñados para que Claude pueda aplicar el fix sin
contexto adicional.

## 🟢 Estado actual: 12 / 13 prompts aplicados

Los prompts marcados ✅ ya fueron ejecutados el 2026-05-10. Se mantienen
en este folder como referencia histórica de qué cambió y cómo.

### Bloque urgente — ✅ APLICADO en commit `e35ae35`

1. ✅ [01-pagos-roto.md](01-pagos-roto.md) · 🔴 corregir queries con `empleados.sede`
2. ✅ [02-permisos-dashboard.md](02-permisos-dashboard.md) · 🔴 encargados solo ven SU sede (Opción C)
3. ✅ [03-empleados-fuga.md](03-empleados-fuga.md) · 🔴 sanitizeEmp filtra según rol
4. ✅ [04-pass-plain.md](04-pass-plain.md) · 🔴 18 filas con cod_plain/pass_plain vaciadas

### Bloque "antes del cierre" — ✅ APLICADO en commit `1ff13e2`

5. ✅ [06-asistencias-vacia.md](06-asistencias-vacia.md) · 🟠 helper reutilizable + cron + backfill (53 asistencias)
6. ✅ [05-login-mensaje.md](05-login-mensaje.md) · 🟠 mensaje específico para deshab/susp
7. ✅ [07-indices-fk.md](07-indices-fk.md) · 🟠 16 índices creados (más de los 6 sugeridos)

### Bloque saneamiento — ✅ APLICADO en commit `970e909`

8. ✅ [08-datos-sucios.md](08-datos-sucios.md) · 2 prendas PRUEBA borradas + 3 envíos cancelados (Marylin pendiente)
9. ✅ [09-roles-fantasma.md](09-roles-fantasma.md) · auxiliar/trabajador removidos de DEFAULT_PERMS y dropdowns
10. ✅ [10-modales-sin-close.md](10-modales-sin-close.md) · botón X agregado a confirmModal e incNuevaModal
11. ✅ [11-pages-sin-render.md](11-pages-sin-render.md) · hooks renderPagos y renderAsistDia en goTo()
12. ✅ [14-console-noise.md](14-console-noise.md) · 3 console.log más ruidosos silenciados
13. ✅ [16-delete-motivo.md](16-delete-motivo.md) · ya estaba aplicado (anularPago usaba prompt())

## Pendientes (decisiones del usuario, no técnicas)

- "Marylin" en reporte_trabajadores (#08 parcial)
- Tabla `horarios` legacy (#12)
- Features sin estrenar (#18: evaluaciones_mensuales, ventas_metas, etc.)
- Mensajes de error inconsistentes (#22, cosmético)

## Cómo usar cada prompt (si volviera a aplicar uno)

1. Abrir nueva sesión de Claude Code en `C:\Users\ASUS\Downloads\Lucebien`.
2. Pegar el contenido de un `.md` como mensaje.
3. Confirmar las decisiones que pide (algunos prompts tienen Opción A/B/C).
4. Dejar que Claude aplique el fix.
5. Commit + restart PM2 después de cada fix (o agrupar varios en un commit si están relacionados).
