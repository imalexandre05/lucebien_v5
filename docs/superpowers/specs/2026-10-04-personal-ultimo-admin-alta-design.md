# Personal: último administrador, deshacer alta y límite de subida

**Ticket:** imalexandre05/lucebien-tablero, «Personal: alta, contratos, suspensión y documentos con
huecos». Sólo estos 3 ítems. Fuera de alcance: transacción de turnos, suspensión vs contrato,
grants por columna.
**Nivel de rigor:** spec completa (permisos / aislamiento + RPC de empleados).

## Verificado contra el código (regla 7)

| Ítem | Hallazgo |
|---|---|
| 1 | `empleado_actualizar` tiene una sola definición, la de `0050` (`0067` y `0104` sólo la mencionan en comentarios). Cambia `empleados.rol`/`rol_cod` sin ninguna comprobación de administradores: un admin puede degradarse a sí mismo o al último y dejar la empresa sin administrador. `empleado_borrar_alta` (0099 §3) y `actualizarEstadoEmpleado()` (suspender) sí la tienen. |
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
(prefijo `ESTADO:` como en 0099; el resto de la RPC no usa prefijos, se conserva el de 0099 porque
es el que el repo ya traduce.)

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
