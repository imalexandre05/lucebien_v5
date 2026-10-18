# Release 2026-10-18 — arreglos del verificador (spec corta)

Origen: revisión adversarial de la integración (PR #111). Decisión del responsable de release: RPC `security definer`, nunca un `getAdminClient` nuevo.

## 1. Responsable de la incidencia (0162)
Problema: `leerResponsableIncidencia` lee `empleados` bajo RLS; un encargado solo ve su fila, así que todo reporte con responsable ajeno se rechaza.
Regla:
- Nueva función `public.incidencia_responsable_valido(p_empleado uuid, p_sede text) returns boolean`, `security definer`, `set search_path`.
- Quien llama debe ser administrador o encargado/administrador con acceso a `p_sede` (`app_sedes()`); si no, lanza `PERMISO:`.
- Devuelve solo `true/false`: la persona existe, está activa y pertenece a `p_sede` (sede principal o `empleado_tiendas`). No devuelve ningún otro dato de la persona (aislamiento de datos de personas).
- `grant execute` solo a `authenticated`; sin `anon`.
- `leerResponsableIncidencia` pasa a usarla; `responsableValido` del catálogo se conserva como regla pura.

## 2. `sueldo_entrada` con una sola firma (0160)
Problema: la 0160 deja dos firmas `(uuid,date,date)` y `(uuid,date,date,boolean)`; la 0127 prohíbe sobrecargas. La 0160 aún no está en producción.
Regla: una sola función `sueldo_entrada(p_acuerdo, p_desde, p_hasta, p_permitir_pendientes boolean default false)`; se elimina el envoltorio de 3 argumentos. Las llamadas con 3 argumentos siguen siendo estrictas (default false). Prueba: exactamente una firma en `pg_proc`.

## 3. Texto de la advertencia del borrador
Los días pendientes cuentan 0 horas trabajadas. La advertencia no debe decir que el monto es «el máximo posible»: dice que el borrador cuenta esos días con 0 horas y que el monto real puede ser mayor.
