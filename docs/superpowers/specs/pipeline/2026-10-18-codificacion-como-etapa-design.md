# Codificación como etapa del pipeline

Sesión 5A · Zona crítica (no-negociable 2: avance solo por RPC) · Migración 0147 · Corrige el apartado separado del PR #70

## Problema
El PR #70 puso «Codificación» como una pestaña aparte con un listado de movimientos. El dueño lo
quiere como una **etapa más del pipeline** (una columna del tablero) para las prendas a las que
todavía les falta su etiqueta con el código. La codificación real (imprimir y poner la etiqueta) se
hace en el sistema externo de inventario y punto de venta; aquí solo se marca que la prenda ya la
tiene y pasa a la etapa siguiente.

## Reglas
1. **R1 — Nueva etapa `codificacion`.** Entra en `ETAPAS_PIPELINE` (core) y en el check
   `prenda_pasada_etapa_check`. Va entre Recepción y Lavado.
2. **R2 — Transiciones.** `recepcion → codificacion` (nueva, opcional: las prendas que ya traen su
   etiqueta siguen yendo directo a lavado/refacción) y `codificacion → lavado | refaccion`. Ninguna
   otra etapa llega a `codificacion`; tampoco se rechaza desde calidad hacia ella. La tabla es la
   misma en `TRANSICIONES` (core) y en `pipeline_avanzar` (lista blanca de la RPC).
3. **R3 — Solo por RPC.** Marcar «etiqueta puesta» es `pipeline_avanzar` (con código de operador
   en equipos compartidos, 0112). Deshacer funciona igual que en las demás etapas.
4. **R4 — Puntos.** Completar `codificacion` usa la clave `pts_codificacion`. **Decidido por el
   dueño (18-oct-2026): vale 1 punto**, editable por el administrador en `/configuracion` → puntos
   del pipeline. La migración siembra la fila (sin ella la RPC aplicaría igualmente el peso 1 de
   respaldo, pero así queda visible y editable). Anotado en `docs/pendientes-negocio.md` como decidido.
5. **R5 — Pantalla.** Columna «Codificación» en el tablero (ícono de etiqueta) con el botón
   «Etiqueta puesta» que avanza a lavado. Se elimina la pestaña `/pipeline/codificacion` y su
   consulta. El código de movimiento `MOV-…` (0135) se conserva en `prenda_historial`.
6. Se retira la etiqueta engañosa «Compostura / codificación» del peso de compostura.

## Pruebas
- SQL `0147_codificacion_etapa.prueba.sql`: recepción→codificación y codificación→lavado
  funcionan y dejan historial con `codigo_mov`; saltos no permitidos (lavado→codificación,
  codificación→planchado) → `TRANSICION:`; con `pts_codificacion` = 1 se paga 1 punto; con un
  peso editado se paga ese peso y con 0 no se escribe punto; el check acepta la etapa; deshacer vuelve a recepción.
- TS `pipeline.test.ts`: la etapa existe, está entre recepción y lavado y sus transiciones coinciden.
