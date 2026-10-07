-- Prueba 0127: una sola firma por RPC del pipeline, con p_operador.
-- Spec: docs/superpowers/specs/pipeline/2026-10-07-pipeline-sin-sobrecargas-design.md
-- Correr: bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0127
do $$
declare
  v_res text[] := '{}';
  v_n int; v_f text; v_anon int;
  v_nombres text[] := array['pipeline_avanzar','pipeline_avanzar_tanda','pipeline_enviar','pipeline_rechazar',
                            'pipeline_deshacer','pipeline_dividir','pipeline_deshacer_division','pipeline_calificar'];
begin
  foreach v_f in array v_nombres loop
    select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_f;
    v_res := v_res || (case when v_n = 1 then '[ok] ' else '[FALLA] ' end || v_f || ': ' || v_n || ' firma(s)');
    select count(*) into v_anon from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_f and has_function_privilege('anon', p.oid, 'execute');
    v_res := v_res || (case when v_anon = 0 then '[ok] ' else '[FALLA] ' end || v_f || ' sin execute para anon');
    select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_f and 'p_operador' = any (p.proargnames);
    v_res := v_res || (case when v_n = 1 then '[ok] ' else '[FALLA] ' end || v_f || ' con p_operador');
  end loop;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'pipeline_exigir_acceso';
  v_res := v_res || (case when v_n = 1 then '[ok] ' else '[FALLA] ' end || 'private.pipeline_exigir_acceso existe');
  raise notice 'RESULTADO 0127 --> %', array_to_string(v_res, '; ');
end $$;
