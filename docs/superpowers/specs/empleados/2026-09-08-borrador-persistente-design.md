# SPEC — F-1: el borrador de un contrato nuevo sobrevive a un cambio de pantalla

> **Zona de rigor:** nivel 2 (UX de un formulario existente, `localStorage`, sin escritura nueva a
> la base ni cambio de cálculo — `docs/rigor-por-zona.md`).
>
> Implementa **F-1** de [la hoja de ruta del 25-ago](../2026-08-25-reunion-admin-hoja-de-ruta.md):
> *«que se quede borrador en caso se cambie de pantalla»* — *«formularios largos que se pierden al
> navegar»*.

## 1. Dónde arranca, y por qué acá

El editor de contrato (`app/sueldos/acuerdos/cliente.tsx`, tipo `Borrador`) es el formulario más
largo del sistema con estado que hoy vive sólo en memoria: persona, fechas, modalidad, sueldo,
escala, almuerzo, hasta 13 parámetros del motor y un horario turno por turno. Cerrar la pestaña,
navegar por error, o que el navegador recargue por cualquier motivo borra todo sin aviso.

No es el único formulario largo del sistema (roadmap: "formularios largos" en plural), pero es el
que ya se tocó dos veces hoy (C-2/C-3) y donde el costo de perder el trabajo es más alto —
propagar el mismo mecanismo a otros formularios queda para cuando haga falta, no se construye una
abstracción genérica para casos que todavía no existen (no diseñes para requisitos hipotéticos).

## 2. Sólo para un contrato NUEVO, nunca para uno que ya existe

**Decisión central.** El borrador en `localStorage` sólo aplica cuando `editando === null` (contrato
nuevo). Editar un acuerdo YA GUARDADO (`abrirEdicion`) siempre carga desde la base
(`deAcuerdo(a)`) y nunca desde `localStorage` — la base es la fuente de verdad de un registro que
ya existe; una restauración automática ahí podría pisar en pantalla los datos reales de un contrato
con lo que quedó de un intento de edición abandonado, de esta misma persona o de otra si la clave
se calculó mal. El riesgo de perder trabajo en una edición existente es menor (no es una hoja en
blanco) y el riesgo de mostrar un dato viejo confundido con el real es mayor.

## 3. La clave, el guardado y el borrado

- **Clave:** `sueldos-acuerdo-borrador:{personaFija?.id ?? 'picker'}` — separada por persona cuando
  la pantalla tiene una fija (`/personal/[id]/contrato`), y una sola clave compartida cuando el
  editor deja elegir a cualquiera (`/sueldos/acuerdos`, sin `personaFija`): ahí sólo puede haber un
  borrador sin guardar a la vez de todos modos, porque sólo hay un editor abierto por pestaña.
- **Se guarda:** en cada cambio de `b`, mientras `enEditor && !editando` — un `useEffect` que
  serializa `b` a JSON. Sin debounce: es un objeto chico y `localStorage.setItem` en cada tecla no
  se nota.
- **Se restaura:** al abrir un contrato nuevo (`abrirNuevo()`, y el arranque directo de la alta
  encadenada) — si hay un borrador guardado para esa clave, se carga en vez del borrador vacío, con
  un aviso visible («Se restauró un borrador sin guardar») y un botón para descartarlo.
- **Se borra:** al guardar con éxito un contrato nuevo (nunca en una edición, que no lo usa), y con
  el botón explícito «Descartar borrador».
- **Qué NO persiste:** nada del lado del servidor. Es `localStorage`, por dispositivo y por
  navegador — perfectamente acorde a lo que se pidió («que no se pierda al cambiar de pantalla» es
  un problema de la MISMA sesión de navegación, no de continuar en otra compu).

## 4. Qué pasa cuando algo falla

Un `localStorage` lleno, bloqueado (navegación privada) o inexistente (SSR) no puede tirar abajo el
formulario: leer y escribir van en `try/catch` que si falla no hace nada — el formulario sigue
funcionando exactamente como hoy, sin borrador, en vez de romperse.
