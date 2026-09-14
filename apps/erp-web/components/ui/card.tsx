import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { Superficie } from './superficie';

export const Card = ({
  className,
  interactive,
  ...p
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) => (
  <Superficie
    elev={1}
    radio="medio"
    className={cn(
      interactive &&
        // Levanta al pasar y CEDE al presionar. Sin el estado presionado el click no devuelve
        // nada y la tarjeta se siente como un dibujo; con él, como algo que se puede tocar.
        'cursor-pointer transition-[transform,box-shadow] duration-200 ease-out-expo hover-fine:-translate-y-0.5 hover:shadow-elev-2 active:translate-y-0 active:shadow-elev-1 active:duration-75',
      className,
    )}
    {...p}
  />
);
export const CardHeader = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-center justify-between px-5 pt-4 pb-3', className)} {...p} />
);
// El título de tarjeta lleva el hilo dorado del sistema a la izquierda: una barra corta en el
// acento del módulo que lo ancla y le da color a una zona que era sólo texto navy sobre blanco.
// `before` y no un nodo aparte para no tocar las ~60 pantallas que ya usan CardTitle.
export const CardTitle = ({ className, ...p }: HTMLAttributes<HTMLHeadingElement>) => (
  <h3
    className={cn(
      'relative flex items-center gap-2.5 text-seccion font-display font-semibold text-navy',
      'before:block before:h-4 before:w-1 before:shrink-0 before:rounded-r-pastilla before:bg-acento before:content-[""]',
      className,
    )}
    {...p}
  />
);
export const CardContent = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('px-5 pb-5', className)} {...p} />
);
