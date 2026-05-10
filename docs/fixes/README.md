# Prompts de fix · Auditoría 2026-05-10

Cada `.md` es un prompt autocontenido para meterlo en una sesión nueva
de Claude Code. Diseñados para que Claude pueda aplicar el fix sin
contexto adicional.

## Orden recomendado de aplicación

### Bloque urgente (1 sola sesión, ~1 hora)

1. [01-pagos-roto.md](01-pagos-roto.md) · 🔴 corregir queries con `empleados.sede`
2. [02-permisos-dashboard.md](02-permisos-dashboard.md) · 🔴 alinear `esSupervisor()` con `DEFAULT_PERMS`
3. [03-empleados-fuga.md](03-empleados-fuga.md) · 🔴 filtrar campos sensibles en `/api/empleados`
4. [04-pass-plain.md](04-pass-plain.md) · 🔴 vaciar `cod_plain`/`pass_plain`

### Bloque "antes del cierre del primer mes" (1 sesión)

5. [06-asistencias-vacia.md](06-asistencias-vacia.md) · 🟠 auto-asistencia desde manual + cron
6. [05-login-mensaje.md](05-login-mensaje.md) · 🟠 mensaje claro empleado deshab/susp
7. [07-indices-fk.md](07-indices-fk.md) · 🟠 índices en FKs grandes

### Bloque saneamiento (cuando haya tiempo)

8. [08-datos-sucios.md](08-datos-sucios.md) · 🟠 huérfanos + datos PRUEBA
9. [09-roles-fantasma.md](09-roles-fantasma.md) · 🟠 quitar roles muertos
10. [10-modales-sin-close.md](10-modales-sin-close.md) · 🟠 botón X en 2 modales
11. [11-pages-sin-render.md](11-pages-sin-render.md) · 🟠 inicializar pagos/asistencias en goTo
12. [14-console-noise.md](14-console-noise.md) · 🟡 reducir console.log
13. [16-delete-motivo.md](16-delete-motivo.md) · 🟡 UX al eliminar pago

## Cómo usar cada prompt

1. Abrir nueva sesión de Claude Code en `C:\Users\ASUS\Downloads\Lucebien`.
2. Pegar el contenido de un `.md` como mensaje.
3. Confirmar las decisiones que pide (algunos prompts tienen Opción A/B/C).
4. Dejar que Claude aplique el fix.
5. Commit + restart PM2 después de cada fix (o agrupar varios en un commit si están relacionados).
