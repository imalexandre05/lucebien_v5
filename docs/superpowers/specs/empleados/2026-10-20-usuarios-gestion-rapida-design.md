# SPEC — Gestión rápida de usuarios (Personal)

> Spec completa (auth + aislamiento) · sesión 10B · 20-oct-2026 · migración **0185**.
> Pedido del dueño: una tabla para cambios por lote del administrador.

## 1. Qué pide

Pantalla `/personal/usuarios`, solo administrador, tipo tabla, con una fila por persona:
- **Usuario** (el nombre con el que entra; solo lectura).
- **Código** personal (`empleados.cod`, 4 dígitos, el que se usa en pipeline y reportes, p. ej. 8686): asignar o cambiar.
- **Contraseña**: «Restablecer» genera una temporal y la muestra **una sola vez** para entregarla.
- **Estado** activo / suspendido, **sede** y **rol**.
- Selección múltiple, acciones sobre lo seleccionado y **«Guardar todo»**.

## 2. Qué hay hoy (verificado en el código)

- `empleados.cod` es único (`0001_init.sql:24`) y además es la credencial de Auth: el correo interno es
  `{cod}@lucebien.local` (`lib/auth.ts:179`). Hoy nunca se cambia (`empleados-repo.ts`, «inmutable por diseño»).
  La spec 0179 lo convirtió también en el código del operador.
- Contraseña temporal: `generarContrasenaTemporalEmpleado` (`empleados-repo.ts`, ya usa `getAdminClient`).
- Suspender/reactivar: `actualizarEstadoEmpleado` (bloquea Auth + RPC). Sede y rol: RPC `empleado_actualizar`.
- `empleados` ya tiene el trigger genérico de `audit_log` (actor = `auth.uid()`).

## 3. Qué cambia

**3.1 Cambiar el código** — RPC `empleado_codigo_cambiar(p_id, p_cod)`, `security definer`, guard de admin adentro:
valida `^[0-9]{4}$`, que no lo tenga otra persona, y actualiza `empleados.cod`; devuelve el código anterior.
El trigger deja en `audit_log` quién lo cambió, antes y después.
Como el código es también el correo de Auth, el servidor (`cambiarCodigoEmpleado`, en `empleados-repo.ts`)
cambia **también el correo** `{cod}@lucebien.local` con la Admin API (el mismo cliente admin que ya usa ese archivo:
**no se agrega un séptimo `getAdminClient`**). Si Auth falla, se revierte el código con la misma RPC y se informa.
Antes se revisa que ningún otro usuario de Auth tenga ya ese correo. Las sesiones abiertas siguen válidas
(se identifican por id, no por correo).

**3.2 Contraseña** — se reutiliza la temporal existente (generada en el servidor, nace con cambio obligatorio,
cierra sesiones). Se devuelve **una vez** a la pantalla y no se guarda ni se registra. Para la auditoría, RPC
`empleado_auditar_accion(p_id, p_accion)` (solo admin) deja una fila en `audit_log` («contraseña temporal
generada») sin ningún secreto.

**3.3 Estado, sede y rol** — se reutilizan `actualizarEstadoEmpleado` (no deja suspender al último admin) y
`actualizarEmpleado` (RPC existente, con sus validaciones y auditoría).

**3.4 Lote** — la acción recibe una lista de cambios y los aplica **uno por uno**; devuelve un resultado por persona
(ok / error con qué hacer). Un error en una fila no frena las demás. Cada fila se valida en el servidor otra vez
(código de 4 dígitos, duplicados dentro del mismo lote incluidos). Un intercambio de códigos entre dos personas
dentro del lote no es posible en un solo paso (el código es único): se informa y se resuelve en dos guardados.

## 4. Aislamiento y seguridad

Solo administrador (guard en la acción **y** en cada RPC). Nadie ve contraseñas: la temporal se muestra una vez y
se descarta del estado al cerrar el aviso. Los códigos no se leen de otro modo que hoy (la lista es de admin).
Sin nuevos `getAdminClient`.

## 5. Pruebas (`0185_usuarios_gestion_rapida.prueba.sql`)

1. Admin cambia el código → queda en `audit_log` con antes/después y el anterior se devuelve.
2. Un no-admin no puede. 3. Formato inválido (3 dígitos, letras) se rechaza. 4. Duplicado se rechaza.
5. `empleado_auditar_accion` deja fila sin secreto y solo la corre un admin; `anon` no ejecuta ninguna.
