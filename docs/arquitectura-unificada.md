# Arquitectura Unificada — SCI-LB (monorepo)

> Entregable W2. Diseño completo del monorepo. Complementa `docs/arquitectura-core-adapter.md`
> (que explica el *principio* core/adapter). **Fecha:** 2026-06-08.

## Layout

```
packages/core              lógica genérica del oficio (pipeline, puntos, permisos). NO importa del adapter.
packages/adapter-lucebien  config de LuceBien (theme navy/gold, features, reglas). Importa del core.
packages/db                schema Postgres + migrations + tipos. (0001_init.sql en W4)
apps/erp-web               admin Next.js 14 + shadcn/ui + Tailwind. (W3)
```

Regla de dependencia: **core ← adapter ← UI**. El core nunca importa hacia afuera.

## Stack y decisiones

| Tema | Decisión |
|---|---|
| Monorepo | Turborepo + pnpm (`pnpm-workspace.yaml`, `turbo.json`) |
| UI admin | Next.js 14 App Router + shadcn/ui (Radix) + Tailwind tematizado navy/gold |
| Backend Fase 1 | Next.js Route Handlers/Server Actions + Supabase directo (sin Railway) |
| Datos | Supabase Postgres: DB + Auth + Storage + RLS + Realtime |
| Validación / estado | Zod · TanStack Query · Zustand |
| Auth | Supabase Auth; login cod+sede como flujo custom encima (E2) |
| Testing | Vitest en `core` (alto) · Playwright e2e en 2-3 flujos críticos |
| LuceBienWeb | Repo separado en Fase 1; se integra en Fase 2; comparte `packages/core` |

## Coexistencia con el ERP viejo

Strangler Fig **sin sync bidireccional**. El ERP viejo (`C:\Program Files (x86)\Lucebien`, `:3000`,
PM2 `LuceBienApp`) sigue siendo system of record para los 18 empleados. El nuevo es **demo** hasta
el cutover. Migración ETL one-shot por módulo (W4). Todos los feature flags OFF por defecto
(`packages/adapter-lucebien/src/features.ts`).

## Estado del scaffold (W2)

Creado: workspace pnpm, `turbo.json`, `tsconfig.base.json`, `packages/core` (interfaces:
9 etapas, roles/`sedesPermitidas`, claves `pts_*` + regla ½ no-terno), `packages/adapter-lucebien`
(theme + features), `packages/db` (esqueleto + `migrations/`).

Pendiente: `apps/erp-web` (W3), Supabase local Docker, `0001_init.sql` + ETL (W4).
