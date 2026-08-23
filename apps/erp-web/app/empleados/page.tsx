import { redirect } from 'next/navigation';

// La ficha administrativa de una persona se mudó al expediente: /personal/[id]/datos (la pestaña
// «Datos», primera del hilo). Este archivo, cliente.tsx y actions.ts se QUEDAN — la pestaña nueva
// reusa sus componentes y sus server actions tal cual, no los reescribe — pero la pantalla suelta
// deja de navegarse: ya no hace falta abrir un colaborador desde una lista aparte cuando el
// expediente es una sola parada para todo lo suyo.
export default function EmpleadosPage() {
  redirect('/personal');
}
