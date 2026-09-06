# Integración SCI-LB ↔ TUXEDO Pro — pliego para el equipo comercial

> Documento para el programador que mantiene TUXEDO Pro (`tuxedo.spk.com.pe:8055`), el ERP
> comercial de LuceBien. Lo escribe el equipo de SCI-LB (procesos, RRHH, sueldos, evaluación,
> pipeline de prendas) para acordar qué dato cruza la frontera entre los dos sistemas y cómo.
>
> Fecha: 25-ago-2026. Autor: Alexander Flores (SCI-LB).

---

## 1. Qué es SCI-LB y qué no toca

SCI-LB es la plataforma de control interno de Confecciones Aliaga E.I.R.L. (LuceBien): procesos,
RRHH, sueldos, evaluación de desempeño y el pipeline de confección/alquiler de ternos. Corre en
paralelo a TUXEDO, no lo reemplaza.

**Lo que SCI-LB explícitamente no hace:** dinero, ventas, POS ni inventario comercial. Eso es
dominio de TUXEDO y se mantiene ahí. Este documento no pide mover ni una de esas funciones — pide
**leer** un recorte muy chico de datos que TUXEDO ya tiene, porque el motor de sueldos de SCI-LB
los necesita para pagar bien.

---

## 2. Veredicto: es posible, y no exige tocar tu sistema

El equipo de SCI-LB inspeccionó TUXEDO en modo solo-lectura (14-ago-2026) para entender el modelo
antes de pedir nada. Conclusión corta:

- **Sí es posible.** SCI-LB ya tiene, desde el diseño del motor de sueldos, una tabla pensada
  exactamente para esto (`sueldo_ventas`) con un campo `origen` que hoy vale `'manual'` porque el
  administrador carga boletas a mano. Agregar un origen `'tuxedo'` no rompe nada existente.
- **La vía que NO conviene:** que SCI-LB lea directo tus endpoints internos (`/api/product/...`,
  `/Home/SearchOrder`, etc.) simulando tu sesión de navegador. Es frágil por diseño: no hay
  API-key, la cookie expira (~48 h), y no hay contrato de datos — cualquier cambio en tu frontend
  rompe la integración sin aviso. No lo vamos a hacer.
- **Lo que sí pedimos:** que definas tú, con el costo que prefieras de la lista de abajo, una
  salida estable para tres datos puntuales.

---

## 3. Los tres datos que SCI-LB necesita

| Dato | Para qué lo usa SCI-LB | Si falta |
|---|---|---|
| **Ventas por vendedor y periodo** — boletas/pedidos con su monto total, fecha, sede y quién atendió | Alimenta la comisión del vendedor y, desde ago-2026, también los **puntos** que arman su nota de evaluación mensual | Sin este dato la comisión queda en cero y la persona pierde puntos que sí ganó — es un error de sueldo real, no cosmético |
| **Meta y avance por sede y mes** | El motor de sueldos usa la meta pactada para calcular si la sede la cumplió | Sin meta el sistema solo puede *sugerir* una (fórmula interna), no usar la pactada de verdad |
| **Estado de caja por sede** | Contexto operativo, no crítico para el cálculo de sueldo | Nada se rompe si falta; es dato de apoyo |

El único dato realmente urgente es el primero. Los otros dos pueden esperar una segunda vuelta.

---

## 4. Tres formas de entregarlo — elige la que te cueste menos

No te imponemos el mecanismo: cualquiera de las tres cierra el contrato de datos. De menor a mayor
esfuerzo de tu lado:

### Opción 1 — Export mensual a carpeta compartida (el piso)

Un CSV o JSON con las ventas del mes, dejado en una carpeta compartida (Drive, red local, lo que
uses hoy para otros reportes).

- **Te cuesta:** una consulta SQL tuya, ejecutada a mano o por un cron simple, una vez al mes.
- **Nos cuesta:** un import manual del lado de SCI-LB (ya existe la pantalla — hoy es cómo carga
  el administrador las boletas).
- **Cadencia real:** mensual, alineada al cierre de sueldos. No sirve si algún día queremos
  comisión en tiempo real, pero hoy no la necesitamos.

### Opción 2 — Vista SQL de solo lectura (recomendada)

Una vista en tu base (`vw_ventas_sci_lb` o el nombre que prefieras) con exactamente las columnas
del contrato de la sección 5, y una credencial de solo lectura sobre esa vista únicamente — no
sobre el resto de tu esquema.

- **Te cuesta:** crear la vista una vez, dar una credencial acotada.
- **Nos cuesta:** un job que la consulta y vuelca a `sueldo_ventas`.
- **Ventaja:** vos controlás exactamente qué columnas se exponen, sin abrir el resto de la base.

### Opción 3 — Endpoint con token estático

Un endpoint JSON tuyo (`GET /api/sci-lb/ventas?periodo=2026-08`), protegido por un token fijo (no
la cookie de sesión de usuarios), que devuelve el mismo contrato de la sección 5.

- **Te cuesta:** escribir un endpoint nuevo y mantenerlo.
- **Nos cuesta:** lo mismo que la opción 2, apuntando a HTTP en vez de SQL.
- **Ventaja:** más formal, versionable, no depende de exponer tu base directamente.

**Nuestra recomendación:** empezar con la Opción 1 para no bloquear nada, y migrar a la Opción 2
si la relación se vuelve recurrente. La Opción 3 tiene sentido si en algún momento hay más de un
consumidor de estos datos.

---

## 5. Contrato de datos propuesto

### 5.1 Ventas por vendedor y periodo

```json
{
  "clave_externa": "TUXEDO-2026-08-004821",
  "fecha": "2026-08-14",
  "monto": 350.00,
  "tipo": "venta",
  "sede_cod": "LB-01",
  "vendedor_externo": "jperez"
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `clave_externa` | texto, único por origen | Tu ID de boleta/pedido. Es lo que evita que reimportar el mismo mes duplique una comisión — **es obligatorio si querés reimportar sin miedo** |
| `fecha` | fecha (`YYYY-MM-DD`) | Fecha de la boleta, no de la carga |
| `monto` | numérico, ≥ 0 | El **total de la boleta**, no el de un producto individual — SCI-LB compara el total contra un mínimo de negocio |
| `tipo` | `"venta"` o `"alquiler"` | Los dos tipos comisionan distinto en SCI-LB |
| `sede_cod` | texto | Ver mapeo de sedes, sección 6 |
| `vendedor_externo` | texto | Tu identificador del vendedor (`userId`, usuario, lo que uses). Ver mapeo de personas, sección 6 |

### 5.2 Meta y avance por sede (segunda vuelta, no urgente)

```json
{ "sede_cod": "LB-01", "periodo": "2026-08", "meta": 45000.00, "avance": 31200.00 }
```

### 5.3 Estado de caja (segunda vuelta, no urgente)

```json
{ "sede_cod": "LB-01", "fecha": "2026-08-25", "caja_abierta": true }
```

---

## 6. El único trabajo real: el mapeo

El contrato de datos es sencillo; lo que exige criterio de negocio (no de código) es hacer
corresponder tus identificadores con los nuestros. Dos mapeos, ambos chicos y estables en el
tiempo:

- **Vendedor:** tu `userId`/usuario ↔ el `empleado_id` de SCI-LB.
- **Sede:** tu `idEstab` (`3`, `4`, `1004`) ↔ el `sede_cod` de SCI-LB.

Propuesta: una tabla de equivalencia chica, mantenida por el administrador (no por ninguno de los
dos programadores), porque es una decisión de negocio, no técnica. Si tu sistema manda un
vendedor que no se puede mapear todavía, **no se pierde el dato**: SCI-LB lo guarda igual en una
cola de "sin asignar" y alguien lo resuelve a mano después — nada se descarta en silencio.

---

## 7. Preguntas abiertas para vos

No las contestamos nosotros porque son tu decisión, no la nuestra:

1. ¿Alguna de las tres opciones de la sección 4 es la que ya usás para otros reportes o
   integraciones? Si ya tenés un mecanismo parecido, mejor reusarlo que inventar uno nuevo.
2. ¿Preferís que SCI-LB *pida* el dato (pull, opciones 1/2/3 tal como están) o preferís *empujarlo*
   vos cuando te convenga (push, por ejemplo un webhook)?
3. ¿Necesitás algo de SCI-LB a cambio? Hoy no hay pedido en esa dirección, pero si tu sistema
   quisiera consumir el maestro de empleados o de sedes de SCI-LB en vez de mantener el suyo
   propio, lo conversamos aparte — es una integración distinta, con su propio contrato.
4. ¿Qué cadencia te resulta cómoda? Mensual alcanza para sueldos; si en algún momento se necesita
   más frecuencia, avisamos con anticipación.

---

## Anexo A — Nota de seguridad (informativa, no es reclamo)

Durante la inspección de solo lectura del 14-ago-2026 se observó que la respuesta del login
(`POST /User/LoginAuth`) incluye la contraseña codificada en base64 dentro del cuerpo JSON de
respuesta — por ejemplo, un campo `password` con valor `MTIzNDU=`, que decodifica a `12345` con
cualquier decodificador estándar. Es reversible de forma trivial y, en general, una contraseña no
debería viajar de vuelta al cliente en ninguna forma, ni siquiera codificada.

No se modificó nada durante la inspección; esto se reporta únicamente como dato técnico, porque
condicionó nuestra decisión de no apoyar ninguna integración sobre ese mecanismo de login (ver
sección 2). Queda a tu criterio si amerita una corrección de tu lado.
