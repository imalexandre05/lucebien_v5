# Índice de documentos

> Una línea por documento. **No los abras por contexto** — abrí el que la tarea pida.
> Si creás uno nuevo, sumá su línea acá. Es la regla de cierre de `CLAUDE.md`.

## Empezar por acá

| Documento | Qué contiene |
|---|---|
| [mapa-verificado.md](mapa-verificado.md) | **El estado real del sistema**, verificado contra código y base. Alcance, adopción, decisiones tomadas, qué falta definir |
| [rigor-por-zona.md](rigor-por-zona.md) | Cuánto proceso exige un cambio según dónde cae. La matriz zona → nivel de spec |
| [pendientes-negocio.md](pendientes-negocio.md) | Parámetros sembrados con un default que nadie confirmó. Se lee antes de tocar cualquier regla de negocio |
| [harness.md](harness.md) | **Cómo trabajar en varias secciones a la vez sin pisarse**: las cuatro redes de verificación, los tres agentes, el protocolo de paralelo y el ciclo completo |
| [aprendizajes.md](aprendizajes.md) | **Los errores ya cometidos y cómo se detectan ahora.** Cada fila la puso un error real. Se lee al empezar algo del área que toca, y se le suma una fila cada vez que algo sale mal |

## Negocio y procesos

| Documento | Qué contiene |
|---|---|
| [operacion-diaria.md](operacion-diaria.md) | **Cómo funciona el negocio en la realidad**: qué hace cada rol cada día, en cada sede, y el flujo real de las prendas |
| [integracion-huellero.md](integracion-huellero.md) | Diseño de la integración del huellero Hikvision del almacén → tabla `asistencias`. Es la entrada del sistema de sueldos |
| [puesta-en-marcha-huellero.md](puesta-en-marcha-huellero.md) | **Los ocho pasos para encender el huellero**: backup, migración, prueba, usuario del colector, alta del equipo, instalación en la PC del almacén y qué revisar antes de la primera liquidación |
| [defecto-derivacion-huellero.md](defecto-derivacion-huellero.md) | **RESUELTO** (verificado 8-sep): `huellero_derivar_asistencia()` ya no escribe `'trabajado'` sin las dos horas ni borra una hora declarada a mano — lo cerraron de paso las migraciones `0096`/`0097` |
| [huellero-identificadores-sin-asignar-06-sep.md](huellero-identificadores-sin-asignar-06-sep.md) | **880 marcas del huellero sin asignar**, 13 identificadores, 5 de personas activas (622 marcas) y 2 vivos hoy — con quién es cada uno y en qué orden asignarlos |
| [integracion-tuxedo.md](integracion-tuxedo.md) | Inspección del sistema comercial TUXEDO Pro (inventario, POS, alquiler, caja) y contrato de datos propuesto para que el motor de sueldos consuma ventas/metas por sede sin acoplarse |
| [hoja-de-ruta-sistema.md](hoja-de-ruta-sistema.md) | Cómo se conecta todo para que la evaluación mensual salga automática y trazable |
| [entrevista-dueno.md](entrevista-dueno.md) | Primera ronda de preguntas al dueño — **respondida** |
| [respuestas-dueno-2.md](respuestas-dueno-2.md) | **Las respuestas del dueño**, agrupadas por tema: puntos, urgencias, Valores 360°, horarios, sanciones, sueldos y qué es lo que más plata hace perder |
| [entrevista-dueno-2.md](entrevista-dueno-2.md) | Segunda ronda, el cuestionario original — **respondido** |

## Specs

| Documento | Qué contiene |
|---|---|
| [superpowers/specs/sueldos/SPEC-sistema-sueldos.md](superpowers/specs/sueldos/SPEC-sistema-sueldos.md) | **Las reglas del sueldo**: modelo, RN-01 a RN-20, el caso de prueba y el registro de cada decisión del dueño (§9). Implementada en `packages/core/src/sueldos.ts` |
| [superpowers/specs/permisos/SPEC-aislamiento-datos-personas.md](superpowers/specs/permisos/SPEC-aislamiento-datos-personas.md) | **Quién puede ver datos de otras personas**: cierra 3 agujeros vivos del no-negociable 3 y hace que la RLS respete la matriz de permisos que edita el administrador |
| [superpowers/specs/sueldos/SPEC-esquema-sueldos.md](superpowers/specs/sueldos/SPEC-esquema-sueldos.md) | **Dónde se guardan**: tablas, RPC, RLS y congelado. ✅ Aplicada en la `0072`. Incluye los 3 bloqueantes, los 3 agujeros de aislamiento encontrados en producción y los 10 defectos que abrió el verificador antes de aplicar |
| [superpowers/specs/sueldos/SPEC-cambios-reglas-2026-08-17.md](superpowers/specs/sueldos/SPEC-cambios-reglas-2026-08-17.md) | **Cinco cambios a las reglas** salidos de las respuestas del 16 y 17-ago: las pausas dejan de pagarse (C-01, el más grande), la semana larga sube su meta (C-02), la hora fuera de contrato se puede pactar aparte (C-03), por qué RN-13 **no** tenía el error que se le atribuyó (C-04) y la regla A del marcaje astuto (C-05). **Los cinco implementados** el 17-ago; las migraciones 0076-0078 escritas y todavía sin aplicar |
| [superpowers/specs/2026-08-15-huellero-asistencias-design.md](superpowers/specs/2026-08-15-huellero-asistencias-design.md) | **La hora real de entrada y salida**: el huellero Hikvision del almacén llena `asistencias` por ISAPI. Migración `0075` y `packages/core/src/huellero.ts` escritos y probados, **sin aplicar**. Alimenta la liquidación, así que trae las salvaguardas que protegen la falta declarada y las horas cargadas a mano. Incluye por qué el mapeo lleva vigencia: el equipo reutiliza los identificadores |
| [superpowers/specs/2026-08-15-huellero-respuesta-sueldos.md](superpowers/specs/2026-08-15-huellero-respuesta-sueldos.md) | **Qué contestó sueldos al huellero**: dos choques bloqueantes contra la `0073`, por qué el colapso `min`/`max` se queda, y la numeración de migraciones corregida. Verificado contra el código, no contra la otra spec |
| [superpowers/specs/2026-08-20-modulo-colaboradores.md](superpowers/specs/2026-08-20-modulo-colaboradores.md) | **Un módulo en lugar de ocho entradas**: el ERP estaba organizado por tabla y quien administra piensa por persona. `/colaboradores` con período único en la URL y siete secciones que reusan los clientes que ya existían. Incluye el hilo de los cinco pasos que separan a alguien de su pago, y por qué Valores 360° no usa el permiso `valores` |
| [superpowers/specs/evaluaciones/2026-10-05-valores360-anonimato-design.md](superpowers/specs/evaluaciones/2026-10-05-valores360-anonimato-design.md) | **Valores 360°: sólo el administrador ve quién puntuó a quién.** Quita `datos_personas` de la policy y hace que la función devuelva sólo promedios, y sólo con un mínimo de 3 evaluaciones (parámetro provisional, editable). Migración 0112 |
| [superpowers/specs/sueldos/2026-08-21-sueldos-flujo-maestro-design.md](superpowers/specs/sueldos/2026-08-21-sueldos-flujo-maestro-design.md) | **El ciclo de vida completo del colaborador en 15 pasos y 6 fases**: qué existe, qué falta (admisión, justificaciones, exámenes, regularizaciones, resumen) y en qué orden se construye. Navegación híbrida: procesos para el admin, expediente por persona, Mi espacio móvil del colaborador. Las decisiones del 21-ago con lo que queda ⚠️ pendiente del dueño |
| [superpowers/specs/sueldos/2026-08-24-liquidacion-por-tramos-design.md](superpowers/specs/sueldos/2026-08-24-liquidacion-por-tramos-design.md) | **Un contrato de varios meses se liquida en tramos**, no de una sola vez al final. Verificado: el motor de `packages/core` no necesita cambiar, sólo un índice, una RPC y la pantalla. `sueldo_pactado` pasa a ser la cuota de cada liquidación (✅ confirmado, §2) — sin implementar todavía |
| [superpowers/specs/reportes/2026-09-12-mis-reportes-design.md](superpowers/specs/reportes/2026-09-12-mis-reportes-design.md) | **El operativo ve el estado de sus propios reportes** (evaluado/pendiente, puntaje general) desde «Interno», sin tocar RLS ni exponer los puntos de extras que el dueño decidió ocultarle en la Fase 5. Anota aparte un hallazgo de RLS sin cerrar en `pendientes-negocio.md` |

## Arquitectura

| Documento | Qué contiene |
|---|---|
| [arquitectura-core-adapter.md](arquitectura-core-adapter.md) | Separación core / adapter: qué es lógica genérica y qué es específico de LuceBien |
| [arquitectura-unificada.md](arquitectura-unificada.md) | Visión de plataforma unificada (previa al recorte de alcance) |
| [schema-actual.md](schema-actual.md) | Esquema de datos |
| [mapeo-migracion.md](mapeo-migracion.md) | Correspondencia entre el sistema viejo y el nuevo |

## El sistema viejo (Express + SQLite)

| Documento | Qué contiene |
|---|---|
| [auditoria-legacy/](auditoria-legacy/) | Auditoría en 5 partes: backend y autorización, modelo de datos, frontend, reglas de negocio, operación y brechas |
| [sistema-actual-mapa.md](sistema-actual-mapa.md) | Mapa del sistema viejo. ⚠️ Anterior al recorte de alcance |

## Diseño

| Documento | Qué contiene |
|---|---|
| [manual-de-marca.md](manual-de-marca.md) | Colores, tipografías y criterio estético. Navy `#2e3e6e` · gold `#b8a515` |
| [sistema-de-diseno.md](sistema-de-diseno.md) | **Cómo viven la marca y el criterio dentro del código**: los tokens semánticos, el presupuesto de movimiento, el área tocable de 44px y los componentes compartidos. Se lee antes de pintar cualquier cosa: sin esto el camino corto es escribir `bg-emerald-600` y agregar el cuarto verde del sistema |
| [pendiente-frontend-prod.md](pendiente-frontend-prod.md) | **Qué falta para mandar el ERP a producción**: los dos bugs del Modal que hay que confirmar en pantalla, el responsive a 360px, el «menos escribir y más presionar», y los flujos que hay que recorrer a mano. Escrito al cerrar la sesión del 21-ago-2026 |
| [brief-fable-ui.md](brief-fable-ui.md) | Elevación visual del ERP: dashboard, shell móvil, login, estados |
| [prompts-design/](prompts-design/) | 8 documentos: identidad, color y tipografía, componentes, materiales físicos, redes, uniformes |

## Auditorías e informes

| Documento | Qué contiene |
|---|---|
| [auditoria-2026-05-10.md](auditoria-2026-05-10.md) | 22 hallazgos, 12 corregidos |
| [auditoria-2026-07-02.md](auditoria-2026-07-02.md) | Segunda auditoría |
| [auditoria-2026-08-23.md](auditoria-2026-08-23.md) | **La de antes de entregarlo a la gente.** 125 hallazgos, 58 pasados por refutación adversarial, 22 lotes de corrección. Qué estaba roto, qué atrapó el proceso, y qué queda abierto |
| [auditoria-2026-09-12-ux-visual.md](auditoria-2026-09-12-ux-visual.md) | **Auditoría visual con sesión real (Playwright).** El desplegable del mapa de piso corregido, la queja de "rústico" no se sostuvo salvo ese caso, y un susto de Server Error que resultó ser dos suites de prueba pisándose el mismo `erp-dev` — no un bug real |
| [auditoria-pipeline-prendas.md](auditoria-pipeline-prendas.md) | Auditoría específica del pipeline |
| [informe-avances-2026-07-01.md](informe-avances-2026-07-01.md) | Informe de avance |
| [fixes/](fixes/) | 15 fichas de corrección, una por hallazgo |

## Planes

| Documento | Qué contiene |
|---|---|
| [plan-modulos-s16-s20-s21.md](plan-modulos-s16-s20-s21.md) | Plan de proveedores, estadísticas y alertas — ejecutado |

## Herramientas

| Documento | Qué contiene |
|---|---|
| [requerimientos-dueno.md](requerimientos-dueno.md) | Los 150 requerimientos del dueño con código y estado — fuente de verdad, alimenta los informes |
| [../tools/informe-diario/README.md](../tools/informe-diario/README.md) | Informes de avance para el dueño: cómo se generan, se convierten a PDF, se archivan y se envían |

## Histórico — no leer salvo arqueología

Prompts de un solo uso, conservados por trazabilidad. Ninguno describe el estado actual:

`prompt-asus-clonar-web.md` · `prompt-claude-design.md` · `prompt-claude-design-fase2.md` ·
`prompt-fix-info-web.md` · `prompt-merge-dashboards.md` · `prompt-pc01-subir-github.md` ·
`prompt-rescue-commits.md` · `prompt-web-ecommerce.md` · `prompt-web-fase2.md`

También `CONTEXTO-PROYECTO.md` (en la raíz): **contradice a `CLAUDE.md`** — declara el puerto 7000
y rutas que ya no existen. Se conserva por historia; no es fuente de verdad.

---

_Actualizado el 13 de agosto de 2026._
