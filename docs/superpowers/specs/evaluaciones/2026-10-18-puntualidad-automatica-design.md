# SPEC corta — Puntualidad automática en la evaluación (6A-1)

**Pedido del cliente:** «se sube automáticamente por su huella y saca el promedio de su nota de
acuerdo al total de asistencias que debe tener y cuántas tardanzas tuvo; en base 20».

## Estado hoy (verificado en `0132_evaluacion_examenes.sql`)
`private.evaluacion_componentes_datos` ya devuelve `tardanza` desde la asistencia, pero con la fórmula
`20 − floor(minutos de atraso / 15)`. Los minutos no dicen «cuántas veces» ni «de cuántas debía
asistir». `notaTardanza` (core) no la usa nadie.

## Regla nueva (default, editable)
Clave `eval_puntualidad_modo` en `config` (se edita en /configuración):
- `proporcion` (**default**): `tardanza = round(20 × puntuales / debidos, 2)`.
- `minutos`: la fórmula de hoy, sin cambios.

Definiciones, dentro del ciclo evaluado y hasta hoy (hora Perú) si el ciclo no terminó:
- **debidos**: días con turno contratado (acuerdo vigente de `sueldo_acuerdos` + `sueldo_acuerdo_turnos`
  de ese día de la semana) que tienen la asistencia **declarada** (`trabajado` o `falta`) y ninguna
  fila `sin_dato`. Un día sin fila o sin declarar (huella sin importar, hoy antes de marcar) no es
  debido: no se castiga lo que no se sabe (igual que `sueldo_entrada`, 0160).
- **tardanzas**: días `trabajado` cuya primera entrada supera `inicio_turno + sueldo_tolerancia_minutos`
  y no tienen `tardanza_justificada` (mismo criterio que el sueldo, RN-08).
- **puntuales**: días **debidos** `trabajado` que no son tardanza. Un día trabajado que no es debido (sábado
  fuera de contrato, día a medias) no suma puntualidad: no puede tapar una tardanza. Una falta no es puntual.
- Sin días debidos (persona sin acuerdo/turnos): cae a la fórmula de `minutos`, que da 20 si no hay
  atraso medible. Nunca divide entre cero.
- Todas las claves anteriores y `puntosTotal` quedan idénticas. Claves nuevas en el jsonb:
  `puntualidadDebidos`, `puntualidadPuntuales`, `puntualidadTardanzas`, `puntualidadModo`.

## Pantalla
En /evaluaciones el campo Puntualidad se llena solo al calcular (queda de sólo lectura) y muestra
«X puntuales de Y que debía asistir · Z tardanzas». Solo el administrador ve esta pantalla.

## Pruebas
`packages/db/pruebas/0159_puntualidad_automatica.prueba.sql` (escrita antes que la migración).

## Defaults a registrar en `docs/pendientes-negocio.md`
Modo `proporcion`; los `sin_dato` no cuentan como debidos; una falta resta puntualidad (además de lo
que ya cuesta en el sueldo). Confirmar con Alexander.
