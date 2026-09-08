-- Prueba de la migración 0105_empleado_documentos.sql
--
-- No hay forma de simular una subida de archivo real desde SQL puro (Storage recibe el binario
-- por la API REST, no por una función SQL) — la subida real queda por probar a mano contra scilb
-- desde la pantalla, una vez que exista (spec §7: esto NO se afirma ya hecho, a propósito, tras el
-- hallazgo del verificador sobre no-negociable 7). Esta prueba comprueba lo que SÍ es verificable
-- desde acá:
--   · el guard de la tabla de metadatos (admin sí, no-admin no — comprobado leyendo el resultado
--     COMO administrador de la base, nunca en el rol restringido: leer con la sesión de un
--     no-admin no distingue "se borró" de "no lo puedo ver", el error que tenía la primera
--     versión de esta prueba);
--   · anon no puede ni ejecutar el guard ni tocar la tabla, por privilegio, no sólo por policy;
--   · los tres `check` nuevos (tipo_mime, tamaño, prefijo del path) rechazan lo que prometen;
--   · `on delete restrict` frena el borrado de un empleado con documentos — no `cascade`;
--   · el bucket quedó privado, 10 MB, sólo imágenes+PDF, y sus tres policies de storage.objects
--     existen, corren `to authenticated` y mencionan el bucket y `app_es_admin` en su expresión
--     (no sólo el nombre — un conteo de policies no prueba que hagan lo que dicen).
--
-- SE DESCARTA SOLA — mismo aviso de siempre: sin `set_config('request.jwt.claims', ...)` y
-- `set local role`, la prueba no comprueba nada de verdad. Correr el archivo ENTERO de una vez.
--
-- Cómo se corre: bash tools/probar-migracion.sh 0105 (o pegarlo en el SQL editor de Supabase).

do $$
declare
  adm uuid; col uuid; emp uuid;
  v_doc_id uuid;
  v_bucket record;
  v_policies_ok int;
  v_puede_admin boolean;
  v_fallas text := '';
begin
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales)
    values ('Admin Prueba 0105', '0105a', 'admin', true, 'AL', 'AP') returning id into adm;
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales)
    values ('Colaborador Prueba 0105', '0105b', 'ventas_junior', true, 'AL', 'CP') returning id into col;
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales)
    values ('Persona Prueba 0105', '0105c', 'ventas_junior', true, 'AL', 'PP') returning id into emp;

  -- 1) Como admin: insertar metadatos debe funcionar, y subido_por/subido_en salen del default
  -- (no del cliente — no están en el grant de columnas).
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', adm::text, 'role', 'authenticated')::text, true);
  insert into empleado_documentos (empleado_id, nombre_archivo, tipo_mime, tamano_bytes, storage_path)
    values (emp, 'dni_prueba.jpg', 'image/jpeg', 123456, emp::text || '/prueba-0105.jpg')
    returning id into v_doc_id;
  reset role;

  if v_doc_id is null then
    v_fallas := v_fallas || E'\n  · admin no pudo insertar metadatos de un documento';
  end if;
  if not exists (select 1 from empleado_documentos where id = v_doc_id and subido_por = adm) then
    v_fallas := v_fallas || E'\n  · subido_por no quedó en el admin que subió (default auth.uid() falló)';
  end if;

  -- 2) Como colaborador sin autoridad: ni ve, ni inserta, ni borra — comprobado por privilegio de
  -- columna/tabla, no sólo por policy (pregunta 6 del verificador).
  select has_table_privilege('authenticated', 'empleado_documentos', 'select') into v_puede_admin;
  -- ^ el rol de base `authenticated` SÍ tiene el privilegio de tabla (RLS es lo que filtra filas,
  -- no el grant) — esto sólo confirma que la tabla no está revocada al ras, cinturón y tirantes.
  if not v_puede_admin then
    v_fallas := v_fallas || E'\n  · authenticated no tiene privilegio de SELECT a nivel de tabla (RLS no llegaría a evaluarse)';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', col::text, 'role', 'authenticated')::text, true);
  if exists (select 1 from empleado_documentos where id = v_doc_id) then
    v_fallas := v_fallas || E'\n  · un colaborador sin autoridad SÍ puede LEER el documento de otra persona';
  end if;
  begin
    insert into empleado_documentos (empleado_id, nombre_archivo, tipo_mime, tamano_bytes, storage_path)
      values (emp, 'intento.jpg', 'image/jpeg', 1, emp::text || '/intento-0105.jpg');
    v_fallas := v_fallas || E'\n  · un colaborador sin autoridad SÍ pudo insertar un documento';
  exception when sqlstate '42501' then
    null; -- esperado: la policy lo bloquea (permiso denegado, no otro motivo)
  end;
  delete from empleado_documentos where id = v_doc_id; -- 0 filas esperadas: RLS lo oculta, no lo borra
  reset role;

  -- La comprobación de "sigue existiendo" tiene que leerse SIN el rol restringido: leerla como
  -- col confundiría "no lo veo" con "no existe", que es exactamente el error que tenía la primera
  -- versión de esta prueba (hallazgo del verificador).
  if not exists (select 1 from empleado_documentos where id = v_doc_id) then
    v_fallas := v_fallas || E'\n  · el intento de DELETE de un colaborador sin autoridad SÍ borró la fila';
  end if;

  -- 3) anon: ni siquiera puede ejecutar el guard (verificado por privilegio, no por policy).
  if has_function_privilege('anon', 'private.app_es_admin()', 'execute') then
    v_fallas := v_fallas || E'\n  · anon SÍ puede ejecutar private.app_es_admin() (debería tener el execute revocado desde la 0018/0037)';
  end if;

  -- 4) Los tres `check` nuevos rechazan lo que prometen (spec, endurecimiento post-verificador).
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', adm::text, 'role', 'authenticated')::text, true);
  begin
    insert into empleado_documentos (empleado_id, nombre_archivo, tipo_mime, tamano_bytes, storage_path)
      values (emp, 'malicioso.exe', 'application/x-msdownload', 100, emp::text || '/malicioso.exe');
    v_fallas := v_fallas || E'\n  · se pudo insertar un tipo_mime fuera de la lista permitida';
  exception when check_violation then null; end;
  begin
    insert into empleado_documentos (empleado_id, nombre_archivo, tipo_mime, tamano_bytes, storage_path)
      values (emp, 'gigante.pdf', 'application/pdf', 20971520, emp::text || '/gigante.pdf');
    v_fallas := v_fallas || E'\n  · se pudo insertar un tamano_bytes de 20 MB (el límite es 10 MB)';
  exception when check_violation then null; end;
  begin
    insert into empleado_documentos (empleado_id, nombre_archivo, tipo_mime, tamano_bytes, storage_path)
      values (emp, 'cruzado.jpg', 'image/jpeg', 100, col::text || '/cruzado.jpg');
    v_fallas := v_fallas || E'\n  · se pudo insertar un storage_path que no empieza con el empleado_id de la fila';
  exception when check_violation then null; end;
  reset role;

  -- 5) `on delete restrict`, no `cascade` (el hallazgo central del verificador): borrar a alguien
  -- con documentos tiene que fallar RUIDOSO, no llevarse los metadatos en silencio.
  begin
    delete from empleados where id = emp;
    v_fallas := v_fallas || E'\n  · se pudo borrar un empleado con documentos (debería fallar por restrict)';
  exception when foreign_key_violation then null; end;

  -- 6) El bucket quedó configurado como promete la spec.
  select * into v_bucket from storage.buckets where id = 'empleado-documentos';
  if v_bucket.id is null then
    v_fallas := v_fallas || E'\n  · el bucket empleado-documentos no existe';
  else
    if v_bucket.public is distinct from false then
      v_fallas := v_fallas || E'\n  · el bucket quedó público (debe ser privado)';
    end if;
    if v_bucket.file_size_limit is distinct from 10485760 then
      v_fallas := v_fallas || format(E'\n  · file_size_limit es %s, esperaba 10485760 (10 MB)', v_bucket.file_size_limit);
    end if;
    if v_bucket.allowed_mime_types is distinct from array['image/jpeg','image/png','image/webp','application/pdf'] then
      v_fallas := v_fallas || format(E'\n  · allowed_mime_types es %s, esperaba jpeg/png/webp/pdf', v_bucket.allowed_mime_types);
    end if;
  end if;

  -- 7) Las tres policies de storage.objects existen, corren a authenticated, y su expresión
  -- menciona de verdad el bucket y el guard — no sólo el nombre de la policy.
  select count(*) into v_policies_ok
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname like 'empdoc_storage_%'
    and roles = array['authenticated']::name[]
    and (qual like '%empleado-documentos%' or with_check like '%empleado-documentos%')
    and (qual like '%app_es_admin%' or with_check like '%app_es_admin%');
  if v_policies_ok <> 3 then
    v_fallas := v_fallas || format(E'\n  · %s de 3 policies de storage.objects cumplen bucket+guard+rol esperado', v_policies_ok);
  end if;

  if v_fallas = '' then
    raise exception 'RESULTADO 0105: OK — metadatos sólo admin (por privilegio y por policy), checks de tipo/tamaño/path, restrict en vez de cascade, bucket y policies de storage correctos';
  else
    raise exception 'RESULTADO 0105: FALLAS —%', v_fallas;
  end if;
end $$;
