-- ═══════════════════════════════════════════════════════════════════════════════════════════
--  RECUPERAR LOS DÍAS QUE SE HABÍAN PERDIDO
--
--  Correr sólo después de aplicar la 0079.
--
--  ESTE SÍ ESCRIBE DATOS. Por eso el primer paso es una copia. Andá bloque por bloque: seleccioná
--  un bloque con el mouse y dale Run, en vez de correr el archivo entero de una.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- ── BLOQUE 1: la copia de seguridad. Tarda segundos y es lo que te salva si algo sale mal. ──
create table asistencias_respaldo_20260821 as select * from asistencias;
-- Es una copia de las horas de las 18 personas: sin RLS, cualquiera con la clave publica del
-- proyecto podria leerla. Activada y sin politicas, no la lee nadie por la API; desde el editor SQL
-- se sigue viendo. (Supabase avisa de esto al crear la tabla: la respuesta correcta es
-- "Run and enable RLS".)
alter table asistencias_respaldo_20260821 enable row level security;

-- ── BLOQUE 2: cómo está AHORA. Anotá estos números antes de seguir. ────────────────────────
select condicion, count(*) as filas, count(*) filter (where hora_salida is null) as sin_salida
from asistencias
where fuente = 'huellero'
group by 1
order by 2 desc;

-- ── BLOQUE 3: volver a derivar todo el histórico del huellero. ─────────────────────────────
-- La función trae sus salvaguardas: no toca un día declarado como falta, no pisa una hora que
-- cargó una persona, y no declara trabajada una jornada imposible.
select huellero_derivar_asistencia(d.empleado_id, d.f)
from (
  select distinct empleado_id, (marcada_en at time zone 'America/Lima')::date as f
  from marcas_huellero
  where empleado_id is not null
) d;

-- ── BLOQUE 4: cómo quedó. Los 'sin_dato' tienen que haber BAJADO. ─────────────────────────
select condicion, count(*) as filas, count(*) filter (where hora_salida is null) as sin_salida
from asistencias
where fuente = 'huellero'
group by 1
order by 2 desc;

-- ── BLOQUE 5 (sólo si algo salió mal): volver atrás. ───────────────────────────────────────
-- Descomentar las tres líneas y correrlas. Cuidado: esto descarta lo derivado.
-- drop table asistencias;
-- alter table asistencias_respaldo_20260821 rename to asistencias;
-- (avisame antes: hay políticas de RLS e índices que hay que rehacer)

-- ── BLOQUE 6: cuando ya estés conforme, borrar la copia. Sin apuro: no molesta a nadie. ────
-- drop table asistencias_respaldo_20260821;

