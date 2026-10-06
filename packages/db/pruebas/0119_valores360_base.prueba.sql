-- Prueba de la migración 0119_valores360_base.sql
--
-- Spec: docs/superpowers/specs/evaluaciones/2026-10-06-valores360-base-design.md §5.
-- Ticket imalexandre05/lucebien-tablero#45. Decisión del dueño: cerrar TODAS las vías para deducir
-- quién votó en Valores 360°.
--
-- Comprueba:
--   1. un no-administrador (la propia persona, y un encargado CON `datos_personas`) ya no lee
--      `evaluaciones_mensuales` directo; el administrador sí,
--   2. `mi_evaluacion_mensual`: sin `valores`/`valoresCantidad` y, en una fila `ponderado`, con
--      `nota_final` en null mientras el mes no sea público (en curso, o sin el mínimo); una fila
--      `puntos` conserva su nota; un mes cerrado con el mínimo se ve completo,
--   3. `evaluaciones_mensuales_visibles`: el encargado con `datos_personas` ve las de otras personas
--      con la MISMA regla; quien no tiene el permiso, sólo las propias,
--   4. `anon` no ejecuta las funciones,
--   5. votos: sólo el mes en curso y con la ventana abierta (insert y update); el administrador, igual
--      que antes.
--
-- Cada comprobación de una función lleva su bloque con `exception`: contra el estado ANTERIOR a la
-- migración (donde la función no existe) la prueba tiene que fallar con [FALLA], no abortar a medias.
--
-- SE DESCARTA SOLA: crea su propio equipo y termina lanzando una excepción con el resultado, que
-- aborta la transacción y no deja ni una fila. El "error" final ES la salida esperada.
--
-- OJO: sin cambiar de rol las políticas no se evalúan. El montaje va ANTES del cambio de rol, y para
-- tocar `config` a mitad de la prueba se vuelve al rol de sesión y se regresa.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0119

do $$
declare
  v_super   text := session_user;
  admin_id  uuid := gen_random_uuid();
  enc_id    uuid := gen_random_uuid();   -- encargado con datos_personas
  evaluada  uuid := gen_random_uuid();
  ev1       uuid := gen_random_uuid();
  ev2       uuid := gen_random_uuid();
  ev3       uuid := gen_random_uuid();
  r         text := '';
  n         int;
  c         int;
  mes_hoy   text := to_char(now() at time zone 'America/Lima', 'YYYY-MM');
  dia_hoy   int  := extract(day from (now() at time zone 'America/Lima'))::int;
  dia_otro  int;
  fila      record;
begin
  dia_otro := case when dia_hoy < 15 then 28 else 2 end;   -- un día que NO es hoy

  insert into empleados(id, cod, nombre, iniciales, rol) values
    (admin_id, 'T-ADM', 'Prueba Admin 0119',    'PA', 'admin'),
    (enc_id,   'T-ENC', 'Prueba Encargado 0119','PE', 'encargado_tienda'),
    (evaluada, 'T-EVD', 'Prueba Evaluada 0119', 'PV', 'confeccionista'),
    (ev1,      'T-EV1', 'Prueba Evaluador Uno 0119',  'P1', 'confeccionista'),
    (ev2,      'T-EV2', 'Prueba Evaluador Dos 0119',  'P2', 'confeccionista'),
    (ev3,      'T-EV3', 'Prueba Evaluador Tres 0119', 'P3', 'confeccionista');

  insert into permisos_modulos(rol, modulo, acciones) values ('encargado_tienda', 'datos_personas', array['ver'])
  on conflict (rol, modulo) do update set acciones = array['ver'];

  -- Votos recibidos por `evaluada`: 2000-01 → 2 (no alcanza), 2000-02 → 3, 2000-03 → 3 (mínimo 4 la tapa),
  -- mes en curso → 3. 2000-05 → ninguno.
  insert into evaluaciones_valores(evaluador_id, evaluado_id, mes, integridad, respeto, honestidad, amabilidad, relacion, actitud) values
    (ev1, evaluada, '2000-01', 5, 5, 5, 5, 5, 5), (ev2, evaluada, '2000-01', 1, 1, 1, 1, 1, 1),
    (ev1, evaluada, '2000-02', 3, 5, 4, 4, 4, 4), (ev2, evaluada, '2000-02', 4, 5, 4, 4, 4, 4), (ev3, evaluada, '2000-02', 5, 4, 4, 4, 4, 4),
    (ev1, evaluada, '2000-04', 4, 4, 4, 4, 4, 4), (ev2, evaluada, '2000-04', 4, 4, 4, 4, 4, 4), (ev3, evaluada, '2000-04', 4, 4, 4, 4, 4, 4),
    (ev1, evaluada, '2000-03', 3, 3, 3, 3, 3, 3), (ev2, evaluada, '2000-03', 3, 3, 3, 3, 3, 3), (ev3, evaluada, '2000-03', 3, 3, 3, 3, 3, 3),
    (ev1, evaluada, mes_hoy, 5, 5, 5, 5, 5, 5),   (ev2, evaluada, mes_hoy, 5, 5, 5, 5, 5, 5),   (ev3, evaluada, mes_hoy, 5, 5, 5, 5, 5, 5);

  -- Evaluaciones guardadas. `componentes.valores` es lo que NO debe llegar a quien no es administrador.
  insert into evaluaciones_mensuales(empleado_id, mes, nota_final, componentes, pesos_usados, metodo, puntos_total) values
    (evaluada, '2000-01', 15.00, '{"valores":20,"valoresCantidad":2,"reportes":10}', '{"valores":0.25}', 'ponderado', null),
    (evaluada, '2000-02', 16.00, '{"valores":16,"valoresCantidad":3,"reportes":10}', '{"valores":0.25}', 'ponderado', null),
    (evaluada, '2000-03', 14.00, '{"valores":12,"valoresCantidad":3,"reportes":10}', '{"valores":0.25}', 'ponderado', null),
    (evaluada, '2000-05', 17.00, '{"valores":16,"valoresCantidad":1,"reportes":10}', '{"valores":0.25}', 'puntos',    5200),
    (evaluada, '2000-04', 11.50, '{"valores":4,"valoresCantidad":1,"reportes":14}',  '{"valores":0.25}', 'ponderado', null),
    (evaluada, mes_hoy,   12.00, '{"valores":20,"valoresCantidad":3,"reportes":10}', '{"valores":0.25}', 'ponderado', null),
    (ev3,      mes_hoy,   18.00, '{"valores":20,"valoresCantidad":1,"reportes":10}', '{"valores":0.25}', 'puntos',    6900);

  insert into config(clave, valor) values
    ('valores_min_evaluaciones', '3'), ('valores_habilitado', 'true'), ('valores_modo', 'siempre'),
    ('valores_dia_inicio', '1'), ('valores_dia_fin', '31')
  on conflict (clave) do update set valor = excluded.valor;

  perform set_config('role', 'authenticated', true);

  -- ── 1) Lectura directa ───────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', evaluada, 'role','authenticated')::text, true);
  select count(*) into n from evaluaciones_mensuales;
  if n = 0 then r := r || ' [ok] la propia persona ya no lee la tabla directo;';
  else          r := r || format(' [FALLA] la propia persona lee %s fila(s) de la tabla directo;', n); end if;

  perform set_config('request.jwt.claims', json_build_object('sub', enc_id, 'role','authenticated')::text, true);
  select count(*) into n from evaluaciones_mensuales;
  if n = 0 then r := r || ' [ok] el encargado con datos_personas no lee la tabla directo;';
  else          r := r || format(' [FALLA] el encargado con datos_personas lee %s fila(s) directo;', n); end if;

  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role','authenticated')::text, true);
  select count(*) into n from evaluaciones_mensuales where empleado_id in (evaluada, ev3);
  if n = 7 then r := r || ' [ok] el administrador lee las 7 filas directo;';
  else          r := r || format(' [FALLA] el administrador lee %s fila(s) en vez de 7;', n); end if;

  -- ── 2) mi_evaluacion_mensual ─────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', evaluada, 'role','authenticated')::text, true);
  begin
    execute $q$ select count(*) from mi_evaluacion_mensual() $q$ into n;
    if n = 6 then r := r || ' [ok] la propia persona recibe sus 6 evaluaciones (y no la de otra);';
    else          r := r || format(' [FALLA] mi_evaluacion_mensual devolvió %s fila(s) en vez de 6;', n); end if;

    -- Mes en curso, ponderado, 3 votos: ni valores ni nota.
    execute format($q$ select nota_final, componentes, valores_publicos from mi_evaluacion_mensual(%L) $q$, mes_hoy) into fila;
    if fila.nota_final is null and not (fila.componentes ? 'valores') and not (fila.componentes ? 'valoresCantidad')
       and fila.valores_publicos = false then
      r := r || ' [ok] mes en curso (ponderado): sin valores y la nota en null;';
    else
      r := r || format(' [FALLA] mes en curso (ponderado): nota=%s componentes=%s publicos=%s;', fila.nota_final, fila.componentes, fila.valores_publicos);
    end if;
    if fila.componentes ? 'reportes' then r := r || ' [ok] y conserva los demás componentes;';
    else r := r || ' [FALLA] se perdieron los demás componentes;'; end if;

    -- Mes cerrado con 2 votos, ponderado: no alcanza.
    execute $q$ select nota_final, componentes from mi_evaluacion_mensual('2000-01') $q$ into fila;
    if fila.nota_final is null and not (fila.componentes ? 'valores') then
      r := r || ' [ok] mes cerrado con 2 votos: sin valores y la nota en null;';
    else
      r := r || format(' [FALLA] mes cerrado con 2 votos: nota=%s componentes=%s;', fila.nota_final, fila.componentes);
    end if;

    -- Método de puntos: la nota sale sólo de los puntos, no revela valores; se ve siempre, valores no.
    execute $q$ select nota_final, componentes, puntos_total from mi_evaluacion_mensual('2000-05') $q$ into fila;
    if fila.nota_final = 17.00 and fila.puntos_total = 5200 and not (fila.componentes ? 'valores') then
      r := r || ' [ok] método puntos sin votos: la nota se ve y valores no;';
    else
      r := r || format(' [FALLA] método puntos: nota=%s puntos=%s componentes=%s;', fila.nota_final, fila.puntos_total, fila.componentes);
    end if;

    -- Mes cerrado con 3 votos: completa.
    execute $q$ select nota_final, componentes, valores_publicos from mi_evaluacion_mensual('2000-02') $q$ into fila;
    if fila.nota_final = 16.00 and (fila.componentes ->> 'valores')::int = 16
       and (fila.componentes ->> 'valoresCantidad')::int = 3 and fila.valores_publicos then
      r := r || ' [ok] mes cerrado con 3 votos: fila completa;';
    else
      r := r || format(' [FALLA] mes cerrado con 3 votos: nota=%s componentes=%s publicos=%s;', fila.nota_final, fila.componentes, fila.valores_publicos);
    end if;

    -- Foto tomada con 1 solo voto (valoresCantidad = 1), mes cerrado y hoy con 3 votos: NO es pública.
    execute $q$ select nota_final, componentes, valores_publicos from mi_evaluacion_mensual('2000-04') $q$ into fila;
    if fila.nota_final is null and not (fila.componentes ? 'valores') and not fila.valores_publicos then
      r := r || ' [ok] foto guardada con 1 voto no se publica aunque hoy haya 3;';
    else
      r := r || format(' [FALLA] se publicó una foto de 1 voto: nota=%s componentes=%s;', fila.nota_final, fila.componentes);
    end if;

    -- El mínimo sale de config.
    perform set_config('role', v_super, true);
    update config set valor = '4' where clave = 'valores_min_evaluaciones';
    perform set_config('role', 'authenticated', true);
    execute $q$ select nota_final, componentes, valores_publicos from mi_evaluacion_mensual('2000-03') $q$ into fila;
    if fila.nota_final is null and not (fila.componentes ? 'valores') and not fila.valores_publicos then
      r := r || ' [ok] con el mínimo en 4 y 3 votos no es público;';
    else
      r := r || format(' [FALLA] con el mínimo en 4 se publicó: nota=%s componentes=%s;', fila.nota_final, fila.componentes);
    end if;
    perform set_config('role', v_super, true);
    update config set valor = '3' where clave = 'valores_min_evaluaciones';
    perform set_config('role', 'authenticated', true);
  exception when others then r := r || format(' [FALLA] mi_evaluacion_mensual: %s;', sqlerrm); end;

  -- ── 3) evaluaciones_mensuales_visibles ───────────────────────────────────────────────────
  begin
    execute $q$ select count(*) from evaluaciones_mensuales_visibles() $q$ into n;
    if n = 6 then r := r || ' [ok] sin datos_personas, visibles devuelve sólo las propias (6);';
    else          r := r || format(' [FALLA] sin datos_personas, visibles devolvió %s fila(s) en vez de 6;', n); end if;
  exception when others then r := r || format(' [FALLA] visibles (propia): %s;', sqlerrm); end;

  perform set_config('request.jwt.claims', json_build_object('sub', enc_id, 'role','authenticated')::text, true);
  begin
    execute $q$ select count(*) from evaluaciones_mensuales_visibles() $q$ into n;
    if n = 7 then r := r || ' [ok] el encargado con datos_personas ve las 7 de otras personas;';
    else          r := r || format(' [FALLA] el encargado con datos_personas ve %s fila(s) en vez de 7;', n); end if;
    execute format($q$ select count(*) from evaluaciones_mensuales_visibles() v
                      where (v.componentes ? 'valores' or v.componentes ? 'valoresCantidad')
                        and not (v.valores_publicos) $q$) into n;
    if n = 0 then r := r || ' [ok] y a ninguna le llega valores sin ser público;';
    else          r := r || format(' [FALLA] %s fila(s) filtran valores sin ser públicas;', n); end if;
    execute format($q$ select count(*) from evaluaciones_mensuales_visibles() v
                      where v.metodo = 'ponderado' and not v.valores_publicos and v.nota_final is not null $q$) into n;
    if n = 0 then r := r || ' [ok] ni la nota de una ponderada no pública;';
    else          r := r || format(' [FALLA] %s nota(s) ponderadas no públicas visibles;', n); end if;
  exception when others then r := r || format(' [FALLA] visibles (encargado): %s;', sqlerrm); end;

  -- ── 4) anon ──────────────────────────────────────────────────────────────────────────────
  begin
    if has_function_privilege('anon', 'public.mi_evaluacion_mensual(text)', 'execute')
       or has_function_privilege('anon', 'public.evaluaciones_mensuales_visibles()', 'execute') then
      r := r || ' [FALLA] anon puede ejecutar las funciones;';
    else r := r || ' [ok] anon no ejecuta las funciones;'; end if;
  exception when others then r := r || format(' [FALLA] anon: %s;', sqlerrm); end;

  -- ── 5) Votos ─────────────────────────────────────────────────────────────────────────────
  -- ev1 vota a ev2 (así no choca con las filas de `evaluada`, que ya tienen su (evaluador, evaluado, mes)).
  perform set_config('request.jwt.claims', json_build_object('sub', ev1, 'role','authenticated')::text, true);

  begin
    insert into evaluaciones_valores(evaluador_id, evaluado_id, mes, integridad, respeto, honestidad, amabilidad, relacion, actitud)
    values (ev1, ev2, mes_hoy, 4, 4, 4, 4, 4, 4);
    r := r || ' [ok] voto en el mes en curso con la ventana abierta: pasa;';
  exception when others then r := r || format(' [FALLA] el voto del mes en curso se rechazó: %s;', sqlerrm); end;

  begin
    update evaluaciones_valores set integridad = 5 where evaluador_id = ev1 and evaluado_id = ev2 and mes = mes_hoy;
    get diagnostics c = row_count;
    if c = 1 then r := r || ' [ok] corregir el voto del mes en curso: pasa;';
    else          r := r || format(' [FALLA] corregir el voto del mes en curso tocó %s fila(s);', c); end if;
  exception when others then r := r || format(' [FALLA] corregir el voto del mes en curso: %s;', sqlerrm); end;

  begin
    insert into evaluaciones_valores(evaluador_id, evaluado_id, mes, integridad, respeto, honestidad, amabilidad, relacion, actitud)
    values (ev1, ev3, '2000-01', 1, 1, 1, 1, 1, 1);
    r := r || ' [FALLA] se aceptó un voto nuevo en un mes cerrado;';
  exception when insufficient_privilege then r := r || ' [ok] voto nuevo en un mes cerrado: rechazado;';
           when others then r := r || format(' [FALLA] voto en mes cerrado falló por otra razón: %s;', sqlerrm); end;

  begin
    insert into evaluaciones_valores(evaluador_id, evaluado_id, mes, integridad, respeto, honestidad, amabilidad, relacion, actitud)
    values (ev1, ev3, '2999-12', 1, 1, 1, 1, 1, 1);
    r := r || ' [FALLA] se aceptó un voto en un mes futuro;';
  exception when insufficient_privilege then r := r || ' [ok] voto en un mes futuro: rechazado;';
           when others then r := r || format(' [FALLA] voto en mes futuro falló por otra razón: %s;', sqlerrm); end;

  -- Corregir una fila de un mes cerrado: no la ve la policy (0 filas) — el voto publicado no cambia.
  begin
    update evaluaciones_valores set integridad = 1 where evaluador_id = ev1 and evaluado_id = evaluada and mes = '2000-02';
    get diagnostics c = row_count;
    if c = 0 then r := r || ' [ok] corregir un voto de un mes cerrado: 0 filas;';
    else          r := r || format(' [FALLA] se corrigió un voto de un mes cerrado (%s fila);', c); end if;
  exception when others then r := r || format(' [FALLA] corregir mes cerrado falló raro: %s;', sqlerrm); end;

  -- Mover un voto del mes en curso a un mes cerrado.
  begin
    update evaluaciones_valores set mes = '2000-06' where evaluador_id = ev1 and evaluado_id = ev2 and mes = mes_hoy;
    r := r || ' [FALLA] se movió un voto del mes en curso a un mes cerrado;';
  exception when insufficient_privilege then r := r || ' [ok] mover un voto a un mes cerrado: rechazado;';
           when others then r := r || format(' [FALLA] mover voto falló por otra razón: %s;', sqlerrm); end;

  -- Ventana: modo 'ventana' con un rango que no incluye hoy.
  perform set_config('role', v_super, true);
  update config set valor = 'ventana' where clave = 'valores_modo';
  update config set valor = dia_otro::text where clave in ('valores_dia_inicio', 'valores_dia_fin');
  perform set_config('role', 'authenticated', true);
  begin
    insert into evaluaciones_valores(evaluador_id, evaluado_id, mes, integridad, respeto, honestidad, amabilidad, relacion, actitud)
    values (ev1, ev3, mes_hoy, 4, 4, 4, 4, 4, 4);
    r := r || ' [FALLA] se aceptó un voto fuera de la ventana de días;';
  exception when insufficient_privilege then r := r || ' [ok] voto fuera de la ventana de días: rechazado;';
           when others then r := r || format(' [FALLA] voto fuera de ventana falló por otra razón: %s;', sqlerrm); end;

  -- Ventana que SÍ incluye hoy.
  perform set_config('role', v_super, true);
  update config set valor = dia_hoy::text where clave in ('valores_dia_inicio', 'valores_dia_fin');
  perform set_config('role', 'authenticated', true);
  begin
    insert into evaluaciones_valores(evaluador_id, evaluado_id, mes, integridad, respeto, honestidad, amabilidad, relacion, actitud)
    values (ev1, ev3, mes_hoy, 4, 4, 4, 4, 4, 4);
    r := r || ' [ok] voto dentro de la ventana de días: pasa;';
  exception when others then r := r || format(' [FALLA] voto dentro de la ventana se rechazó: %s;', sqlerrm); end;

  -- Deshabilitado.
  perform set_config('role', v_super, true);
  update config set valor = 'siempre' where clave = 'valores_modo';
  update config set valor = 'false' where clave = 'valores_habilitado';
  perform set_config('role', 'authenticated', true);
  begin
    insert into evaluaciones_valores(evaluador_id, evaluado_id, mes, integridad, respeto, honestidad, amabilidad, relacion, actitud)
    values (ev1, admin_id, mes_hoy, 4, 4, 4, 4, 4, 4);
    r := r || ' [FALLA] se aceptó un voto con la ventana deshabilitada;';
  exception when insufficient_privilege then r := r || ' [ok] voto con valores_habilitado = false: rechazado;';
           when others then r := r || format(' [FALLA] voto deshabilitado falló por otra razón: %s;', sqlerrm); end;

  -- ── 6) Administrador: nada cambia ────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role','authenticated')::text, true);
  begin
    insert into evaluaciones_valores(evaluador_id, evaluado_id, mes, integridad, respeto, honestidad, amabilidad, relacion, actitud)
    values (admin_id, evaluada, '2000-02', 4, 4, 4, 4, 4, 4);
    update evaluaciones_valores set integridad = 2 where evaluador_id = ev1 and evaluado_id = evaluada and mes = '2000-02';
    get diagnostics c = row_count;
    if c = 1 then r := r || ' [ok] el administrador sigue votando y moderando en cualquier mes, y con la ventana cerrada;';
    else          r := r || format(' [FALLA] el administrador moderó %s fila(s) en vez de 1;', c); end if;
  exception when others then r := r || format(' [FALLA] el administrador perdió un permiso: %s;', sqlerrm); end;

  raise exception 'RESULTADO 0119 -->%', r;
end $$;
