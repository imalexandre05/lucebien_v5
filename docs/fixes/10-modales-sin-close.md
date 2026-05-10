# FIX #10 · Modales `confirmModal` e `incNuevaModal` sin botón de cerrar

## Contexto

`public/index.html` tiene 11 modales. 9 tienen botón X (`modal-close`).
2 NO tienen: `confirmModal` y `incNuevaModal` (registrar nueva
incidencia).

El usuario que abre el modal por equivocación está obligado a aceptar
o cancelar formalmente — no hay X para escapar limpio.

## Reproducción

```bash
node -e "
const fs=require('fs');
const html=fs.readFileSync('public/index.html','utf8');
const re=/<div[^>]*class=\"modal-overlay\"[^>]*id=\"([^\"]+)\"[^>]*>[\\s\\S]*?<\\/div>\\s*<\\/div>\\s*<\\/div>/g;
let m;
while((m=re.exec(html))!==null){
  console.log((m[0].includes('modal-close')?'OK':'NO_CLOSE'),m[1]);
}
"
```

## Fix sugerido

Buscar el `<div class="modal-header">` de cada modal y agregar el botón:

```html
<!-- Antes -->
<div class="modal-header">
  <h2>Confirmar acción</h2>
</div>

<!-- Después -->
<div class="modal-header">
  <h2>Confirmar acción</h2>
  <button class="modal-close" onclick="closeModal('confirmModal')">&#10005;</button>
</div>
```

Aplicar el mismo cambio a `incNuevaModal`.

## Validar

Abrir cada modal, verificar que el botón X esté visible arriba a la
derecha y que cierre el modal al hacer click.

## Reglas

- No cambiar la lógica del modal, solo agregar el cierre.
- Commit: `fix(ux): agregar botón cerrar a confirmModal y incNuevaModal`.
