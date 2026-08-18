-- Prueba de las migraciones 0076_meta_semanal_proporcional_default.sql y
-- 0077_factor_hora_fuera_contrato.sql
--
-- Las dos son cambios de parámetro, así que lo único que hay que comprobar es que el parámetro
-- LLEGUE AL MOTOR. Ese es el modo de fallar que importa: la fila de config existe, el
-- administrador la edita en pantalla, la ve guardada, y private.sueldo_parametros_config() no la
-- emite porque nadie la agregó al mapa. Parece que funciona y liquida con el default.
--
-- SE DESCARTA SOLA. Todo vive en un bloque que termina lanzando una excepción con el resultado:
-- eso aborta la transacción y no queda ni una fila.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0077
--
-- Todo `ok` = las migraciones cumplen. Cualquier `FALLA` = una promesa que no se cumple.

do $$
declare
  p       jsonb;
  emp     uuid;
  acu     uuid;
  r       text := '';
begin
  -- ── 1) El default de la empresa quedó en meta proporcional (C-02) ────────────────────────
  -- La 0072 sembró 'true' con `on conflict do nothing`, así que sin el update de la 0076 esta
  -- comprobación falla y el motor liquidaría con la conducta anterior aunque el core diga otra.
  p := private.sueldo_parametros_config();
  if (p ->> 'metaSemanalFija') = 'false' then r := r || '1=ok ';
  else r := r || format('1-META-SIGUE-FIJA=FALLA(%s) ', coalesce(p ->> 'metaSemanalFija', 'ausente')); end if;

  -- ── 2) El factor de la hora fuera de contrato llega al motor (C-03) ──────────────────────
  -- Éste es el silencioso. Si falta la línea en el mapa de la RPC, la clave simplemente no
  -- aparece y el core aplica su default de 1 sin que nadie se entere.
  update config set valor = '1.5' where clave = 'sueldo_factor_hora_fuera_contrato';
  p := private.sueldo_parametros_config();
  if (p ->> 'factorHoraFueraContrato')::numeric = 1.5 then r := r || '2=ok ';
  else r := r || format('2-FACTOR-NO-LLEGA=FALLA(%s) ', coalesce(p ->> 'factorHoraFueraContrato', 'ausente')); end if;

  -- ── 3) En blanco significa "no configurado", no cero ─────────────────────────────────────
  -- Un factor 0 es una decisión válida ("no se paga aparte"); una celda vacía NO es esa decisión.
  -- Number('') es 0 y es finito, así que un cast ingenuo dejaría de pagar la hora sin avisar.
  update config set valor = '' where clave = 'sueldo_factor_hora_fuera_contrato';
  p := private.sueldo_parametros_config();
  if not (p ? 'factorHoraFueraContrato') then r := r || '3=ok ';
  else r := r || format('3-VACIO-NO-CAE-AL-DEFAULT=FALLA(%s) ', p ->> 'factorHoraFueraContrato'); end if;

  -- ── 4) Basura corta, no liquida a ciegas ─────────────────────────────────────────────────
  update config set valor = 'una vez y media' where clave = 'sueldo_factor_hora_fuera_contrato';
  begin
    p := private.sueldo_parametros_config();
    r := r || '4-BASURA-NO-CORTA=FALLA ';
  exception when others then
    if sqlerrm like 'CONFIG:%' then r := r || '4=ok ';
    else r := r || format('4-CORTA-MAL=FALLA(%s) ', sqlerrm); end if;
  end;

  -- ── 5) Se puede pactar por contrato: la lista blanca acepta la clave nueva ───────────────
  -- Sin ampliar sueldo_acuerdos_parametros_chk, pactarlo con una persona explota con un error de
  -- base sin traducir en la pantalla de contratos.
  select id into emp from empleados order by id limit 1;
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, modalidad, sueldo_pactado, estado, parametros)
    values (emp, '2099-01-01', '2099-01-31', 'mensual', 600, 'borrador', '{"factorHoraFueraContrato": 1.5}'::jsonb)
    returning id into acu;
  r := r || '5=ok ';

  -- ── 6) Y una clave inventada sigue rebotando ────────────────────────────────────────────
  -- La lista blanca se rehizo entera en la 0077. Si al rehacerla se hubiera aflojado, un
  -- 'factor_hora_fuera_contrato' en snake_case entraría, y TODA liquidación de esa persona
  -- cortaría después con "Parámetro de sueldo desconocido".
  begin
    update sueldo_acuerdos set parametros = '{"factor_hora_fuera_contrato": 1.5}'::jsonb where id = acu;
    r := r || '6-LISTA-BLANCA-AFLOJADA=FALLA ';
  exception when check_violation then
    r := r || '6=ok ';
  end;

  raise exception 'RESULTADO %', r;
end $$;
