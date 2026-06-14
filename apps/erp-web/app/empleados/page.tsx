import { PageHeader } from '../../components/shell/page-header';
import { StubNote } from '../../components/shell/stub-note';
import { Card, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';

// Datos de muestra. El RRHH interno real se migra desde el ERP viejo en la integración.
const EMP = [
  { nombre: 'C. Aliaga', rol: 'dueno', sede: 'LB', puntos: 412 },
  { nombre: 'M. Rojas', rol: 'encargado_tienda', sede: 'ST', puntos: 287 },
  { nombre: 'J. Quispe', rol: 'confeccionista', sede: 'AL', puntos: 356 },
  { nombre: 'P. Castro', rol: 'encargado_almacen', sede: 'AL', puntos: 240 },
  { nombre: 'L. Huamán', rol: 'ventas_junior', sede: 'LB', puntos: 198 },
];

export default function EmpleadosPage() {
  return (
    <div>
      <PageHeader title="Empleados" subtitle="Colaboradores y productividad" />
      <StubNote>Módulo en construcción · datos de muestra. El RRHH interno se migra en la integración.</StubNote>
      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Nombre</TH>
                <TH>Rol</TH>
                <TH>Sede</TH>
                <TH className="text-right">Puntos</TH>
                <TH className="pr-5">Estado</TH>
              </TR>
            </THead>
            <TBody>
              {EMP.map((e) => (
                <TR key={e.nombre}>
                  <TD className="pl-5 font-medium text-navy">{e.nombre}</TD>
                  <TD className="text-muted">{e.rol.replace('_', ' ')}</TD>
                  <TD>{e.sede}</TD>
                  <TD className="text-right font-mono text-navy">{e.puntos}</TD>
                  <TD className="pr-5">
                    <Badge tone="green">activo</Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
