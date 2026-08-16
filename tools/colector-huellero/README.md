# Colector del huellero

Lee las marcaciones del terminal Hikvision del almacén y las empuja al ERP cada cinco minutos.
Corre en la PC del almacén, que es **distinta** de la PC donde corre el sistema viejo.

No importa nada del resto del repositorio: se instala copiando sólo esta carpeta.

Diseño completo, con el porqué de cada decisión:
[docs/superpowers/specs/2026-08-15-huellero-asistencias-design.md](../../docs/superpowers/specs/2026-08-15-huellero-asistencias-design.md).

---

## Qué hace, en una frase

Cada cinco minutos le pregunta a la base cuál fue la última marca que recibió, le pide al huellero
todo lo que pasó desde entonces (menos diez minutos, por las dudas) y lo manda a la base por una
sola función. Nada más.

**No guarda ningún archivo de progreso.** Si esta PC se formatea y se instala de cero, no se
pierde ni se duplica una sola marca: el punto de partida vive en la base y el reenvío del mismo
evento no crea nada nuevo.

---

## Antes de instalar

Tres cosas tienen que existir del lado de la base. Sin ellas el colector arranca y avisa, pero no
sincroniza:

1. **La fila del equipo** en la tabla `dispositivos_huellero`, con su nombre, sede e IP. Su `id`
   es el que va en el `.env`.
2. **El usuario del colector**: una cuenta de Supabase creada para esta PC, con su `user_id`
   cargado en la tabla `huellero_colectores` y `activo = true`.
3. **La función de lectura del checkpoint**, `huellero_checkpoint(p_dispositivo_id uuid)`, que
   devuelve la fecha y hora de la última marca del equipo. El colector no puede consultar
   `marcas_huellero` directamente porque esa tabla es sólo-administrador, y eso es a propósito:
   las marcas dicen a qué hora entra y sale cada persona.

Y del lado de la PC:

- **Node 20 o superior**. Se descarga de [nodejs.org](https://nodejs.org) y se instala con el
  instalador de Windows, siguiente-siguiente. Conviene la versión LTS: la librería de Supabase ya
  avisa que va a dejar de dar soporte a Node 20, aunque hoy funcione.
- Que la PC **llegue al huellero**: `ping 192.168.1.220` tiene que responder.
- Que la PC **tenga internet**, para hablar con Supabase.
- La **contraseña de administrador del huellero**: la misma con la que se entra a
  `https://192.168.1.220` desde el navegador.

> Si todavía no se probó que el equipo responde desde esta PC, conviene correr primero
> `tools/diagnostico-huellero`, que sólo lee y no instala nada.

---

## Instalación, paso a paso

Alrededor de veinte minutos.

### 1. Copiar la carpeta

Copiar `tools/colector-huellero/` completa a la PC del almacén. Por ejemplo a
`C:\lucebien\colector-huellero`.

### 2. Instalar las dependencias

Abrir PowerShell **dentro de esa carpeta** y ejecutar:

```powershell
npm install
```

Baja una sola librería, la de Supabase. Todo lo demás lo trae Node.

### 3. Completar la configuración

Copiar la plantilla y editarla:

```powershell
Copy-Item .env.example .env
notepad .env
```

Hay que completar: la URL y la clave pública de Supabase, el correo y la contraseña del usuario
del colector, el `id` del equipo, su IP y su contraseña.

El archivo `.env` **no se comparte con nadie ni se sube al repositorio**. Es el único lugar donde
está la contraseña del huellero.

### 4. Probar una corrida a mano

```powershell
node colector.js
```

Tiene que verse algo así:

```
[2026-08-15 21:30:04] ══ Colector del huellero — LuceBien ══
[2026-08-15 21:30:04] Equipos: ALMACEN (192.168.1.220)
[2026-08-15 21:30:05] ALMACEN: DS-K1T321MFWX · firmware V3.9.1 · serie ...
[2026-08-15 21:30:05] ALMACEN: pidiendo desde 2026-01-01T00:00:00 (sin marcas previas: primera corrida, trae el histórico)
[2026-08-15 21:31:40] ALMACEN: 3058 leídas · 3058 nuevas · 0 repetidas · 3058 sin mapeo
```

La primera corrida trae el histórico entero y tarda varios minutos: va mostrando el avance mes a
mes. Que todas salgan "sin mapeo" es lo normal al principio — las marcas quedan guardadas y se
asignan a cada persona desde la pantalla `/asistencias/huellero` del ERP.

Cortar con `Ctrl+C` cuando se vea que funciona.

### 5. Dejarlo corriendo con PM2

```powershell
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
```

### 6. Arranque automático de Windows

Esto es lo que hace que la PC se pueda apagar sola sin que nadie tenga que acordarse de nada:

```powershell
npm install -g pm2-windows-startup
pm2-startup install
pm2 save
```

Para comprobarlo: reiniciar la PC y, cuando vuelva, ejecutar `pm2 list`. El colector tiene que
aparecer en `online` sin que nadie lo haya levantado.

### 7. Verificar en el ERP

Entrar a `/asistencias/huellero`. La tarjeta del equipo tiene que decir "última sincronización
hace menos de 5 minutos", en verde.

---

## Uso diario

Ninguno. El colector no necesita atención.

Comandos útiles cuando haga falta mirarlo:

```powershell
pm2 list                      # está corriendo?
pm2 logs colector-huellero    # qué está haciendo ahora
pm2 restart colector-huellero # reiniciarlo
pm2 stop colector-huellero    # detenerlo
```

Los registros también quedan en la carpeta `logs/` al lado del colector.

---

## Qué pasa cuando algo falla

| Situación | Qué hace el colector |
|---|---|
| El huellero está apagado o sin red | Anota el error y reintenta al ciclo siguiente. El equipo guarda sus eventos por su cuenta: no se pierde ninguna marca. |
| Se cortó el internet | El checkpoint no avanza, porque vive en la base. Al volver la conexión, el primer ciclo trae todo lo acumulado. |
| Se apagó la PC | PM2 la levanta al encender. El primer ciclo recupera las horas que estuvo apagada. |
| Una marca de alguien que no está mapeado | Se guarda igual, sin empleado asignado, y aparece en la cola de `/asistencias/huellero`. Al mapearla, el histórico de esa persona se reprocesa solo. |
| Falla la lectura a mitad del histórico | Lo que ya se leyó se sube igual. Sólo se corta lo que faltaba, y el ciclo siguiente lo retoma. |

**Mientras el huellero no responda, la pantalla del ERP muestra el equipo en rojo.** Es a
propósito: el indicador dice si la cadena entera está viva, no sólo si el colector está corriendo.

---

## Si algo no arranca

**"Falta PASS_ALMACEN en el .env"** — falta completar la plantilla. Comparar contra
`.env.example`.

**"HTTP 401" o "la clave del equipo no fue aceptada"** — la contraseña del huellero no es esa, o
el equipo está bloqueado por intentos fallidos. Esperar unos minutos: **no probar contraseñas al
azar**, el equipo bloquea el acceso.

**"Sin respuesta del equipo"** — comprobar con `ping 192.168.1.220`. Si el ping responde pero el
colector no, poner `HTTP_ALMACEN=true` en el `.env` y reintentar.

**"Falta la RPC huellero_checkpoint"** — falta esa función en la base. Es de la lista de
requisitos de arriba: la agrega una migración, no se arregla desde esta PC.

**"sólo un colector registrado o el administrador puede registrar marcas"** — el usuario del
`.env` existe, pero su `user_id` no está en la tabla `huellero_colectores`, o está con
`activo = false`.

**"el dispositivo no existe o está inactivo"** — el `ID_ALMACEN` del `.env` no coincide con
ninguna fila activa de `dispositivos_huellero`.

---

## Para el que venga después

- El colector **sólo escribe por la función `huellero_registrar_marcas`**. No hace `insert` sobre
  ninguna tabla, y no tiene manera de hacerlo aunque quisiera: el usuario no tiene ese permiso.
- Nunca se usa la service key acá. Si alguien se lleva este `.env`, lo único que consigue es
  insertar marcas de asistencia.
- El equipo devuelve **como máximo 30 registros por página** aunque se le pidan cien, así que la
  paginación avanza por la cantidad realmente devuelta. Avanzar por la cantidad pedida perdía el
  70% de las marcas — ya pasó una vez.
- La lectura se **trocea por mes**: pedir ocho meses de una sola vez es arriesgado.
- Lo leído **se sube antes de resumirse**. Un error al armar el log no puede costar marcas ya
  leídas — también pasó, y costó una lectura de ocho meses.
