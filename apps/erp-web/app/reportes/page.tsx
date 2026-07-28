import { redirect } from 'next/navigation';

// Fase 4 tarea 1: /reportes para el usuario operativo es SOLO el formulario del turno — sin
// lista. La lista administrativa (antes vivía acá) se mudó a /administracion/reportes, con
// permiso propio ('reportes_admin') y el resumen de todos los reportes.
//
// El formulario en sí sigue viviendo en /reportes/nuevo sin cambios: es el destino "puerto
// seguro" al que ya redirigen /page.tsx, /evaluar-reportes, /evaluaciones, /pagos, /incidencias
// cuando el usuario no tiene permiso para esos módulos, y no valida ningún permiso propio (debe
// quedar alcanzable siempre para cualquier sesión válida). Esta ruta solo reenvía — no duplica esa
// lógica ni le agrega un gate que no tenía.
export default function ReportesPage() {
  redirect('/reportes/nuevo');
}
