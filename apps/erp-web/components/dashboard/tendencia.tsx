import { cn } from '../../lib/cn';

// Gráfico de tendencia en SVG propio (sin librería). Barras diarias con la media como guía.
// Server component: sin JavaScript en el navegador. El `<title>` de cada barra da el dato exacto
// al pasar el mouse y a los lectores de pantalla.
export function Tendencia({
  datos,
  etiquetaSerie,
  className,
}: {
  datos: { fecha: string; valor: number }[];
  etiquetaSerie: string;
  className?: string;
}) {
  const W = 560;
  const H = 150;
  const base = 22; // espacio para etiquetas del eje
  const alto = H - base - 8;
  const max = Math.max(1, ...datos.map((d) => d.valor));
  const media = datos.length ? datos.reduce((s, d) => s + d.valor, 0) / datos.length : 0;
  const paso = W / Math.max(1, datos.length);
  const ancho = Math.max(4, paso * 0.62);
  const yMedia = 8 + alto - (media / max) * alto;
  const total = datos.reduce((s, d) => s + d.valor, 0);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={cn('h-auto w-full', className)}
      role="img"
      aria-label={`${etiquetaSerie}, últimos ${datos.length} días: ${total} en total, ${media.toFixed(1)} por día en promedio.`}
    >
      <line x1={0} x2={W} y1={8 + alto} y2={8 + alto} stroke="rgb(var(--line))" strokeWidth={1} />
      {datos.map((d, i) => {
        const h = d.valor === 0 ? 2 : Math.max(4, (d.valor / max) * alto);
        const x = i * paso + (paso - ancho) / 2;
        const esHoy = i === datos.length - 1;
        return (
          <g key={d.fecha}>
            <rect
              x={x}
              y={8 + alto - h}
              width={ancho}
              height={h}
              rx={3}
              fill={esHoy ? 'rgb(var(--acento))' : 'rgb(var(--acento) / .38)'}
            >
              <title>{`${d.fecha}: ${d.valor}`}</title>
            </rect>
            {d.valor > 0 && (
              <text x={x + ancho / 2} y={8 + alto - h - 3} textAnchor="middle" fontSize={9} fill="rgb(var(--muted))" className="tabular-nums">
                {d.valor}
              </text>
            )}
            {(i % 2 === datos.length % 2 || esHoy) && (
              <text x={x + ancho / 2} y={H - 6} textAnchor="middle" fontSize={9} fill="rgb(var(--muted))" className="tabular-nums">
                {d.fecha.slice(8, 10)}/{d.fecha.slice(5, 7)}
              </text>
            )}
          </g>
        );
      })}
      {media > 0 && (
        <line x1={0} x2={W} y1={yMedia} y2={yMedia} stroke="rgb(var(--gold))" strokeWidth={1} strokeDasharray="4 4" />
      )}
    </svg>
  );
}
