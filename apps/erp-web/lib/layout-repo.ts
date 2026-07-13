import { getServerClient } from './supabase/server';
import type { LayoutZona } from './reportes-repo';

// Editor de layout: guardado atómico por sede vía RPC layout_guardar (0038, bulk replace
// como el PUT /api/layout/bulk del viejo). La RLS layout_admin_write exige admin.

export type ZonaInput = Omit<LayoutZona, 'id'>;

export async function guardarLayout(sede: string, zonas: ZonaInput[]): Promise<number> {
  const sb = getServerClient();
  const { data, error } = await sb.rpc('layout_guardar', {
    p_sede: sede,
    p_zonas: zonas.map((z) => ({
      cod: z.cod,
      nombre: z.nombre,
      turno: z.turno,
      tipo: z.tipo,
      peso: z.peso,
      pos_x: z.posX,
      pos_y: z.posY,
      ancho: z.ancho,
      alto: z.alto,
      color: z.color,
      forma: z.forma,
      nivel: z.nivel,
      sobre_cod: z.sobreCod,
    })),
  });
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}
