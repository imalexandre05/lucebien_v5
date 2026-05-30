# CLAUDE.md — SCI-LB (LuceBien)

Contexto del proyecto para cualquier sesión de Claude que trabaje en este repositorio.
Léelo antes de proponer o escribir código.

## Qué es

SCI-LB es la plataforma digital integral de **Confecciones Aliaga E.I.R.L. (LuceBien)**, empresa
de alquiler / venta / confección de ternos formales en Huancayo, Perú. 4 sedes, ~18 empleados.

**Estado actual del repo:** ERP interno en Node.js + Express + better-sqlite3, con frontend
HTML/JS que usa React (JSX transpilado en el navegador vía `@babel/standalone`). Cubre la
operación interna: pipeline de lavandería, productividad (puntos), reportes diarios FR-01,
evaluaciones mensuales, incidencias y pagos a empleados.

**Objetivo:** evolucionar a una plataforma unificada (Next.js + Supabase Postgres) que integre
lo interno + lo comercial (inventario de alquiler/venta, clientes, pedidos) + la web pública
(repo separado `LuceBienWeb`).

## Dominio (glosario)

- **Sedes:** `LB` (Lucebien, Calle Real 380), `ST` (Stand 101-102, Real 326), `TR` (Trece,
  almacén secundario), `AL` (Almacén Central, solo interno).
- **Roles:** `admin`, `dueno`, `encargado_tienda`, `encargado_almacen`, `confeccionista`,
  `ventas_junior`, `ventas_junior_2`.
- **Pipeline de lavandería (9 pasos):** Recepción → Lavado → Empatado → Vacío → Refacción →
  Compostura/Codificación → Planchado → Control de Calidad → Listo p/ Envío.
- **Puntos:** cada avance de prenda en el pipeline asigna puntos al operario. Pesos en la tabla
  `config` (claves `pts_*`).
- **FR-01:** reporte diario por turno (M/T/C) con auto-cierre por cron.
- **Codificación de prendas:** `[TIPO]-[NNN]`, ej. `TN-042` (terno), `CM-008` (camisa).
  Numeración **global**; la sede es un campo aparte, NO va en el código.

## Sistema de diseño (RESPETAR SIEMPRE)

- **Colores:** navy `#2e3e6e` · gold `#b8a515`. NO usar `#0A1628` ni `#C8A24B` (deprecados).
- **Fuentes:** Cormorant Garamond (display/serif) · Inter (body) · JetBrains Mono (códigos/mono).
- **Estética:** seria, sobria, navy/gold. Sin elementos infantiles, sin confeti, emojis mínimos
  funcionales.

## Arquitectura objetivo

Monorepo Turborepo + pnpm:

```
packages/core              lógica de negocio genérica (inventario, pedidos, puntos, permisos)
packages/adapter-lucebien  config específica de LuceBien (theme, features, reglas)
packages/db                schema Postgres + migrations + tipos
apps/erp-web               admin Next.js 14 + shadcn/ui + Tailwind
```

Principio: **core NO importa del adapter; adapter SÍ importa del core; la UI consume ambos.**
El core es lógica genérica del oficio; el adapter es lo específico del cliente.

## Convenciones

- **Idioma:** español en commits, comentarios, UI y mensajes de error.
- **Commits:** Conventional Commits — `tipo(scope): descripción`. Áreas: `empleados`, `pagos`,
  `inventario`, `core`, `adapter`, `migration`, `pipeline`, `tools`.
- **Stack nuevo:** validación con Zod · data fetching con TanStack Query · estado cliente con
  Zustand · UI con shadcn/ui (Radix) + Tailwind tematizado con los tokens navy/gold.

## Gotchas del sistema actual (SQLite / JSX en runtime)

- SQLite con DQS desactivado → **SIEMPRE comillas simples** para strings: `WHERE etapa='listo'`.
- JSX en navegador (`@babel/standalone`): `{cond && <X/>}` con un entero `0` de SQLite renderiza
  el literal "0". Usar `{Boolean(cond) && <X/>}`.
- Migraciones idempotentes: `try { db.exec('ALTER ...') } catch {}` + `CREATE INDEX IF NOT EXISTS`.
- **7 relaciones pseudo-FK por nombre TEXT** (a resolver con FKs reales en la migración a
  Postgres): `reportes.encargado`, `incidencias.responsable`, `incidencias.reportado_por`,
  `pipeline_puntos.emp_nombre`, `prenda_historial.responsable`, `reporte_trabajadores.nombre`,
  `reporte_extras.registrado_por`.

## NO TOCAR

- `patches-v3.js`, `patches-v4.js`, `patches-v5.js` (deuda de alto riesgo, si existen).
- `database/lucebien.db*` (BD viva; nunca trackear ni sobreescribir).
- La BD de producción (PC empresa): **backup antes de cualquier operación**.

## Reglas de negocio

**NO inventar reglas de negocio** (fórmula de puntos, precios, permisos, flujos). Pedirlas al
responsable del proyecto. Pendientes de confirmar: fórmula exacta de puntos, baja de precio por
uso acumulado, etapas de confección a medida, relación inventario-comercial ↔ prenda-pipeline,
y si se preserva el login `cod+sede` o se migra a Supabase Auth.

## Docs clave

- `docs/arquitectura-core-adapter.md` — separación core/adapter.
- `docs/auditoria-2026-05-10.md` — auditoría del sistema (22 hallazgos, 12 fixes aplicados).
- `tools/weekly-report/cronograma.json` — cronograma del proyecto (96 semanas).
