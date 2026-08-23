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
export const THead = ({ className, ...p }: HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className={cn('border-b border-line', className)} {...p} />
);
export const TBody = (p: HTMLAttributes<HTMLTableSectionElement>) => <tbody {...p} />;
export const TR = ({ className, ...p }: HTMLAttributes<HTMLTableRowElement>) => (
  <tr
    className={cn(
      'border-b border-line/60 transition-colors duration-150 last:border-0 hover:bg-paper/60',
      className,
    )}
    {...p}
  />
);
export const TH = ({ className, ...p }: ThHTMLAttributes<HTMLTableCellElement>) => (
  <th
    className={cn('px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted', className)}
    {...p}
  />
);
export const TD = ({ className, ...p }: TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn('px-3 py-2.5 align-middle', className)} {...p} />
);
