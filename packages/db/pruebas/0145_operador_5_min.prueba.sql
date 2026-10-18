-- Prueba de la migración 0145_operador_5_min.sql
-- Spec: docs/superpowers/specs/pipeline/2026-10-18-operador-pc-compartida-design.md (sección «Pruebas»).
-- Se escribió ANTES que la migración (Zone Guard). Corre dentro de una transacción que se descarta
-- sola y vuelve a ejecutar la migración con distintos valores de partida.
-- Cómo se corre:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0145
begin;
create temp table r0145 (caso text, valor text);

update config set valor = '10' where clave = 'codigo_operador_min';
\i packages/db/migrations/0145_operador_5_min.sql
insert into r0145 select 'provisional_10', valor from config where clave = 'codigo_operador_min';

update config set valor = '7' where clave = 'codigo_operador_min';
\i packages/db/migrations/0145_operador_5_min.sql
insert into r0145 select 'personalizado_7', valor from config where clave = 'codigo_operador_min';

delete from config where clave = 'codigo_operador_min';
\i packages/db/migrations/0145_operador_5_min.sql
insert into r0145 select 'ausente', valor from config where clave = 'codigo_operador_min';

\i packages/db/migrations/0145_operador_5_min.sql
insert into r0145 select 'reaplicada', valor from config where clave = 'codigo_operador_min';
insert into r0145 select 'param_efectivo', private.codigo_param('codigo_operador_min', 10)::text;

do $$
declare r text := ''; v text;
begin
  select valor into v from r0145 where caso = 'provisional_10';
  r := r || case when v = '5' then '[ok] caso 1: el valor provisional 10 pasa a 5;' else format('[FALLA] caso 1: %s;', v) end;
  select valor into v from r0145 where caso = 'personalizado_7';
  r := r || case when v = '7' then '[ok] caso 2: un valor del administrador no se toca;' else format('[FALLA] caso 2: %s;', v) end;
  select valor into v from r0145 where caso = 'ausente';
  r := r || case when v = '5' then '[ok] caso 3: si la fila no existe se crea en 5;' else format('[FALLA] caso 3: %s;', v) end;
  select valor into v from r0145 where caso = 'reaplicada';
  r := r || case when v = '5' then '[ok] caso 4: reaplicar es inocuo;' else format('[FALLA] caso 4: %s;', v) end;
  select valor into v from r0145 where caso = 'param_efectivo';
  r := r || case when v = '5' then '[ok] caso 5: la base lee 5 minutos de ventana;' else format('[FALLA] caso 5: %s;', v) end;
  raise exception 'RESULTADO 0145 --> %', r;
end $$;
rollback;
