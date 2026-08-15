# CLAUDE.md — SCI-LB (LuceBien)

> **Este archivo es un mapa, no un manual.** Sólo contiene lo que TODA sesión necesita.
> Todo lo demás vive en `docs/` y acá queda únicamente el puntero.
>
> **Criterio para agregar algo acá:** ¿lo necesita toda sesión? Si la respuesta es no, va a un
> documento y acá queda el enlace.
>
> **No abras los documentos enlazados por contexto.** Ábrelos cuando la tarea los pida.

---

## Qué es

Plataforma de control interno de **Confecciones Aliaga E.I.R.L. (LuceBien)**, empresa de alquiler,
venta y confección de ternos en Huancayo, Perú. 4 sedes, 18 empleados. Cubre procesos, recursos
humanos, sueldos, evaluación de desempeño y el pipeline de prendas.

Dinero, ventas, POS e inventario comercial **están fuera de alcance**: los maneja otro programador
en un sistema aparte (ASP.NET Core, `tuxedo.spk.com.pe:8055`).

---

## Antes de buscar en el código: consultá el grafo

Este repo tiene un grafo de código consultable. **Orientarse cuesta 15 veces menos que leer
archivos** (medido con tiktoken: 1.432 tokens contra 21.247 para la misma pregunta).

```bash
graphify query "cómo se calcula la nota mensual"    # dónde vive algo y qué lo toca
graphify explain "calcularNotaMensual()"            # qué hace un símbolo y sus vecinos
graphify affected "config"                          # qué se rompe si cambio esto
graphify path "reportes-repo.ts" "evaluaciones.ts"  # cómo se conectan dos cosas
```

Primero el grafo. Leé archivos sólo cuando el grafo no alcance. Se actualiza solo en cada commit.
Si hace falta reconstruirlo: `graphify extract . --code-only` **desde la raíz del repo y sólo desde
ahí** — correrlo desde otra raíz rompe el alcance.

---

## Mapa de módulos

| Ruta | Qué es | Estado | ¿Se puede tocar? |
|---|---|---|---|
| `packages/core/src/` | Lógica de negocio pura, sin dependencias de infraestructura. 20 archivos de test | **Zona crítica** | Sí, con spec y test |
| `packages/adapter-lucebien/src/` | Configuración específica de LuceBien: tema, catálogos, features | Activo | Sí |
| `packages/db/migrations/` | 66 migraciones SQL, **todas aplicadas** en producción | **Zona crítica** | Sólo agregando la siguiente numerada |
| `apps/erp-web/lib/*-repo.ts` | Acceso a datos. Cada repo envuelve una tabla o RPC | Activo | Sí |
| `apps/erp-web/app/` | Pantallas (Next.js App Router) | Activo | Sí |
| `server.js`, `routes/`, `public/js/` | Sistema viejo Express + SQLite. **Es el que la gente usa hoy** | Congelado | No, salvo pedido explícito |
| `/caja` `/pedidos` `/clientes` `/inventario` `/finanzas` `/proveedores` `/materiales` `/compras` | Módulo comercial | **Código muerto** — fuera de alcance | No |

**Principio de capas:** `core` no importa del `adapter`. El `adapter` sí importa del `core`.
La UI consume ambos.

---

## Los 7 no-negociables

Estas son las reglas que un agente rompe sin darse cuenta porque parecen detalles.

1. **La cadena del sueldo es sagrada.** `puntos del pipeline → reportes → evaluación /20 → pago`.
   Ningún cambio en `packages/core/src/{evaluaciones,puntos,reportes,valores360}.ts` ni en sus RPC
   entra sin spec escrita y sin un test que cubra el caso. Un error acá le paga de menos a una
   persona real.

2. **Todo avance de prenda pasa por una RPC.** Nunca un `update` plano sobre `prenda_pasada` ni
   sobre el estado de un activo. `pipeline-repo.ts` ya tiene 9 RPC — usá esas o agregá una nueva.
   Una prenda mal mapeada es una prenda perdida.

3. **Cuatro aislamientos, sin excepción.** Nadie ve el sueldo de otro. Nadie ve la nota de otro.
   Nadie sabe quién lo puntuó en Valores 360° salvo el administrador. Un encargado ve sólo su sede.
   Toda lectura de datos de personas pasa por RLS. `getAdminClient()` bypassa RLS y está restringido
   a los 6 archivos que hoy lo usan: agregarlo a un séptimo exige justificación escrita.

4. **Las fechas son hora Perú (UTC−5); los cron de Supabase corren en UTC.** El core **nunca** llama
   `new Date()`: recibe `hoyPeru()` desde quien lo invoca. `evaluaciones.ts` ya lo hace bien — ese
   es el patrón a copiar.

5. **No inventes reglas de negocio.** Si falta un parámetro: default explícito, comentado como tal
   en la migración, editable desde `/configuracion`, y anotado en `docs/pendientes-negocio.md`.
   Nunca hardcodeado en silencio. La filosofía del proyecto es que todo parámetro de negocio sea
   editable por el administrador.

6. **Zone Guard: spec y código jamás en el mismo commit.** Si un test falla porque la regla de
   negocio estaba mal, primero se corrige la spec y se confirma con Alexander; después el código.
   Sin esta separación, el camino de menor resistencia ante un test rojo es aflojar la spec hasta
   que pase — y así se cuela un error de sueldo.

7. **Lo que se escribe se verifica contra el código o contra la base, nunca contra otro documento.**
   Coincidencia entre documentos no es evidencia. Este repo ya pagó ese error: tres fases repitieron
   que faltaban 9 migraciones que en realidad estaban aplicadas, y se escribieron avisos de "falta
   migrar" en pantallas que funcionaban.

---

## El ciclo de trabajo

**Diseñar → plan escrito → ejecutar.** El rigor es proporcional al radio de daño:

| Nivel | Cuándo | Qué exige |
|---|---|---|
| **Directo** | Texto, color, espaciado, un `console.log` | Nada. Se hace y listo |
| **Spec corta** | Pantalla nueva, flujo nuevo, campo nuevo | Un documento de media página en `docs/superpowers/specs/` |
| **Spec completa** | Cadena del sueldo, esquema de base, permisos, aislamiento | Spec + tests + subagente verificador antes de mergear |

La tabla completa de qué zona exige qué está en **[docs/rigor-por-zona.md](docs/rigor-por-zona.md)**.

**Antes de commitear, siempre:**

```bash
bash tools/verificar-local.sh    # guard de no-negociables + typecheck + tests. Es lo que corre CI
```

**Antes de escribir una migración, siempre:**

```bash
bash tools/reservar-migracion.sh <slug>   # mira TODAS las ramas y te da un número libre
```

Nunca elijas el número a mano. Dos ramas paralelas ven la misma "última" y las dos escriben la
siguiente; el choque aparece en el merge, con una ya aplicada en producción. Ya pasó.

Hay tres subagentes: **`explorador`** para ubicar sin gastar la ventana, **`implementador`** para
ejecutar un cambio ya especificado, y **`verificador`** antes de mergear zona crítica — su objetivo
es encontrar el fallo, no aprobar el cambio.

El protocolo completo para trabajar en varias secciones a la vez está en
**[docs/harness.md](docs/harness.md)**.

---

## Convenciones

- **Idioma:** español neutral en commits, comentarios, UI y mensajes de error. Sin voseo.
- **Commits:** Conventional Commits — `tipo(scope): descripción`. Scopes: `core`, `adapter`,
  `migration`, `pipeline`, `reportes`, `evaluaciones`, `empleados`, `erp`, `tools`.
- **Colores:** navy `#2e3e6e` · gold `#b8a515`. NO usar `#0A1628` ni `#C8A24B` (deprecados).
- **Fuentes:** Cormorant Garamond (display) · Inter (cuerpo) · JetBrains Mono (códigos).
- **Estética:** seria y sobria. Sin confeti, sin elementos infantiles, emojis mínimos y funcionales.
- **Migraciones:** idempotentes. `create ... if not exists`, y `alter` envuelto para que reaplicar
  no falle.
- **JSX en el sistema viejo:** `{Boolean(cond) && <X/>}`, nunca `{cond && <X/>}` — un `0` de SQLite
  renderiza el literal "0".

---

## Antes de X, leé Y

| Si vas a… | Leé primero |
|---|---|
| Entender el estado real del proyecto | [docs/mapa-verificado.md](docs/mapa-verificado.md) |
| Tocar cualquier regla de negocio | [docs/pendientes-negocio.md](docs/pendientes-negocio.md) |
| Decidir cuánto rigor aplica a un cambio | [docs/rigor-por-zona.md](docs/rigor-por-zona.md) |
| Trabajar en el pipeline o la evaluación | [docs/hoja-de-ruta-sistema.md](docs/hoja-de-ruta-sistema.md) |
| Separar lógica genérica de lo específico | [docs/arquitectura-core-adapter.md](docs/arquitectura-core-adapter.md) |
| Diseñar una pantalla | [docs/manual-de-marca.md](docs/manual-de-marca.md) |
| Entender el sistema viejo antes de migrar algo | [docs/auditoria-legacy/](docs/auditoria-legacy/) |
| Trabajar en paralelo con otra sección | [docs/harness.md](docs/harness.md) |

Índice completo de los 56 documentos: **[docs/INDEX.md](docs/INDEX.md)**.

---

## No tocar

- `database/lucebien.db*` — base viva del sistema viejo. Nunca versionar ni sobreescribir.
- `public/js/patches-v3.js`, `patches-v4.js`, `patches-v5.js` — deuda de alto riesgo.
- La base de producción sin backup previo.
- El cron de auto-cierre de reportes: está desprogramado a propósito y **no se reactiva hasta que
  exista el sistema de horarios** (ver `docs/mapa-verificado.md` §2).

---

## Cerrar una tarea

**Ninguna tarea está terminada hasta que lo aprendido esté escrito.** El grafo de código se
actualiza solo; la semántica no. Un dato que sólo vive en la cabeza de un agente se vuelve a
equivocar en la próxima sesión.

Al cerrar: actualizá el documento que corresponda, sumá la línea en `docs/INDEX.md` si creaste uno
nuevo, y anotá en `docs/pendientes-negocio.md` cualquier default que hayas tenido que inventar.
