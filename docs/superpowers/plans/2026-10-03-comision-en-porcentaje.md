# Plan — comisión en porcentaje (ticket tablero#1)

Spec: [specs/sueldos/2026-10-03-comision-en-porcentaje-design.md](../specs/sueldos/2026-10-03-comision-en-porcentaje-design.md)

1. **Test primero** — `apps/erp-web/lib/__tests__/porcentaje.test.ts`: 1.5→0.015, 1.50→0.015,
   2→0.02, 2.0→0.02, 0 válido, 100→1, coma decimal, vacío→null, negativo/>100/letras rechazados,
   sin ruido de coma flotante; y la inversa fracción→texto. Commit aparte (rojo esperado hasta el
   paso 2 — se commitea junto con el helper para no dejar CI rojo; el test se escribe antes).
2. **Helper** — `apps/erp-web/lib/porcentaje.ts` (`porcentajeAFraccion`, `fraccionAPorcentaje`) y
   un lector genérico `leerNumero(texto, {min, max})` para los demás campos del modal.
3. **Contrato** — `sueldos/acuerdos/cliente.tsx`: los 13 campos a texto libre (`inputMode=decimal`),
   textos en estado propio, la comisión en % y convertida al guardar; errores por campo bloquean
   «Pactar/Guardar». `acuerdos/actions.ts`: mismo rango (fracción 0–1), mensaje en %.
4. **/configuracion** — `config-catalogo.ts` marca `sueldo_pct_comision` con `unidad: 'porcentaje'`;
   `configuracion/cliente.tsx` lo muestra/edita en % con texto propio y guarda la fracción.
5. `bash tools/verificar-local.sh` en verde antes de cada commit; subagente `verificador`; docs.
