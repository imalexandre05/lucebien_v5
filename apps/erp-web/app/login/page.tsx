import { iniciarSesion } from './actions';
import { Card, CardContent } from '../../components/ui/card';
import { Input, Select, Label } from '../../components/ui/form';
import { Button } from '../../components/ui/button';

const SEDES = [
  { cod: 'LB', nombre: 'Lucebien' },
  { cod: 'ST', nombre: 'Stand' },
  { cod: 'TR', nombre: 'Trece' },
  { cod: 'AL', nombre: 'Almacén Central' },
];

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <div className="font-display text-4xl font-semibold text-navy">LuceBien</div>
          <div className="mt-1.5 font-mono text-[10px] tracking-brand text-gold">SCI · LB</div>
        </div>
        <Card>
          <CardContent className="pt-6">
            {searchParams.error && (
              <p className="mb-4 rounded-md bg-amber-500/15 px-3 py-2 text-xs text-amber-700">
                {searchParams.error === 'credenciales'
                  ? 'Código o sede incorrectos.'
                  : 'Datos inválidos. Revisa la sede y el código (4 dígitos).'}
              </p>
            )}
            <form action={iniciarSesion} className="space-y-4">
              <div>
                <Label>Sede</Label>
                <Select name="sede" defaultValue="LB">
                  {SEDES.map((s) => (
                    <option key={s.cod} value={s.cod}>
                      {s.nombre}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Código</Label>
                <Input
                  name="cod"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="4 dígitos"
                  className="font-mono tracking-[0.3em]"
                  required
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full">
                Ingresar
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-[11px] text-muted">Ingresa con tu código y sede</p>
      </div>
    </div>
  );
}
