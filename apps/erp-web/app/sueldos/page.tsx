import { redirect } from 'next/navigation';

// El hub de cinco etapas (F1) queda absorbido por la portada de Personal: la fila «Herramientas
// del período» de app/personal/page.tsx muestra el mismo recorrido —gateada pantalla por
// pantalla, no como bloque— arriba de la lista de personas (Tarea 2 de la fusión R1-R4). Se
// conserva la ruta para no romper un enlace guardado; las cinco subrutas (/sueldos/acuerdos,
// /asistencia, /ventas, /movimientos, /liquidaciones) siguen vivas, sólo este índice se movió.
export default function SueldosPage() {
  redirect('/personal');
}
