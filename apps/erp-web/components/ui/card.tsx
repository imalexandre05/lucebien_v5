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
        'cursor-pointer transition-[transform,box-shadow] duration-200 ease-out-expo hover:-translate-y-0.5 hover:shadow-lift',
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
