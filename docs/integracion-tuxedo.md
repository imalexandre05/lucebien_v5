# Integración TUXEDO Pro ↔ SCI-LB

> Inspección de solo lectura del sistema comercial en `http://tuxedo.spk.com.pe:8055`
> (14-ago-2026). No se alteró nada del sistema. El objetivo fue entender su modelo y
> definir dónde toca a SCI-LB, no copiar su código ni su base.

## Qué es TUXEDO

ERP comercial de LuceBien. Es el sistema que la gente usa hoy para lo **comercial**
(inventario, POS, alquiler, caja, compras). En SCI-LB este dominio está **fuera de
alcance**: lo mantiene otro programador. SCI-LB se ocupa de personas, sueldos,
evaluación y el pipeline de prendas. Este documento existe sólo para acordar la
frontera y el intercambio de datos entre ambos, no para absorber funciones de TUXEDO.

**Stack:** ASP.NET Core sobre Kestrel · tema Metronic · SignalR para tiempo real ·
backend SQL. Es multi-sede y trae scaffolding multi-tenant (`companyId = 1`,
`tenantId` todavía en null).

**Sedes** (`idEstab`): `3`, `4`, `1004` → Casa Matriz Pelcuhe · La Casa de los Ternos
(Real 326, stands 101 y 102) · Tienda Norte Centro. Almacenes: `warehouseId` 4
(LuceBien 380) y 5 (La Casa de los Ternos).

## Autenticación

El login es en dos pasos y se sostiene con cookie de sesión. **No hay token ni
API-key**, lo que condiciona cualquier integración automática.

1. `POST /User/LoginAuth` con `multipart/form-data` (`usernameData`, `passwordData`).
   Devuelve el JSON del usuario y su `id`.
2. `GET /User/LoginAuthVerify?id={id}` fija la cookie `.AspNetCore.Cookies`
   (httponly, samesite=none, expira ~48 h).
3. `GET /User/LoginAuthVerifyEstab?idEstab={n}` fija la sede activa en la sesión.

### Hallazgo de seguridad (reportar al otro programador)

La respuesta del paso 1 incluye la contraseña codificada en base64 dentro del cuerpo:
`{"password":"MTIzNDU="}` decodifica a `12345`. Es reversible de forma trivial y no
debería viajar al cliente. **No se modificó nada**; queda como aviso para el dueño del
sistema comercial. No es un problema de SCI-LB, pero sí un riesgo si se apoya una
integración sobre ese login.

## Módulos

| Área | Rutas principales |
|---|---|
| Inventario | `/products`, `/categories`, `/set-pieces` (conjuntos = ternos armados de piezas), `/measures`, `/warehouses`, `/inventory/recount`, `/Availability/Matrix` |
| POS / Ventas | `/sales` (pedidos), `/finance/cashs-manager` (cajero: abrir/cerrar caja), pagos, facturas y boletas |
| Alquiler | `/Availability/Check`, devoluciones, validaciones, control de atrasos |
| Compras | `/purchases`, `/requirements` (plantilla de requerimientos) |
| Clientes | `/customers` (CRM: crédito, última visita, retrasos) |
| Finanzas | cuentas financieras, formas de pago, bancos, tarjetas, monedas, conceptos de caja y de alquiler |
| Reportes | `/report` (informes generales), `/establishments/comparativo` (comparativo entre sedes) |

## Modelo de datos (item de inventario)

Ids en GUID. Cada item trae, entre otros:

- `itemList` — tipo de prenda (Pantalon, Terno, …)
- `codeBar`, `size`, `existenceType`
- `priceStandard`, `costBase`, `taxRateValue` (IGV 18 %)
- `trackStock`, `qtyMin`, `qtyMax`, `baseLine` / `currentLine` (niveles de stock)
- `warehouseId`, `setPieceId` + `components` (un conjunto/terno se arma de piezas)
- `itemFiles` (imágenes)
- `customAttributes`: `{ tela, modelo_tela, color, aberturas }`

## Superficie JSON descubierta (cookie-auth, lectura)

Probados y funcionando durante la inspección:

- `/api/product/GetItemsByCompanyPage` — inventario paginado por cursor
  (`lasId`, `actionText`, `query`).
- `/api/product/getcomponents/` — piezas de un conjunto.
- `/Home/SearchProduct`, `/Home/SearchCustomer`, `/Home/SearchOrder` — búsquedas.
- `/Home/GetCajaStatus`, `/Home/GetAlertSummary`, `/Home/GetManagerItemsCount` — estado.
- `/api/Sale/GetPaymentsByDocument/{id}`, `/Sale/GetBalanceByDocument` — pagos.
- `/Availability/GetMatrix?establishmentId={n}` — disponibilidad por talla.
- SignalR hub (`/hubBaseUrl` + `/config`) — notificaciones de venta en tiempo real.

Todos responden JSON pero exigen la cookie de sesión y la sede activa. No hay contrato
público ni versionado: son endpoints internos del front de TUXEDO.

## Dónde tocan TUXEDO y SCI-LB

SCI-LB no necesita casi nada de TUXEDO, pero el motor de sueldos sí depende de unos
pocos datos comerciales. Los puntos de contacto reales:

1. **Comisión por vendedor** — `/sales` atribuye cada pedido a quien atendió (columna
   "Atención"). El sueldo con comisión necesita las ventas por empleado y mes.
2. **Meta por sede** — el dashboard de TUXEDO ya calcula meta y avance del mes por sede;
   el motor de sueldos usa la meta pactada.
3. **Estado de caja** — `GetCajaStatus` por sede.
4. **Pipeline de prendas** — el flujo de alquiler y devoluciones de TUXEDO se relaciona
   con los puntos del pipeline de SCI-LB, pero son sistemas distintos y no deben
   acoplarse por dentro.

## Recomendación de integración

**No integrar por scraping de los endpoints cookie-auth.** Sería frágil: sin API-key,
con sesión que expira, sin contrato de datos y atado al HTML/JS interno de TUXEDO. Como
el dominio comercial es del otro programador, la vía sana es que él exponga una interfaz
estable para los pocos datos que SCI-LB consume. Dos opciones, en orden de preferencia:

1. **Vista SQL de solo lectura** sobre su base, con las columnas acordadas.
2. **Endpoint con token** (no cookie) que devuelva esos mismos datos en JSON.

Así SCI-LB depende de un contrato explícito y no cruza el límite de alcance del proyecto.

### Contrato de datos propuesto (mínimo para sueldos)

Lo que SCI-LB pediría al sistema comercial, por sede y periodo:

| Dato | Uso en SCI-LB | Forma sugerida |
|---|---|---|
| Ventas por empleado y mes | Comisión del vendedor | `{ empId/nombre, sedeId, periodo, montoVendido, nOperaciones }` |
| Meta y avance por sede y mes | Meta pactada del motor de sueldos | `{ sedeId, periodo, meta, avance }` |
| Estado de caja por sede | Contexto operativo | `{ sedeId, fecha, cajaAbierta }` |

Campos de correlación a acordar: cómo se mapea el vendedor de TUXEDO (`userId`) al
empleado de SCI-LB, y cómo se mapea `idEstab` de TUXEDO a la sede de SCI-LB. Ese mapeo
es el único trabajo de integración real; el resto lo entrega el contrato.

## Pendiente

- Confirmar con el otro programador cuál de las dos vías (vista SQL o endpoint con token)
  puede entregar, y sobre qué campos.
- Reportarle el hallazgo del login que devuelve la contraseña en base64.
- Definir en `docs/pendientes-negocio.md` la regla exacta de comisión antes de cablear
  el dato de ventas al motor de sueldos.
