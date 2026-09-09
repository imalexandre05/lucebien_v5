import type {
  HTMLAttributes,
  TableHTMLAttributes,
  ThHTMLAttributes,
  TdHTMLAttributes,
} from 'react';
import { cn } from '../../lib/cn';

// La tabla trae su propio contenedor con scroll horizontal.
//
// POR QUÉ ACÁ Y NO EN CADA PANTALLA. De 44 tablas del ERP, 28 estaban envueltas a mano y 16 no. Una
// tabla que se pasa de ancho SIN contenedor no se desborda sola: empuja la página entera de
// costado, y en un celular eso deja la interfaz inservible —la barra fija se corre, el menú queda
// fuera— por una sola columna que no entraba. Con el contenedor, lo único que se mueve es la tabla.
//
// Los 28 envoltorios que ya existían quedan como estaban: un contenedor de scroll dentro de otro no
// hace daño, y sacarlos a mano de 28 archivos es riesgo sin premio.
export const Table = ({ className, ...p }: TableHTMLAttributes<HTMLTableElement>) => (
  <div className="overflow-x-auto">
    <table className={cn('w-full border-collapse text-sm', className)} {...p} />
  </div>
);

// `pegajosa` (spec "Ocho afinados"): opt-in, no default. `sticky top-0` se ancla al primer
// ancestro con scroll — que para la mayoría de las 44 tablas de hoy es el viewport entero, salvo
// que un topbar fijo le gane el `top: 0` y el encabezado quede tapado. Sin auditar los 44
// contenedores uno por uno, forzarlo por defecto es arriesgar una tabla rota por cada una que se
// arregla; se activa tabla por tabla en la fase 8, cuando se revisa en pantalla.
export const THead = ({
  className,
  pegajosa = false,
  ...p
}: HTMLAttributes<HTMLTableSectionElement> & { pegajosa?: boolean }) => (
  <thead
    className={cn('border-b border-line', pegajosa && 'sticky top-0 z-10 bg-superficie', className)}
    {...p}
  />
);

// `cebra` (spec "Ocho afinados"): opt-in — `:nth-child(even)` no necesita saber el índice de cada
// fila. Se queda apagado por defecto: una tabla que ya resalta la fila seleccionada con
// `hilo-fila` puede leerse peor con las dos señales encima.
export const TBody = ({
  className,
  cebra = false,
  ...p
}: HTMLAttributes<HTMLTableSectionElement> & { cebra?: boolean }) => (
  <tbody className={cn(cebra && '[&>tr:nth-child(even)]:bg-superficie-hundida/40', className)} {...p} />
);

// `seleccionada` pinta el hilo dorado a la izquierda de la fila (spec §4, `.hilo-fila`) — la señal
// de foco/selección del sistema, siempre dorada, nunca del acento del módulo.
export const TR = ({
  className,
  seleccionada = false,
  ...p
}: HTMLAttributes<HTMLTableRowElement> & { seleccionada?: boolean }) => (
  <tr
    className={cn(
      'border-b border-line/60 transition-colors duration-150 last:border-0 hover:bg-paper/60',
      seleccionada && 'hilo-fila bg-superficie-hundida/60',
      className,
    )}
    {...p}
  />
);

export const TH = ({ className, ...p }: ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn('px-3 py-2.5 text-left text-rotulo font-display text-muted', className)} {...p} />
);

// `num` (spec "Ocho afinados", celdas numéricas en `text-dato`): alinea a la derecha con cifras
// tabulares — es la columna que alguien compara entre filas, y sin alinear no se compara de un
// vistazo.
export const TD = ({
  className,
  num = false,
  ...p
}: TdHTMLAttributes<HTMLTableCellElement> & { num?: boolean }) => (
  <td className={cn('px-3 py-2.5 align-middle', num && 'text-right text-dato', className)} {...p} />
);
