import Link from 'next/link';
import { CalendarCheck, Coins, FileSignature, ShoppingBag, Wallet } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';

// El ciclo del periodo en el orden en que se recorre. Quien administra piensa por proceso, y hasta
// ahora /sueldos no llevaba a ningun lado: habia que saberse las rutas.

const ETAPAS = [
  {
    href: '/sueldos/acuerdos',
    icono: FileSignature,
    titulo: 'Acuerdos',
    ayuda: 'Lo pactado con cada persona: horario, sueldo y meta',
  },
  {
    href: '/sueldos/asistencia',
    icono: CalendarCheck,
    titulo: 'Asistencia',
    ayuda: 'Que paso cada dia del periodo',
  },
  {
    href: '/sueldos/ventas',
    icono: ShoppingBag,
    titulo: 'Ventas y metas',
    ayuda: 'Las boletas transcritas y las cuatro semanas contra su meta',
  },
  {
    href: '/sueldos/movimientos',
    icono: Wallet,
    titulo: 'Adelantos y descuentos',
    ayuda: 'Lo que se entrego o se descuenta antes del pago',
  },
  {
    href: '/sueldos/liquidaciones',
    icono: Coins,
    titulo: 'Liquidaciones',
    ayuda: 'El calculo del periodo y su resumen',
  },
];

export default function SueldosPage() {
  return (
    <div className="animate-page-enter">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-navy">Sueldos</h1>
        <p className="mt-1 text-sm text-muted">
          El recorrido de un periodo, de lo pactado hasta el pago.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ETAPAS.map((e, i) => {
          const Icono = e.icono;
          return (
            <Link key={e.href} href={e.href} className="animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
              <Card interactive className="h-full">
                <CardContent className="flex items-start gap-3 p-5">
                  <span className="rounded-lg bg-navy/5 p-2 text-navy">
                    <Icono className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block font-medium text-navy">{e.titulo}</span>
                    <span className="mt-0.5 block text-sm text-muted">{e.ayuda}</span>
                  </span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
