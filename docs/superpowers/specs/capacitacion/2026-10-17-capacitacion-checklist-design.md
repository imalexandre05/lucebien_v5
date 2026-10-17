# Spec 0131 — Capacitación: checklist de 3 estados, examen y capacitadores

> Spec corta (17-oct-2026). Ticket: lucebien-tablero#13. Nivel: pantalla/flujo nuevo. **No toca el
> pago al capacitador** (`valorCapacitacion` en `sueldos.ts`): eso es cadena del sueldo y exige spec
> completa; queda anotado como pendiente.

## Qué pide el cliente
- Checklist de capacitación con 3 estados: **bueno, regular, malo**.
- Un examen por capacitación.
- Un apartado de nuevos a quienes capacitan los colaboradores con más experiencia, con todo el camino
  hasta hacerles las pruebas.

## Modelo
- `capacitacion_items` — catálogo del checklist (nombre, orden, activo). Lo edita el administrador.
- `capacitaciones` — una por persona nueva: `nuevo_id`, `capacitador_id`, `inicio`, `estado`
  (`en_curso` · `completada` · `cancelada`), `cierre`. Un nuevo tiene a lo sumo una en curso.
- `capacitacion_avances` — estado de cada ítem por capacitación (`bueno` · `regular` · `malo`; sin fila =
  pendiente), con observación opcional.
- `capacitacion_examenes` — notas de examen (0–20) con nombre y fecha; puede haber varios intentos.

## Camino
1. Admin/dueño asigna: «Nuevo» + «Capacitador» (otra persona, distinta del nuevo).
2. El capacitador (o admin) marca cada ítem bueno/regular/malo, con observación.
3. Registra uno o varios exámenes (nota /20).
4. Cierra la capacitación: sólo si **todos los ítems activos están marcados** y hay **al menos un
   examen**. El resultado es **aprobada** si la última nota ≥ nota aprobatoria y no queda ítem en
   «malo»; si no, **por reforzar** (informativo, no bloquea el cierre).

## Aislamiento (no-negociable 3)
- Admin/dueño ven todo. El **capacitador** ve las capacitaciones que dicta. El **nuevo** ve sólo la suya.
  Nadie más. Un encargado no ve capacitaciones de otra sede (hoy: sólo admin y los dos participantes).
- Toda escritura es por RPC `security definer`; tablas sin `insert/update/delete` directo.
- Marcar ítems y registrar exámenes: capacitador o admin (el nuevo no se califica a sí mismo).

## Defaults inventados (no-negociable 5)
Todos editables y anotados en `docs/pendientes-negocio.md`:
- `capacitacion_nota_aprobatoria` = **14** (/20), editable en /configuracion → sección Capacitación.
  Provisional: la escala /20 es la del proyecto; el 14 no lo dijo el dueño.
- Ítems iniciales del checklist (5, editables en la propia pantalla por el administrador): conocimiento
  del taller y las sedes · proceso de prendas (pipeline) · uso del sistema · orden y limpieza · trato y
  puntualidad. Son un punto de partida, no una regla.

## Conexiones
- **Evaluación (tablero#3):** el componente `examenes` se alimenta del promedio de las notas de examen
  de las capacitaciones cerradas en el ciclo; sin exámenes queda como hoy (manual). Va en su propia spec.
- **Pago al capacitador:** fuera de esta spec. Pendiente: decidir cuándo se considera «persona nueva
  capacitada» (¿cierre aprobado?) para alimentar `personasCapacitadas`.

## Pruebas
- Core (`capacitacion.ts`): resumen del checklist, nota de examen, puede cerrar, resultado.
- SQL (`0131_capacitacion.prueba.sql`): aislamiento (un tercero no ve nada, el nuevo no califica),
  cierre bloqueado sin ítems/examen, una sola en curso por nuevo, sin escritura directa.
