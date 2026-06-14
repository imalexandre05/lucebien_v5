import type { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold leading-none text-navy">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="gold-rule mt-4" />
    </div>
  );
}
