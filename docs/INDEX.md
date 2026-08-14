# Índice de documentos

> Una línea por documento. **No los abras por contexto** — abrí el que la tarea pida.
> Si creás uno nuevo, sumá su línea acá. Es la regla de cierre de `CLAUDE.md`.

## Empezar por acá

| Documento | Qué contiene |
|---|---|
| [mapa-verificado.md](mapa-verificado.md) | **El estado real del sistema**, verificado contra código y base. Alcance, adopción, decisiones tomadas, qué falta definir |
| [rigor-por-zona.md](rigor-por-zona.md) | Cuánto proceso exige un cambio según dónde cae. La matriz zona → nivel de spec |
| [pendientes-negocio.md](pendientes-negocio.md) | Parámetros sembrados con un default que nadie confirmó. Se lee antes de tocar cualquier regla de negocio |

## Negocio y procesos

| Documento | Qué contiene |
|---|---|
| [operacion-diaria.md](operacion-diaria.md) | **Cómo funciona el negocio en la realidad**: qué hace cada rol cada día, en cada sede, y el flujo real de las prendas |
| [integracion-huellero.md](integracion-huellero.md) | Diseño de la integración del huellero Hikvision del almacén → tabla `asistencias`. Es la entrada del sistema de sueldos |
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
| [superpowers/specs/sueldos/SPEC-esquema-sueldos.md](superpowers/specs/sueldos/SPEC-esquema-sueldos.md) | **Dónde se guardan**: tablas, RPC, RLS y congelado. Incluye los 3 bloqueantes y 3 agujeros de aislamiento encontrados en producción |

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
| [brief-fable-ui.md](brief-fable-ui.md) | Elevación visual del ERP: dashboard, shell móvil, login, estados |
| [prompts-design/](prompts-design/) | 8 documentos: identidad, color y tipografía, componentes, materiales físicos, redes, uniformes |

## Auditorías e informes

| Documento | Qué contiene |
|---|---|
| [auditoria-2026-05-10.md](auditoria-2026-05-10.md) | 22 hallazgos, 12 corregidos |
| [auditoria-2026-07-02.md](auditoria-2026-07-02.md) | Segunda auditoría |
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
