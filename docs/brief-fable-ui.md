# Brief para Fable — Elevación UI/UX de SCI-LB (nivel "impresiona al jefe")

> Documento de encargo. Pégalo al iniciar la sesión de Fable. Es **autocontenido**: no
> asume contexto de conversaciones previas. Fable también debe leer `CLAUDE.md` en la raíz.

---

## 0. Misión en una frase

El ERP ya está **funcional y con un pulido base decente** (navy/gold, tipografía seria, motion
sobrio). Tu trabajo NO es rehacerlo: es llevarlo del *"se ve bien"* al **"esto parece un producto
caro"** — el nivel que hace que el dueño lo enseñe con orgullo. Cada pantalla debe sentirse
**intencional, viva y coherente**, sin un solo detalle suelto.

Regla de oro: **eleva, no reinventes.** El sistema de diseño ya existe (§3). Reutilízalo y
profundízalo. Si algo ya está bien, no lo repintes.

---

## 1. Qué es SCI-LB

ERP interno de **Confecciones Aliaga E.I.R.L. (LuceBien)** — alquiler/venta/confección de ternos
formales, Huancayo, Perú. 4 sedes (`LB`, `ST`, `TR`, `AL`), ~18 empleados.

- **Stack:** Next.js 14 (App Router, Server Components, Server Actions) + Supabase Postgres (RLS
  real) + Tailwind. Monorepo pnpm/Turborepo: `packages/core` (dominio puro), `packages/adapter-lucebien`
  (theme/features), `apps/erp-web` (la app que vas a pulir).
- **Módulos existentes:** Login (cod+sede) · Dashboard · Reportes FR-01 (lista/detalle/nuevo/evaluar)
  · Pipeline de lavandería (9 pasos) · Incidencias · Asistencias · Evaluación mensual · Pagos ·
  Caja (abrir/cobrar/cerrar) · Configuración · Empleados · Dispositivos.
- **Cómo verlo:** dev server bajo PM2 (`pm2 list` → `erp-dev`) en **http://localhost:3005**.
  Login de prueba: **cod `8686`, sede `AL`** (admin). Reinicio: `pm2 restart erp-dev`.

---

## 2. Dirección estética (ya definida — respétala)

**Nombre: "Atelier Formal".** Sastrería de lujo hecha software. Serio, sobrio, navy/gold. Cero
elementos infantiles, cero confeti, emojis mínimos y solo funcionales. Íconos **SVG** (Lucide),
nunca emojis como íconos.

- **Anchor memorable (la firma):** el **crest LB** — la etiqueta de sastre (recuadro navy + filete
  gold + serif "LB"). Ya existe como componente. Es el elemento que, con el logo tapado, hace
  reconocible el producto. Explótalo con criterio (login, sidebar, encabezados de reporte impreso).
- **DFII** (frontend-design): esta dirección puntúa en banda **Excelente** (Impacto alto, Fit
  perfecto con un negocio de sastrería formal, Feasibility alta, Consistency risk baja). Ejecuta a
  fondo, con **restricción cohesiva**: cada floritura debe servir a la tesis. Si dudas, quita.

---

## 3. Sistema de diseño existente (reutiliza — NO reinventes tokens)

Todo esto ya vive en el repo. Úsalo; no crees paletas/fuentes nuevas.

**Color** (`tailwind.config` + tokens): navy `#2e3e6e`, navy-dark, navy-deep · gold `#b8a515`,
gold-soft · paper, ink, line, muted. **PROHIBIDO** `#0A1628` y `#C8A24B` (deprecados).

**Tipografía:** Cormorant Garamond (display/serif) · Inter (body) · JetBrains Mono (códigos/mono,
p. ej. `TN-042`). No introduzcas fuentes nuevas.

**Sombras/motion tokens ya definidos:** `shadow-card`, `shadow-lift`; easing
`ease-out-expo = cubic-bezier(0.23,1,0.32,1)`; keyframes `rise / fade / scaleIn / shimmer /
pulseSoft`; utilidades `animate-rise / animate-page-enter / animate-fade / animate-scale-in`.

**Componentes compartidos (extiéndelos, no los dupliques):**
`components/brand/logo.tsx` (`LogoMark`, `Logo`) · `components/ui/modal.tsx`
(`Modal/ModalBody/ModalFooter`, ya con Escape/scroll-lock/focus) · `components/ui/stat-box.tsx`
(`StatBox`) · `components/ui/{form,card,table}.tsx` (Card tiene prop `interactive`) ·
`components/ui/persona-picker.tsx` · `components/shell/sidebar.tsx`.

**Mandato de disposición (clave):** copia la **disposición/UX del SCI viejo** (grande, guiada,
espacial, poca densidad — pensado para uso masivo real) pero con **estos** estilos navy/gold. Grande
y con vida, no un panel apretado de analista.

---

## 4. Los frentes de trabajo (ordenados por impacto en la demo)

Ataca en este orden: lo que el jefe ve primero y más, primero.

### A. Dashboard — "sala de mando" (máximo impacto)
Es lo primero tras el login. Debe dar la sensación de **control total del taller en un vistazo**.
- Hero con el crest + saludo + sede activa + fecha (Cormorant en los números grandes).
- Fila de KPIs con `StatBox` (prendas en pipeline hoy, reportes pendientes de evaluar, caja del día,
  incidencias abiertas) — con **stagger** de entrada 40–70ms y contadores que animan al montar.
- Un bloque visual de **estado del pipeline** (mini-flujo de los 9 pasos con conteos) y un bloque de
  **actividad reciente**. Estados vacíos elegantes cuando no hay datos (no dejar huecos).

### B. Login — primera impresión
Ya tiene hero con crest. Súbelo: entrada `animate-scale-in` del crest, foco automático, transición
suave al entrar, microfeedback en el botón (`active:scale-[0.97]`). Que se sienta **premium desde el
segundo cero**. Respeta el login `cod+sede` (4 dígitos); no cambies la lógica de auth.

### C. Visualización de datos (donde un ERP se ve "caro")
Antes de graficar, **lee la skill `dataviz`**. Paleta categórica derivada de navy/gold, no arcoíris.
- **Pipeline:** represéntalo como un **flujo vivo** de los 9 pasos (Recepción → … → Listo p/ Envío),
  con conteos por etapa. Es tu mejor candidato a "momento wow".
- **Puntos/productividad:** ranking de operarios (barras) — datos reales de `pipeline_puntos`.
- **Evaluación mensual:** perfil por componente (barras o radar sobrio).
- **Caja:** serie del día. Todo con tabla alternativa accesible.

### D. Estados (lo que separa "demo" de "producto")
Para cada pantalla con datos async: **skeleton** de carga (usa `shimmer`), **empty state** con copy
útil + acción, **error state** claro cerca del problema, **success** discreto. Reserva espacio para
evitar saltos de layout (content-jumping).

### E. Motion cohesivo (lenguaje único, no efectos sueltos)
- Transición de página consistente (`animate-page-enter`) en todas las rutas.
- Stagger en listas/tarjetas (30–80ms entre ítems).
- Micro-interacciones uniformes: todo lo presionable con `active:scale-[0.97]`; hover con
  color/sombra, nunca con scale que mueva el layout.
- Respeta `prefers-reduced-motion` en TODO (ya hay base; verifícalo).

### F. El "wow" firmado (UN solo momento memorable — regla frontend-design)
Elige **uno** y hazlo impecable (no varios a medias): el **pipeline vivo** del dashboard, o la
**transición del crest** login→dashboard, o un **encabezado de reporte FR-01 con calidad de
impresión** (papel, crest, mono para códigos). Que sea la cosa que el jefe recuerda al día siguiente.

### G. Detalle fino, módulo por módulo
Pasada final de consistencia en Reportes, Pipeline, Incidencias, Asistencias, Evaluación, Pagos,
Caja, Configuración, Empleados, Dispositivos: mismos espaciados, mismos radios, mismos estados de
foco, mismos modales (`Modal` compartido, centrado — no origin-aware), mismos `StatBox`. Cero
inconsistencias entre pantallas.

---

## 5. Reglas de motion (Emil — obligatorio)

- **¿Debe animar?** Acciones repetidas 100+ veces/día (atajos, toggles frecuentes) → **sin
  animación**. Modales/drawers/toasts → animación estándar. Onboarding/raros → puede haber deleite.
- **Easing:** entra/sale → `ease-out` (usa `ease-out-expo`, ya definido). Movimiento en pantalla →
  `ease-in-out`. Hover/color → `ease`. **Nunca `ease-in`** en UI (se siente lento).
- **Duración:** press 100–160ms · tooltips 125–200ms · dropdowns 150–250ms · modales 200–300ms.
  **UI < 300ms.**
- **Nunca `scale(0)`** — parte de `scale(0.95)` + opacity. Nada aparece de la nada.
- **Popovers origin-aware** (`transform-origin` desde el trigger). **Excepción: los modales quedan
  centrados** (`center`).
- **Solo animar `transform` y `opacity`** (GPU). Nunca width/height/margin/padding.
- **Transiciones CSS > keyframes** para UI interrumpible.
- Formato de review si revisas motion existente: tabla `| Antes | Después | Por qué |`.

---

## 6. Checklist de calidad (ui-ux-pro-max — antes de dar por hecho cada pantalla)

- [ ] Contraste texto ≥ 4.5:1 · foco visible en todo lo interactivo · `aria-label` en botones de solo
      ícono · labels en inputs.
- [ ] Touch targets ≥ 44px · `cursor-pointer` en todo lo clickeable · botón deshabilitado durante
      async.
- [ ] Íconos SVG (Lucide) consistentes, nunca emojis · logos correctos.
- [ ] Body ≥ 16px en móvil · sin scroll horizontal · line-height 1.5–1.75 · línea 65–75 caracteres.
- [ ] Skeleton/spinner en cargas · `prefers-reduced-motion` respetado · sin saltos de contenido.
- [ ] Consistencia total con las otras pantallas (mismo estilo, mismos componentes).

---

## 7. Restricciones DURAS (no negociables)

- **NO** actives `DEVICE_GATE` (poner el flag en `true` es decisión del dueño). Déjalo OFF.
- **NO** despliegues a producción (Vercel) sin que el usuario lo pida explícitamente.
- **NO** toques `node_modules`, la BD viva local (`database/lucebien.db*`), ni `patches-v*.js`.
- **Migraciones:** solo si son imprescindibles, y **solo** al proyecto Supabase **scilb
  `lszrvbfkgsdyvhyxcslw`**. **Jamás** al proyecto "Semilla" `ezlcbfohjfougqujlvqf`.
- **NO inventes reglas de negocio** (fórmula de puntos, precios, permisos, flujos). Si una tarea
  necesita una regla que no está en el código, **pausa y pregunta**.
- Español en commits, comentarios, UI y errores. Español neutral (sin voseo).
- Filosofía "todo configurable": parámetros de negocio editables desde Configuración, no
  hardcodeados.

---

## 8. Método de trabajo

1. **Un commit por cosa** (una pantalla / un componente / un frente). Conventional Commits en
   español: `feat(ui): …`, `style(dashboard): …`, `refactor(ui): …`.
2. **`tsc --noEmit` limpio ANTES de cada commit:** `pnpm --filter erp-web exec tsc --noEmit`.
3. Previsualiza en **http://localhost:3005** (PM2 `erp-dev`) tras cada cambio visible.
4. Trabaja en el branch actual (`feat/w13-auth-supabase`) salvo instrucción distinta. No crees
   branches ocultos ni falsees commits.
5. Si algo necesita una regla de negocio o una decisión del dueño → **pausa y pregunta**, no asumas.

---

## 9. Verificación (definición de "terminado" por frente)

- **Tipos:** `pnpm --filter erp-web exec tsc --noEmit` en verde.
- **Core (si tocas dominio):** `pnpm --filter @scilb/core test` en verde.
- **Visual:** abrir la pantalla en :3005, recorrer estados (carga → con datos → vacío → error),
  probar en anchos 375 / 768 / 1024 / 1440, verificar foco por teclado y `prefers-reduced-motion`.
- **Checklist §6** completo para la pantalla.
- El jefe podría abrir esta pantalla en la demo sin que veas nada que corregir.

---

## 10. Sugerencia de secuencia (primeras sesiones de Fable)

1. Dashboard "sala de mando" (§4A) — máximo retorno visual.
2. Login premium (§4B) — primera impresión.
3. Estados globales: skeletons + empty + error (§4D) — hace que todo se sienta terminado.
4. Pipeline vivo como momento wow (§4C/§4F).
5. Pasada de consistencia módulo por módulo (§4G).

Cada punto = uno o varios commits, typecheck antes, preview después.

---

## 11. Mapa de referencia del SCI viejo (la disposición a copiar)

El sistema **viejo vive en este mismo repo** (Express + SQLite + React-en-navegador). Es tu fuente
para la **disposición/UX** (dónde va cada cosa, agrupaciones, flujo guiado, densidad baja). **Copia la
disposición, NO los estilos** — los colores/emojis viejos están deprecados; el look es el navy/gold
nuevo (§2–§3).

> Se dan **rutas de código** en vez de capturas a propósito: leer el markup real del SCI viejo es más
> fiel que una foto (ves el layout exacto, los grupos, el orden de campos) y no requiere levantar la
> app vieja (riesgo de tocar boot/BD viva). Si aun así quieres capturas en vivo, la app vieja es el
> proceso PM2 `lucebien` (hoy **detenido**); pide confirmación antes de arrancarla.

**Cómo leer una pantalla vieja:** su markup es `id="page-{VISTA}"` en `public/index.html`; su lógica
de render es la función que dispara `goTo()` (`public/js/app.js:1759`). Registro de vistas y permisos
por rol: `public/js/app.js:1675-1720` (`PAGES_CONFIG`, `DEFAULT_PERMS`). Estilos viejos de layout:
`public/css/style.css` (+ `enhancements.css`, `kanban-almacen.css`) — úsalos solo para entender
espaciados/disposición, no para copiar color.

**Cruce Vista vieja → dónde leerla → pantalla nueva a elevar:**

| Módulo | Markup viejo (`public/index.html`) | Lógica vieja | Ruta nueva (`apps/erp-web/app/`) |
| --- | --- | --- | --- |
| Dashboard | `id="page-dashboard"` (L781) | `admin.js:28` `renderDashboard` | `page.tsx` (raíz) |
| Reporte FR-01 (crear) | `id="page-reporte"` (L335) | `app.js` FR-01 + `routes/reportes.js` | `reportes/nuevo/page.tsx` |
| Evaluación de Reporte | `id="page-evaluacion"` (L481) | `app.js` `prepararEval` | `evaluar-reportes/` + `reportes/[id]/page.tsx` |
| Reportes (lista/admin) | `id="page-admin-reportes"` (L1874) | `admin.js:2025` `renderAdminReportes` | `reportes/page.tsx` |
| Colaboradores | `id="page-empleados"` (L857) | `admin.js:733` `renderEmpleados` | `empleados/page.tsx` |
| Incidencias | `id="page-incidencias-admin"` (L894) | `admin.js:661` `renderIncidenciasAdmin` | `incidencias/page.tsx` |
| Evaluación Mensual | `id="page-evaluacion-mensual"` (L936) | `admin.js:1145` `initEvalMensual` | `evaluaciones/page.tsx` |
| Pagos | `id="page-pagos"` (L1282) | `public/js/pagos.js` `renderPagos` | `pagos/page.tsx` |
| Asistencia diaria | `id="page-asistencias"` (L1371) | `public/js/asistencia-dia.js` `renderAsistDia` | `asistencias/page.tsx` |
| Pipeline / Lavandería / Envíos | `page-lavanderia` (L585), `page-kanban-almacen` (L1809), `page-pipeline-envios` (L1814), `page-retorno` (L716) | `pipeline-envios.js`, `renderAlmacenListas` (`app.js:1432`) | `pipeline/page.tsx` |
| Configuración (actividades/pipeline/permisos) | `page-gestion-actividades` (L1495), `page-config-pipeline` (L1901) | `admin.js` + `routes/config.js` | `configuracion/page.tsx` |
| Mi Desempeño (personal) | `id="page-mi-desempeno"` (L550) | `admin.js:1008` `renderMiDesempeno` | — (aún sin ruta nueva; candidato a "vista personal" del dashboard) |

**Notas:**
- **Caja** (`apps/erp-web/app/caja/`) es **módulo nuevo** (POS): no tiene equivalente en el viejo, no
  hay disposición que copiar — diséñala coherente con el resto.
- Vistas viejas aún **no migradas** (referencia futura, no las inventes ahora): `prestamos` (L1691),
  `garantias` (L1763), `solicitudes` (L1961), `horarios-admin` (L2006), `audit-log` (L1918),
  `eval-valores` (L556). Si una tarea las pide, **pausa y pregunta**.
- El sidebar/menú viejo (secciones Turno / Personal / Almacén / Gestión) está en
  `public/index.html:238-262` — buena referencia de **agrupación** para el sidebar nuevo.
