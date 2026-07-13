import { getServerClient } from './supabase/server';

// Gestión de actividades por sede (espejo de routes/actividades.js del viejo).
// El catálogo vive en actividades_config; escritura solo admin (RLS 0017).

export type ActividadAdmin = {
  id: string;
  sedeCod: string;
  cod: string;
  nombre: string;
  categoria: string; // PO · SO · IND · EXT
  tipoAct: string; // obligatoria · por_puntos (extra)
  peso: number;
  descuento: number;
  activa: boolean;
  turno: string; // ambos · mañana · tarde
  frecuenciaDias: number; // 0/1 diaria · 7 semanal (dia_semana) · N cada N días
  diaSemana: string; // 'L Mi S'
  apareceDia: number; // semanal: cada X semanas
  acumula: boolean;
  precioUnitario: number;
  unidad: string;
  orden: number;
};

export type ActividadInput = {
  nombre: string;
  categoria: string;
  tipoAct: string;
  peso: number;
  descuento: number;
  turno: string;
  frecuenciaDias: number;
  diaSemana: string;
  apareceDia: number;
  acumula: boolean;
  precioUnitario: number;
  unidad: string;
  orden: number;
};

function fromRow(r: Record<string, unknown>): ActividadAdmin {
  return {
    id: String(r.id),
    sedeCod: String(r.sede_cod),
    cod: String(r.cod),
    nombre: String(r.nombre ?? ''),
    categoria: String(r.categoria ?? 'PO'),
    tipoAct: String(r.tipo_act ?? 'obligatoria'),
    peso: Number(r.peso ?? 0),
    descuento: Number(r.descuento ?? 0),
    activa: Boolean(r.activa),
    turno: String(r.turno ?? 'ambos'),
    frecuenciaDias: Number(r.frecuencia_dias ?? 0),
    diaSemana: String(r.dia_semana ?? ''),
    apareceDia: Number(r.aparece_dia ?? 0),
    acumula: Boolean(r.acumula),
    precioUnitario: Number(r.precio_unitario ?? 0),
    unidad: String(r.unidad ?? 'unidad'),
    orden: Number(r.orden ?? 0),
  };
}

function aRow(p: ActividadInput) {
  return {
    nombre: p.nombre.trim(),
    categoria: p.categoria,
    tipo_act: p.tipoAct,
    peso: p.peso,
    descuento: p.descuento,
    turno: p.turno,
    frecuencia_dias: p.frecuenciaDias,
    dia_semana: p.diaSemana,
    aparece_dia: p.apareceDia,
    acumula: p.acumula,
    precio_unitario: p.precioUnitario,
    unidad: p.unidad || 'unidad',
    orden: p.orden,
  };
}

/** Todas las actividades (activas e inactivas). Sin sede → catálogo completo (para codificar). */
export async function listarActividadesAdmin(sede?: string): Promise<ActividadAdmin[]> {
  const sb = getServerClient();
  let q = sb.from('actividades_config').select('*').order('orden').order('cod');
  if (sede) q = q.eq('sede_cod', sede);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) ?? []).map(fromRow);
}

// Código auto-generado como el viejo (gaGuardarActividad): prefijo por categoría+relación
// (A=Primer Orden · B=2° Orden · OL=Indispensable · EX=Extra; S=Software · T=Ternos) y
// correlativo global de 2 dígitos sobre el catálogo completo.
export function generarCod(catalogo: { cod: string }[], categoria: string, relacion: 'S' | 'T'): string {
  const prefijo =
    categoria === 'IND' ? 'OL' : categoria === 'EXT' ? 'EX' : (categoria === 'SO' ? 'B' : 'A') + relacion;
  const usados = catalogo
    .filter((a) => a.cod.startsWith(prefijo))
    .map((a) => parseInt(a.cod.slice(prefijo.length), 10) || 0);
  const sig = usados.length ? Math.max(...usados) + 1 : 1;
  return `${prefijo}${String(sig).padStart(2, '0')}`;
}

/** Crea la actividad en cada sede seleccionada (mismo cod). */
export async function crearActividad(sedes: string[], cod: string, p: ActividadInput): Promise<void> {
  const sb = getServerClient();
  const filas = sedes.map((s) => ({ sede_cod: s, cod, activa: true, ...aRow(p) }));
  const { error } = await sb.from('actividades_config').insert(filas);
  if (error) throw new Error(error.message);
}

/** Edita por id y sincroniza el mismo cod hacia las sedes seleccionadas (upsert, sin borrar). */
export async function editarActividad(id: string, cod: string, sedes: string[], p: ActividadInput): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('actividades_config').update(aRow(p)).eq('id', id);
  if (error) throw new Error(error.message);
  if (sedes.length) {
    const { error: e2 } = await sb.from('actividades_config').upsert(
      sedes.map((s) => ({ sede_cod: s, cod, ...aRow(p) })),
      { onConflict: 'sede_cod,cod' },
    );
    if (e2) throw new Error(e2.message);
  }
}

export async function activarActividad(id: string, activa: boolean): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('actividades_config').update({ activa }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function eliminarActividad(id: string): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('actividades_config').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Copia el catálogo de una sede a otra (solo los cod que no existan; espejo de /duplicar). */
export async function duplicarActividades(desde: string, hacia: string): Promise<number> {
  const sb = getServerClient();
  const [origen, destino] = await Promise.all([listarActividadesAdmin(desde), listarActividadesAdmin(hacia)]);
  const existentes = new Set(destino.map((a) => a.cod));
  const nuevas = origen.filter((a) => !existentes.has(a.cod));
  if (!nuevas.length) return 0;
  const { error } = await sb.from('actividades_config').insert(
    nuevas.map((a) => ({
      sede_cod: hacia,
      cod: a.cod,
      activa: a.activa,
      ...aRow(a),
    })),
  );
  if (error) throw new Error(error.message);
  return nuevas.length;
}
