# SPEC — Integración huellero Hikvision → asistencias

> **Fecha:** 2026-08-15
> **Estado:** migración `0075` y `packages/core/src/huellero.ts` escritos y probados.
> **Sin aplicar a la base todavía.** Falta: el verificador, las pantallas del ERP (§8) y la
> instalación del colector en la PC del almacén (§11). El colector en sí ya está construido en
> `tools/colector-huellero/`.
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

**Histórico completo leído el 15-ago-2026** con `tools/diagnostico-huellero`: **3.058 marcaciones
entre el 1 de enero y el 15 de agosto**, más las 54 personas inscritas. Cada evento trae
identificador, nombre, fecha con offset `-05:00` y número de serie.

El equipo contesta **XML** en `/ISAPI/System/deviceInfo` y **JSON** en `AcsEvent`, así que el
colector tiene que aceptar los dos formatos. Devuelve **como máximo 30 registros por página** sin
importar cuántos se pidan, de modo que hay que paginar avanzando por la cantidad realmente
devuelta y contrastando contra `totalMatches`. Consultar ocho meses de una vez es arriesgado: la
lectura se trocea por mes.

**De las 54 personas inscritas, solo 23 marcaron alguna vez este año**, y de esas varias dejaron
de marcar hace meses (REMY en mayo, MARITZA en abril, JEFFREY en febrero). Los identificadores
que nunca aparecen o que dejaron de aparecer hace tiempo son los candidatos a ignorar en el
mapeo. El propio dato dice quién sigue activo, así que el mapeo inicial no hay que adivinarlo.

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

Una sola migración nueva, idempotente como todas.

**El número no se elige mirando la carpeta.** Una versión anterior de esta spec decía que 0068 a
0071 estaban libres y reservaba la 0074: las dos cosas eran falsas. Esos cinco números los tiene
`feat/mi-talla-db`, que no está en la copia de trabajo de esta rama, así que un `ls` de
`packages/db/migrations/` no los muestra. **La primera libre es la 0075**, y se confirma al
implementar con:

```bash
bash tools/reservar-migracion.sh huellero_marcas
```

Ese script mira todas las ramas, locales y remotas. Además hay un hook `PreToolUse`
(`.claude/hooks/migracion-reservada.sh`) que deniega la escritura de una migración cuyo número
esté tomado por otra rama o que no haya sido reservada: si alguien intenta escribir un número
ocupado, el hook lo frena y dice qué archivo y qué rama lo tienen.

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
| `id` | uuid pk | |
| `dispositivo_id` | uuid not null references dispositivos_huellero | |
| `employee_no` | text not null | |
| `empleado_id` | uuid references empleados(id) | nulo si el identificador está ignorado |
| `ignorado` | boolean not null default false | identificador que no es empleado de la empresa |
| `vigente_desde` | date not null | primera fecha en que este identificador es de esta persona |
| `vigente_hasta` | date | nulo = sigue vigente |
| `creado_en` | timestamptz not null default now() | |

El mapeo es por dispositivo porque cada equipo numera a su gente de forma independiente.

Restricción: `check (ignorado or empleado_id is not null)` — una fila o apunta a un empleado o
está marcada como ignorada, nunca ninguna de las dos. Y un índice que impide dos mapeos vigentes
a la vez para el mismo `(dispositivo_id, employee_no)` en fechas solapadas.

### Por qué el mapeo lleva fechas de vigencia

Porque **el equipo reutiliza los identificadores**, y está comprobado en los datos reales.

El identificador `00000013` marcó como **JAZMIN** hasta el 28 de enero de 2026 a las 08:45, y
como **NICOL** desde las 20:46 de ese mismo día. Hoy figura como NICOL en la lista de personas
inscritas. Es el mismo número asignado a dos personas distintas.

Un mapeo sin fechas le adjudicaría a NICOL los 27 días que trabajó JAZMIN. Y hay algo peor en el
propio día del cambio: la derivación juntaría la entrada de JAZMIN (08:45) con la salida de NICOL
(20:46) en una sola jornada de doce horas que no trabajó ninguna de las dos.

Con vigencia, cada marca se resuelve contra el mapeo que estaba activo **en la fecha de la
marca**, no contra el que está activo hoy. La pantalla de administración avisa cuando detecta un
identificador con más de un nombre en el histórico, para que el administrador parta el mapeo en
el punto correcto.

**El día exacto del cambio necesita una protección más**, porque la vigencia es por fecha y la
reasignación ocurrió a mitad de día: las dos marcas del 28 de enero caen en la vigencia de JAZMIN
y el colapso le daría una jornada de 08:45 a 20:46 que no trabajó.

La delata el nombre que el equipo guardó en cada evento. **Cuando las marcas de un mismo día
traen dos nombres distintos, la derivación no escribe nada** y el día queda para que lo resuelva
una persona, que es la única que sabe quién trabajó cuánto. Es un día por reasignación, no un
caso frecuente. Verificado contra la base: con las dos marcas del 28 de enero, la función no crea
ninguna fila.

El equipo ayuda sin saberlo: cada evento guarda el nombre que la persona tenía registrada en ese
momento, así que el histórico conserva de quién era cada marca aunque el número se haya
reasignado después.

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
5. `condicion = 'trabajado'` **solo cuando la fila tiene entrada y salida, las dos cargadas**.
   Con una sola marca la fila se escribe con `condicion = 'sin_dato'` y la hora de entrada puesta.

### Por qué la condición espera a la segunda marca

La migración 0073 agregó una restricción que la primera versión de esta spec no contemplaba
(`0073_sueldos_rpc.sql:26-29`):

```sql
alter table asistencias add constraint asistencias_trabajado_chk
  check (condicion <> 'trabajado' or (hora_entrada is not null and hora_salida is not null));
```

Escribir `'trabajado'` apenas hay hora de entrada la viola, y no en un caso raro: entre que una
persona marca su entrada a las 09:00 y marca su salida a las 20:00 pasan once horas, y en todas
esas corridas el colector intentaría escribir esa fila. **La RPC habría fallado todos los días,
con todas las personas.**

La restricción existe por una buena razón: sin ella, la liquidación colapsaría el día a
`horaIngreso='09:00', horaSalida=null`, que `sueldos.ts:520-527` lee como cero horas. La persona
perdería el día completo y la advertencia se perdería entre otras. La restricción convierte ese
error silencioso en un error ruidoso en el momento de escribir.

Una fila `'sin_dato'` sí puede llevar hora de entrada con la salida en `null`, así que la jornada
en curso se registra sin problema. Y trae un efecto lateral bueno: un día que quedó a medias no
entra en la liquidación (`0073_sueldos_rpc.sql:180`) y `sueldo_entrada` corta nombrando la fecha,
para que alguien la mire.

### Los días sin marca de salida

**Medido sobre el histórico completo: 268 de 1571 jornadas, el 17%.** Son ocho meses,
3.058 marcas, 23 personas. (Una primera estimación del 41% quedó descartada: salió de una lectura
incompleta por un defecto de paginación, ya corregido.)

El 17% no está repartido parejo, y ahí está lo interesante:

| Persona | Identificador | Días | Sin salida | Qué es |
|---|---|---|---|---|
| GUILLERMO | 25 | 29 | **29 (100%)** | Solo abre las puertas — correcto, va ignorado |
| ELTHOM | 61 | 45 | 23 (51%) | Personal nuevo, acuerdo por confirmar |
| JORDAN | 2 | 96 | 46 (48%) | Entra y sale muchas veces al día |
| MARITZA | 10 | 48 | 20 (42%) | |
| REMY | 1 | 85 | 26 (31%) | Ya no marca desde mayo |
| JANET | 52 | 182 | 19 (10%) | |
| MARYLIN | 50 | 188 | 8 (4%) | |
| YESSICA | 19 | 186 | 15 (8%) | |
| JAEROCK | 40 | 68 | 2 (3%) | |
| SHEYLA | 58 | 106 | 4 (4%) | |

**La gente de turno fijo marca bien.** Yessica, Marylin, Jaerock y Sheyla, que son los que tienen
horario estable, están entre el 3% y el 8%. El problema se concentra en unos pocos casos y cada
uno tiene una explicación distinta: Guillermo no trabaja una jornada, Jordan entra y sale todo el
día, Elthom es nuevo. No es un problema general de disciplina.

Confirmado por Alexander: GUILLERMO entra solo a abrir las puertas y marca igual, así que sus 29
marcas únicas son correctas y no representan jornadas. Distinguir "no marcó la salida" de "no vino
a trabajar una jornada" no lo puede hacer el sistema solo.

**Consecuencia sobre el sueldo, que sí es cierta pase lo que pase con el número:** un día con
entrada y sin salida queda en `condicion='sin_dato'`, y `sueldo_entrada` corta la liquidación del
periodo entero nombrando cada fecha sin declarar (`0073_sueldos_rpc.sql:128-145`).

La alternativa sería peor. Si el sistema inventara una hora de salida estaría inventando plata, y
si marcara el día como trabajado con la salida en `null`, la liquidación colapsaría ese día a cero
horas y le comería el día entero a la persona. El corte ruidoso es el comportamiento correcto.

**Lo que hace el diseño:** no inventa nada y hace el problema visible temprano. La pantalla de
administración lista los días con entrada y sin salida, con nombre y fecha, para que el
administrador complete la hora a mano **antes** de liquidar, no cuando la liquidación se niegue a
correr. Completarla deja la fila con `fuente='manual'`, que es lo que corresponde: esa hora la
puso una persona.

Y para los casos como el de GUILLERMO, la misma pantalla permite marcar el identificador como
ignorado, de modo que sus marcas no generen jornadas que nadie va a completar nunca.

### Jornadas implausibles: el colapso no siempre acierta

El colapso de la primera a la última marca es correcto para quien entra, trabaja y sale. Para
quien entra y sale varias veces al día, no.

En los datos reales, JORDAN (identificador 2) tiene días con diez marcas repartidas entre las
00:22 y las 23:01: el colapso le da **22,6 horas trabajadas**. Y FERNANDO tiene un día con dos
marcas en el mismo minuto, que da **cero horas**.

Ninguna de las dos cifras es una jornada. El diseño no las corrige —inventar un tope sería
inventar una regla de negocio— pero **las marca**: la pantalla de administración lista aparte las
jornadas fuera de un rango razonable para que el administrador las revise antes de liquidar. El
rango es una fila de `config`, no un número en el código.

Esto no contradice el colapso `min`/`max`: lo confirma como la lectura correcta *y* como una que
necesita supervisión humana en los casos raros. Que sean raros importa: son un puñado de días
sobre 1.571.

### La transición que sí hay que hacer

La regla de no pisar otras fuentes tiene una excepción necesaria, y es una sola: **cuando la fila
queda con las dos horas cargadas, `condicion` pasa de `'sin_dato'` a `'trabajado'`**.

Sin esa transición el proyecto no sirve para nada en la práctica. La migración 0030 ya crea filas
de asistencia sola al enviar un reporte (`0030_reportes_asistencia.sql:20-24`), y esas filas nacen
sin horas y con `condicion` en su default `'sin_dato'`. Si el huellero les rellenara las horas
pero dejara la condición intacta, el día seguiría siendo invisible para la liquidación, que filtra
por `condicion <> 'sin_dato'`. Habría horas reales en la fila y la liquidación se negaría a
calcularse diciendo que falta declarar ese día. En las sedes donde se envían reportes —todas— eso
sería la mayoría de los días.

La transición es solo esa: `'sin_dato'` → `'trabajado'`, y **nunca** sobre una fila `'falta'`.
`fuente` se sigue dejando intacta: al motor no le importa quién cargó el dato, le importa que
esté declarado.

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

**Comprobado contra marcaciones reales del 15-ago-2026.** De los diez días con entrada y salida
registradas en esa muestra, el corte de las 13:00 habría roto **ocho**: quien entra a las 08:00 y
sale a las 14:00 deja una marca de cada lado del corte, y los dos turnos quedan sin salida. Ocho
jornadas completas liquidadas en cero horas. Los dos días que se salvaban eran de personas de
turno tarde, cuyas dos marcas caen del mismo lado por casualidad.

La muestra era incompleta por un defecto de paginación del script de diagnóstico, pero eso no
debilita la conclusión: **la partición por turno rompe cada vez que las dos marcas del día caen a
distinto lado del corte**, y eso pasa con todo el turno de mañana. Más datos solo agregan más
casos rotos.

Turnos observados, que tampoco coinciden con lo que asume el comentario de
`0073_sueldos_rpc.sql:159` (09:00–13:00 más 13:00–20:00 para todos): turno de mañana ~08:00–14:00,
turno de tarde ~14:00–20:00, y jornada larga ~08:00–19:00. Importa para `sueldo_acuerdo_turnos`:
si a alguien de turno mañana se le carga un horario contratado que empieza a las 09:00, la
tardanza sale mal.

### Las dos salvaguardas del sueldo

**Primera: no se pisa lo declarado.** Si ya existe fila para `(empleado_id, fecha, turno)` con
`fuente` distinta de `'huellero'`, la función solo rellena las horas que estén en `null`. Nunca
sobreescribe una hora cargada, nunca cambia `fuente`, nunca borra. Lo que escribió el
administrador a mano y lo que dejó el envío de un reporte mandan sobre la máquina. La única
excepción es la transición de `condicion` descrita arriba, sin la cual el dato queda invisible.

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
ingreso (RN-11), no un descuento de horas.

**El argumento que de verdad sostiene el colapso `min`/`max`** no es ese, sin embargo, y conviene
tenerlo claro antes de llevárselo al dueño. Con el horario real de LuceBien —09:00 a 13:00 más
13:00 a 20:00— el almuerzo cae **dentro** de las once horas contratadas. Hoy, con carga manual,
esa persona cobra once horas. Si al empezar a marcar se sumaran los tramos en vez de tomar la
primera y la última marca, cobraría diez. **Sumar tramos le bajaría el sueldo a alguien por el
solo hecho de empezar a marcar, sin que nadie haya cambiado ninguna regla.**

Por el no-negociable #5 eso importa: cambiar el colapso sería inventar una regla de negocio;
dejarlo es no inventar ninguna.

**Lo que sí queda abierto es otro caso, y no es el almuerzo:** la persona que se va dos horas al
mediodía por un trámite y vuelve. El colapso le paga esas dos horas. Hoy ese caso es invisible
porque nadie lo carga, y el huellero lo va a volver visible por primera vez. Va a
`docs/pendientes-negocio.md` como pregunta separada para el dueño: *¿el hueco del mediodía se paga
siempre, o solo hasta cierta cantidad de minutos?*

Y acá la tabla de marcas crudas gana una segunda razón de ser, más fuerte que la auditoría: si el
dueño decide dentro de tres meses que el hueco largo no se paga, **la regla se puede aplicar hacia
atrás**, porque las cuatro marcas siguen guardadas. Si el colector solo guardara entrada y salida,
esa decisión sería irrecuperable.

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

Un distintivo de origen en cada fila (manual, reporte, huellero) y filtro por fecha. El registro
manual sigue funcionando exactamente igual.

**Y se deja de mostrar la columna de minutos de tardanza.** Hoy la pantalla la lee de la tabla
(`asistencias-repo.ts:49`), donde el huellero la deja siempre en 0. Mostraría "0 min de tardanza"
al lado de una entrada de las 09:05, lo cual es falso a la vista aunque no afecte ni un sol de la
liquidación: la tardanza que se paga la calcula el motor contra el horario contratado, y son dos
cálculos distintos. O se quita la columna, o se muestra la tardanza calculada por el motor. Nunca
la columna cruda.

### `/asistencias/huellero` (nueva, solo administrador)

Una sola pantalla con tres partes:

**Estado del equipo.** Nombre, sede, IP y "última sincronización hace X minutos" con indicador
verde o rojo. Con un solo huellero es una tarjeta; con varios, una lista. Botón para dar de alta
un equipo nuevo con nombre, sede e IP.

**Días sin marca de salida.** La lista de pendientes más importante de la pantalla, porque cada
fila es una liquidación que se va a bloquear. Muestra nombre, fecha y hora de entrada, con un
campo para escribir la hora de salida. Completarla escribe la fila con `fuente='manual'` — la
puso una persona, y así queda registrado. Con los datos de agosto de 2026 esta lista tendría
cuatro de cada diez días, así que no es un caso de borde: es el uso principal de la pantalla
hasta que el hábito de marcar la salida se asiente.

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
11. **Jornada en curso**: una sola marca a las 09:00, fila con entrada cargada y
    `condicion='sin_dato'`. No viola `asistencias_trabajado_chk`. Este test es el que impide que
    la RPC falle once horas por día.
12. **Llega la segunda marca**: la fila pasa a `condicion='trabajado'` con las dos horas.
13. Fila de reporte sin horas: se rellenan y la condición transiciona, de modo que el día deja de
    ser invisible para la liquidación.

**Prueba de extremo a extremo, obligatoria antes de producción:** liquidar un periodo real con
datos del huellero y comprobar que las horas pagadas coinciden con las horas trabajadas. El
defecto de la partición por turno pasaba todos los tests unitarios de derivación y solo aparecía
al liquidar.

### Verificado contra la base real (15-ago-2026)

La migración 0075 se ejecutó dentro de una transacción con `rollback` sobre la base de
producción, sin dejar rastro, y estos siete casos dieron el resultado esperado:

| Caso | Resultado |
|---|---|
| Dos marcas, 08:00 y 14:00 | Una fila `trabajado`, 08:00–14:00, fuente `huellero` |
| Una sola marca a las 09:35 | Entrada cargada, salida `null`, condición `sin_dato` — no viola `asistencias_trabajado_chk` |
| Día declarado `falta` con marcas | La fila queda **intacta**: sin horas, fuente `manual`, condición `falta` |
| Fila de reporte sin horas | Horas rellenadas, condición pasa a `trabajado`, `fuente` sigue siendo `reporte` |
| Horas ya cargadas a mano (09:00–18:00) con marcas 07:00 y 22:00 | **No se pisan**: quedan 09:00–18:00, fuente `manual` |
| Día de reasignación (dos nombres) | No se crea ninguna fila |
| Vigencia del mapeo en cuatro fechas | 27 y 28 de enero a JAZMIN, 29 de enero y 4 de abril a NICOL |

El esquema completo compila, incluida la restricción de exclusión que impide dos mapeos
solapados para el mismo identificador (`btree_gist` ya está instalada en la base).

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
| `condicion='trabajado'` solo con entrada **y** salida | Lo exige `asistencias_trabajado_chk` (0073). Escribirla con una sola marca haría fallar la RPC durante toda la jornada. |
| Transicionar `condicion` aunque `fuente` sea de otro | Sin eso, una fila de reporte con horas reales sigue invisible para la liquidación y bloquea el cálculo del periodo. |
| Una fila por día, sin corte de turno | Nadie sale a almorzar: un día completo deja dos marcas. Partirlas por turno dejaba ambas filas sin salida y liquidaba cero horas. El grano correcto es el que usa la liquidación. |
| Cero parámetros de negocio nuevos | Al caer el corte de turno, no quedó ningún default que inventar. |
| Solo Supabase, no el sistema viejo | El viejo está congelado y tocarlo exige pedido explícito. |
| Histórico desde 2026-01-01 | Decisión del dueño del proyecto. |
| Usuario dedicado en vez de service key | El radio de daño de un `.env` robado en una PC de almacén queda acotado a insertar marcas. |

---

## Estado al 17 de agosto de 2026

**La migración `0075` está APLICADA y verificada en producción.** Cuatro tablas, nueve funciones,
dos columnas nuevas en `asistencias` y dos parámetros de configuración. Las 13 filas de
asistencias que existían quedaron intactas, y hay una copia en `asistencias_respaldo_0075` (el
plan gratuito de Supabase no incluye backups programados). Para deshacerla:
`packages/db/pruebas/0075_revertir.sql`.

La prueba `packages/db/pruebas/0075_huellero_asistencias.prueba.sql` cubre 27 casos y pasa. Se
corre con `bash tools/probar-migracion.sh 0075`, o pegándola en el editor de SQL: termina
lanzando un error `P0001` cuyo mensaje **es** el resultado.

### Lo que cambió respecto al diseño original

**El huellero emite TRAMOS, no una fila por día.** Mientras esto se construía, la sesión de
sueldos implementó C-01 (migración `0078`): las pausas dejaron de pagarse. Para que eso valga
también acá, la derivación empareja las marcas de a dos y escribe una fila por par. Con dos
marcas —el caso normal, porque nadie sale a almorzar— sigue siendo un solo tramo y nada cambia.

Confirmado por Alexander el 17-ago-2026: *"si alguien marca su salida y vuelve a habilitarlo el
mismo día se cuentan nuevamente las horas; no es que el sistema castigue, sencillamente no cuenta
esas horas como trabajadas"*.

El umbral que separa "se fue" de "apoyó el dedo dos veces" es `sueldo_pausa_minima_minutos`, 15
minutos, confirmado.

**JORDAN (identificador 2) y REMY (1) van ignorados.** Son el administrador y su familia: marcan
sin trabajar y no cobran. Eso explica los dos patrones que no cerraban en los datos —los días de
22 horas y casi la mitad de las marcas sueltas eran suyos.

### Los tres verificadores

Tres pasadas adversariales encontraron **27 fallos**, todos corregidos. Los que más pesaban:

| Qué pasaba | Cómo se arregló |
|---|---|
| `revoke from public, anon` no cerraba nada: Supabase concede `execute` a `authenticated` por defecto, y la función interna quedaba llamable por cualquier empleado logueado | `revoke ... from authenticated` explícito |
| Al mapear a la segunda persona se borraban las asistencias de la primera | Re-resolver cada marca contra la tabla entera de mapeos, no por diferencia con un rango |
| Sellar el origen dentro de `obs` era frágil: el formulario normal lo borraba en cada guardado | Dos columnas propias, `huellero_puso_entrada` y `huellero_puso_salida` |
| Con tramos, el primer tramo iba siempre a turno 'M', así que dejaba de completar la fila que deja un reporte (turno 'T') y bloqueaba la liquidación del mes | Los tramos se emparejan con las filas que ya existen, en orden |

### Lo que falta

1. **El colector** (`tools/colector-huellero/`). No existe todavía. El contrato con la base está
   cerrado y probado; falta el programa que corre en la computadora del almacén.
2. **El usuario del colector** en Supabase, y su registro en `huellero_colectores`.
3. **`packages/core/src/huellero.ts` quedó desactualizado.** Sus 40 tests pasan, pero refleja el
   modelo viejo de una fila por día. No afecta el funcionamiento —quien manda es el SQL— pero
   deja de servir para lo que existe: probar las reglas sin una base delante.
4. **Cerrar el motivo `revisar:` al resolver un día.** `declararDia` no toca `obs`, así que un día
   ya resuelto sigue apareciendo marcado y, con el tope de 400 filas del listado, puede empujar
   fuera a los pendientes más viejos.
5. **Los tres pendientes con el dueño**, en `docs/pendientes-negocio.md`: los parámetros de
   tardanza, los horarios contratados de cada persona, y qué hacer con los días sin marca de
   salida.
