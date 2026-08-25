-- 0094_incidencias_solo_a_su_nombre.sql — inc_select deja de ser "por sede" y pasa a "a su nombre"
--
-- Implementa docs/superpowers/specs/almacen/2026-08-25-incidencias-alcance-y-formulario-design.md
-- §2 (C-1).
--
-- QUÉ PASABA. La 0092 (24-ago-2026) dejó `inc_select` en:
--   using (private.app_es_admin() or private.app_es_almacen() or sede_cod in (select private.app_sedes()))
-- Las once personas activas tienen las CUATRO sedes asignadas en empleado_tiendas —confirmado
-- intencional por el administrador el 24-ago, por la rotación—, así que "por sede" no acota nada
-- en la práctica: hoy cualquiera ve las incidencias de todos. El 25-ago, en la reunión de hoja de
-- ruta, el administrador pidió acotar explícito a "solo a su nombre" (ítem E-1).
--
-- Esto no contradice lo que contestó el 24-ago ("sí ven el listado, pero no pueden ver quién
-- reportó, solo el admin"): esa frase acotaba el NOMBRE del reportante en la UI (spec del 24-ago,
-- C-2), no las FILAS que la política deja leer. Con las cuatro sedes por persona, "por sede" dejó
-- de acotar filas — y eso es justo lo que el administrador pidió cerrar hoy.
--
-- QUÉ CAMBIA. `inc_select` pasa a: admin, o `responsable_id = auth.uid()`, o
-- `reportado_por_id = auth.uid()`.
--   · `responsable_id = auth.uid()` es la lectura literal de "a su nombre": una incidencia a mi
--     nombre me descuenta puntos de mi evaluación, así que tengo que poder verla.
--   · `reportado_por_id = auth.uid()` se agrega para que quien registra una incidencia no
--     desaparezca de su propia pantalla al guardarla (se leería como que no se guardó). No filtra
--     nada nuevo —ya sabe lo que reportó— y no choca con que el NOMBRE del reportante se oculte a
--     los no-administradores en la UI: si soy yo, no hay nada que ocultarme.
--   · `private.app_es_almacen()` SE SACA a propósito, no por descuido: devuelve true también para
--     'confeccionista' (0006_pipeline_rls.sql:22-25), y una incidencia con responsable ES un dato
--     de una persona porque le mueve la nota — este repo ya pagó ese error una vez
--     (0067_aislamiento_datos_personas.sql). Si el almacén necesita ver más que lo suyo, es una
--     decisión del administrador, no un efecto lateral de un helper mal nombrado.
--   · `sede_cod in (select private.app_sedes())` SE SACA: es exactamente lo que el administrador
--     pidió dejar de usar como criterio de lectura en esta tabla.
--
-- `inc_insert`, `inc_update` e `inc_delete` NO SE TOCAN: quién puede registrar una incidencia y
-- quién puede editarla/borrarla no cambia en esta migración.
--
-- Idempotente: se puede reaplicar sin fallar. `drop policy if exists` antes de recrearla.
--
-- Recordatorios que este repo pagó caros:
--   · Los helpers de RLS viven en el schema `private` desde la 0037. SIEMPRE con el prefijo.
--   · NUNCA `private.app_es_almacen()` sobre datos de personas: devuelve true para
--     'confeccionista' además de 'encargado_almacen' (0006_pipeline_rls.sql:22-25). Por eso se saca
--     de esta política, no por descuido.
--   · Toda tabla con RLS necesita policy de LECTURA **y** de ESCRITURA. `incidencias` ya tiene las
--     cuatro (inc_select/inc_insert/inc_update/inc_delete, desde la 0046); esta migración
--     reemplaza únicamente `inc_select`.
--   · Todo default de negocio va comentado como provisional y anotado en
--     docs/pendientes-negocio.md (no-negociable 5) — esta migración no agrega ningún parámetro
--     nuevo, sólo estrecha una política existente.

drop policy if exists inc_select on incidencias;
create policy inc_select on incidencias for select
  using (
    private.app_es_admin()
    or responsable_id = auth.uid()
    or reportado_por_id = auth.uid()
  );
