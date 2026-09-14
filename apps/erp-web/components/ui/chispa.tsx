// Línea de tendencia de 64×20 con relleno de área y el último punto marcado (spec §7 "Cuatro de
// visualización"). Sin ejes ni etiquetas — vive dentro de un `StatBox`. La serie usa el acento
// del módulo (`currentColor` no sirve acá: el trazo necesita su propio color aunque el texto de
// alrededor sea otro), nunca un semántico — un semántico es para decir "bien/mal", no para
// dibujar una tendencia.
//
// Se dibuja UNA vez al montar (`animate-trazar`, spec §6 ítem 22): un gráfico que se re-anima en
// cada actualización de datos convierte una pantalla de trabajo en una que parpadea.
export function Chispa({
  valores,
  etiqueta,
  className,
}: {
  /** Al menos dos puntos. Se normalizan solos — no hace falta pasar nada en escala 0-1. */
  valores: number[];
  /** Para `aria-label`: qué es la serie y cómo cambió, ya armado por quien llama (spec: "no formatea sola"). */
  etiqueta: string;
  className?: string;
}) {
  if (valores.length < 2) return null;
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const rango = max - min || 1;
  const paso = 64 / (valores.length - 1);
  const puntos = valores.map((v, i) => [i * paso, 20 - ((v - min) / rango) * 18 - 1] as const);
  const linea = puntos.map(([x, y]) => `${x},${y.toFixed(1)}`).join(' L');
  const area = `M0,20 L${linea} L64,20 Z`;
  const [ultX, ultY] = puntos[puntos.length - 1];

  return (
    <svg viewBox="0 0 64 20" className={className} role="img" aria-label={etiqueta}>
      <path d={area} fill="rgb(var(--acento) / .16)" stroke="none" />
      <path
        d={`M${linea}`}
        fill="none"
        stroke="rgb(var(--acento))"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className="animate-trazar"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={ultX}
        cy={ultY}
        r={2.4}
        fill="rgb(var(--acento))"
        stroke="rgb(var(--superficie))"
        strokeWidth={1.4}
        className="animate-fade"
        style={{ animationDelay: 'var(--dur-momento)', animationFillMode: 'backwards' }}
      />
    </svg>
  );
}
