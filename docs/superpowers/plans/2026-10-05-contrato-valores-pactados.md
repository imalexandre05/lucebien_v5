# Plan — contrato con valores pactados (spec: `specs/sueldos/2026-10-05-contrato-valores-pactados-design.md`)

1. Docs (este commit): spec + plan. Sin código (Zone Guard).
2. Reserva de la migración **0118** (0110–0117 están tomadas por PR abiertos; verificado con `git ls-remote` + fetch de cada rama). Commit y push solos.
3. Pruebas primero, vistas en rojo: vitest (`sueldos-repo.parametros.test.ts`, deriva de defaults) y `packages/db/pruebas/0118_*.prueba.sql` en Postgres local.
4. Código: 0118 (RPC `sueldo_parametros_vigentes()` + congelado de contratos), `crearAcuerdo`, editor y aviso en `/configuracion`.
5. `bash tools/verificar-local.sh` + prueba SQL en verde; subagente `verificador`; PR en borrador (`Closes imalexandre05/lucebien-tablero#20`, menciona #44 y #54).

## Orden de despliegue (hallazgo del verificador)
1. Aplicar la 0118 (crea la RPC y congela los contratos existentes).
2. Desplegar el código. Sin la RPC, las pantallas de contratos no cargan.
3. Si hubo contratos creados con el código viejo entre 1 y 2, correr `select private.sueldo_acuerdos_congelar_parametros();` como postgres y la consulta de verificación comentada en la 0118 (tiene que dar 0 filas).
