# Login seguro: usuario + contraseña propia, cambio obligatorio y límite de intentos

**Fecha:** 6-oct-2026 · **Nivel:** spec completa (autenticación / aislamiento) · **Origen:** hallazgos
H0 y H3 de `docs/auditorias/2026-10-06-seguridad.md` (rama `audit/2026-10-06-seguridad`) ·
**Decisión del dueño:** «usuario + contraseña» · **Migración:** `0123_login_seguro.sql`

---

## 1. Estado real, verificado contra el código (no contra la auditoría)

La auditoría señala `apps/erp-web/lib/auth.ts:58-62` (`login()`: `password: cod`). Leído el código:

- `LOGIN_V2` está **encendido** desde el 25-jul-2026 (`packages/adapter-lucebien/src/features.ts:7`).
  La pantalla de login pide **usuario (nombre) + contraseña** y llama a `loginConUsuario()`. La
  función `login()` con el código como contraseña es una rama muerta: sólo se usaría si alguien
  apagara el flag. Igual es una trampa —un `false` la revive— y se elimina.
- **El agujero real sigue abierto por otro lado.** La contraseña de cada persona en Supabase Auth es
  una copia del `password_hash` del sistema viejo (migración `0049`). En el sistema viejo esa
  contraseña se asignaba a mano, con mínimo de 4 caracteres, y existió en texto plano
  (`pass_plain`, ver comentario de `0001`/`0049`). No hay forma de saber desde el código cuántas
  son iguales al código de 4 dígitos: se mide con la consulta de §8 (sólo lectura).
- No hay **límite de intentos** propio, ni **cambio obligatorio**, ni **reglas mínimas** (el admin
  puede asignar «1234»: `accionEstablecerContrasena` sólo exige 4 caracteres).
- **Límite que esta spec no puede cerrar desde la app:** la clave anónima de Supabase está en el
  navegador, así que cualquiera puede llamar a GoTrue (`/auth/v1/token`) directamente con
  `{cod}@lucebien.local` y saltarse cualquier contador de la app. Lo único que frena eso es (a) que
  la contraseña sea larga —8 caracteres— y (b) el rate limit de Auth del proyecto, que el dueño
  revisa en el panel (§8, paso 7). Por eso **las reglas de contraseña son la defensa principal y el
  límite de intentos es la segunda**.

## 2. Qué cambia para la persona

1. Entra con **su nombre** (como hoy) y **su contraseña**. El código de 4 dígitos ya no sirve para
   entrar al ERP; sigue siendo su PIN interno de atribución (pipeline), que es otro tema (H2).
2. Si su cuenta está marcada para cambio, después de entrar la app la lleva a
   **`/cambiar-contrasena`** y no la deja ir a ninguna otra pantalla hasta cambiarla. Pide:
   contraseña actual (la que acaba de usar), nueva y repetir nueva.
3. Si se equivoca 5 veces seguidas, la cuenta queda **bloqueada 15 minutos**. El mensaje lo dice y
   dice qué hacer.
4. Si la olvidó o quedó bloqueada: el administrador le genera una **contraseña temporal** desde su
   ficha (`/personal/[id]/datos`) y se la entrega en persona. Con esa entra y la cambia.

## 3. Cómo entra cada una de las ~18 personas el primer día sin quedar bloqueada

- La migración `0123` marca a **todas** las cuentas con `debe_cambiar_contrasena = true` (en
  `auth.users.raw_app_meta_data`, sólo si la clave no existe: reaplicarla no vuelve a forzar a
  quien ya cambió). **No toca ninguna contraseña.** Quien sepa su contraseña actual entra con ella y
  se la obliga a cambiarla.
- Quien no la sepa, quien no tenga contraseña (3 cuentas inactivas, según `0049`) o quien aparezca
  en la consulta de «contraseña = código» (§8, paso 3) recibe una **contraseña temporal** que el
  admin genera ese día. Esa también obliga a cambiarla al entrar.
- **El admin no puede quedar afuera:** su contraseña actual sigue valiendo; la cambia al primer
  ingreso como todos. Si la olvidara, el correo de recuperación de Supabase no sirve (los correos
  son `@lucebien.local`); se cambia desde el panel de Supabase (§8, último párrafo).
- Las contraseñas temporales no se mandan por WhatsApp ni se dejan escritas en la tienda: papel en
  mano, y se descarta cuando la persona ya cambió la suya.

## 4. Reglas de contraseña (core puro, `packages/core/src/auth.ts`)

`validarContrasenaNueva(nueva, { minimo, cod, nombre, actual })` devuelve la lista de problemas,
cada uno redactado como instrucción:

| Regla | Mensaje |
|---|---|
| Largo ≥ `minimo` (default **8**) | «Usa al menos 8 caracteres.» |
| Largo ≤ 72 (límite de bcrypt; más se trunca en silencio) | «Usa como máximo 72 caracteres.» |
| No contiene el código de 4 dígitos de la persona | «No uses tu código de 4 dígitos dentro de la contraseña.» |
| No es igual al nombre (sin mayúsculas ni espacios) | «No uses tu nombre como contraseña.» |
| No es un solo carácter repetido («aaaaaaaa», «11111111») | «No repitas el mismo carácter: mezcla letras y números.» |
| Distinta de la actual | «La nueva contraseña tiene que ser distinta de la actual.» |

**Sin reglas de composición** (mayúscula + símbolo obligatorios): para 18 personas que entran desde
una PC compartida y un celular, una frase larga es más segura y más fácil que «P@ssw0rd!». Esto es
una decisión de producto tomada aquí, anotada en `docs/pendientes-negocio.md`.

## 5. Límite de intentos y bloqueo temporal

- Parámetros **editables** en `/configuracion` → sección «Acceso» (catálogo en
  `config-catalogo.ts`, fila sembrada en `0123` con comentario de default provisional):
  - `acceso_contrasena_min` = **8** (rango 6–72)
  - `acceso_intentos_max` = **5** (rango 3–20)
  - `acceso_bloqueo_min` = **15** minutos (rango 1–1440)
  Un valor ilegible o fuera de rango cae al default (`leerReglasAcceso()` en el core); nunca tumba
  el login.
- Estado en la tabla nueva **`login_intentos`** (`empleado_id` PK, `fallidos`, `bloqueado_hasta`,
  `actualizado`). RLS activada **sin ninguna policy** y `revoke all` a `anon`/`authenticated`: sólo
  la escribe y la lee el servidor con la clave de servicio. Nadie puede ver ni borrar su propio
  contador por la API.
- Lógica pura en el core, con la hora inyectada (no-negociable 4: el core no llama `new Date()`):
  - `estadoBloqueo(estado, ahora)` → `{ bloqueado, minutosRestantes }`.
  - `registrarFallo(estado, ahora, reglas)` → suma 1; al llegar a `intentosMax` fija
    `bloqueadoHasta = ahora + bloqueoMin` y deja `fallidos` en 0. Un bloqueo vencido arranca de cero.
- Flujo de `loginConUsuario()`:
  1. Busca a la persona por nombre. Si no existe → «Usuario o contraseña incorrectos» (no cuenta
     intentos: no hay cuenta que proteger).
  2. Si está bloqueada → **no consulta la contraseña** (ni la correcta entra) y responde con el
     mensaje de bloqueo y los minutos que faltan.
  3. Intenta la contraseña. Si falla → registra el fallo; si con ese fallo se bloquea, el mensaje ya
     es el de bloqueo.
  4. Si acierta → borra el contador.
- Si `login_intentos` no existe todavía (código desplegado antes que la migración) el contador
  falla abierto: se loguea el error y el login sigue funcionando como hoy. Nunca brickea el acceso.
- **Costo aceptado:** quien conozca el nombre de otra persona puede bloquearla 15 minutos tecleando
  mal a propósito. Con 18 personas que se conocen, es un riesgo menor que la fuerza bruta; el admin
  lo resuelve con «Generar contraseña temporal», que también desbloquea.
- **No se distingue** «usuario no existe» de «contraseña incorrecta». El mensaje de bloqueo sí revela
  que el nombre existe: en una empresa de 18 personas los nombres no son secreto.

## 6. Restablecer (admin)

- En la ficha de la persona, «Asignar / reiniciar contraseña» se reemplaza por **«Generar contraseña
  temporal»**: el servidor genera `generarContrasenaTemporal()` (core, con la fuente aleatoria
  inyectada: `crypto.getRandomValues` en el servidor) — 8 caracteres de un alfabeto sin ambiguos
  (sin `0/o/1/l/i`) en dos grupos, `xxxx-xxxx`, ≈ 40 bits — y en una sola llamada a la Admin API
  fija la contraseña y `debe_cambiar_contrasena = true`; después borra su fila de `login_intentos`.
- La pantalla la muestra **una sola vez** con la instrucción «Entrégala en persona. Al entrar, el
  sistema le pedirá cambiarla.» No se guarda en ningún lado ni se loguea.
- Sólo `admin`/`dueno` (`exigirAdmin()`, como hoy).
- Alta de personal (`/personal/nuevo`): la contraseña inicial que escribe el admin pasa a exigir el
  mínimo configurado y la cuenta nace con `debe_cambiar_contrasena = true`.

## 7. Cambio obligatorio

- La marca vive en `app_metadata` de Supabase Auth: **sólo la escribe la clave de servicio** (un
  empleado no puede quitársela por la API) y `auth.getUser()`, que el middleware ya llama en cada
  request, la trae sin consulta extra.
- `middleware.ts`: con sesión y `app_metadata.debe_cambiar_contrasena === true`, toda ruta que no
  sea `/cambiar-contrasena` redirige ahí (también las server actions de otras páginas, porque
  pasan por el middleware).
- `cambiarMiContrasena(actual, nueva, repetir)` en `lib/auth.ts`: exige sesión, verifica `actual`
  (cuenta como intento de login: mismo contador), valida `nueva` con las reglas, y en **una** llamada
  a la Admin API fija la contraseña y `debe_cambiar_contrasena = false`. El usuario sólo puede
  cambiar la suya: el id sale de `auth.getUser()`, nunca del formulario.
- La misma pantalla queda disponible desde el menú de usuario para cambiarla cuando quiera.

## 8. Pasos del dueño el día del cambio (en este orden)

1. **Backup** de la base de producción (Supabase → Database → Backups).
2. Desplegar el ERP con este cambio. Sin la migración el comportamiento es el de hoy (fail-open).
3. Diagnóstico, **sólo lectura** (SQL editor): cuántas contraseñas son el código —
   `select e.nombre from empleados e join auth.users u on u.id = e.id
    where u.encrypted_password = extensions.crypt(e.cod, u.encrypted_password);`
4. Aplicar `0123_login_seguro.sql`. Desde ese momento todos deben cambiar su contraseña al entrar.
5. El admin entra primero y cambia la suya.
6. En `/personal`, para cada persona de la lista del paso 3, cada inactiva que vaya a volver y cada
   una que no recuerde su contraseña: «Generar contraseña temporal», anotarla en papel y entregarla
   en persona. El resto entra con la suya de siempre y la cambia.
7. Panel de Supabase → Authentication → **Rate Limits**: confirmar el límite de inicios de sesión
   por IP (dejarlo en el valor por defecto o más bajo, nunca subirlo).
8. Al día siguiente, repetir la consulta del paso 3 con
   `select e.nombre from empleados e join auth.users u on u.id = e.id
    where coalesce(u.raw_app_meta_data->>'debe_cambiar_contrasena','false') = 'true';`
   para ver quién no cambió todavía.

Si el admin olvidara su contraseña: Supabase → Authentication → Users → la cuenta
`{cod}@lucebien.local` → «Update user» → nueva contraseña. Es el único camino fuera de la app.

## 9. Sistema viejo (H3) — commit separado, autorizado por el dueño sólo para esto

`routes/auth.js` `POST /api/auth/login-code` recibe un limitador en memoria, sin dependencias nuevas:

- **Por IP:** 5 fallos en 15 min → esa IP no puede intentar por 15 min.
- **Global:** 30 fallos en 24 h (todas las IP) → `/login-code` se pausa para todos hasta que la
  ventana baje. Es lo que frena a un atacante que reparte intentos entre muchas IP o códigos.
- Respuesta `429` con «Demasiados intentos con código. Espera N minutos o entra con usuario y
  contraseña.» El ingreso por nombre + contraseña (`/login`) no se toca.
- Un acierto no borra los fallos de la ventana global (si no, un empleado legítimo «resetearía» el
  límite de un atacante).
- **Riesgo residual, dicho con números:** con un código de 4 dígitos y ~18 códigos activos, 30
  intentos por día dan ≈ 5 % de acertar alguno por día y ≈ 80 % en un mes de ataque sostenido. El
  límite compra tiempo y hace visible el ataque (cada pausa global se loguea); no lo cierra. Lo que
  lo cierra es retirar `/login-code` cuando el kanban viejo deje de usarse. Anotado en pendientes.
- En memoria: reiniciar el servidor borra los contadores. Aceptado por no agregar dependencias ni
  tablas a un sistema congelado.

## 10. Fuera de alcance

H2 (PIN del pipeline = código), el login del sistema viejo por nombre (`/login`), correo real para
recuperación, 2FA, y la sincronización de contraseñas entre ERP y sistema viejo (divergen desde el
primer cambio; el sistema viejo conserva la suya).

## 11. Archivos y `getAdminClient()`

Ningún archivo nuevo usa `getAdminClient()`. Todo el acceso con clave de servicio queda en dos
archivos que ya están en la lista permitida: `lib/auth.ts` (contador de intentos y cambio de
contraseña: corren antes de que exista sesión o sobre la propia cuenta, y `login_intentos` no tiene
policies a propósito) y `lib/empleados-repo.ts` (contraseña temporal, alta).

## 12. Tests

- `packages/core/src/auth.test.ts`: reglas de contraseña (cada fila de §4), generador (largo,
  alfabeto, sin sesgo con fuente fija), `registrarFallo`/`estadoBloqueo` (bloquea en el quinto,
  vence a los 15 min exactos, un bloqueo vencido arranca de cero), `leerReglasAcceso` (default ante
  vacío, texto y fuera de rango).
- Sistema viejo: test del limitador como función pura (`routes/limitador-intentos.js`).
