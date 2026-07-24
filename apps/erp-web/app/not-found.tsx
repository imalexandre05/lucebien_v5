import Link from 'next/link';
import { Compass } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { buttonVariants } from '../components/ui/button';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg pt-10">
      <Card className="animate-scale-in overflow-hidden">
        <div aria-hidden className="h-0.5 bg-gradient-to-r from-gold via-gold/50 to-line" />
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <Compass className="h-10 w-10 text-gold" strokeWidth={1.25} aria-hidden />
          <h1 className="text-2xl font-semibold text-navy">Página no encontrada</h1>
          <p className="max-w-sm text-sm leading-relaxed text-muted">
            La ruta que buscas no existe o fue movida.
          </p>
          <Link href="/" className={buttonVariants()}>
            Ir al dashboard
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
