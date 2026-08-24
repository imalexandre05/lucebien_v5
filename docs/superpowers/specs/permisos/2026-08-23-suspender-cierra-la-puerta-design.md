# SPEC — Suspender a alguien tiene que cerrarle la puerta

> **Qué es.** Hoy el botón «Suspender» de la ficha de una persona escribe dos columnas y nada más.
> El diálogo le promete al administrador que esa persona «deja de poder entrar al sistema». Es
> mentira: entra igual, con el mismo usuario y la misma contraseña.
>
> **Zona de rigor:** spec completa. Toca autenticación y aislamiento (no-negociable 3). Migración
> numerada y verificación contra la base antes de aplicar.
>
> **Estado:** escrita el 23-ago-2026 a partir de los hallazgos F01 y F13 de la auditoría, ambos
> confirmados contra la base viva por un agente verificador que reprodujo el acceso.

---

## 1. Lo que pasa hoy

`actualizarEstadoEmpleado()` (`apps/erp-web/lib/empleados-repo.ts:78-84`) hace exactamente esto:

```ts
.update({ activo, estado: activo ? 'activo' : 'suspendido' })
```

Y nadie más mira esa columna:

| Capa | Qué comprueba | ¿Mira `activo`? |
|---|---|---|
| `loginConUsuario` (`lib/auth.ts:45-62`) | nombre → cod → Supabase Auth | No |
| `getSesion` (`lib/auth.ts:74-113`) | `id, nombre, rol, rol_cod, sede_cod` | No la selecciona siquiera |
| `middleware.ts:65` | que exista un usuario de Auth | No |
| `private.app_es_admin()` | rol | No |
| `private.app_sedes()` | sede y tiendas | No |
| `private.app_ve_datos_personas()` | rol y permisos de módulo | No |

Y en Supabase Auth, `banned_until` está en null para los trece usuarios.

**Reproducido** (dentro de una transacción que se descartó): con `activo=false` y
`estado='suspendido'`, la persona suplantada siguió leyendo reportes y prendas, siguió viendo su
propia ficha, y `private.app_sedes()` siguió devolviéndole su sede.

## 2. Lo que eso significa un lunes cualquiera

Se despide a alguien. El administrador entra a su ficha y lo suspende; el diálogo le confirma que
la persona ya no puede entrar. Esa tarde, desde su celular, la persona entra con el mismo usuario:

- ve el pipeline y las solicitudes de sus sedes,
- **envía reportes de turno**, que generan puntos que alimentan la nota mensual de otros,
- se puntúa en Valores 360°,
- consulta su liquidación.

Si a quien se suspende es uno de los dos administradores, además sigue viendo el sueldo, el DNI y
la nota de las once personas.

## 3. El diseño: tres cerraduras, no una

Una sola comprobación en un solo lugar es lo que produjo este agujero. Se ponen tres, en capas
distintas, y cada una alcanza por sí sola.

### C-1 — La puerta de calle: banear al usuario en Supabase Auth

`actualizarEstadoEmpleado()` pasa a hacer las dos cosas: escribir las columnas **y** banear (o
des-banear) al usuario con la Admin API, que ya está importada en ese mismo archivo y ya se usa
para la contraseña (`establecerContrasenaEmpleado`, línea 92).

Si el baneo falla, **se revierte la escritura de las columnas**: dejar la ficha en «suspendido» con
el acceso vivo es peor que no haber hecho nada, porque el administrador se queda tranquilo.

### C-2 — La sesión que ya estaba abierta

Banear impide entrar de nuevo, pero no mata la sesión que ya tiene el navegador: ese token sigue
siendo válido hasta que expire. Por eso `getSesion()` pasa a seleccionar `activo` y a devolver
`null` cuando es `false`. Para la aplicación, una persona suspendida es igual que una sin sesión.

### C-3 — La base, por si alguien escribe la columna a mano

Los tres helpers de RLS —`private.app_es_admin()`, `private.app_sedes()` y
`private.app_ve_datos_personas()`— pasan a exigir `e.activo`. Es la cerradura que sigue puesta
aunque alguien cambie `activo` con un `update` directo sin pasar por la pantalla, y la que protege
las tablas aunque la aplicación tenga un bug.

`private.app_es_almacen()` queda igual: hoy no hay nadie con esos roles y esta spec no lo toca.

### C-4 — No se puede suspender al último administrador

Si se suspende al único administrador que queda activo, nadie puede volver a reactivarlo desde la
aplicación: la empresa se queda afuera de su propio sistema. `actualizarEstadoEmpleado()` cuenta
los administradores activos antes de suspender y se niega con un mensaje que lo explica.

## 4. Lo que NO cambia

- **No** se borra a nadie ni se toca su historial: sus reportes, sus puntos y sus liquidaciones
  siguen donde están. Suspender no es borrar.
- **No** cambia quién aparece en las listas: `listarColaboradores` ya filtra por `activo`.
- **No** se toca el login por código (`login()`), que hoy no se usa: `LOGIN_V2` está encendido.

## 5. Cómo se comprueba

`packages/db/pruebas/0083_suspender_cierra_puerta.prueba.sql`, con la forma de las demás:

| Caso | Esperado |
|---|---|
| Persona activa | `app_sedes()` devuelve sus sedes; lee sus reportes |
| Misma persona con `activo=false` | `app_sedes()` vacío; no lee nada |
| Administrador con `activo=false` | `app_es_admin()` falso |
| Administrador activo | `app_es_admin()` verdadero (no se rompió lo que funcionaba) |

Y del lado de la aplicación, a mano: suspender a la cuenta de prueba, intentar entrar, comprobar
que el login la rechaza.

## 6. Lo que queda anotado

- **La sede que se elige al entrar no se valida** (hallazgo F24): `fijarSedeActiva()` acepta
  cualquiera de las cuatro, aunque no sea de esa persona, y después la RLS la frena con un error de
  Postgres en inglés. No hay fuga —la base aguanta— pero el turno no se puede registrar y el
  mensaje no lo explica. Se arregla junto con esto porque vive en el mismo archivo.
