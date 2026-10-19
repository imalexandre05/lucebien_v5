# Accesorios: enviar y validar con código personal

Sesión 10A · Zona crítica (permisos + trazabilidad) · Migración 0182

## Problema
Principio del dueño: cada acción operativa queda a nombre de quien la hace, con su código. Auditoría
de acciones (19-oct-2026): registrar, avanzar, tanda, dividir, rechazar, deshacer, enviar, recibir,
devolver, anular y enviar reporte ya pasan por RPC con `p_operador`. **Quedan sin código dos:**
enviar una remesa de accesorios y validarla en tienda (`/pipeline/accesorios`): escriben directo con
la sesión y las políticas `envios_acc_rw` dejan que cualquiera con sede escriba.

## Reglas
1. **R1 — `accesorios_enviar(sede, obs, items, operador)`**: lo hace almacén o admin; el responsable
   es el dueño del código. Valida sede existente y al menos un ítem con cantidad > 0.
2. **R2 — `accesorios_validar(id, operador)`**: lo hace la tienda destino (no almacén) o el admin;
   `validado_por_id` es el dueño del código; una remesa ya validada no se vuelve a validar.
3. **R3 — Solo por RPC.** Se retiran las políticas de escritura de `envios_accesorios` y
   `envio_accesorios_items`; quedan de lectura (admin, almacén o sede destino).
4. **R4 — Pantalla.** Las dos acciones piden el código con el mismo diálogo del pipeline.

## Pruebas
SQL `0182_accesorios_con_codigo.prueba.sql`: almacén envía y queda a nombre del dueño del código;
una tienda no puede enviar; la tienda destino valida a nombre del código; otra tienda no valida;
doble validación → error; sin código en cuenta que lo exige → `CODIGO:`; insert/update directo falla.
