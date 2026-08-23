# Contrato individual (F1.5) · Plan de implementación

> **Para agentes ejecutores:** SUB-SKILL REQUERIDA: usá `superpowers:subagent-driven-development`
> o `superpowers:executing-plans` para implementar tarea por tarea. Los pasos usan casillas
> (`- [ ]`) para el seguimiento.

**Objetivo:** los cuatro cambios de la spec
[2026-08-23-contrato-individual-design.md](../specs/sueldos/2026-08-23-contrato-individual-design.md):
persona fija sin buscador, fecha de ingreso precompletada en el primer contrato, horario con
barra visual y atajos, y el resumen con nombre y cifras mensuales.

**Arquitectura:** todo vive en `AcuerdosCliente`
(`apps/erp-web/app/sueldos/acuerdos/cliente.tsx`) más un cambio chico en
`apps/erp-web/app/colaboradores/[id]/contrato/page.tsx` que le pasa la persona. Cero cambios en
`packages/core`, cero migraciones, cero server actions nuevas.

**Stack:** Next.js App Router, TypeScript, Tailwind con tokens del sistema.

## Restricciones globales

Idénticas a las del plan de F1 (salen de `CLAUDE.md` y `docs/sistema-de-diseno.md`):

- **No se toca `packages/core/`** — esta vez sin excepción alguna.
- **No se escriben migraciones.**
- **Prohibida la paleta por defecto de Tailwind** (`emerald`, `amber`, `red`, `slate`, `sky`…).
  Tokens: `navy`, `gold`, `gold-soft`, `gold-deep`, `paper`, `ink`, `line`, `muted`, familias
  `exito`/`aviso`/`error`/`info` (`-soft`/`-line`/base/`-deep`). Lo comprueba
  `tools/guard-reglas.sh` (regla `diseno`) y falla CI.
- **Números con `tabular-nums`.** Nada monoespaciado.
- **`hoyPeru()` para "hoy"** — nunca `new Date()` (acá no hace falta ninguno de los dos).
- **Español neutral, sin voseo.** Sin signos de exclamación.
- **Animaciones ≤300 ms, sólo `transform`/`opacity`.** (Las barras del horario son estáticas —
  no animar el ancho.)
- **Verificación antes de cada commit:** `bash tools/verificar-local.sh`
- **Commits:** Conventional Commits en español, scope `erp`.
- **Staging:** nunca `git add -A` — el repo tiene muchos archivos sucios de otro trabajo. Sólo
  los archivos que cada tarea nombra.

## Estructura de archivos

| Archivo | Cambio | Tarea |
|---|---|---|
| `apps/erp-web/app/sueldos/acuerdos/cliente.tsx` | props `personaFija`/`fechaIngresoPersona`, ocultar picker y columna, precompletar fecha | 1 |
| `apps/erp-web/app/colaboradores/[id]/contrato/page.tsx` | pasar los props nuevos | 1 |
| `apps/erp-web/app/sueldos/acuerdos/cliente.tsx` | barra visual + botones de turno rápido + copiar día | 2 |
| `apps/erp-web/app/sueldos/acuerdos/cliente.tsx` | título «Resumen del contrato» + celdas nuevas en `analizar()` y el JSX | 3 |
| `docs/superpowers/specs/sueldos/2026-08-23-contrato-individual-design.md` | marcar construida | 4 |

Las tareas 1-3 tocan el mismo archivo: van en serie, nunca en paralelo.

---

## Tarea 1: Persona fija y fecha de ingreso (C-1 + C-2)

**Archivos:**
- Modificar: `apps/erp-web/app/sueldos/acuerdos/cliente.tsx`
- Modificar: `apps/erp-web/app/colaboradores/[id]/contrato/page.tsx`

**Interfaces:**
- Consume: `obtenerColaborador()` ya devuelve `fechaIngreso: string | null`
  (`apps/erp-web/lib/colaboradores-repo.ts:25`); `contrato/page.tsx` ya tiene `persona` cargada.
- Produce: `AcuerdosCliente` acepta dos props opcionales nuevos:

```ts
export function AcuerdosCliente({
  acuerdos,
  empleados,
  personaFija,
  fechaIngresoPersona,
}: {
  acuerdos: AcuerdoSueldo[];
  empleados: Emp[];
  /** Contexto /colaboradores/[id]/contrato: la persona no se elige, ya está dada. */
  personaFija?: Emp;
  /** Fecha de ingreso de la persona fija: precompleta el primer contrato (C-2). */
  fechaIngresoPersona?: string | null;
})
```

- [ ] **Paso 1: Agregar los props y el borrador inicial**

En `apps/erp-web/app/sueldos/acuerdos/cliente.tsx`:

1. Cambiar la firma del componente (línea ~202) por la de arriba.
2. En `abrirNuevo` (línea ~223), inicializar el borrador con la persona fija y, si es su primer
   contrato, con la fecha de ingreso:

```ts
  const abrirNuevo = () => {
    setEditando(null);
    setB({
      ...VACIO,
      empleadoId: personaFija?.id ?? '',
      // C-2: el PRIMER contrato de la persona arranca en su fecha de ingreso, editable. Una
      // renovación no: tiene su propia fecha y atarla al ingreso original la pisaría.
      fechaInicio: personaFija && acuerdos.length === 0 ? (fechaIngresoPersona ?? '') : '',
    });
    setError(null);
    setEnEditor(true);
  };
```

- [ ] **Paso 2: Ocultar el picker cuando la persona está fija**

Reemplazar el bloque del picker (líneas ~308-318) por:

```tsx
            {personaFija ? (
              <div>
                <LabelGrupo>Persona</LabelGrupo>
                <p className="text-sm font-medium text-navy">Contrato de {personaFija.nombre}</p>
              </div>
            ) : (
              <div>
                <LabelGrupo>Persona</LabelGrupo>
                <PersonaPicker
                  empleados={empleados}
                  selected={b.empleadoId ? [b.empleadoId] : []}
                  onChange={(ids) => setB((v) => ({ ...v, empleadoId: ids[0] ?? '' }))}
                  single
                  placeholder="Buscar a la persona…"
                />
              </div>
            )}
```

- [ ] **Paso 3: Ocultar la columna «Persona» de la tabla**

En la tabla de contratos (el `<TH>Persona</TH>` de la línea ~599 y su `<TD>` correspondiente en
las filas): envolver ambos en `{!personaFija && (...)}`. Leer las filas reales antes de editar —
el `<TD>` de persona muestra `nombreDe(a.empleadoId)` o similar; ocultar exactamente esa celda,
ninguna otra.

- [ ] **Paso 4: Pasar los props desde la página del colaborador**

En `apps/erp-web/app/colaboradores/[id]/contrato/page.tsx` (líneas ~49-52):

```tsx
      <AcuerdosCliente
        acuerdos={acuerdos}
        empleados={[{ id: persona.id, nombre: persona.nombre, rol: persona.rol, sedeCod: persona.sedeCod }]}
        personaFija={{ id: persona.id, nombre: persona.nombre, rol: persona.rol, sedeCod: persona.sedeCod }}
        fechaIngresoPersona={persona.fechaIngreso}
      />
```

`/sueldos/acuerdos/page.tsx` NO se toca: sin los props nuevos todo queda como estaba.

- [ ] **Paso 5: Verificar** — `bash tools/verificar-local.sh` en verde.

- [ ] **Paso 6: Commit**

```bash
git add apps/erp-web/app/sueldos/acuerdos/cliente.tsx "apps/erp-web/app/colaboradores/[id]/contrato/page.tsx"
git commit -m "feat(erp): el contrato de una persona ya no pide buscarla, y el primero arranca en su fecha de ingreso"
```

---

## Tarea 2: Horario con barra visual y atajos (C-3)

**Archivos:**
- Modificar: `apps/erp-web/app/sueldos/acuerdos/cliente.tsx` (sólo el bloque «Horario semanal»,
  líneas ~351-398, más helpers nuevos arriba del componente)

**Interfaces:**
- Consume: `minutos()` ya existe (línea ~118). `setB`, `b.turnos`, `agregarTurno`, `quitarTurno`,
  `setTurno` ya existen.
- Produce: nada para otras tareas.

- [ ] **Paso 1: Helpers y constantes de UI**

Arriba del componente (junto a `minutos`), agregar:

```ts
// Atajos de tipeo, no regla de negocio: son los dos horarios reales que ya menciona el texto de
// la pantalla. El administrador puede escribir cualquier otra hora.
const TURNOS_RAPIDOS = [
  { label: 'Mañana 09–13', horaInicio: '09:00', horaFin: '13:00' },
  { label: 'Tarde 13–20', horaInicio: '13:00', horaFin: '20:00' },
] as const;

// La ventana visible de la barra: cubre los horarios reales con margen. Un turno fuera de la
// ventana se recorta visualmente, nunca se pierde como dato.
const BARRA_DESDE = 6 * 60;
const BARRA_HASTA = 22 * 60;

const pctBarra = (hhmm: string): number => {
  const m = Math.min(Math.max(minutos(hhmm), BARRA_DESDE), BARRA_HASTA);
  return ((m - BARRA_DESDE) / (BARRA_HASTA - BARRA_DESDE)) * 100;
};
```

- [ ] **Paso 2: Handlers nuevos dentro del componente**

Junto a `agregarTurno` (línea ~273):

```ts
  const agregarTurnoRapido = (dia: number, r: (typeof TURNOS_RAPIDOS)[number]) =>
    setB((v) => ({
      ...v,
      turnos: [...v.turnos, { diaSemana: dia, horaInicio: r.horaInicio, horaFin: r.horaFin, lugar: null }],
    }));

  // Copia los turnos de `dia` a los días SIGUIENTES que estén vacíos. No pisa un día con turnos:
  // pisar en silencio lo que alguien ya cargó es exactamente lo que este editor no hace.
  const copiarDiaASiguientes = (dia: number) =>
    setB((v) => {
      const base = v.turnos.filter((t) => t.diaSemana === dia);
      if (base.length === 0) return v;
      const nuevos: TurnoForm[] = [];
      for (let d = dia + 1; d <= 7; d++) {
        if (v.turnos.some((t) => t.diaSemana === d)) continue;
        for (const t of base) nuevos.push({ ...t, diaSemana: d });
      }
      return nuevos.length === 0 ? v : { ...v, turnos: [...v.turnos, ...nuevos] };
    });
```

- [ ] **Paso 3: La fila por día, con barra y atajos**

Reemplazar el cuerpo del `DIAS.map(...)` del bloque «Horario semanal» para que cada fila tenga:
nombre del día · **barra visual** · los inputs de hora que ya existen · atajos. La barra:

```tsx
                      {/* Barra 06:00–22:00: cada turno es un segmento. Estática a propósito. */}
                      <div className="relative h-4 w-full max-w-[16rem] shrink-0 overflow-hidden rounded bg-paper sm:w-40" aria-hidden>
                        {delDia.map(({ t, i }) => (
                          <span
                            key={i}
                            className="absolute inset-y-0 rounded-sm bg-gold/60"
                            style={{ left: `${pctBarra(t.horaInicio)}%`, width: `${Math.max(pctBarra(t.horaFin) - pctBarra(t.horaInicio), 1)}%` }}
                          />
                        ))}
                      </div>
```

Y los atajos, al final de la fila (donde hoy está el botón «+ Turno», que se conserva):

```tsx
                      {delDia.length === 0 &&
                        TURNOS_RAPIDOS.map((r) => (
                          <Button key={r.label} variant="ghost" onClick={() => agregarTurnoRapido(dia, r)}>
                            <Plus className="h-4 w-4" /> {r.label}
                          </Button>
                        ))}
                      {delDia.length > 0 && dia < 7 && (
                        <Button variant="ghost" onClick={() => copiarDiaASiguientes(dia)}>
                          <Copy className="h-4 w-4" /> Copiar a los días vacíos siguientes
                        </Button>
                      )}
```

`Copy` se importa de `lucide-react` junto a los íconos ya importados. El texto «sin turnos» y los
inputs de hora existentes NO se tocan. El layout de la fila puede necesitar `flex-wrap` extra —
mantener el patrón actual (`flex flex-wrap items-center gap-2`).

- [ ] **Paso 4: Verificar** — `bash tools/verificar-local.sh` en verde. Además grep del archivo
  por `red-\|amber-\|emerald-\|slate-\|sky-` sin resultados nuevos.

- [ ] **Paso 5: Commit**

```bash
git add apps/erp-web/app/sueldos/acuerdos/cliente.tsx
git commit -m "feat(erp): el horario del contrato se ve como barra y se llena con atajos"
```

---

## Tarea 3: «Resumen del contrato» con cifras mensuales (C-4)

**Archivos:**
- Modificar: `apps/erp-web/app/sueldos/acuerdos/cliente.tsx` (la función `analizar()`, líneas
  ~132-187, y la tarjeta de vista previa, líneas ~444-487)

**Interfaces:**
- Consume: `PARAMETROS_SUELDO_DEFAULT` ya está importado en el archivo (lo usa el modal de
  parámetros como placeholder «global» — mismo criterio de precedencia que se sigue acá:
  override del borrador → default).
- Produce: `analizar()` devuelve campos nuevos.

- [ ] **Paso 1: Ampliar `analizar()`**

Al tipo de retorno se agregan:

```ts
  pagoMensual: number | null;      // sueldo / (dias/30) — aproximado siempre (decisión 23-ago)
  horasMensuales: number | null;   // horas / (dias/30)
  almuerzoPeriodo: number | null;  // techo: días con horario "completo" × valor almuerzo
  almuerzoMensual: number | null;
```

Y dentro del `try`, después de calcular `horas` y `pactado`:

```ts
    const meses = fechas.length / 30;
    const horasMin = b.parametros.horasMinimasAlmuerzo ?? PARAMETROS_SUELDO_DEFAULT.horasMinimasAlmuerzo;
    const valorAlm = b.parametros.valorAlmuerzo ?? PARAMETROS_SUELDO_DEFAULT.valorAlmuerzo;
    // Techo de almuerzos (C-4): cuenta los días del periodo cuyo horario contratado llega a las
    // horas mínimas — o todos los días con horario, si el almuerzo está habilitado a mano. Es lo
    // MÁXIMO si cumple el horario todos los días; el real sale de la asistencia (RN-15).
    const diasConAlmuerzo = fechas.filter((f) => {
      const h = porDia.get(diaSemanaISO(f))?.horas ?? 0;
      return b.almuerzoHabilitado ? h > 0 : h >= horasMin;
    }).length;
    const almuerzoPeriodo = diasConAlmuerzo * valorAlm;
```

y en el objeto de retorno:

```ts
      pagoMensual: pactado > 0 && meses > 0 ? pactado / meses : null,
      horasMensuales: horas > 0 && meses > 0 ? horas / meses : null,
      almuerzoPeriodo: horas > 0 ? almuerzoPeriodo : null,
      almuerzoMensual: horas > 0 && meses > 0 ? almuerzoPeriodo / meses : null,
```

El objeto `vacio` del principio suma los cuatro campos en `null`.

- [ ] **Paso 2: La tarjeta, con nombre y las celdas nuevas**

En el JSX de la vista previa (línea ~445), inmediatamente arriba de la grilla:

```tsx
              <p className="mb-2 text-sm font-medium text-navy">Resumen del contrato</p>
```

La grilla pasa de 4 celdas a 8 (mantener `grid-cols-2 sm:grid-cols-4`, dos filas). Celdas nuevas,
con el mismo patrón exacto de las existentes (`text-xs text-muted` + `tabular-nums text-navy`):

| Etiqueta | Valor |
|---|---|
| Pago del periodo | `Number(b.sueldoPactado) > 0 ? soles(Number(b.sueldoPactado)) : '—'` |
| Pago mensual (aprox.) | `analisis.pagoMensual == null ? '—' : soles(analisis.pagoMensual)` |
| Horas mensuales (aprox.) | `analisis.horasMensuales == null ? '—' : analisis.horasMensuales.toFixed(2)` |
| Almuerzos (máx. mes / periodo) | `analisis.almuerzoMensual == null ? '—' : `${soles(analisis.almuerzoMensual)} · ${soles(analisis.almuerzoPeriodo!)}`` |

Y debajo de la grilla (junto a la nota de escala existente), la aclaración del techo:

```tsx
                  {analisis.almuerzoPeriodo != null && analisis.almuerzoPeriodo > 0 && (
                    <p className="mt-2 text-xs text-muted">
                      Almuerzos: es el máximo si cumple el horario todos los días; lo que
                      efectivamente gane sale de la asistencia.
                    </p>
                  )}
```

- [ ] **Paso 3: Verificar** — `bash tools/verificar-local.sh` en verde.

- [ ] **Paso 4: Commit**

```bash
git add apps/erp-web/app/sueldos/acuerdos/cliente.tsx
git commit -m "feat(erp): el resumen del contrato tiene nombre y dice el mes, no solo el total"
```

---

## Tarea 4: Cierre

- [ ] **Paso 1:** `bash tools/verificar-local.sh` completo en verde.
- [ ] **Paso 2:** `pnpm --filter erp-web build` exitoso. Si `.next/trace` está lockeado por PM2:
  `pm2 stop erp-dev`, build, `pm2 start erp-dev` — y confirmar `online` después. **Nunca**
  `pnpm install` para "arreglar" un binario: el bloqueo es el lock, no el binario (aprendido el
  22-ago).
- [ ] **Paso 3:** En la spec
  (`docs/superpowers/specs/sueldos/2026-08-23-contrato-individual-design.md`), cambiar la línea
  de estado por: `> **Estado:** construida el 23-ago-2026 (C-1 a C-4). Pendientes de §4 sin
  cambios.` Sólo docs en este commit (Zone Guard).
- [ ] **Paso 4: Commit de cierre**

```bash
git add docs/superpowers/specs/sueldos/2026-08-23-contrato-individual-design.md
git commit -m "docs(sueldos): contrato individual construido"
```

## Lo que este plan NO hace

- No toca `packages/core` ni migraciones (ninguna excepción esta vez).
- No construye el horario general de tienda (spec §3 — subproyecto propio, zona crítica).
- No toca el error transitorio de permisos (sin reproducción).
- No cambia `/sueldos/acuerdos/page.tsx`: la pantalla general queda idéntica.
