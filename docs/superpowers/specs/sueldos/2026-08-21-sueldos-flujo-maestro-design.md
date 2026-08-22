# SPEC — Flujo maestro del sistema de sueldos (ciclo de vida del colaborador)

> **Qué es este documento.** El administrador describió el sistema de sueldos como un flujo de
> 15 pasos que acompaña al colaborador desde la entrevista hasta el resumen de fin de mes. Este
> documento fija ese flujo, lo mapea contra lo que ya existe, y lo parte en fases construibles.
> **No reemplaza a [SPEC-sistema-sueldos.md](SPEC-sistema-sueldos.md)**: aquella define el motor
> de cálculo (RN-01 a RN-20); esta define el recorrido completo y las pantallas.
>
> **Estado:** aprobada por Alexander el 21-ago-2026. Las decisiones marcadas ⚠️ requieren
> confirmación del dueño antes de implementarse (mismo criterio que §9.5 V-03 de la spec del
> motor: Alexander es locador de servicios, no el dueño).

---

## 1. Los 15 pasos del administrador y su estado

| # | Paso | Estado hoy | Fase |
|---|---|---|---|
| 1 | Entrevista | No existe (PEND-01) | F3 |
| 2 | Prueba de 3 días y su resultado | No existe (PEND-02) | F3 |
| 3 | Registro de datos del personal | Parcial (`/colaboradores`, `/empleados`) | F3 |
| 4 | Documentación del personal | No existe (PEND-04) | F3 |
| 5 | Acuerdos de contrato: horario, sueldo, meta, funciones | Existe `/sueldos/acuerdos`; funciones del cargo no (PEND-05) | F1 (F3 funciones) |
| 6 | Registro de asistencias | Existe (huellero + `/sueldos/asistencia`) | F1 |
| 7 | Ventas > S/120 y las 4 semanas de meta | Backend existe (`sueldo_ventas`); carga manual del admin | F1 |
| 8 | Registro de adelantos | Existe (`/sueldos/movimientos`) | F1 |
| 9 | Reportes con descuento | Existe (`/sueldos/movimientos`) | F1 |
| 10 | Justificaciones del colaborador + avisos al admin | No existe (PEND-06) | F2 |
| 11 | Cálculo de sueldo | Existe (`/sueldos/liquidaciones`, motor en core) | F1 |
| 12 | Nota mensual y evaluación (con exámenes) | Nota existe (`/evaluaciones`); exámenes no | F4 |
| 13 | Observaciones del personal | Existe (cierre del periodo, §3.7 del motor) | F1 |
| 14 | Qué falta regularizar: incidencias, prendas perdidas | Parcial (`/incidencias`); revocación no (HUE-03) | F5 |
| 15 | Resumen informativo mensual (admin y colaborador) | No existe (PEND-09) | F1 |

Los pasos 1-4 aplican al colaborador nuevo que el administrador no conoce. El onboarding de
capacitación que planteó el dueño se ubica entre el paso 4 y el 5, y se diseña en F6.

### El flujo en 6 etapas

```
ADMISIÓN (1-4)        candidato: entrevista → prueba 3 días → datos → documentación
CONTRATO (5)          acuerdo: horario, sueldo, meta, funciones
OPERACIÓN (6-9)       asistencia · ventas/metas · adelantos · reportes
CIERRE (10-11)        justificaciones validadas → cálculo del motor
EVALUACIÓN (12-13)    nota /20 (+ examen como componente) · observaciones
ENTREGA (14-15)       pendientes de regularizar (informa) · resumen mensual
```

---

## 2. Decisiones tomadas (Alexander, 21-ago-2026)

| Tema | Decisión |
|---|---|
| Alcance | Spec maestra del flujo completo; se construye por fases empezando por el rediseño de lo existente |
| Origen de las ventas (paso 7) | **El admin las registra a mano por ahora**; la integración con el sistema del otro programador queda en F6. La carga manual queda como respaldo permanente |
| "Las semanales (4 etapas)" | Son las 4 semanas de meta del mes (RN-12). No es un concepto nuevo |
| Exámenes y nota /20 | ⚠️ Componente **nuevo con peso configurable** en `calcularNotaMensual()`. Default de peso: **0** hasta confirmación del dueño — con peso 0 el motor no cambia ningún pago |
| Regularizaciones (paso 14) | **Solo informan** en la liquidación. El descuento lo decide el admin registrando un reporte. La sanción es revocable (HUE-03) |
| Candidatos | Tabla separada de `empleados`. El rechazado queda como historial. **Existe la ruta directa "contratar por experiencia"** que salta entrevista y prueba. Candidatos sin login |
| Colaborador desde el celular | Justificar tardanzas/faltas · ver su asistencia y su resumen mensual · rendir exámenes y capacitación. **Adelantos NO**: se piden en persona y los registra el admin |
| Admin desde el celular | El mismo dashboard responsive, para ver cómo va la empresa. Sin funciones exclusivas |
| Avisos | Solo dentro del sistema (`/notificaciones` + campana). Sin WhatsApp ni correo |
| Plazo para justificar | Hasta el cierre del periodo, configurable. El colaborador recibe aviso antes del cierre si tiene eventos sin justificar. El admin puede marcar un evento como **no justificable** |
| Onboarding/capacitación | Fase futura (F6). Esta spec solo lo ubica en el flujo |
| Móvil | Web responsive con vista por rol. Sin PWA ni app nativa |

---

## 3. Navegación (enfoque híbrido)

Tres vistas sobre los mismos datos. Nada se registra dos veces.

### 3.1 Admin escritorio — por proceso (operación diaria)

`/sueldos` se vuelve un hub que muestra el ciclo del periodo y da entrada a:
Acuerdos · Asistencia · Ventas y metas · Movimientos · Liquidaciones.

Disposición grande y guiada (la del SCI viejo que el personal ya conoce) con la paleta
navy/gold del ERP — ver `docs/sistema-de-diseno.md`. No se repinta: se rediseña el flujo.

### 3.2 Expediente — por persona

`/colaboradores/[id]` ya existe ([spec del 20-ago](../2026-08-20-modulo-colaboradores.md)) y es
la columna vertebral: se le suma la línea de tiempo de las 6 etapas — Admisión · Contrato
vigente · Periodo actual (asistencia, ventas, movimientos, justificaciones) · Evaluación ·
Liquidaciones · Documentos · Observaciones. Las secciones nuevas aparecen conforme sus fases
se construyan.

### 3.3 Mi espacio — colaborador (móvil primero)

Amplía `/mi-desempeno`: mi asistencia · justificar tardanza/falta · mi resumen mensual · mis
exámenes · mi evaluación. RLS estricta: cada uno ve solo lo suyo (no-negociable 3).

---

## 4. Fases

### F1 — Rediseño de la operación existente (pasos 5-9, 11, 13, 15)

**Sin tocar el motor.** Solo pantallas, más la vista del resumen.

- **Acuerdos:** el formulario existente guiado por pasos (horario → sueldo → metas → parámetros),
  mostrando al costado la tarifa y la meta sugeridas (RN-14, RN-10) como referencia para negociar.
- **Asistencia:** día activo por defecto, marcas del huellero a la vista, pausas y huecos
  explicados en pantalla (RN-05) para que el admin entienda por qué una jornada suma lo que suma.
- **Ventas y metas:** carga rápida por fecha/tienda/tipo/monto, semáforo de las 4 semanas contra
  su meta (RN-12), boletas > S/120 marcadas como base de comisión (RN-13), cola de ventas sin
  vendedor visible (nada se descarta en silencio).
- **Movimientos:** adelantos, reportes y bonos con motivo y monto obligatorios (el motor ya lo
  valida; la pantalla lo exige antes de enviar).
- **Liquidación:** desglose RN-19 donde **cada línea abre los registros que la originan**
  (RN-20). Observaciones y pendientes de regularizar al costado.
- **Resumen mensual (PEND-09):** vista imprimible de solo lectura del resultado del motor.
  Versión admin (todo el desglose) y versión colaborador (solo él). **Sin lógica propia** — el
  error de la hoja `RESUMEN` del Excel no se repite.
- **Expediente v1:** línea de tiempo con las secciones que ya existen.

### F2 — Justificaciones y avisos (paso 10, PEND-06) — migración nueva

- Tabla `justificaciones`: empleado, fecha del evento, tipo (`tardanza`|`falta`), motivo,
  adjunto opcional, estado (`pendiente`|`aceptada`|`rechazada`|`no_justificable`), quién y
  cuándo resolvió.
- El colaborador crea desde Mi espacio hasta el cierre del periodo (plazo configurable).
- **Aceptar una justificación marca `tardanza_justificada`/`falta_justificada` vía RPC** —
  nunca un update plano sobre asistencias.
- El admin puede marcar un evento como no justificable (lo cierra para el colaborador).
- Avisos in-app: al admin cuando llega una justificación; al colaborador cuando se resuelve y
  antes del cierre si tiene eventos sin justificar.
- RLS: el colaborador ve y crea solo lo suyo; el admin ve todo.

### F3 — Admisión (pasos 1-4, PEND-01..05) — migración nueva

- Tabla `candidatos` con estado (`entrevista` → `prueba` → `aprobado`|`rechazado`), datos de
  la entrevista (resultado, notas) y de la prueba de 3 días (resultado por día y final).
- **Ruta directa "contratar por experiencia"**: convierte a empleado saltando entrevista/prueba,
  dejando registrado que fue directo.
- Al aprobar: conversión a empleado heredando los datos. El rechazado queda como historial.
- `empleado_documentos`: tipo, adjunto, vencimiento, aviso al admin cuando vence (PEND-04).
- Funciones del cargo en el acuerdo (PEND-05).

### F4 — Exámenes y componente de nota (paso 12) — **cadena del sueldo**

- El admin crea exámenes (preguntas, respuestas, puntaje); el colaborador rinde desde el
  celular; la nota sale sola.
- ⚠️ Entra como componente nuevo de `calcularNotaMensual()` con **peso configurable, default 0**.
  Con peso 0 ningún pago cambia; subirlo es decisión del dueño desde `/configuracion`.
- Exige su propia spec corta + tests + subagente verificador antes de mergear
  (no-negociables 1 y 6).

### F5 — Regularizaciones (paso 14, HUE-03)

- Sanción por prenda perdida o incidencia **revocable**: si la prenda aparece, se revoca con
  motivo y queda rastro de quién y por qué.
- Panel "pendiente de regularizar" en la liquidación y el expediente. **Solo informa**: el
  descuento lo decide el admin como reporte (§3.6 del motor).

### F6 — Futuro (solo hoja de ruta)

- Onboarding/capacitación con módulos para nuevos (idea del dueño; sin diseño aún).
- Integración de ventas con el sistema del otro programador (`tuxedo`); la carga manual de F1
  queda como respaldo.

---

## 5. Reglas transversales

- El motor no se toca en F1, F3 ni F5. Solo F4 entra a `packages/core`, con spec completa.
- Toda migración: `bash tools/reservar-migracion.sh <slug>`, idempotente, defaults editables
  desde `/configuracion` y anotados en `docs/pendientes-negocio.md`.
- Fechas en hora Perú; el core recibe `hoyPeru()` (patrón de `evaluaciones.ts`).
- Cada fase lleva su propia spec corta y su PR separado, uno por uno.
- Los cuatro aislamientos del no-negociable 3 aplican a toda pantalla nueva, en especial a
  Mi espacio y al resumen del colaborador.

## 6. Pendientes de negocio que esta spec deja abiertos

| Código | Qué falta decidir | Quién |
|---|---|---|
| ⚠️ Peso del examen en la nota /20 | Hoy default 0; qué peso real tendrá | Dueño |
| PEND-10 | Qué efecto tienen los mínimos de venta para continuar | Dueño |
| HUE-02 | Garantía mínima de una semana trabajada para dar adelanto | Dueño (validación al registrar) |
| HUE-04 | Si la comisión por ticket "aparte" es RN-13 u otra cosa | Dueño — antes de rediseñar ventas en F1 |
