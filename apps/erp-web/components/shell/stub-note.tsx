import type { ReactNode } from 'react';
import { Construction } from 'lucide-react';

export function StubNote({ children }: { children: ReactNode }) {
  return (
    <div className="mb-5 flex items-center gap-2 rounded-r-chico border border-gold/30 bg-gold/10 px-4 py-2.5 text-apoyo text-gold-deep">
      <Construction className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      {children}
    </div>
  );
}
