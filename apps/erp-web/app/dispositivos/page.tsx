import { ShieldCheck, ShieldX, Ban, Laptop } from 'lucide-react';
import { getSesion } from '../../lib/auth';
import { listarDispositivos, type Dispositivo } from '../../lib/dispositivos-repo';
import { listarSedes } from '../../lib/sedes-repo';
import { PageHeader } from '../../components/shell/page-header';
import { Card, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge, type Tone } from '../../components/ui/badge';
import { StatBox } from '../../components/ui/stat-box';
import { buttonVariants } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';
import { cn } from '../../lib/cn';
import { accionAprobar, accionRechazar, accionRevocar, accionCambiarSede, accionCambiarCompartido } from './actions';

const TONE: Record<Dispositivo['estado'], Tone> = {
  aprobado: 'green',
  pendiente: 'amber',
  rechazado: 'gray',
  revocado: 'gray',
};
const LABEL: Record<Dispositivo['estado'], string> = {
  aprobado: 'Aprobado',
  pendiente: 'Pendiente',
  rechazado: 'Rechazado',
  revocado: 'Revocado',
};

const fecha = (iso: string | null) => (iso ? iso.slice(0, 16).replace('T', ' ') : '—');

export default async function DispositivosPage() {
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';

  if (!esAdmin) {
    return (
      <div>
        <PageHeader title="Dispositivos autorizados" subtitle="Acceso restringido" />
        <Card>
          <CardContent className="py-10 text-center text-cuerpo text-muted">
            Solo un administrador puede gestionar los equipos autorizados.
          </CardContent>
        </Card>
      </div>
    );
  }

  const [disp, sedes] = await Promise.all([listarDispositivos(), listarSedes().catch(() => [])]);
  const n = (e: Dispositivo['estado']) => disp.filter((d) => d.estado === e).length;

  return (
    <div>
      <PageHeader
        title="Dispositivos autorizados"
        subtitle="Solo los equipos aprobados pueden usar SCI-LB (control por equipo)"
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox index={0} label="Equipos" valor={disp.length} tone="navy" />
        <StatBox index={1} label="Aprobados" valor={n('aprobado')} tone="exito" />
        <StatBox index={2} label="Pendientes" valor={n('pendiente')} tone="aviso" />
        <StatBox index={3} label="Bloqueados" valor={n('rechazado') + n('revocado')} tone="neutro" />
      </div>

      <Card>
        <CardContent className="overflow-x-auto px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Equipo</TH>
                <TH>Token</TH>
                <TH>Sede</TH>
                <TH>Compartido</TH>
                <TH>Estado</TH>
                <TH>Registrado</TH>
                <TH>Últ. visto</TH>
                <TH className="pr-5 text-right">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {disp.map((d) => (
                <TR key={d.id}>
                  <TD className="pl-5">
                    <div className="font-medium text-navy">{d.nombre || 'Equipo sin nombre'}</div>
                    {d.userAgent && (
                      <div className="max-w-[16rem] truncate text-micro text-muted" title={d.userAgent}>
                        {d.userAgent}
                      </div>
                    )}
                  </TD>
                  <TD>
                    <span className="tabular-nums text-micro text-muted" title={d.deviceId}>
                      …{d.deviceId.slice(-8)}
                    </span>
                  </TD>
                  <TD>
                    <form action={accionCambiarSede} className="flex flex-wrap gap-1">
                      <input type="hidden" name="id" value={d.id} />
                      {sedes.map((s) => (
                        <button
                          key={s.cod}
                          type="submit"
                          name="sede"
                          value={s.cod}
                          aria-pressed={d.sedeCod === s.cod}
                          title={`Pre-marcar ${s.nombre} en el login de este equipo`}
                          className={cn(
                            'rounded-r-pastilla border px-2 py-0.5 tabular-nums text-micro font-medium transition-colors',
                            d.sedeCod === s.cod ? 'border-navy bg-navy text-paper' : 'border-line text-muted hover:border-gold hover:text-navy',
                          )}
                        >
                          {s.cod}
                        </button>
                      ))}
                    </form>
                  </TD>
                  <TD>
                    <form action={accionCambiarCompartido}>
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="compartido" value={d.compartido ? 'false' : 'true'} />
                      <button
                        type="submit"
                        aria-pressed={d.compartido}
                        title={
                          d.compartido
                            ? 'Equipo compartido: el pipeline pide el código personal. Clic para quitarlo'
                            : 'Marcar como compartido: el pipeline pedirá el código personal de quien opera'
                        }
                        className={cn(
                          'rounded-r-pastilla border px-2 py-0.5 text-micro font-medium transition-colors',
                          d.compartido ? 'border-navy bg-navy text-paper' : 'border-line text-muted hover:border-gold hover:text-navy',
                        )}
                      >
                        {d.compartido ? 'Sí' : 'No'}
                      </button>
                    </form>
                  </TD>
                  <TD>
                    <Badge tone={TONE[d.estado]}>{LABEL[d.estado]}</Badge>
                  </TD>
                  <TD className="tabular-nums text-dato text-muted">{fecha(d.creadoEn)}</TD>
                  <TD className="tabular-nums text-dato text-muted">{fecha(d.ultimoVisto)}</TD>
                  <TD className="pr-5">
                    <div className="flex items-center justify-end gap-1.5">
                      {d.estado !== 'aprobado' && (
                        <form action={accionAprobar}>
                          <input type="hidden" name="id" value={d.id} />
                          <button className="toque inline-flex items-center gap-1 rounded-r-pastilla border border-exito-line bg-exito-soft px-2.5 py-1 text-apoyo font-medium text-exito-deep transition-colors duration-150 hover:bg-exito-soft active:scale-[0.97]">
                            <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} /> Aprobar
                          </button>
                        </form>
                      )}
                      {d.estado === 'pendiente' && (
                        <form action={accionRechazar}>
                          <input type="hidden" name="id" value={d.id} />
                          <button className="toque inline-flex items-center gap-1 rounded-r-pastilla border border-line px-2.5 py-1 text-apoyo font-medium text-muted transition-colors duration-150 hover:border-gold hover:text-navy active:scale-[0.97]">
                            <ShieldX className="h-3.5 w-3.5" strokeWidth={2} /> Rechazar
                          </button>
                        </form>
                      )}
                      {d.estado === 'aprobado' && (
                        <form action={accionRevocar}>
                          <input type="hidden" name="id" value={d.id} />
                          <button className="toque inline-flex items-center gap-1 rounded-r-pastilla border border-error-line bg-error-soft px-2.5 py-1 text-apoyo font-medium text-error-deep transition-colors duration-150 hover:bg-error-soft active:scale-[0.97]">
                            <Ban className="h-3.5 w-3.5" strokeWidth={2} /> Revocar
                          </button>
                        </form>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
              {disp.length === 0 && (
                <TR>
                  <TD colSpan={8} className="p-0">
                    <EmptyState icon={Laptop} titulo="Todavía no entró ningún equipo">
                      Cada computadora o teléfono aparece acá la primera vez que alguien abre el ERP
                      desde él. No hay nada que registrar a mano.
                    </EmptyState>
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <p className="mt-3 text-apoyo text-muted">
        La <strong className="font-medium text-navy">sede</strong> es la que este equipo pre-marca como botón en su
        pantalla de login (&ldquo;el dispositivo manda&rdquo;) — quien tenga varias tiendas puede cambiarla ahí mismo o
        después desde el topbar. El control de acceso por equipo se activa con el flag{' '}
        <span className="tabular-nums">DEVICE_GATE</span>. Mientras no haya ningún equipo aprobado, el acceso queda
        abierto (modo instalación) para no bloquear al primer administrador.
      </p>
    </div>
  );
}
