# SPEC — La evaluación de compañeros se abre sola, una semana antes del pago de cada persona

> **Qué es.** El ítem A-8 de [la hoja de ruta](../2026-08-25-reunion-admin-hoja-de-ruta.md), textual:
>
> > *«en el tema de evaluación debe ser automático, todos los usuarios deben evaluar a un usuario una
> > semana antes del pago de este, y que tengan un pendiente de evaluar a esa persona hasta su día de
> > pago»*
>
> **Zona de rigor: spec corta.** No toca la cadena del sueldo — Valores 360° alimenta un componente
> del perfil, no la plata. Sí toca el no-negociable 3 (nadie sabe quién lo puntuó salvo el
> administrador), que se conserva entero.
>
> **⛔ Esta spec NO se puede implementar todavía.** Ver §1 — el dato que la haría funcionar no existe
> para 9 de las 11 personas reales. Se escribe igual, completa, para que el día que ese dato esté se
> construya sin volver a pensarla.

---

## 1. ⛔ El bloqueo: no hay fecha de ingreso

La regla que pidió el administrador cuelga entera de una fecha: **el día de pago de cada persona**.
Ese día es el cierre de su ciclo por aniversario — `calcularCiclo(fecha_ingreso, hoy).hasta`, la
función que se corrigió el 24-ago para que se recorte bien en meses cortos.

**Medido contra `scilb` el 25-ago-2026:**

| | |
|---|---|
| Personas activas | 14 |
| Con `fecha_ingreso` | 5 — **y tres son cuentas de prueba** (`Prueba Admin`, `Prueba Colaborador`, `Alexito prueba`) |
| **Personas reales con `fecha_ingreso`** | **2**: Alexander (23-ene-2026) y Marylin (22-may-2026) |
| **Personas reales SIN `fecha_ingreso`** | **9**: Daniel, Nicol, Yessica, Sheyla, Elthom, Jesus, Jordan, Janet, Jaerock |

Sin `fecha_ingreso` no hay ciclo, sin ciclo no hay día de pago, y sin día de pago **no hay ventana
que abrir ni pendiente que mostrar**. Construir esto hoy daría un sistema que, para nueve de once
personas, no hace absolutamente nada — y no lo diría.

**Lo que destraba esto no es código, es carga de datos:** nueve fechas. Es lo primero que hay que
pedirle al administrador de esta spec.

### Por qué no se usa el contrato en vez de la fecha de ingreso

Sería razonable pensar que el día de pago debería salir del contrato (`sueldo_acuerdos.fecha_fin`, o
el fin del tramo que se está liquidando) en vez del aniversario — sobre todo ahora que un contrato se
liquida por tramos. **Hoy es peor:** existe **un solo** `sueldo_acuerdos` en toda la base (el de
Marylin). Se deja anotado como la alternativa a evaluar cuando haya contratos cargados de verdad.

---

## 2. Lo que hay hoy

| Pieza | Dónde | Qué hace |
|---|---|---|
| La ventana | `puedeEvaluarValoresHoy(cfg, diaDelMes)` — `packages/core/src/valores360.ts:76-82` | **Global y por día del mes**: o siempre abierta, o entre `valores_dia_inicio` y `valores_dia_fin` |
| Los parámetros | `config.valores_habilitado`, `valores_modo`, `valores_dia_inicio`, `valores_dia_fin` (migración `0058`) | Default: habilitado + modo `'siempre'` |
| Los votos | `evaluaciones_valores` (migración `0057`) | Una fila por `(evaluador, evaluado, mes)`, 6 valores Likert 1-5 |
| El ciclo | `calcularCiclo(fechaIngreso, hoyStr)` — `packages/core/src/evaluaciones.ts` | Ya recorta bien en mes corto (24-ago) |

**La distancia entre lo que hay y lo que pidió, en una línea:** hoy la ventana es *«del 25 al 28 para
todos»*; él la quiere *«los 7 días antes del pago de cada uno»*.

---

## 3. El diseño

### C-1 — Un modo nuevo, no un reemplazo

`valores_modo` gana un tercer valor: **`'antes_del_pago'`**. Los dos que ya existen (`'siempre'` y el
de días fijos) **no se tocan** — quedan disponibles para volver atrás en un clic si el modo nuevo no
funciona en la práctica.

`puedeEvaluarValoresHoy()` cambia de firma: hoy recibe el día del mes, y pasa a recibir también **la
fecha de pago de la persona evaluada** (o `null` si no se puede calcular). En el modo nuevo:

```
abierta  ⟺  fechaPago ≠ null
             y  hoy ≥ fechaPago − valores_dias_antes_del_pago
             y  hoy ≤ fechaPago
```

**Parámetro nuevo:** `valores_dias_antes_del_pago`, default **7** — sale de *«una semana antes»*,
literal. Editable desde `/configuracion`, anotado como provisional.

### C-2 — Qué pasa con quien no tiene fecha de ingreso

Con `fechaPago = null`, la ventana de esa persona queda **cerrada**, y la pantalla lo dice: *«No se
puede abrir la evaluación de <nombre>: falta su fecha de ingreso»*, con enlace a su ficha.

**Esto es deliberado y es lo contrario de lo cómodo.** La alternativa —dejarla siempre abierta cuando
falta el dato— haría que nueve de once personas quedaran en el modo viejo sin que nadie se enterara,
y el administrador creería que el sistema hace algo que no hace. Un aviso visible es lo que consigue
que las nueve fechas se carguen.

### C-3 — El pendiente

Mientras la ventana de P está abierta, **cada colaborador activo salvo P** tiene un pendiente:
*«Evaluá a P — vence el <fecha de pago>»*.

- Vive en `/valores` (la pantalla que ya existe), arriba, como lista de quiénes están pendientes con
  su fecha de vencimiento.
- **Nadie se evalúa a sí mismo.** Es lo estándar en 360° y él dijo *«todos los usuarios deben evaluar
  a un usuario»* — a *un* usuario, otro.
- El pendiente desaparece cuando esa persona ya votó a P, o cuando pasa la fecha de pago de P.
- **No se calcula sobre `evaluaciones_valores` leyendo quién votó a quién**: eso rompería el
  anonimato (no-negociable 3). Se resuelve con una función `security definer` que devuelve, para
  *quien pregunta*, sólo **a quiénes le falta votar** — nunca quién votó a quién.

### C-4 — Lo que NO cambia

- **El anonimato entero.** Quién puntuó a quién lo sigue viendo sólo el administrador. El pendiente
  le dice a cada uno qué le falta a *él*, y nada sobre los demás.
- **Cómo se calcula el componente `valores`** de la evaluación: sigue igual (promedio de los seis,
  llevado a /20).
- **La clave `mes`** de `evaluaciones_valores`: sigue siendo `to_char(cicloDesde, 'YYYY-MM')`, el mes
  en que arranca el ciclo. Un ciclo 15-jul → 14-ago guarda sus votos en `'2026-07'`. Es lo que ya
  hace `evaluacion_componentes` y no se toca en esta spec, aunque conviene saber que es una
  convención y no una verdad.

---

## 4. Cómo se comprueba

| # | Caso | Esperado |
|---|---|---|
| 1 | Persona con ingreso el 15-jun, hoy 8-jul (pago: 14-jul) | Ventana **abierta** (faltan 6 días) |
| 2 | La misma, hoy 6-jul | Ventana **cerrada** (faltan 8, más de 7) |
| 3 | La misma, hoy 14-jul (el día del pago) | Ventana **abierta** — *«hasta su día de pago»*, inclusive |
| 4 | La misma, hoy 15-jul | Ventana **cerrada** |
| 5 | Persona **sin `fecha_ingreso`** | Ventana **cerrada**, con el aviso de C-2 |
| 6 | `valores_modo = 'siempre'` | Exactamente como hoy — el modo nuevo no lo afecta |
| 7 | Quien ya votó a P | Sin pendiente de P |
| 8 | El propio P | Nunca tiene pendiente de sí mismo |
| 9 | Un no-administrador pide los pendientes | Recibe sólo los suyos, sin ninguna pista de quién votó a quién |

## 5. Orden de implementación

0. **⛔ Antes que nada: que el administrador cargue las nueve fechas de ingreso.** Sin eso, todo lo
   demás construye una pantalla que no hace nada para nueve de once personas.
1. `packages/core/src/valores360.ts`: el modo nuevo en `puedeEvaluarValoresHoy()`, con sus tests
   (casos 1-6).
2. Migración: el parámetro `valores_dias_antes_del_pago` y la función `security definer` de los
   pendientes (casos 7-9).
3. `/valores`: la lista de pendientes y el aviso de C-2.
4. `/configuracion`: el modo nuevo en el selector de `valores_modo`.
