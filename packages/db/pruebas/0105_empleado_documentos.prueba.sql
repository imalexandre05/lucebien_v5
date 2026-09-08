-- Prueba de la migración 0105_empleado_documentos.sql
--
-- No hay forma de simular una subida de archivo real desde SQL puro (Storage recibe el binario
-- por la API REST, no por una función SQL) — la subida real se probó a mano contra scilb desde la
-- pantalla, después de aplicar. Esta prueba comprueba lo que SÍ es verificable acá: el guard de
-- la tabla de metadatos (admin sí, no-admin no) y que el bucket quedó configurado como promete la
-- spec §1/§3 (privado, 10 MB, sólo imágenes+PDF) y con sus tres policies de storage.objects.
--
-- SE DESCARTA SOLA — ver el aviso de siempre sobre `set_config('request.jwt.claims', ...)` y
-- `set local role authenticated`: sin las dos cosas la prueba no comprueba nada de verdad.
--
-- Cómo se corre: bash tools/probar-migracion.sh 0105 (o pegarlo en el SQL editor de Supabase).

do $$
declare
  adm uuid; col uuid; emp uuid;
  v_doc_id uuid;
  v_bucket record;
  v_policies_storage int;
  v_fallas text := '';
begin
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales)
    values ('Admin Prueba 0105', '0105a', 'admin', true, 'AL', 'AP') returning id into adm;
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales)
    values ('Colaborador Prueba 0105', '0105b', 'ventas_junior', true, 'AL', 'CP') returning id into col;
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales)
    values ('Persona Prueba 0105', '0105c', 'ventas_junior', true, 'AL', 'PP') returning id into emp;

  -- 1) Como admin: insertar metadatos debe funcionar.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', adm::text, 'role', 'authenticated')::text, true);
  insert into empleado_documentos (empleado_id, nombre_archivo, tipo_mime, tamano_bytes, storage_path, subido_por)
    values (emp, 'dni_prueba.jpg', 'image/jpeg', 123456, emp::text || '/prueba-0105.jpg', adm)
    returning id into v_doc_id;
  reset role;

  if v_doc_id is null then
    v_fallas := v_fallas || E'\n  · admin no pudo insertar metadatos de un documento';
  end if;

  -- 2) Como colaborador sin autoridad: ni ve ni puede insertar/borrar.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', col::text, 'role', 'authenticated')::text, true);
  if exists (select 1 from empleado_documentos where id = v_doc_id) then
    v_fallas := v_fallas || E'\n  · un colaborador sin autoridad SÍ puede LEER el documento de otra persona';
  end if;
  begin
    insert into empleado_documentos (empleado_id, nombre_archivo, tipo_mime, tamano_bytes, storage_path)
      values (emp, 'intento.jpg', 'image/jpeg', 1, emp::text || '/intento-0105.jpg');
    v_fallas := v_fallas || E'\n  · un colaborador sin autoridad SÍ pudo insertar un documento';
  exception when others then
    null; -- esperado: la policy lo bloquea
  end;
  begin
    delete from empleado_documentos where id = v_doc_id;
    if not exists (select 1 from empleado_documentos where id = v_doc_id) then
      v_fallas := v_fallas || E'\n  · un colaborador sin autoridad SÍ pudo borrar el documento';
    end if;
  exception when others then
    null;
  end;
  reset role;

  -- 3) Como admin de nuevo: borrar debe funcionar (limpieza + comprobación del guard positivo).
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', adm::text, 'role', 'authenticated')::text, true);
  delete from empleado_documentos where id = v_doc_id;
  reset role;
  if exists (select 1 from empleado_documentos where id = v_doc_id) then
    v_fallas := v_fallas || E'\n  · admin no pudo borrar el documento';
  end if;

  -- 4) El bucket quedó configurado como promete la spec.
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

  -- 5) Las tres policies de storage.objects existen.
  select count(*) into v_policies_storage
  from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'empdoc_storage_%';
  if v_policies_storage <> 3 then
    v_fallas := v_fallas || format(E'\n  · hay %s policies de empdoc_storage_* en storage.objects, esperaba 3', v_policies_storage);
  end if;

  if v_fallas = '' then
    raise exception 'RESULTADO 0105: OK — guard de metadatos correcto (admin sí, no-admin no), bucket privado 10MB imagenes+PDF, tres policies de storage';
  else
    raise exception 'RESULTADO 0105: FALLAS —%', v_fallas;
  end if;
end $$;
