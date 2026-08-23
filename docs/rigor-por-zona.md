# Rigor por zona

> Cuánto proceso exige un cambio, según dónde cae y qué puede romper.
>
> **Principio:** el costo de la spec nunca puede superar al del código. Un proceso tan pesado que
> nadie lo sigue es peor que no tener proceso; uno tan liviano que deja pasar cambios peligrosos
> también.

---

## Los tres niveles

### Nivel 1 — Directo

Se hace y listo. Sin documento, sin ceremonia.

- Texto, etiquetas, mensajes de error
- Color, espaciado, tamaño, orden visual
- Renombrar una variable, quitar un `console.log`
- Corregir un typo en un comentario

### Nivel 2 — Spec corta

Media página en `docs/superpowers/specs/AAAA-MM-DD-<tema>-design.md` antes de escribir código.
Tiene que responder: qué problema resuelve, cómo se ve el flujo, y qué pasa cuando algo falla.

- Pantalla nueva o rediseño de una existente
- Campo nuevo en un formulario
- Filtro, orden o vista nueva sobre datos que ya existen
- Reporte o exportación nueva

### Nivel 3 — Spec completa

Spec + tests + subagente **verificador** antes de mergear. La spec entra en un commit; el código,
en otro (Zone Guard).

- Cualquier cosa en la cadena del sueldo
- Cualquier migración de base de datos
- Cambios en permisos, roles o RLS
- Cambios en el pipeline que muevan el estado de una prenda
- Integraciones con sistemas externos

---

## La matriz

| Zona | Ruta | Nivel | Por qué |
|---|---|---|---|
| **Cadena del sueldo** | `core/src/{evaluaciones,puntos,reportes,valores360}.ts` | 3 | Un error le paga de menos a una persona real |
| **Cadena del sueldo (datos)** | `lib/{evaluaciones,desempeno,pagos}-repo.ts` | 3 | Misma cadena, capa de acceso |
| **Pipeline de prendas** | `core/src/pipeline.ts`, `lib/pipeline-repo.ts` | 3 | Una prenda mal mapeada es una prenda perdida |
| **Migraciones** | `packages/db/migrations/` | 3 | Aplicadas contra producción, sin vuelta atrás fácil |
| **Permisos y aislamiento** | `core/src/permisos.ts`, `lib/permisos-repo.ts`, RLS | 3 | Filtrar un sueldo ajeno no se deshace |
| **Autenticación** | `lib/auth.ts`, `lib/reauth.ts`, `middleware.ts` | 3 | Puerta de entrada de todo |
| **Cliente admin** | `lib/supabase/admin.ts` y sus 6 consumidores | 3 | Bypassa RLS por diseño |
| **Reportes diarios** | `core/src/reportes.ts`, `lib/reportes-repo.ts` | 3 | Alimentan la nota mensual |
| **Otros repos** | `lib/*-repo.ts` restantes | 2 | Tocan datos, no dinero |
| **Pantallas** | `apps/erp-web/app/**` | 2 | Se ven, no calculan |
| **Componentes visuales** | `apps/erp-web/components/**` | 1–2 | 1 si es estética, 2 si cambia comportamiento |
| **Configuración del adapter** | `packages/adapter-lucebien/src/` | 2 | Catálogos y tema |
| **Sistema viejo** | `server.js`, `routes/`, `public/js/` | — | Congelado. No se toca sin pedido explícito |
| **Módulo comercial** | `/caja` `/pedidos` `/clientes` `/inventario` `/finanzas` `/proveedores` `/materiales` `/compras` | — | Código muerto, fuera de alcance |

---

## Criterios de diseño

Estos no son zonas, son cómo se decide al escribir código.

**No diseñes para requisitos hipotéticos.** Construí lo que la spec pide, no lo que "capaz mañana
haga falta". Una abstracción agregada por si acaso es código muerto con costo de mantenimiento —
y en este repo ya hay bastante.

**Arquitectura hexagonal, capas de indirección y patrones sólo si la spec los pide.** Si el
requisito es "guardar el horario del turno", la respuesta es una tabla y un repo, no una jerarquía
de interfaces.

**Archivo que crece es archivo que hace demasiado.** Si un archivo pasa de unas 400 líneas, casi
siempre es porque juntó dos responsabilidades. Separarlo mejora el código y además hace que los
cambios de un agente sean más confiables: se razona mejor sobre lo que entra completo en contexto.

**Si algo se explica dos veces, se convierte en skill.** Cualquier procedimiento con un orden de
pasos que se puede equivocar deja de reconstruirse de memoria y pasa a ser invocable.

---

## Cómo usar esta tabla

1. Ubicá el archivo que vas a tocar en la columna "Ruta".
2. Si el cambio cruza dos zonas, **manda la más estricta**.
3. Si no está en la tabla, asumí nivel 2 y preguntá.
4. Ante la duda entre dos niveles, subí uno. Es más barato escribir media página de más que
   corregir un sueldo mal pagado.

---

_Creado el 13 de agosto de 2026, junto con los 7 no-negociables de `CLAUDE.md`._
