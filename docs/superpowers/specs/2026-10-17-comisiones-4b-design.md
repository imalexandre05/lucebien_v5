# Comisiones editables (1.ª y 2.ª) — hoja RESUMEN del Excel

Spec corta. Regla del dueño (hoja RESUMEN/DASHWORD).

## Reglas

- **1.ª comisión** = 2 % de las boletas mayores a S/120. Se desbloquea al cumplir la meta mensual.
  **Ya existe** (RN-13): `sueldo_pct_comision` (0.02), `sueldo_monto_minimo_comision` (120), línea «Comisión 2%».
- **2.ª comisión** = S/30 por cada meta semanal cumplida. **Ya existe** como «Bono por metas semanales»
  (RN-12): `sueldo_bono_meta_semanal` (30). Es la misma regla con otro nombre: no se duplica.

## Cambio (sin migración, sin tocar el motor)

1. El resumen muestra la línea «Bono por metas semanales» como **2.ª comisión** (hoy cae en «Otros
   beneficios» y la fila dice «No configurado»). `comision2` pasa de `null` a número; el total de
   beneficios no cambia (sólo se mueve de fila).
2. Configuración: las tres claves ya son editables; se corrigen etiquetas/descripciones para que digan
   «1.ª/2.ª comisión» y que la 1.ª se desbloquea con la meta del **mes** (la descripción actual decía
   «semanas», que no es lo que hace el motor).

## Defaults inventados

Ninguno: 2 %, S/120 y S/30 ya eran los defaults del motor y de la 0072.
