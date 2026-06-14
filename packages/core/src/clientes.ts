// Clientes: datos personales + medidas para alquiler/confección. Genérico del oficio.
import { z } from 'zod';

export interface Medidas {
  talla?: string;
  pecho?: number; // cm
  cintura?: number;
  largoPierna?: number;
}

export interface Cliente {
  id: string;
  nombre: string;
  dni: string;
  telefono: string;
  sedeCod: string;
  medidas: Medidas;
  createdAt: string; // YYYY-MM-DD
}

const medidasSchema = z.object({
  talla: z.string().default(''),
  pecho: z.number().nonnegative().optional(),
  cintura: z.number().nonnegative().optional(),
  largoPierna: z.number().nonnegative().optional(),
});

export const clienteSchema = z.object({
  nombre: z.string().min(1, 'Nombre requerido'),
  // DNI peruano: 8 dígitos. Se permite vacío (cliente sin registrar DNI).
  dni: z
    .string()
    .refine((v) => v === '' || /^\d{8}$/.test(v), 'DNI de 8 dígitos')
    .default(''),
  telefono: z.string().default(''),
  sedeCod: z.string().min(1, 'Sede requerida'),
  medidas: medidasSchema.default({}),
});
export type ClienteInput = z.infer<typeof clienteSchema>;

export interface ClientesRepo {
  listar(): Promise<Cliente[]>;
  crear(input: ClienteInput): Promise<Cliente>;
  eliminar(id: string): Promise<void>;
}
