'use client';

import { Printer } from 'lucide-react';

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex cursor-pointer items-center gap-2 rounded-r-pastilla bg-navy px-4 py-2 text-sm font-medium text-paper transition-colors duration-150 hover:bg-navy-dark print:hidden"
    >
      <Printer className="h-4 w-4" strokeWidth={1.75} />
      Imprimir
    </button>
  );
}
