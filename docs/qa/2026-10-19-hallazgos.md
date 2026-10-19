# Hallazgos de QA y rendimiento · auditoría 2 (19-oct-2026)

## Cómo se probó
No hay Docker, GoTrue ni PostgREST en la nube, así que la app Next **no corre completa**. Se levantó Postgres 16 local
(`tools/postgres-local.sh aplicar`, migraciones 0001→0176; fallan 4 por pg_cron/datos de producción, ya sabido) y se
simularon los roles como `authenticated` con `tools/qa/correr-flujos.sh`
(`tools/qa/flujos-por-rol.prueba.sql`, se descarta sola). Playwright (Chromium) solo pudo capturar `/login`
(`docs/qa/capturas-2026-10-19/`): el resto redirige a login sin sesión.

## Pasó (26 comprobaciones)
PIN propio; código de operador (PIN malo no da token, equipo no compartido rechazado, cuenta compartida no emite token);
avanzar sin código desde cuenta compartida rechazado; con código el punto queda a nombre de la persona; tanda, rechazar,
dividir, deshacer división, enviar con código; el token no sirve desde otra sesión; aislamiento de puntos entre sedes,
de sueldos/movimientos/evaluaciones, notificaciones por persona; `generar_alertas`, `pipeline_ranking_hoy`,
`est_productividad`, `mi_evaluacion_mensual` corren.

## Hallazgos (solo reporte; zona sueldo/RLS no se tocó)
1. **Reporte con cuenta compartida no usa código.** `reportes_crear` no recibe `p_operador`; desde una cuenta compartida el reporte
   queda con `encargado_id` = la cuenta («QA Cuenta Taller») y pasar otro encargado se rechaza (PERMISO). Los puntos/evaluación
   del turno irían a una cuenta, no a una persona. Cadena del sueldo: necesita spec.
2. **Misma sede ve puntos de compañeros.** `puntos_sel` deja leer `pipeline_puntos` de cualquier prenda de tu sede (una persona nueva
   leyó 8 filas ajenas). Entre sedes sí está aislado. Decidir si es intencional (para la otra sesión de seguridad).
3. **`listarPasadas()` traía toda `prenda_pasada` sin límite.** PostgREST corta en 1000 filas: el tablero habría perdido prendas en silencio.
   **Arreglado en este PR:** pagina de a 1000 y deja fuera las `recibido` de más de 7 días (estado final, no se dibujan); el total
   histórico de recibidas sale de `contarRecibidas()` (solo conteo) para `/pipeline/metricas`.
4. **Pruebas antiguas (0072–0105) ya corren sobre base vacía.** `tools/postgres-local.sh aplicar` siembra sedes AL/LB/ST/TR, 2 admins,
   10 personas (prefijo `SEED-`), un reporte y la tabla `schema_migrations`, y quita los jobs de auto-cierre (en producción están
   desprogramados). 0073/0078/0085 quedan **OMITIDA** (la 0093 retiró `sueldo_entrada(uuid)` a propósito); 0102 **OMITIDA** (audita datos
   reales de producción); 0114 apaga el trigger de último admin solo para armar el escenario; 0096 caso 4 se ajustó a la 0097
   (la entrada faltante ahora se estima). Quedan 3 con falla, que NO se tocaron por ser sueldo/seguridad: **0075 caso 19** (4 marcas
   08-11-13-18 dan 1 fila, no 2 tramos), **0082** (`valores_mis_puntajes('2099-01')` devuelve 0, lo reemplazó la 0119) y **0105**
   (`anon` conserva EXECUTE por PUBLIC en `private.app_es_admin()`; en local falta el grant explícito de Supabase, confirmar en producción).
5. **Build:** OK (6 min 51 s). Páginas más pesadas (First Load): `/pipeline` 208 kB (74 kB propios), `/reportes/nuevo` 157 kB,
   `/pedidos` 153 kB, `/contrato` 153 kB. Compartido 103 kB; middleware 91 kB. Nada alarmante.
6. **Sin N+1** en `estadoDelPeriodo` (colaboradores): una consulta por tabla con `in(ids)`. `movimientosRecientes` tiene `limit(2000)`.

## Arreglo propuesto: migración 0176
`0176_indices_rendimiento.sql` — 12 índices sobre columnas que se filtran o unen y no tenían índice
(`reporte_trabajadores`, `pipeline_puntos(pasada_id)`, `prenda_pasada(sede_origen_cod, etapa)` para RLS por sede, etc.).
Idempotente, aplicada dos veces en local sin error. Sin cambio de reglas.
