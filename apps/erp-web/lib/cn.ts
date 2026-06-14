import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Combina clases Tailwind resolviendo conflictos (patrón shadcn).
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
