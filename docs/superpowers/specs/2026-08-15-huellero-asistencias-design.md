# SPEC — Integración huellero Hikvision → asistencias

> **Fecha:** 2026-08-15
> **Estado:** diseño aprobado, sin implementar
> **Zona de rigor:** crítica (la tabla `asistencias` alimenta la cadena del sueldo)
> **Autor del diseño:** sesión de brainstorming con Alexander Flores

---

## 1. Problema

Las asistencias del ERP nuevo se registran a mano o se derivan del envío de un reporte
(`reportes_marcar_asistencia`, migración 0030). Ninguna de las dos fuentes refleja la hora real
en que una persona llegó o se fue.

En el almacén existe un terminal biométrico Hikvision que ya registra esas horas: 54 personas
inscritas, 111 huellas, cerca de 42.900 eventos acumulados. Ese dato existe y nadie lo usa.

Este proyecto lo trae al ERP.

---

## 2. Alcance

**Hace:**

- Lee los eventos de autenticación por huella del terminal.
- Los guarda crudos y auditables en la base.
- Deriva de ellos la hora de entrada y de salida de cada empleado por turno.
- Ofrece una pantalla de administración para mapear los identificadores del equipo a empleados
  reales y para vigilar la salud del colector.

**No hace** (queda escrito para que ninguna sesión futura lo asuma):

- No escribe la columna `minutos_tardanza`, que queda en 0. Es una columna heredada que el motor
  de sueldos no lee.
- No declara faltas. Una falta es una declaración explícita del administrador
  (`condicion = 'falta'`); la ausencia de marcas no es prueba de que alguien no vino.
- No alimenta la evaluación de desempeño.
- No reemplaza el registro manual de asistencias ni la auto-asistencia desde reportes.
- No toca el sistema viejo (Express + SQLite).
- No maneja turnos que cruzan la medianoche. Una marca pertenece al día calendario en que ocurrió,
  en hora Perú. LuceBien no tiene turno nocturno; si alguna vez lo tuviera, esta regla se rediseña.

### Sí alimenta el sueldo, y hay que decirlo con todas las letras

Verificado en `packages/db/migrations/0073_sueldos_rpc.sql:177` y en
`packages/core/src/sueldos.ts:519-580`: la liquidación **lee la tabla `asistencias`**, colapsa
cada día a un par ingreso/salida con `min(hora_entrada)` y `max(hora_salida)`, y calcula la
tardanza comparando la hora de ingreso contra el horario contratado en `sueldo_acuerdo_turnos`.

En cuanto el huellero escriba una hora de entrada, esa hora **se liquida**. No hace falta ningún
paso adicional para que ocurra, y no hay forma de evitarlo salvo no escribir la hora.

Esto convierte al proyecto en zona crítica plena: un error de derivación es plata de menos en el
bolsillo de una persona real. De ahí las dos salvaguardas de la sección 6 — la fila manual nunca
se pisa, y la condición `'trabajado'` se escribe solo cuando hay horas reales.

El motor calcula la tardanza por su cuenta y la spec no toca esa lógica. Lo que este proyecto
aporta es el dato de entrada: la hora real en vez de la hora que alguien recuerda.

---

## 3. El dispositivo

Verificado contra la interfaz web del equipo el 2026-08-14:

| Dato | Valor |
|---|---|
| Modelo | Hikvision DS-K1T321MFWX |
| Firmware | V3.9.1 build 230619 |
| IP | 192.168.1.220, fija, máscara 255.255.255.0, gateway 192.168.1.1 |
| HTTP / HTTPS | ambos habilitados (80 / 443) |
| Personas | 54 |
| Huellas | 111 |
| Eventos guardados | ~42.900 de 150.000 de capacidad |
| Hik-Connect | en línea, sin cuenta vinculada |
| ISUP | deshabilitado |

**Protocolo elegido: ISAPI**, la API REST del equipo con autenticación digest. El endpoint de
eventos es `POST /ISAPI/AccessControl/AcsEvent?format=json`, filtrando `major=5, minor=38`
(autenticación por huella) y paginando con `searchResultPosition`.

Descartados: Hik-Connect no expone eventos por API pública; ISUP exigiría montar un servidor
propio del protocolo; el SDK en el puerto 8000 es binario y propietario, e ISAPI cubre todo lo
que hace falta.

---

## 4. Arquitectura

```
[Huellero 192.168.1.220]
      │  ISAPI, digest auth, polling cada 5 min
      ▼
[Colector Node — PC de almacén, bajo PM2]
      │  RPC huellero_registrar_marcas (usuario dedicado, solo inserta)
      ▼
[Supabase]
   marcas_huellero  ── evento crudo, auditable
      │  derivación en la misma transacción
      ▼
   asistencias      ── fuente='huellero', nunca pisa manual ni reporte
      ▼
[ERP: /asistencias  ·  /asistencias/huellero]
```

### 4.1 Por qué polling y no push

El terminal soporta *HTTP Listening*: postear cada evento a un servidor propio en tiempo real.
Se descartó porque la PC de almacén se apaga sola de vez en cuando (vuelve a encender sola), y el
push de Hikvision no garantiza reintentos. Un mecanismo de recuperación sería obligatorio de
todos modos, y una vez que existe, el push solo agrega una segunda vía que mantener a cambio de
una latencia que a nadie le importa: nadie necesita ver una marca de asistencia al segundo.

El polling con checkpoint recupera solo: si la PC estuvo apagada seis horas, el primer ciclo tras
encender trae las seis horas. El terminal conserva los eventos por su cuenta.

### 4.2 Dónde corre el colector

En la PC de almacén, que es **distinta** de la PC donde corre el sistema viejo con PM2. No hay
nada que migrar: el colector es autónomo y no importa nada de `packages/`. Esa PC tendrá su
propia instalación de Node y su propio PM2.

Requisitos de esa PC: alcanzar 192.168.1.220 por LAN y tener salida HTTPS a internet para
Supabase. Nada más.

---

## 5. Modelo de datos

Una sola migración nueva, **0074** (0068–0071 están libres pero 0072 y 0073 ya existen en la rama
de sueldos; se toma el siguiente número libre al final para no colisionar). Idempotente, como
todas.

### `dispositivos_huellero`

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid pk | |
| `nombre` | text not null | "Almacén" |
| `sede_cod` | text references sedes(cod) | |
| `ip` | text not null | 192.168.1.220 |
| `activo` | boolean not null default true | apagar un equipo sin borrarlo |
| `ultima_sincronizacion` | timestamptz | la escribe la RPC en cada ciclo |
| `created_at` | timestamptz not null default now() | |

La contraseña del equipo **no se guarda en la base**. Vive únicamente en el `.env` de la PC
colectora. La tabla solo declara qué equipos existen y dónde.

La tabla existe desde el día uno aunque hoy haya un solo huellero: agregar el segundo debe ser
insertar una fila y una línea en un `.env`, no un refactor.

### `marcas_huellero`

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid pk | |
| `dispositivo_id` | uuid not null references dispositivos_huellero | |
| `employee_no` | text not null | identificador crudo del equipo |
| `empleado_id` | uuid references empleados(id) | `null` = sin mapear |
| `marcada_en` | timestamptz not null | hora real del evento |
| `evento_serial` | bigint not null | `serialNo` que devuelve el equipo |
| `nombre_equipo` | text | nombre según el huellero, para auditar el mapeo |
| `recibida_en` | timestamptz not null default now() | |

`unique (dispositivo_id, evento_serial)` — idempotencia total. El colector puede reenviar el
mismo lote las veces que sea sin duplicar nada.

Índices: `(dispositivo_id, marcada_en desc)` para el checkpoint, `(empleado_id, marcada_en)` para
la derivación.

### `huellero_mapeos`

| Columna | Tipo | Nota |
|---|---|---|
| `dispositivo_id` | uuid not null references dispositivos_huellero | |
| `employee_no` | text not null | |
| `empleado_id` | uuid references empleados(id) | nulo si el identificador está ignorado |
| `ignorado` | boolean not null default false | identificador que no es empleado de la empresa |
| `creado_en` | timestamptz not null default now() | |

Clave primaria `(dispositivo_id, employee_no)`. El mapeo es por dispositivo porque cada equipo
numera a su gente de forma independiente.

Restricción: `check (ignorado or empleado_id is not null)` — una fila o apunta a un empleado o
está marcada como ignorada, nunca ninguna de las dos.

### Configuración

**Ninguna.** Este proyecto no agrega parámetros de negocio, y por lo tanto no inventa ningún
default.

Una versión anterior de esta spec proponía un `huellero_corte_turno` de 13:00 para partir las
marcas del día entre el turno M y el T. **Era un defecto**, y se explica en la sección 6 porque
entender por qué estaba mal es lo que justifica el diseño actual.

### Checkpoint sin estado local

El colector no guarda archivo de progreso. Consulta a la base la `marcada_en` más reciente del
dispositivo y pide al equipo desde ese instante menos diez minutos de solape. El índice único
absorbe el solape. Si la PC se reinstala desde cero, no se pierde ni se duplica nada.

Cuando no hay ninguna marca previa, el punto de partida es **2026-01-01**: la importación del
histórico es simplemente la primera corrida, sin modo especial ni código aparte.

---

## 6. Ingesta y derivación

### `huellero_registrar_marcas(p_dispositivo_id uuid, p_marcas jsonb) → jsonb`

`SECURITY DEFINER`, `set search_path = public`. Única puerta de escritura del colector. Sigue el
patrón ya establecido por `reportes_marcar_asistencia` (migración 0030).

Por cada marca del lote:

1. Resuelve `empleado_id` contra `huellero_mapeos`. Si no hay mapeo, guarda igual con `null`.
2. `insert ... on conflict (dispositivo_id, evento_serial) do nothing`.
3. Si la marca quedó con `empleado_id`, recalcula la asistencia de ese empleado y esa fecha.

Al terminar actualiza `ultima_sincronizacion` del dispositivo — también cuando el lote viene
vacío, porque un ciclo sin marcas sigue siendo señal de que el colector está vivo.

Devuelve `{insertadas, duplicadas, sin_mapeo}` para el log del colector.

### `huellero_derivar_asistencia(p_empleado_id uuid, p_fecha date) → void`

Función separada de la ingesta, y no interna a ella, porque hay que poder invocarla por
su cuenta: cuando el administrador crea un mapeo, se llama una vez por cada fecha con marcas de
esa persona para reprocesar su histórico.

1. Toma todas las marcas del empleado en esa fecha, convertidas a hora Perú con
   `at time zone 'America/Lima'`.
2. **Una sola fila por día.** `hora_entrada` = la marca más temprana del día, `hora_salida` = la
   más tardía. Si hay una sola marca en todo el día, entrada queda con esa hora y salida en
   `null`.
3. Si ya existe alguna fila del día para ese empleado, se rellena esa (la de turno menor cuando
   hay varias). Si no existe ninguna, se crea una con `turno = 'M'`.
4. `minutos_tardanza = 0` siempre — el motor de sueldos no lee esa columna.
5. `condicion = 'trabajado'` **solo si la marca dio una hora de entrada real**. Sin marcas, la
   fila no se crea y la condición sigue siendo `'sin_dato'`, que es exactamente lo que es.

### Por qué una fila por día y no una por turno

El primer diseño partía las marcas en turno M y turno T por una hora de corte configurable, y era
un defecto capaz de pagar de menos. Queda escrito para que nadie lo reintroduzca.

En LuceBien **nadie sale a almorzar**: los colaboradores almuerzan en el local. Eso significa que
un día completo deja exactamente **dos marcas**: entrada por la mañana y salida por la noche.

Con un corte a las 13:00, esas dos marcas caen en turnos distintos. El turno M se queda con la
entrada de las 09:00 y **ninguna salida**; el turno T se queda con la salida de las 20:00 tomada
como si fuera una entrada, y **ninguna salida** tampoco. La liquidación colapsa el día con
`min(hora_entrada)` y `max(hora_salida)`, encuentra la salida en `null`, y `sueldos.ts:526` lo
lee como "ingreso sin salida": **cero horas trabajadas**.

Una persona que trabajó once horas habría cobrado cero.

El grano correcto es el día, porque el día es el grano que usa la liquidación. La tabla conserva
su clave `(empleado, fecha, turno)` intacta —los reportes la siguen usando— pero el huellero
escribe una sola fila por día y deja que el colapso de la lectura haga lo suyo. Con dos marcas
funciona, con cuatro también, y no hay ningún parámetro que ajustar.

### Las dos salvaguardas del sueldo

**Primera: no se pisa lo declarado.** Si ya existe fila para `(empleado_id, fecha, turno)` con
`fuente` distinta de `'huellero'`, la función solo rellena las horas que estén en `null`. Nunca
sobreescribe una hora cargada, nunca cambia `fuente`, nunca borra. Lo que escribió el
administrador a mano y lo que dejó el envío de un reporte mandan sobre la máquina.

**Segunda: no se toca una falta.** Si la fila tiene `condicion = 'falta'`, la derivación **no
hace nada**, ni siquiera rellenar horas vacías. Una falta es una declaración del administrador,
y el motor la cobra a dos días de sueldo (RN-09). Que una marca de huella la revierta sola sería
exactamente el tipo de error silencioso que el no-negociable #1 existe para impedir. Si aparecen
marcas en un día declarado como falta, se avisa en la pantalla de administración y decide una
persona.

Tampoco se tocan `tardanza_justificada`, `falta_justificada` ni `motivo_justificacion`: son
decisiones humanas, y el huellero no las toma.

El índice único `(empleado_id, fecha, turno)` de la migración 0025 hace el resto.

### El almuerzo — resuelto, no pendiente

**Confirmado por Alexander el 15-ago-2026: los colaboradores almuerzan dentro de la empresa, no
salen.** No pasan por el huellero al mediodía.

Dos consecuencias, y las dos son buenas noticias:

El hueco del almuerzo **no aparece en los datos**, porque no hay marcas de salida y regreso al
mediodía. El pendiente que `docs/pendientes-negocio.md` tenía anotado sobre el turno partido no
se materializa por esta vía.

Y el almuerzo **se paga**: a los colaboradores de tiempo completo se les agrega S/8, que es un
ingreso (RN-11), no un descuento de horas. El tiempo de almuerzo cuenta como trabajado. El
colapso de la liquidación ya hace exactamente eso, así que no hay nada que cambiar en el motor.

Si algún día alguien sí marca al salir y volver —un mandado, una excepción— el colapso `min`/`max`
sigue dando el día completo, que es la respuesta correcta bajo esta regla.

### Fechas

Toda conversión a hora Perú ocurre dentro de SQL con `at time zone 'America/Lima'`. El colector
envía timestamps con offset explícito `-05:00`. No hay cron involucrado: la ingesta la empuja el
colector, así que el desfase UTC de los cron de Supabase no aplica acá.

---

## 7. El colector

Vive en el repo en `tools/colector-huellero/`. Es autónomo: no importa nada de `packages/`, y se
instala copiando solo esa carpeta.

```
tools/colector-huellero/
  colector.js            loop principal
  lib/isapi.js           digest auth y paginación de AcsEvent
  lib/subida.js          login del usuario "huellero" y llamada a la RPC
  ecosystem.config.js    configuración de PM2
  .env.example           plantilla con valores vacíos
  README.md              instalación paso a paso en una PC nueva
```

Node 20 o superior. Dependencias: `@supabase/supabase-js` y una implementación de digest auth.

### Ciclo, cada cinco minutos y por cada dispositivo activo

1. Consulta el checkpoint a la base.
2. Pide al equipo los eventos de huella desde el checkpoint menos diez minutos hasta ahora,
   paginando de a cien.
3. Sube lotes de hasta doscientas marcas a la RPC.
4. Escribe en el log local cuántas entraron, cuántas eran duplicadas y cuántas quedaron sin
   mapeo.

### Comportamiento ante fallas

| Falla | Qué pasa |
|---|---|
| Huellero apagado o sin red | Se registra el error, se reintenta al ciclo siguiente. El equipo conserva los eventos. |
| Supabase inalcanzable | El checkpoint no avanza porque el checkpoint vive en la base. Reintento automático. |
| PC apagada | PM2 con arranque automático de Windows la levanta. El primer ciclo recupera lo acumulado. |
| Marca con `employee_no` desconocido | Se guarda con `empleado_id` en `null` y aparece en la cola de sin asignar. |

### Salud visible

`dispositivos_huellero.ultima_sincronizacion` se actualiza en cada ciclo. La pantalla de
administración muestra "última sincronización hace X minutos" y marca en rojo si pasan de treinta.
Un colector caído se ve, no se descubre a fin de mes.

### Contenido del `.env`

URL y clave pública de Supabase, credenciales del usuario "huellero", y la contraseña de cada
equipo en la forma `PASS_<nombre>`. El archivo real nunca entra al repo; `.env.example` va con
valores vacíos y se verifica el `.gitignore` antes de commitear.

---

## 8. Pantallas

### `/asistencias` (existente)

Cambios mínimos: un distintivo de origen en cada fila (manual, reporte, huellero) y filtro por
fecha. El registro manual sigue funcionando exactamente igual.

### `/asistencias/huellero` (nueva, solo administrador)

Una sola pantalla con tres partes:

**Estado del equipo.** Nombre, sede, IP y "última sincronización hace X minutos" con indicador
verde o rojo. Con un solo huellero es una tarjeta; con varios, una lista. Botón para dar de alta
un equipo nuevo con nombre, sede e IP.

**Cola de marcas sin asignar.** Agrupadas por `employee_no`, mostrando el nombre que trae el
equipo, cuántas marcas acumula y desde cuándo. Cada fila lleva un selector de empleado; al
elegir, se crea el mapeo y se reprocesan automáticamente todas las marcas históricas de esa
persona. Esta es la pantalla que convierte los 54 identificadores del equipo en los 18 empleados
reales.

Los identificadores que no corresponden a ningún empleado activo — el equipo tiene 54 personas
inscritas y la empresa 18 — se marcan como **ignorados**: dejan de aparecer en la cola y sus
marcas siguen guardadas con `empleado_id` en `null`. Se implementa con un mapeo cuyo
`empleado_id` es nulo y una columna `ignorado boolean`. Un identificador ignorado se puede
reactivar; nunca se borran sus marcas.

**Mapeos vigentes.** Tabla `employee_no → empleado`, editable y borrable. Borrar un mapeo no
borra marcas: vuelven a la cola.

No se agrega ninguna pantalla para el empleado común. Cada quien ve sus asistencias donde ya las
veía.

---

## 9. Seguridad

**Usuario "huellero".** Cuenta propia en Supabase con rol `huellero`, que no es administrador ni
empleado. Puede ejecutar exactamente una función: `huellero_registrar_marcas`. Se hace `revoke
all` de las tres tablas nuevas para ese rol. Si alguien se lleva el `.env` de la PC de almacén,
lo único que consigue es insertar marcas de asistencia: no lee sueldos, no lee notas de
evaluación, no lee datos personales.

**Sin service key fuera del servidor.** `getAdminClient()` permanece en sus seis archivos. La
ingesta no lo usa ni lo necesita. El no-negociable #3 queda intacto.

**RLS de las tablas nuevas.** `dispositivos_huellero`, `marcas_huellero` y `huellero_mapeos` son
solo-administrador, en lectura y en escritura. Las marcas crudas revelan a qué hora entra y sale
cada persona: merecen el mismo trato que un sueldo. La RLS de `asistencias` no se toca.

**Contraseña del terminal.** Solo en el `.env` de la PC. Nunca en la base, nunca en el repo.

---

## 10. Testing

**Lógica pura en `packages/core/src/huellero.ts`** — partir marcas en turnos, elegir primera y
última, y decidir si una fila existente puede tocarse. Recibe la hora de corte y las marcas como
parámetros; no llama a `new Date()`. Casos cubiertos:

1. **El caso real de LuceBien**: dos marcas, 09:00 y 20:00. Una fila, entrada 09:00, salida
   20:00, `condicion='trabajado'`. Este test es el que impide reintroducir la partición por turno,
   que dejaba el día en cero horas.
2. Una sola marca en el día: entrada cargada, salida en `null`.
3. Cuatro marcas (alguien sí salió y volvió): una fila, de la primera a la última.
4. Marcas fuera de orden cronológico en el lote.
5. Marcas duplicadas al mismo segundo.
6. Fila previa con `fuente='manual'` y horas cargadas: no se toca.
7. Fila previa con `fuente='reporte'` y horas en `null`: se rellenan sin cambiar `fuente`.
8. Fila previa con `condicion='falta'`: no se toca nada, ni siquiera horas vacías.
9. Día sin ninguna marca: no se crea fila, la condición sigue en `'sin_dato'`.
10. Dos filas previas del día (turno M y T de reportes): se rellena una sola, la de turno menor.

**Prueba de extremo a extremo, obligatoria antes de producción:** liquidar un periodo real con
datos del huellero y comprobar que las horas pagadas coinciden con las horas trabajadas. El
defecto de la partición por turno pasaba todos los tests unitarios de derivación y solo aparecía
al liquidar.

**RPC en SQL** verificada contra la base de desarrollo con un lote de marcas de prueba,
comprobando en particular que una fila manual previa sobrevive intacta y que el reenvío del mismo
lote no duplica.

**Antes de mergear:** subagente verificador (`.claude/agents/verificador.md`), obligatorio por
tocar zona crítica.

---

## 11. Puesta en marcha

**Paso previo, hoy mismo y sin instalar nada.** Desde cualquier PC de la red del almacén,
comprobar que el equipo responde:

```bash
curl -k --digest -u admin:CONTRASEÑA \
  "https://192.168.1.220/ISAPI/AccessControl/AcsEvent?format=json" \
  -H "Content-Type: application/json" \
  -d '{"AcsEventCond":{"searchID":"prueba","searchResultPosition":0,"maxResults":30,"major":5,"minor":38,"startTime":"2026-08-01T00:00:00-05:00","endTime":"2026-08-14T23:59:59-05:00"}}'
```

Es una lectura: no instala nada ni modifica el equipo. Si devuelve JSON con marcas, la
integración está confirmada.

**Qué conviene traer de esa visita:**

- La contraseña de administrador del terminal.
- Confirmación de que la PC de almacén tiene salida a internet.
- La correspondencia entre identificadores del equipo y personas, para el mapeo inicial de los 18
  empleados activos. Se obtiene de *Person Management* en la web del equipo.

**Instalación del colector**, una vez implementado: instalar Node, copiar la carpeta, completar
el `.env`, `pm2 start` con arranque automático, y verificar que las marcas aparezcan en el ERP.
Alrededor de veinte minutos, con el README paso a paso.

---

## 12. Decisiones tomadas y por qué

| Decisión | Razón |
|---|---|
| ISAPI en vez de SDK, ISUP o Hik-Connect | Es REST, está documentado y alcanza. Los otros exigen infraestructura propia o son binarios propietarios. |
| Polling en vez de push | La PC se apaga sola; el mecanismo de recuperación es obligatorio de todas formas. El push solo agregaría una segunda vía sin beneficio real. |
| Checkpoint en la base, no en archivo local | Reinstalar la PC no pierde ni duplica nada. |
| Marcas crudas además de asistencias | Auditabilidad. Un error de derivación se corrige reprocesando; sin las marcas, el dato original se pierde para siempre. |
| Tabla de dispositivos desde el día uno | Agregar el segundo huellero debe ser una fila, no un refactor. |
| Mapeo explícito en vez de asumir que el ID del equipo es el `cod` | No coinciden. Verificado. |
| `minutos_tardanza = 0` | Columna heredada que el motor de sueldos no lee. La tardanza la calcula el motor contra `sueldo_acuerdo_turnos`. |
| Nunca tocar una fila con `condicion='falta'` | Una falta cuesta dos días de sueldo y la declara una persona. Que una marca la revierta sola sería un error silencioso en la cadena del sueldo. |
| `condicion='trabajado'` solo con hora real | Es lo que hace visible la fila para la liquidación. Escribirla sin horas convertiría el día en una falta ante el motor. |
| Una fila por día, sin corte de turno | Nadie sale a almorzar: un día completo deja dos marcas. Partirlas por turno dejaba ambas filas sin salida y liquidaba cero horas. El grano correcto es el que usa la liquidación. |
| Cero parámetros de negocio nuevos | Al caer el corte de turno, no quedó ningún default que inventar. |
| Solo Supabase, no el sistema viejo | El viejo está congelado y tocarlo exige pedido explícito. |
| Histórico desde 2026-01-01 | Decisión del dueño del proyecto. |
| Usuario dedicado en vez de service key | El radio de daño de un `.env` robado en una PC de almacén queda acotado a insertar marcas. |
