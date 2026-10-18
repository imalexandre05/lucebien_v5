-- Prueba de la migración 0159_puntualidad_automatica.sql
-- Spec: docs/superpowers/specs/evaluaciones/2026-10-18-puntualidad-automatica-design.md
-- Escrita ANTES que la migración (Zone Guard).
--
-- Semana sintética lun 2020-03-02 … dom 2020-03-08, turno lun–vie 08:00–17:00, tolerancia 10 min:
--   lun 07:55 puntual · mar 08:30 tardanza · mié 08:30 tardanza JUSTIFICADA (cuenta puntual)
--   jue falta · vie sin_dato (no cuenta como debido)
--   → debidos 4, puntuales 2, tardanzas 1 → nota 20 × 2/4 = 10.
-- Casos: 1) proporción; 2) modo 'minutos' = fórmula vieja (30 min → 20−2 = 18);
--        3) sin acuerdo → cae a minutos (20); 4) puntosTotal no cambia entre modos.
-- Todo sintético, prefijo 'P0159'. Se descarta sola. Se corre: bash tools/postgres-local.sh probar 0159

do $$
declare
  r text := ''; e uuid; s uuid; ac uuid; j1 jsonb; j2 jsonb; j3 jsonb;
  d date := date '2020-03-02'; h date := date '2020-03-08';
begin
  insert into empleados (cod, nombre, iniciales, rol) values ('P0159-A', 'P0159 A', 'PA', 'confeccionista') returning id into e;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0159-S', 'P0159 Sin acuerdo', 'PS', 'confeccionista') returning id into s;
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado)
    values (e, date '2020-03-01', date '2020-03-31', 1000) returning id into ac;
  insert into sueldo_acuerdo_turnos (acuerdo_id, dia_semana, hora_inicio, hora_fin)
    select ac, n, time '08:00', time '17:00' from generate_series(1, 5) n;
  insert into asistencias (empleado_id, fecha, hora_entrada, hora_salida, condicion) values
    (e, date '2020-03-02', time '07:55', time '17:00', 'trabajado'),
    (e, date '2020-03-03', time '08:30', time '17:00', 'trabajado');
  insert into asistencias (empleado_id, fecha, hora_entrada, hora_salida, condicion, tardanza_justificada) values
    (e, date '2020-03-04', time '08:30', time '17:00', 'trabajado', true);
  insert into asistencias (empleado_id, fecha, condicion) values
    (e, date '2020-03-05', 'falta'),
    (e, date '2020-03-06', 'sin_dato');
  delete from config where clave = 'eval_puntualidad_modo';

  j1 := private.evaluacion_componentes_datos(e, d, h);
  if (j1 ->> 'tardanza')::numeric = 10 and (j1 ->> 'puntualidadDebidos')::int = 4
     and (j1 ->> 'puntualidadPuntuales')::int = 2 and (j1 ->> 'puntualidadTardanzas')::int = 1 then
    r := r || '[ok] caso 1: 2 puntuales de 4 debidos = 10;';
  else
    r := r || format('[FALLA] caso 1: %s;', j1);
  end if;

  insert into config (clave, valor) values ('eval_puntualidad_modo', 'minutos');
  j2 := private.evaluacion_componentes_datos(e, d, h);
  if (j2 ->> 'tardanza')::numeric = 18 then
    r := r || '[ok] caso 2: modo minutos conserva la fórmula vieja (30 min → 18);';
  else
    r := r || format('[FALLA] caso 2: tardanza=%s;', j2 ->> 'tardanza');
  end if;

  j3 := private.evaluacion_componentes_datos(s, d, h);
  if (j3 ->> 'tardanza')::numeric = 20 and (j3 ->> 'puntualidadDebidos')::int = 0 then
    delete from config where clave = 'eval_puntualidad_modo';
    j3 := private.evaluacion_componentes_datos(s, d, h);
    if (j3 ->> 'tardanza')::numeric = 20 then
      r := r || '[ok] caso 3: sin acuerdo no divide entre cero y da 20;';
    else
      r := r || format('[FALLA] caso 3b: tardanza=%s;', j3 ->> 'tardanza');
    end if;
  else
    r := r || format('[FALLA] caso 3: %s;', j3);
  end if;

  if (j1 -> 'puntosTotal') = (j2 -> 'puntosTotal') and (j1 -> 'operaciones') = (j2 -> 'operaciones') then
    r := r || '[ok] caso 4: puntosTotal no depende del modo de puntualidad;';
  else
    r := r || '[FALLA] caso 4: puntosTotal cambió;';
  end if;

  raise exception 'RESULTADO 0159 --> %', r;
end $$;
