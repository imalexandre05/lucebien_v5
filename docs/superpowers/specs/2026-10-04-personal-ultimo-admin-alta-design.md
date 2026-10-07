# Personal: último administrador, deshacer alta y límite de subida

**Ticket:** imalexandre05/lucebien-tablero, «Personal: alta, contratos, suspensión y documentos con
huecos». Sólo estos 3 ítems. Fuera de alcance: transacción de turnos, suspensión vs contrato,
grants por columna.
**Nivel de rigor:** spec completa (permisos / aislamiento + RPC de empleados).

## Verificado contra el código (regla 7)

| Ítem | Hallazgo |
|---|---|
| 1 | `empleado_actualizar` tiene una sola definición, la de `0050` (`0067` y `0104` sólo la mencionan en comentarios). Cambia `empleados.rol`/`rol_cod` sin ninguna comprobación de administradores: un admin puede quitarse el rol a sí mismo (el chequeo sólo puede saltar cuando `p_id = auth.uid()`, porque quien llama ya es admin activo) y dejar la empresa sin administrador. `empleado_borrar_alta` (0099 §3) y `actualizarEstadoEmpleado()` (suspender) sí la tienen. |
| 2 | `empleadoBorrarAlta()` (`empleados-repo.ts`) sólo llama a la RPC: el usuario de Auth queda vivo, con su email `{cod}@lucebien.local`. `crearEmpleado()` elige el código con `elegirCodigoLibre()` pasándole únicamente `empleados.cod`, así que un código cuyo empleado se borró pero cuyo usuario de Auth sigue vivo se puede volver a elegir y `createUser` falla por email duplicado. |
| 3 | El máximo real de un documento es 10 MB: `TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024` (`documentos-repo.ts`) y `file_size_limit = 10485760` del bucket `empleado-documentos` (`0105`). `next.config.mjs` no define `serverActions.bodySizeLimit`, y Next 14.2 usa 1 MB por defecto: la subida llega como `FormData` a `accionSubirDocumento` y se corta antes de llegar a la validación de 10 MB. |

## Cambios

### 1. `empleado_actualizar` rechaza dejar la empresa sin administrador activo
Migración nueva (la siguiente numerada, reservada con `tools/reservar-migracion.sh`), `create or
replace` de la misma firma (no se agrega sobrecarga; la prueba 0104 ya vigila que sea una sola).

Mismo criterio que 0099 §3: «el empleado es admin/dueño activo y no queda otro admin/dueño activo».
Aplicado al cambio de rol: tras calcular el rol efectivo (`v_rol`), si el empleado hoy es
`admin`/`dueno` activo, el nuevo rol **no** es `admin`/`dueno` y no existe otro `admin`/`dueno`
activo, se lanza excepción y no se escribe nada. Cambiar entre `admin` y `dueno` sí se permite
(sigue habiendo administrador). El mensaje sigue el de 0099, adaptado a la acción y sin voseo:
`No se puede quitar el rol de administrador al último administrador activo. Nombra a otro administrador antes de cambiar el rol de este.`
(Sin prefijo `ESTADO:`: `actualizarEmpleado` muestra `error.message` tal cual y la pantalla
no traduce prefijos. Un `select ... for update` sobre los admin activos serializa dos cambios
simultáneos.)

No cambia ningún parámetro de negocio ni se inventa regla nueva.

### 2. Deshacer alta borra también el usuario de Auth
- `empleadoBorrarAlta(id)` en `empleados-repo.ts` (ya usa `getAdminClient`; no se agrega a otro
  archivo): después de que la RPC borre la fila, llama `auth.admin.deleteUser(id)`.
- Si el borrado de Auth falla, la alta **ya está deshecha** (no se puede revertir): la función
  devuelve `{ avisoAuth }` con el mensaje y `accionBorrarAlta` lo expone; la pantalla
  (`deshacer-alta.tsx`) lo muestra al administrador en vez de silenciarlo. Un usuario de Auth que
  no existe («not found») no es fallo.
- `elegirCodigoLibre` (core) sigue sin consultar nada. Se agrega un helper puro
  `codigosDeEmails(emails, dominio)` que extrae los códigos de 4 dígitos de emails
  `{cod}@{dominio}`; `crearEmpleado()` lista los usuarios de Auth (paginado) y le pasa a
  `elegirCodigoLibre` la unión de `empleados.cod` y esos códigos.

### 3. `experimental.serverActions.bodySizeLimit`
`'11mb'`: los 10 MB del archivo (techo del bucket y de `TAMANO_MAXIMO_BYTES`) más el sobre
multipart del `FormData`. Quedar justo en 10 MB rechazaría archivos válidos cercanos al máximo.

**Riesgo abierto (no resuelto aquí).** La documentación del repo (`docs/auditoria-2026-07-02.md`)
dice que producción corre en Vercel, que corta los pedidos a funciones en 4,5 MB antes de llegar a
Next. Con `11mb` Next ya no es el freno, pero entre ~4,5 y 10 MB la subida puede seguir fallando
en producción. Salidas: subida directa a Storage con URL firmada, o bajar el máximo (regla de
negocio: confirmar con Alexander). Queda anotado en el PR; no se verificó contra el despliegue.

## Pruebas (antes del código)
- SQL `packages/db/pruebas/<n>_personal_ultimo_admin.prueba.sql`: (a) el último admin no puede
  pasar a un rol no admin; (b) con otro admin activo sí puede; (c) admin → dueño del último admin
  sí; (d) un no-admin no accede; (e) un empleado no admin se edita igual; (f) sigue habiendo una
  sola firma.
- Vitest `packages/core/src/empleados.test.ts`: `codigosDeEmails` y que `elegirCodigoLibre` evite
  códigos que vienen sólo de Auth.

## Fuera de esta spec / pendientes
Ningún default de negocio inventado. Nada se aplica a ninguna base desde esta rama: la migración
se aplica a `scilb` después de la revisión.

## Enmienda del 06-oct-2026

Nace de las auditorías del 06-oct (H-12 / seguridad H11 y seguridad H7). Corrige dos puntos de
arriba: el §3 («`11mb`», con el riesgo de Vercel «abierto») y el §1 (el guard del último admin
sólo en la RPC).

### (a) Tope de subida de 4 MB por archivo
- `TAMANO_MAXIMO_BYTES = 4 * 1024 * 1024` (antes 10 MB). Queda por debajo de los 4,5 MB que Vercel
  admite en el cuerpo de una función, **incluido** el sobre multipart del `FormData`.
- Se valida en dos sitios, con el mismo mensaje: en el navegador antes de enviar (sin llamar al
  servidor) y en el servidor (`subirDocumento`, que es lo que ejecuta la server action). Mensaje:
  «El archivo pesa X MB; el máximo es 4 MB. Reduce la foto o súbelo como PDF.» (X con un decimal).
- La llamada a la action del cliente va dentro de `try/catch`: si Vercel o Next cortan el cuerpo
  antes de llegar a la validación, la pantalla muestra un error legible y no una excepción cruda.
- `serverActions.bodySizeLimit` baja de `'11mb'` a `'5mb'` (los 4 MB más margen para el sobre).
- La pantalla muestra «Máximo 4 MB» junto al selector de archivo.
- Es un tope provisional hasta tener subida directa a Storage con URL firmada. El `file_size_limit`
  del bucket (0105, 10 MB) no se toca: sigue siendo el techo de esa futura vía directa.
- El 4 MB es un default inventado por restricción de plataforma, no una regla de negocio: se anota
  en `docs/pendientes-negocio.md`.

### (b) El guard del último admin pasa a un trigger
El guard vive sólo en la RPC `empleado_actualizar` (0114); un `update empleados set rol=...` o
`activo=false` directo por PostgREST (policy `emp_admin_write`, FOR ALL, 0002) deja 0 admins.
- Migración `0125_ultimo_admin_trigger.sql`: trigger `before update or delete` en `empleados`
  (por fila). Rechaza la operación si, tras ella, no quedaría ningún empleado con
  `activo = true` y `rol in ('admin','dueno')`. Cubre cambio de rol, desactivar (`activo=false`),
  cambio de `estado` (que se mantiene sincronizado con `activo`) y `delete`.
- Sólo actúa cuando la fila afectada era admin activo y deja de serlo; el resto de ediciones no
  pasan por la comprobación.
- Mensaje: `ULTIMO_ADMIN: …`.
- Concurrencia: toma `pg_advisory_xact_lock` antes de contar, para que dos degradaciones
  simultáneas de dos admins no dejen 0 (cada una vería al otro todavía activo).
- La función vive en el schema `private`, `security definer`, `search_path = public`, sin
  `execute` para public/anon/authenticated: la comprobación cuenta todos los admins aunque la RLS
  del que ejecuta no los deje ver.
- Los guards de `empleado_actualizar` (0114), `empleado_borrar_alta` (0099) y
  `actualizarEstadoEmpleado` se conservan: dan el mensaje amistoso; el trigger es la red de
  seguridad.
- Prueba: `packages/db/pruebas/0125_ultimo_admin_trigger.prueba.sql`, escrita antes de la
  migración.
