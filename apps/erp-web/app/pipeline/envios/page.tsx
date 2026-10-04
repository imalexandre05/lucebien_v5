import { listarPrendasEnviadas } from '../../../lib/envios-repo';
import { getSesion } from '../../../lib/auth';
import { PageHeader } from '../../../components/shell/page-header';
import { equipoCompartido } from '../../../lib/pipeline-operador';
import { EnviosCliente } from './cliente';

// Envíos a tienda: la mitad del flujo que faltaba. El almacén despacha desde el kanban
// (prendas 'listo' → Enviar); aquí la TIENDA confirma lo que le llegó (aceptar/observar)
// y el almacén ve el historial. Espeja pipeline-envios del viejo.
export default async function EnviosPage() {
  const [prendas, sesion, compartido] = await Promise.all([
    listarPrendasEnviadas(),
    getSesion(),
    equipoCompartido(),
  ]);
  return (
    <div>
      <PageHeader
        title="Envíos a tienda"
        subtitle="Confirma en tienda lo que llegó del almacén; observado vuelve al taller"
      />
      <EnviosCliente prendas={prendas} miSede={sesion?.usuario.sede ?? ''} compartido={compartido} />
    </div>
  );
}
