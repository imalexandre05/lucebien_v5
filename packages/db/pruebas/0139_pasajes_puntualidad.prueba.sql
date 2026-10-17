-- Prueba de la migración 0139_pasajes_puntualidad.sql.
-- Spec: docs/superpowers/specs/2026-10-17-pasajes-puntualidad-design.md.
-- Cómo se corre:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0139
-- Se descarta sola: termina con una excepción cuya línea RESULTADO dice [ok]/[FALLA] por caso.

do $t$
declare
  v_res text := '';
  v_par jsonb;
begin
  -- 1. Las claves existen: monto vacío, minutos = 5.
  v_res := v_res || case when (select valor from config where clave = 'sueldo_monto_pasaje') = ''
                          and (select valor from config where clave = 'sueldo_pasaje_minutos_antes') = '5'
                     then '[ok] defaults ' else '[FALLA] defaults ' end;

  -- 2. Con el monto vacío la lectura NO trae montoPasaje (el core lo toma como «no se paga»).
  v_par := private.sueldo_parametros_config();
  v_res := v_res || case when not (v_par ? 'montoPasaje') and (v_par->>'minutosAntesPasaje')::numeric = 5
                     then '[ok] vacio-no-paga ' else '[FALLA] vacio-no-paga ' end;

  -- 3. Con un monto configurado, la lectura lo entrega como número.
  update config set valor = '3.5' where clave = 'sueldo_monto_pasaje';
  v_par := private.sueldo_parametros_config();
  v_res := v_res || case when (v_par->>'montoPasaje')::numeric = 3.5 then '[ok] con-monto ' else '[FALLA] con-monto ' end;

  -- 4. Un texto no numérico se rechaza con mensaje claro.
  update config set valor = 'abc' where clave = 'sueldo_monto_pasaje';
  begin
    perform private.sueldo_parametros_config();
    v_res := v_res || '[FALLA] texto-invalido ';
  exception when others then
    v_res := v_res || case when sqlerrm like 'CONFIG:%' then '[ok] texto-invalido ' else '[FALLA] texto-invalido ' end;
  end;

  raise exception 'RESULTADO: %', v_res;
end $t$;
