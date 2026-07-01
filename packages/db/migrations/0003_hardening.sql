-- 0003_hardening.sql — Cierra los hallazgos del linter de seguridad de Supabase.
-- RLS en las tablas que quedaron expuestas + search_path fijo en las funciones helper.
-- La app accede server-side con service_role (bypassa RLS); el API público queda bloqueado
-- hasta definir políticas por tabla a medida que se construyen los módulos.

alter table public.sedes enable row level security;
alter table public.empleado_tiendas enable row level security;
alter table public.config enable row level security;
alter table public.pedido_items enable row level security;
alter table public.prenda_historial enable row level security;
alter table public.pipeline_puntos enable row level security;
alter table public.envios_prendas enable row level security;
alter table public.reporte_trabajadores enable row level security;
alter table public.reporte_actividades enable row level security;
alter table public.reporte_extras enable row level security;
alter table public.incidencias enable row level security;
alter table public.evaluaciones_mensuales enable row level security;
alter table public.asistencias enable row level security;
alter table public.pagos enable row level security;

create or replace function public.app_es_admin() returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.empleados e where e.id = auth.uid() and e.rol in ('admin','dueno')
  );
$$;
create or replace function public.app_sedes() returns setof text
  language sql stable security definer set search_path = '' as $$
  select et.sede_cod from public.empleado_tiendas et where et.empleado_id = auth.uid()
  union
  select e.sede_cod from public.empleados e where e.id = auth.uid() and e.sede_cod is not null;
$$;
