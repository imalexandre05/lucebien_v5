# Integración huellero Hikvision → asistencias

> Estado al 14-ago-2026: **diseño en curso**, arquitectura aprobada por Alexander, **sin una
> línea de código escrita**. Falta cerrar modelo de datos, colector, derivación, pantallas ERP,
> seguridad/RLS y testing; después la spec en `docs/superpowers/specs/`; recién después el plan
> de implementación.
>
> Este documento existe porque la asistencia es la entrada del sistema de sueldos: sin ella el
> motor de `packages/core/src/sueldos.ts` no tiene qué liquidar.

---

## Qué se está haciendo

Automatizar las asistencias del ERP nuevo leyendo el huellero biométrico del almacén, en vez de
que alguien las cargue a mano.

## El dispositivo (verificado contra su web de administración)

| Dato | Valor |
|---|---|
| Modelo | Hikvision DS-K1T321MFWX |
| Firmware | V3.9.1 build 230619 |
| Dirección | 192.168.1.220, fija, en la LAN del almacén. HTTPS habilitado, usuario admin |
| Personas registradas | 54 |
| Huellas | 111 |
| Eventos guardados | ~42.900 de 150.000 de capacidad |

Hik-Connect está online pero **no se usa** para la integración. ISUP deshabilitado. El SDK no se
usa.

**Protocolo elegido: ISAPI** (REST con autenticación digest).
Eventos: `POST /ISAPI/AccessControl/AcsEvent?format=json`.

---

## Decisiones tomadas

No se reabren sin hablar con Alexander.

1. **Colector Node con polling cada 5 minutos y checkpoint**, no push ni escucha HTTP. Corre en
   la PC del almacén bajo PM2 — siempre prendida, a veces se apaga pero enciende sola. **No es la
   PC del sistema viejo.** Al arrancar recupera lo pendiente.
2. **Destino: sólo Supabase.** La tabla `asistencias` con `fuente = 'huellero'`. El sistema viejo
   (Express + SQLite) no se toca: está congelado.
3. **El Employee ID del huellero no coincide con el código de empleado.** Hace falta una tabla de
   mapeo (`dispositivo`, `employee_id_huellero` → `empleado_id`) editable desde el ERP. Una marca
   sin mapeo se guarda con `empleado_id` en null y aparece en una cola de "sin asignar"; se
   reprocesa al crear el mapeo. **Nada se descarta en silencio.**
4. **`minutos_tardanza` = 0 siempre**, por ahora. No existe el sistema de horarios, así que no hay
   contra qué comparar la hora de entrada. Inventar una regla acá rompería el no-negociable 5.
   Sólo se registran horas reales.
5. **Dos capas.** Una tabla nueva `marcas_huellero` guarda el evento crudo y auditable; de ahí se
   derivan las `asistencias`: primera marca del día = hora de entrada, última = hora de salida. El
   corte entre turno mañana y tarde es configurable desde `/configuracion`, con default 13:00
   (anotado en `docs/pendientes-negocio.md` como default inventado).
6. **La derivación nunca pisa** una fila de `asistencias` con fuente `manual` o `reporte`: sólo
   completa horas vacías. El unique `(empleado_id, fecha, turno)` ya existe.
7. **Backfill histórico desde 2026-01-01**, con el mismo colector en modo one-shot paginado.
8. **Multi-dispositivo desde el día uno**: una tabla `dispositivos` con IP, credenciales y sede, y
   el colector itera sobre ella. Hoy hay un solo huellero.
9. **Escritura a Supabase con un usuario dedicado `huellero`** y una RPC `SECURITY DEFINER` que
   sólo permite insertar marcas. **Ninguna service key en la PC del almacén**, y no se agrega
   `getAdminClient` a ningún archivo nuevo (no-negociable 3).

---

## Reglas del repo que pegan fuerte acá

- Esto **toca la cadena del sueldo**: la asistencia alimenta la liquidación y la evaluación. Zona
  crítica → spec escrita, tests, y subagente verificador antes de mergear.
- Migraciones: sólo agregar la siguiente numerada (la última es la `0066` — verificar antes),
  idempotente.
- El core nunca llama `new Date()`: recibe `hoyPeru()` de quien lo invoca. Los cron de Supabase
  corren en UTC.
- Zone Guard: la spec y el código jamás en el mismo commit.
- Todo parámetro de negocio editable desde `/configuracion`, nunca quemado en el código.

---

## Archivos ya explorados

| Archivo | Para qué sirve |
|---|---|
| `packages/db/migrations/0001_init.sql:212` | La tabla `asistencias`, con su unique `(empleado, fecha, turno)` |
| `packages/db/migrations/0025_asistencias.sql` | Su RLS: el empleado ve lo suyo, sólo el administrador escribe |
| `packages/db/migrations/0030_reportes_asistencia.sql` | Auto-asistencia desde un reporte — el patrón `SECURITY DEFINER` a imitar |
| `apps/erp-web/lib/asistencias-repo.ts`, `app/asistencias/` | La pantalla que existe hoy |
| `routes/horarios.js` | El sistema de horarios del sistema viejo, referencia para cuando exista la tardanza |

---

## Cómo se conecta con el sistema de sueldos

El motor de sueldos (`packages/core/src/sueldos.ts`) necesita, por cada día del periodo, la hora
de entrada y la de salida. Eso es exactamente lo que produce la derivación del punto 5.

Dos consecuencias que la spec de sueldos ya asume y que esta integración tiene que respetar:

- **Todo día contratado necesita su fila**, trabajada o no. Una falta se declara con
  `hora_ingreso` en null; omitir el día hace que el motor corte con error, a propósito.
- **La tardanza la calcula el motor de sueldos**, no el huellero: deriva el límite del horario
  contratado del día más la tolerancia. El `minutos_tardanza = 0` del punto 4 es para la
  evaluación mensual, que es otro camino.

---

_Contexto aportado por Alexander el 14 de agosto de 2026. Actualizar cuando se cierre el diseño._
