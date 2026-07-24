import { iniciarSesion } from './actions';
import { Card, CardContent } from '../../components/ui/card';
import { Input, Select, Label } from '../../components/ui/form';
import { LogoMark } from '../../components/brand/logo';
import { listarSedesPublico } from '../../lib/sedes-repo';
import { BotonIngresar } from './boton';

// Primera impresión (§4B): entrada escalonada crest → wordmark → tarjeta → pie,
// código estilo "cerradura" (mono, centrado, tracking ancho). La lógica de auth
// (cod + sede, 4 dígitos) no cambia. Las sedes salen de la BD: crear una sede
// nueva en Configuración la habilita aquí sin tocar código.
export default async function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  const SEDES = await listarSedesPublico();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <LogoMark size="xl" className="animate-scale-in" />
          <div className="mt-4 animate-rise text-4xl font-semibold leading-none text-navy [animation-delay:90ms]">
            LuceBien
          </div>
          <div className="mt-2 animate-rise font-mono text-[10px] tracking-brand text-gold [animation-delay:150ms]">
            SCI · LB
          </div>
        </div>
        <Card className="animate-rise overflow-hidden [animation-delay:210ms]">
          {/* Filete de sastre: hairline dorada que firma la tarjeta. */}
          <div aria-hidden className="h-0.5 bg-gradient-to-r from-gold via-gold/50 to-line" />
          <CardContent className="pt-6">
            {searchParams.error && (
              <p role="alert" className="mb-4 animate-rise rounded-md bg-amber-500/15 px-3 py-2 text-xs text-amber-700">
                {searchParams.error === 'credenciales'
                  ? 'Código o sede incorrectos.'
                  : 'Datos inválidos. Revisa la sede y el código (4 dígitos).'}
              </p>
            )}
            <form action={iniciarSesion} className="space-y-4">
              <div>
                <Label htmlFor="login-sede">Sede</Label>
                <Select id="login-sede" name="sede" defaultValue="LB">
                  {SEDES.map((s) => (
                    <option key={s.cod} value={s.cod}>
                      {s.nombre}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="login-cod">Código</Label>
                <Input
                  id="login-cod"
                  name="cod"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  placeholder="····"
                  autoComplete="off"
                  className="py-2.5 text-center font-mono text-lg tracking-[0.5em] placeholder:tracking-[0.3em]"
                  aria-describedby="login-ayuda"
                  required
                  autoFocus
                />
              </div>
              <BotonIngresar />
            </form>
          </CardContent>
        </Card>
        <p
          id="login-ayuda"
          className="mt-4 animate-rise text-center text-[11px] text-muted [animation-delay:270ms]"
        >
          Ingresa con tu código de 4 dígitos y tu sede
        </p>
      </div>
    </div>
  );
}
