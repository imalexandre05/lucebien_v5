-- Prueba de la migración 0099_borrar_alta_por_error.sql
--
-- Cubre los 10 casos de §5 de
-- docs/superpowers/specs/empleados/2026-08-25-borrar-alta-por-error-design.md, más tres casos que
-- salen de su §7 (addendum medido contra la base): huellero_mapeos, prenda_pasada.lavador_id, y
-- evaluaciones_valores como evaluador_id — esta última con una comprobación hermana para
-- evaluado_id (caso7b), porque §7.1 lista las dos columnas por separado y las dos son `on delete
-- cascade`: si el bloqueo no está escrito en la RPC, la base las dejaría borrarse solas y en
-- silencio, sin avisar a nadie.
--
-- OJO: `empleado_borrar_alta` y `empleado_borrar_alta_previo` exigen `private.app_es_admin()`, que
-- lee `auth.uid()` desde `request.jwt.claims` — no depende del rol de Postgres con el que corre
-- esta prueba. Por eso no hace falta `set local role authenticated` (a diferencia de una prueba de
-- RLS pura, como la de la 0083): alcanza con impersonar admin/no-admin con `set_config(...)`, mismo
-- patrón que 0073/0097/0098.
--
-- SE DESCARTA SOLA: todo el escenario —incluidos los borrados de verdad— vive dentro de un bloque
-- que termina lanzando una excepción con el resultado. Eso aborta la transacción entera y no queda
-- ni una fila, ni una persona borrada de verdad.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0099
-- (o pegar el archivo entero de una sola vez en el SQL editor de Supabase, proyecto scilb, y leer
-- el mensaje de error P0001 que empieza con "RESULTADO 0099").

do $$
declare
  adm             uuid;
  v_no_admin      uuid;
  v_otros_admins  uuid[];
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; p6 uuid;
  p7a uuid; p7x uuid; p7b uuid; p7y uuid;
  p8 uuid; p9 uuid; p11 uuid; p12 uuid;
  ac4             uuid;
  disp            uuid;
  pasada12        uuid;
  v_previo        jsonb;
  v_suma          numeric;
  v_nombre_log    text;
  v_cod_log       text;
  v_tiene_hash    boolean;
  r               text := '';
begin
  select id into adm from empleados where rol in ('admin','dueno') and activo order by id limit 1;
  if adm is null then raise exception 'La prueba necesita al menos un empleado con rol admin activo'; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  if not private.app_es_admin() then
    raise exception 'No pude hacerme pasar por el administrador; la prueba no comprobaría nada';
  end if;

  insert into dispositivos_huellero(nombre, ip) values ('Prueba 0099', '10.0.0.99') returning id into disp;

  -- ── Caso 1 (§5.1): alta reciente sin nada — se borra, la cuenta previa da todo en cero ──────
  insert into empleados (cod, nombre, iniciales)
    values ('PRUEBA0099-C1', 'Prueba 0099 Caso1 Limpio', 'Q1') returning id into p1;

  v_previo := empleado_borrar_alta_previo(p1);
  select coalesce(sum(value::numeric), 0) into v_suma from jsonb_each_text(v_previo -> 'conteos');
  if jsonb_array_length(v_previo -> 'bloqueos') = 0 and v_suma = 0 then
    r := r || ' [ok] caso1: alta reciente sin nada, la cuenta previa da todo en cero;';
  else
    r := r || format(' [FALLA] caso1: la cuenta previa no dio cero (bloqueos=%s conteos=%s);',
                     v_previo -> 'bloqueos', v_previo -> 'conteos');
  end if;

  perform empleado_borrar_alta(p1);
  if not exists (select 1 from empleados where id = p1) then
    r := r || ' [ok] caso1: se borro;';
  else
    r := r || ' [FALLA] caso1: la persona sigue existiendo;';
  end if;

  -- ── Caso 2 (§5.2): 2 asistencias y 1 marca — se borra, los números se ven ANTES ─────────────
  insert into empleados (cod, nombre, iniciales)
    values ('PRUEBA0099-C2', 'Prueba 0099 Caso2 Con Asistencia', 'Q2') returning id into p2;
  insert into asistencias(empleado_id, fecha, turno, hora_entrada, hora_salida, fuente)
    values (p2, '2099-01-01', 'M', '08:00', '12:00', 'manual'),
           (p2, '2099-01-02', 'M', '08:00', '12:00', 'manual');
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial)
    values (disp, '9902', p2, '2099-01-01T08:00:00-05:00', 990201);

  v_previo := empleado_borrar_alta_previo(p2);
  if (v_previo -> 'conteos' ->> 'asistencias')::int = 2
     and (v_previo -> 'conteos' ->> 'marcas_huellero')::int = 1
     and jsonb_array_length(v_previo -> 'bloqueos') = 0
  then
    r := r || ' [ok] caso2: la cuenta previa muestra 2 asistencias y 1 marca del huellero;';
  else
    r := r || format(' [FALLA] caso2: cuenta previa incorrecta (%s);', v_previo -> 'conteos');
  end if;

  perform empleado_borrar_alta(p2);
  if not exists (select 1 from empleados where id = p2)
     and not exists (select 1 from asistencias where empleado_id = p2)
     and exists (select 1 from marcas_huellero where dispositivo_id = disp and evento_serial = 990201 and empleado_id is null)
  then
    r := r || ' [ok] caso2: se borro con sus asistencias, y la marca del huellero quedo sin dueno;';
  else
    r := r || ' [FALLA] caso2: no quedo como se esperaba;';
  end if;

  -- ── Caso 3 (§5.3): encargada de un reporte — se borra, el reporte queda con encargado_id null ─
  insert into empleados (cod, nombre, iniciales)
    values ('PRUEBA0099-C3', 'Prueba 0099 Caso3 Encargada', 'Q3') returning id into p3;
  insert into reportes(id, sede_cod, turno, fecha, encargado_id)
    values ('PRUEBA-0099-C3_M-LB', 'LB', 'M', '2099-01-03', p3);

  perform empleado_borrar_alta(p3);
  if not exists (select 1 from empleados where id = p3)
     and exists (select 1 from reportes where id = 'PRUEBA-0099-C3_M-LB' and encargado_id is null)
  then
    r := r || ' [ok] caso3: se borro y el reporte quedo con encargado_id en null;';
  else
    r := r || ' [FALLA] caso3: el reporte no quedo como se esperaba;';
  end if;

  -- ── Caso 4 (§5.4): con una liquidación — se niega ────────────────────────────────────────────
  insert into empleados (cod, nombre, iniciales)
    values ('PRUEBA0099-C4', 'Prueba 0099 Caso4 Con Liquidacion', 'Q4') returning id into p4;
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, sueldo_pactado)
    values (p4, '2099-02-01', '2099-02-01', 1500) returning id into ac4;
  insert into sueldo_liquidaciones(acuerdo_id, empleado_id, periodo_desde, periodo_hasta,
                                    entrada, parametros_usados, resultado,
                                    total, valor_por_hora, motor_version)
    values (ac4, p4, '2099-02-01', '2099-02-01', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
            100, 10, 'prueba-0099');

  begin
    perform empleado_borrar_alta(p4);
    r := r || ' [FALLA] caso4: se permitio borrar con una liquidacion emitida;';
  exception when others then
    if sqlerrm like 'BLOQUEADO:%liquidaci%' then
      r := r || ' [ok] caso4: se nego por tener una liquidacion emitida;';
    else
      r := r || format(' [FALLA] caso4: fallo por otro motivo (%s);', sqlerrm);
    end if;
  end;
  if exists (select 1 from empleados where id = p4) then
    r := r || ' [ok] caso4: la persona sigue existiendo, nada se borro;';
  else
    r := r || ' [FALLA] caso4: la persona se borro pese al bloqueo;';
  end if;

  -- ── Caso 5 (§5.5): con un contrato (sueldo_acuerdos), sin liquidación — se niega ─────────────
  insert into empleados (cod, nombre, iniciales)
    values ('PRUEBA0099-C5', 'Prueba 0099 Caso5 Con Contrato', 'Q5') returning id into p5;
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, sueldo_pactado)
    values (p5, '2099-03-01', '2099-03-01', 1500);

  begin
    perform empleado_borrar_alta(p5);
    r := r || ' [FALLA] caso5: se permitio borrar con un contrato registrado;';
  exception when others then
    if sqlerrm like 'BLOQUEADO:%contrato%' then
      r := r || ' [ok] caso5: se nego por tener un contrato (sueldo_acuerdos);';
    else
      r := r || format(' [FALLA] caso5: fallo por otro motivo (%s);', sqlerrm);
    end if;
  end;

  -- ── Caso 6 (§5.6): con una evaluación mensual — se niega ─────────────────────────────────────
  insert into empleados (cod, nombre, iniciales)
    values ('PRUEBA0099-C6', 'Prueba 0099 Caso6 Con Evaluacion', 'Q6') returning id into p6;
  insert into evaluaciones_mensuales(empleado_id, mes, nota_final) values (p6, '2099-04', 15);

  begin
    perform empleado_borrar_alta(p6);
    r := r || ' [FALLA] caso6: se permitio borrar con una evaluacion mensual emitida;';
  exception when others then
    if sqlerrm like 'BLOQUEADO:%evaluaci%mensual%' then
      r := r || ' [ok] caso6: se nego por tener una evaluacion mensual;';
    else
      r := r || format(' [FALLA] caso6: fallo por otro motivo (%s);', sqlerrm);
    end if;
  end;

  -- ── Caso 7a (§5.7 + extra de §7): votó a otra persona (evaluador_id) — se niega ──────────────
  -- La FK de evaluaciones_valores.evaluador_id es `on delete cascade`: sin este bloqueo escrito a
  -- mano, la base la dejaría borrarse sola y en silencio.
  insert into empleados (cod, nombre, iniciales)
    values ('PRUEBA0099-C7A', 'Prueba 0099 Caso7a Evaluadora', 'Q7A') returning id into p7a;
  insert into empleados (cod, nombre, iniciales)
    values ('PRUEBA0099-C7X', 'Prueba 0099 Caso7a Evaluada Por Otra', 'Q7X') returning id into p7x;
  insert into evaluaciones_valores(evaluador_id, evaluado_id, mes, integridad, respeto, honestidad, amabilidad, relacion, actitud)
    values (p7a, p7x, '2099-05', 5, 5, 5, 5, 5, 5);

  begin
    perform empleado_borrar_alta(p7a);
    r := r || ' [FALLA] caso7a: se permitio borrar a quien voto en Valores 360;';
  exception when others then
    if sqlerrm like 'BLOQUEADO:%Valores 360%' then
      r := r || ' [ok] caso7a: se nego por haber votado (evaluador_id, cascade que no frenaria sola);';
    else
      r := r || format(' [FALLA] caso7a: fallo por otro motivo (%s);', sqlerrm);
    end if;
  end;

  -- ── Caso 7b (extra, complemento de §7.1): fue votada por otra persona (evaluado_id) — se niega ─
  insert into empleados (cod, nombre, iniciales)
    values ('PRUEBA0099-C7B', 'Prueba 0099 Caso7b Evaluada', 'Q7B') returning id into p7b;
  insert into empleados (cod, nombre, iniciales)
    values ('PRUEBA0099-C7Y', 'Prueba 0099 Caso7b Evaluadora De Otra', 'Q7Y') returning id into p7y;
  insert into evaluaciones_valores(evaluador_id, evaluado_id, mes, integridad, respeto, honestidad, amabilidad, relacion, actitud)
    values (p7y, p7b, '2099-05', 4, 4, 4, 4, 4, 4);

  begin
    perform empleado_borrar_alta(p7b);
    r := r || ' [FALLA] caso7b: se permitio borrar a quien fue evaluada en Valores 360;';
  exception when others then
    if sqlerrm like 'BLOQUEADO:%evaluada%Valores 360%' then
      r := r || ' [ok] caso7b: se nego por haber sido evaluada (evaluado_id);';
    else
      r := r || format(' [FALLA] caso7b: fallo por otro motivo (%s);', sqlerrm);
    end if;
  end;

  -- ── Caso 8 (§5.8): el último administrador activo — se niega ────────────────────────────────
  -- Se apagan TEMPORALMENTE todos los demás admin/dueño activos (incluido "adm"), y se impersona
  -- al admin sintético — que es, en ese momento, el único activo — para intentar borrarse a sí
  -- mismo. Todo dentro de esta misma transacción, que se descarta entera al final.
  insert into empleados (cod, nombre, iniciales, rol)
    values ('PRUEBA0099-C8', 'Prueba 0099 Caso8 Unico Admin', 'Q8', 'admin') returning id into p8;
  select array_agg(id) into v_otros_admins
    from empleados where rol in ('admin','dueno') and activo and id <> p8;

  update empleados set activo = false where id = any(v_otros_admins);

  perform set_config('request.jwt.claims', json_build_object('sub', p8, 'role', 'authenticated')::text, true);
  if not private.app_es_admin() then
    r := r || ' [FALLA] caso8: no se pudo impersonar al admin sintetico, no se pudo probar este caso;';
  else
    begin
      perform empleado_borrar_alta(p8);
      r := r || ' [FALLA] caso8: se permitio borrar al ultimo administrador activo;';
    exception when others then
      if sqlerrm like 'ESTADO:%administrador activo%' then
        r := r || ' [ok] caso8: se nego borrar al ultimo administrador activo;';
      else
        r := r || format(' [FALLA] caso8: fallo por otro motivo (%s);', sqlerrm);
      end if;
    end;
  end if;

  update empleados set activo = true where id = any(v_otros_admins);
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);

  -- ── Caso 9 (§5.9): un no-administrador intenta borrar — se niega por el guard de la RPC ──────
  select id into v_no_admin from empleados where rol not in ('admin','dueno') and activo order by id limit 1;
  if v_no_admin is null then
    r := r || ' [FALLA] caso9: la prueba necesita al menos un empleado activo no-administrador;';
  else
    insert into empleados (cod, nombre, iniciales)
      values ('PRUEBA0099-C9', 'Prueba 0099 Caso9 Objetivo', 'Q9') returning id into p9;

    perform set_config('request.jwt.claims', json_build_object('sub', v_no_admin, 'role', 'authenticated')::text, true);
    begin
      perform empleado_borrar_alta(p9);
      r := r || ' [FALLA] caso9: un no-administrador pudo borrar;';
    exception when others then
      if sqlerrm like 'PERMISO:%' then
        r := r || ' [ok] caso9: un no-administrador no puede borrar (guard de la RPC, no solo la pantalla);';
      else
        r := r || format(' [FALLA] caso9: fallo por otro motivo (%s);', sqlerrm);
      end if;
    end;
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  end if;

  -- ── Caso 10 (§5.10): después de borrar, queda la fila en audit_log con nombre y código ───────
  select antes ->> 'nombre', antes ->> 'cod', (antes ? 'password_hash')
    into v_nombre_log, v_cod_log, v_tiene_hash
    from audit_log
    where tabla = 'empleados' and operacion = 'DELETE' and fila_id = p1::text
    order by at desc limit 1;

  if v_nombre_log = 'Prueba 0099 Caso1 Limpio' and v_cod_log = 'PRUEBA0099-C1' and not coalesce(v_tiene_hash, true) then
    r := r || ' [ok] caso10: audit_log guardo nombre y codigo del borrado, sin password_hash;';
  else
    r := r || format(' [FALLA] caso10: audit_log no quedo como se esperaba (nombre=%s cod=%s tiene_hash=%s);',
                     v_nombre_log, v_cod_log, v_tiene_hash);
  end if;

  -- ── Caso 11 (extra de §7.2): con huellero_mapeos — se borra, el mapeo se va con ella ─────────
  -- huellero_mapeos.empleado_id es `on delete restrict`: sin el delete explícito de esta RPC, la
  -- base habría negado el borrado entero con un error crudo de Postgres.
  insert into empleados (cod, nombre, iniciales)
    values ('PRUEBA0099-C11', 'Prueba 0099 Caso11 Con Mapeo', 'Q11') returning id into p11;
  insert into huellero_mapeos(dispositivo_id, employee_no, empleado_id, vigente_desde)
    values (disp, '9911', p11, '2099-01-01');

  v_previo := empleado_borrar_alta_previo(p11);
  if (v_previo -> 'conteos' ->> 'huellero_mapeos')::int = 1 then
    r := r || ' [ok] caso11: la cuenta previa muestra el mapeo del huellero;';
  else
    r := r || ' [FALLA] caso11: la cuenta previa no conto el mapeo del huellero;';
  end if;

  perform empleado_borrar_alta(p11);
  if not exists (select 1 from empleados where id = p11)
     and not exists (select 1 from huellero_mapeos where empleado_id = p11)
  then
    r := r || ' [ok] caso11: se borro y el mapeo del huellero se fue con ella;';
  else
    r := r || ' [FALLA] caso11: el mapeo sobrevivio o la persona no se borro;';
  end if;

  -- ── Caso 12 (extra de §7.3): fue lavadora en una prenda_pasada — se borra, la pasada queda ───
  insert into empleados (cod, nombre, iniciales)
    values ('PRUEBA0099-C12', 'Prueba 0099 Caso12 Lavadora', 'Q12') returning id into p12;
  insert into prenda_pasada(codigo, lavador_id) values ('PRUEBA-0099-TN', p12) returning id into pasada12;

  perform empleado_borrar_alta(p12);
  if not exists (select 1 from empleados where id = p12)
     and exists (select 1 from prenda_pasada where id = pasada12 and lavador_id is null)
  then
    r := r || ' [ok] caso12: se borro y la pasada de la prenda quedo con lavador_id en null;';
  else
    r := r || ' [FALLA] caso12: la pasada no quedo como se esperaba;';
  end if;

  raise exception 'RESULTADO 0099 --> %', r;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §7.5 de la spec: la lista de tablas de arriba está ENUMERADA a mano, no descubierta en tiempo
-- de ejecución. Si esta prueba —o la RPC misma— falla algún día con un error crudo de Postgres
-- por una violación de FK sobre una tabla que NO aparece en la lista de §7.1/§7.2/§7.3/§7.4 de la
-- migración 0099, significa que alguien agregó una tabla nueva con una FK hacia `empleados` y
-- todavía nadie decidió a qué grupo va (¿bloquea? ¿se borra con la persona? ¿se vacía?). Ese
-- error es el comportamiento correcto: es ruidoso a propósito, y hay que decidir el grupo antes
-- de silenciarlo — no agrandar el `where` a ciegas.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
