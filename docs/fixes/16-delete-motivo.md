# FIX #16 · `DELETE /api/pagos/:id` requiere `motivo` no documentado

## Contexto

`routes/pagos.js` exige `body.motivo` en el DELETE para auditoría. Bien
diseñado. Pero el frontend probablemente no lo envía → admin clickea
"Eliminar pago" y recibe `{"error":"motivo requerido"}` sin saber qué hacer.

## Reproducción

```bash
TOKEN=$(curl -s -X POST http://localhost:7000/api/auth/login-code \
  -H "Content-Type: application/json" -d '{"cod":"8686","sede":"AL"}' | \
  node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).token))")

# DELETE sin motivo
curl -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:7000/api/pagos/1
# {"error":"motivo requerido"}

# DELETE con motivo
curl -X DELETE -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"motivo":"prueba"}' http://localhost:7000/api/pagos/1
# {"ok":true}
```

## Fix sugerido

### Frontend: prompt de motivo antes del DELETE

```js
// public/js/admin.js o pagos.js — donde se elimina pago
async function eliminarPago(id) {
  const motivo = prompt('Motivo de la eliminación (queda en auditoría):');
  if (!motivo) return; // usuario canceló
  const r = await API.del('/pagos/' + id, { motivo });
  // ...
}
```

Pero `API.del` en `api.js:40` no acepta body. Hay que extenderlo o usar
`API.req('DELETE', '/pagos/'+id, {motivo})`.

### Alternativa: modal en lugar de prompt nativo

UX más fina: modal con textarea para el motivo + botones Confirmar/
Cancelar. Mejor que prompt() del navegador.

## Validar

1. Crear un pago de prueba (POST /pagos)
2. Click en eliminar
3. Aparece prompt o modal pidiendo motivo
4. Escribir motivo + confirmar
5. Pago eliminado, mensaje de éxito

## Reglas

- NO quitar el requirement de `motivo` (es auditoría legítima).
- Solo agregar UX que pida el motivo.
- Commit: `fix(pagos): pedir motivo en eliminación de pago`.
