import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export const Card = ({
  className,
  interactive,
  ...p
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) => (
  <div
    className={cn(
      'rounded-lg border border-line bg-white shadow-card',
      interactive &&
        // Levanta al pasar y CEDE al presionar. Sin el estado presionado el click no devuelve
        // nada y la tarjeta se siente como un dibujo; con él, como algo que se puede tocar.
        'cursor-pointer transition-[transform,box-shadow] duration-200 ease-out-expo hover-fine:-translate-y-0.5 hover:shadow-lift active:translate-y-0 active:shadow-card active:duration-75',
      className,
    )}
    {...p}
  />
);
export const CardHeader = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-center justify-between px-5 pt-4 pb-3', className)} {...p} />
);
export const CardTitle = ({ className, ...p }: HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn('text-lg font-semibold text-navy', className)} {...p} />
);
export const CardContent = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('px-5 pb-5', className)} {...p} />
);
