# Auditoría visual y de flujo — 12-sep-2026

> Pedida por Alexander tras un pantallazo del mapa de piso ("el layout se siente mal, cuando
> aparecen los botones de distintas secciones debe poder presionarse ahí mismo") con encargo de
> hacer una auditoría completa del diseño y flujo, usando Playwright contra sesión real.
>
> **Método:** `erp-dev` (PM2, puerto 3005) con las 2 cuentas dedicadas de E2E (`Prueba Admin` sede
> ST, `Prueba Colaborador` sede AL — ver `docs/harness.md`), navegador real vía Playwright, capturas
> de pantalla revisadas una por una. No es una opinión sobre código: es lo que la pantalla
> realmente dibuja.

---

## 1. El hallazgo puntual — confirmado y corregido

El desplegable "N zonas en este punto" (`layout-map.tsx`) se cerraba solo con cada clic: marcar
la segunda de 4 zonas superpuestas obligaba a reabrirlo desde cero. Corregido — los ítems del
desplegable ya no pasan por el `toggle()` que reseteaba el estado; se agregó además un botón ✕
explícito para cerrarlo a propósito. Commit `2550b20`.

No se pudo reproducir visualmente el caso exacto de 4 zonas superpuestas (la sede con datos de
prueba sin evaluar hoy, ST, no tiene ese solape en su layout) — la corrección se verificó por
lectura de código, no en vivo contra ese caso puntual. El resto del mapa (proporción, tamaño de
zona, mapa de piso en modo evaluación) sí se vio en vivo y se ve bien — ver §2.

## 2. Lo que se recorrió y SÍ se ve bien

Contra la impresión de "se siente muy rústico": lo que se navegó en vivo no lo confirma. Capturado
y revisado:

- **Dashboard** (admin y colaborador): pipeline por etapa, cobertura de turnos, actividad reciente,
  top operarios — con datos reales, sin huecos ni texto de relleno.
- **Historial de reportes** (admin): tabla con filtros, badges de estado coloreados, puntaje con
  color por rango.
- **Evaluar reporte** (mapa de piso en modo evaluación + lista de actividades): la corrección de
  proporción de hoy (`b47579c`, aspect 800/580 fijo) se ve bien — zonas con su forma real, sin
  deformación.
- **Notificaciones** (campana + página completa): filtros, iconos por severidad, estados vacíos,
  marcar leída — nada rústico, ya estaba maduro antes de esta sesión.
- **Solicitudes** (lista, nueva solicitud, filtros): igual — StatBox de resumen, badges, modal
  bien resuelto.
- **Configuración → Notificaciones**: la pantalla que la spec del 6-sep dejó anotada como "sin
  comprobación visual" — comprobada ahora, se ve correcta (11 reglas agrupadas, toggle y umbral).
- **Mis reportes** (nuevo, esta sesión): aparece en `/reportes/nuevo`, con datos reales, para el
  colaborador.
- **Responsive 375px** de `/reportes/nuevo`: se reacomoda sin romperse.

Conclusión honesta: la queja general de "rústico" no se sostuvo contra la sesión real, más allá
del caso puntual del §1 (ya corregido) y los dos hallazgos menores de abajo.

## 3. Un susto que NO era real — anotado para no repetir la confusión

Corriendo dos suites de Playwright a la vez contra el mismo `erp-dev` (modo desarrollo), 3 pantallas
de admin (`/`, `/configuracion/notificaciones`, `/solicitudes`) tiraron **Server Error**:
`TypeError: Cannot read properties of null (reading 'useContext')` en `usePathname`, con el aviso
de Next.js de "más de una copia de React". El mismo run tumbó además 2 casos de
`admin.navegacion.spec.ts` (`/personal/dashboard` con 500, y la ficha de personal sin ningún link
de persona).

**Reproducido en aislamiento (sin la segunda suite corriendo): las 60 pruebas de `admin.navegacion`
+ la auditoría visual de admin pasaron limpio, sin un solo error.** Es un artefacto de saturar un
servidor de Next.js en modo desarrollo con dos sesiones de prueba pesadas a la vez, no un defecto
del producto. Se anota acá para que si vuelve a aparecer un día de verdad, no se pierda tiempo
sospechando de lo mismo: **primero confirmar si hay algo más corriendo contra el mismo `erp-dev`**.

## 4. Hallazgo menor, sin acción por ahora

Dos notificaciones `reporte_auto_evaluado` de la misma sede y fecha (AL, 2026-08-06) se leen
IDÉNTICAS ("El reporte de AL del 2026-08-06 se evaluó solo…") porque el mensaje no menciona el
turno. Verificado contra la base: son dos reportes reales y distintos (`06-08-26_T-AL` y
`06-08-26_C-AL`, cada uno con su propio `dedup_key`) — el motor de deduplicación funciona bien, es
sólo el texto el que no distingue. Mejora cosmética menor (agregar el turno al mensaje), toca la
función SQL que arma el texto — spec/migración chica si se quiere, no urgente.

## 5. Hallazgo de permisos, ya anotado por separado

`reporte_extras.puntos_total` es legible por API directa (RLS por sede, no recorta la columna) —
ver `docs/pendientes-negocio.md`, hallazgo del 12-sep-2026. No es nuevo de esta sesión, se repite
acá sólo como referencia cruzada.

## 6. Estado de la suite E2E

`admin` + `colaborador` + `anonimo`, en aislamiento: **87/87 en verde** (85 del run con carga +
2 reconfirmados solos, ver §3). Suma `colaborador.mis-reportes.spec.ts` (3 casos, spec del 12-sep).

## 7. Lo que esta auditoría NO cubrió

- El caso exacto de 4+ zonas superpuestas en vivo (§1) — no había un reporte sin evaluar con ese
  layout en los datos de prueba de hoy.
- Los flujos de ESCRITURA de solicitudes (aprobar/entregar/confirmar) — la sesión de prueba no
  tenía ninguna solicitud activa para recorrer ese camino completo.
- Ningún dispositivo real (sólo Chrome desktop 1280×720 y un 375×812 simulado para `/reportes/nuevo`).
