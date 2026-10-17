-- Prueba de la migración 0132_evaluacion_examenes.sql
-- Spec: docs/superpowers/specs/evaluaciones/2026-10-17-componentes-automaticos-design.md (sección «Pruebas»).
-- Escrita ANTES que la migración (Zone Guard).
--
-- QUÉ COMPRUEBA:
--   1. Sin capacitaciones: examenes y examenesCantidad = null / 0.
--   2. Una completada con nota 16 cerrada en el ciclo → 16.
--   3. Dos completadas (16 y 12; en la segunda el último examen manda) → promedio de las vigentes.
--   4. Cerrada fuera del ciclo, cancelada o en curso: no cuenta.
--   5. Las demás claves y puntosTotal no cambian al sumar capacitaciones (se comparan antes/después).
-- Todo sintético, prefijo 'P0132'. Se descarta sola. Se corre: bash tools/postgres-local.sh probar 0132

do $$
declare
  r text := '';
  e uuid; c uuid; v_sin jsonb; v_con jsonb;
  v_desde date := date '2099-03-01'; v_hasta date := date '2099-03-31';
  v_otro jsonb; v_ok boolean;
begin
  insert into empleados (cod, nombre, iniciales, rol) values ('P0132-NU', 'P0132 Nuevo', 'NU', 'confeccionista') returning id into e;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0132-CA', 'P0132 Cap', 'CA', 'confeccionista') returning id into c;
  v_sin := private.evaluacion_componentes_datos(e, v_desde, v_hasta);
  if (v_sin -> 'examenes') = 'null'::jsonb and coalesce((v_sin ->> 'examenesCantidad')::int, -1) = 0 then
    r := r || '[ok] caso 1: sin capacitaciones examenes es null y la cantidad 0;';
  else
    r := r || format('[FALLA] caso 1: examenes=%s cantidad=%s;', v_sin -> 'examenes', v_sin ->> 'examenesCantidad');
  end if;

  -- 2) una completada, nota 16, cierre dentro del ciclo
  declare k1 uuid; k2 uuid; k3 uuid; k4 uuid; k5 uuid;
  begin
    insert into capacitaciones (nuevo_id, capacitador_id, inicio, estado, resultado, cierre)
      values (e, c, date '2099-02-20', 'completada', 'aprobada', date '2099-03-10') returning id into k1;
    insert into capacitacion_examenes (capacitacion_id, nombre, nota, fecha) values (k1, 'E1', 16, date '2099-03-09');
    v_con := private.evaluacion_componentes_datos(e, v_desde, v_hasta);
    if (v_con ->> 'examenes')::numeric = 16 and (v_con ->> 'examenesCantidad')::int = 1 then
      r := r || '[ok] caso 2: una completada con nota 16 da examenes = 16;';
    else
      r := r || format('[FALLA] caso 2: examenes=%s cantidad=%s;', v_con -> 'examenes', v_con ->> 'examenesCantidad');
    end if;

    -- 3) segunda completada: primer examen 5, último 12 → vigente 12; promedio (16+12)/2 = 14
    insert into capacitaciones (nuevo_id, capacitador_id, inicio, estado, resultado, cierre)
      values (e, c, date '2099-03-11', 'completada', 'por_reforzar', date '2099-03-20') returning id into k2;
    insert into capacitacion_examenes (capacitacion_id, nombre, nota, fecha) values (k2, 'E1', 5, date '2099-03-15');
    insert into capacitacion_examenes (capacitacion_id, nombre, nota, fecha) values (k2, 'E2', 12, date '2099-03-18');
    v_con := private.evaluacion_componentes_datos(e, v_desde, v_hasta);
    if (v_con ->> 'examenes')::numeric = 14 and (v_con ->> 'examenesCantidad')::int = 2 then
      r := r || '[ok] caso 3: dos completadas promedian sus notas vigentes (16 y 12 → 14);';
    else
      r := r || format('[FALLA] caso 3: examenes=%s cantidad=%s;', v_con -> 'examenes', v_con ->> 'examenesCantidad');
    end if;

    -- 4) fuera de ciclo, cancelada y en curso no cuentan
    insert into capacitaciones (nuevo_id, capacitador_id, inicio, estado, resultado, cierre)
      values (e, c, date '2099-01-01', 'completada', 'aprobada', date '2099-02-01') returning id into k3;
    insert into capacitacion_examenes (capacitacion_id, nombre, nota, fecha) values (k3, 'E1', 1, date '2099-01-30');
    insert into capacitaciones (nuevo_id, capacitador_id, inicio, estado) values (e, c, date '2099-03-21', 'cancelada') returning id into k4;
    insert into capacitacion_examenes (capacitacion_id, nombre, nota, fecha) values (k4, 'E1', 2, date '2099-03-22');
    insert into capacitaciones (nuevo_id, capacitador_id, inicio, estado) values (e, c, date '2099-03-25', 'en_curso') returning id into k5;
    insert into capacitacion_examenes (capacitacion_id, nombre, nota, fecha) values (k5, 'E1', 3, date '2099-03-26');
    v_otro := private.evaluacion_componentes_datos(e, v_desde, v_hasta);
    if (v_otro ->> 'examenes')::numeric = 14 and (v_otro ->> 'examenesCantidad')::int = 2 then
      r := r || '[ok] caso 4: fuera de ciclo, cancelada y en curso no cuentan;';
    else
      r := r || format('[FALLA] caso 4: examenes=%s cantidad=%s;', v_otro -> 'examenes', v_otro ->> 'examenesCantidad');
    end if;
  end;

  -- 5) el resto del JSON no cambió: todas las claves de v_sin salvo las dos nuevas son iguales
  v_ok := (v_sin - 'examenes' - 'examenesCantidad') = (v_otro - 'examenes' - 'examenesCantidad');
  if v_ok and v_sin ? 'puntosTotal' then
    r := r || '[ok] caso 5: puntosTotal y las demás claves no cambian por las capacitaciones;';
  else
    r := r || '[FALLA] caso 5: otras claves cambiaron;';
  end if;

  raise exception 'RESULTADO 0132 --> %', r;
end $$;
