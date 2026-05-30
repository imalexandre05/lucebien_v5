# Arquitectura Core + Adapter

## Problema a resolver

Jordan pedirá cambios. Algunos son **cosméticos** (color, copy, validación específica de su negocio), otros **estructurales** (lógica de negocio que se aplica al ERP completo). Si todo está mezclado, cada pedido cosmético genera riesgo de romper algo gordo.

## Separación

```
src/
├── core/                       ← Lógica de negocio GENERICA
│   ├── inventario/             ← Reglas universales de inventario
│   ├── pedidos/                ← Reglas universales de pedidos
│   ├── caja/                   ← Flujo financiero genérico
│   ├── usuarios/               ← Auth, roles, permisos genéricos
│   └── notificaciones/         ← Sistema de eventos genérico
│
├── adapter/lucebien/           ← Específico del cliente Confecciones Aliaga
│   ├── config.ts               ← Constantes del negocio (nombres sedes, tipos de prenda)
│   ├── theme.ts                ← Colores, logos, copys
│   ├── rules/                  ← Reglas que SOLO aplican a LuceBien
│   │   ├── puntos-empleados.ts
│   │   ├── prendas-estados.ts
│   │   └── ...
│   ├── reports/                ← Reportes específicos del cliente
│   └── integrations/           ← Integraciones específicas (su WhatsApp, su pasarela)
│
└── ui/                         ← Interfaz consume core + adapter
    ├── pages/
    ├── components/
    └── ...
```

## Reglas de la arquitectura

### Core NO conoce al adapter
- `src/core/inventario/` no importa nada de `src/adapter/lucebien/`.
- El core expone interfaces genéricas: `Producto`, `Movimiento`, `Stock`.
- Si el core necesita datos específicos del cliente, los recibe por inyección.

### Adapter SÍ conoce al core
- `src/adapter/lucebien/rules/puntos-empleados.ts` puede importar del core.
- El adapter implementa interfaces del core con la lógica concreta.

### UI consume ambos
- Las páginas piden datos al core y aplican estilos/copys del adapter.
- Cambiar el adapter cambia el UI sin tocar el core.

## Ejemplos prácticos

### Cambio cosmético — adapter
> Jordan: "Quiero que los botones sean dorados en vez de azules."

✏️ Editas `src/adapter/lucebien/theme.ts` y cambias `--accent: #0a2540` → `--accent: #c9a227`. UN archivo. Cero riesgo en el resto.

### Cambio de regla del negocio — adapter
> Jordan: "Cuando alquilamos un terno, el cliente paga 50% al recoger y 50% al devolver."

✏️ Editas `src/adapter/lucebien/rules/cobros-alquiler.ts`. Implementa la regla `calcularCobroParcial(pedido)`. El core de pedidos llama a `adapter.calcularCobroParcial()` por su interfaz.

### Cambio de lógica de inventario — depende
> Jordan: "Cuando una prenda se daña en lavado, debe descontarse del stock y crearse un evento de pérdida."

🤔 Esto es **lógica universal del oficio** (cualquier negocio textil lo necesitaría). Va al **core**: `src/core/inventario/eventos.ts` agrega tipo `PRENDA_DANADA`. El adapter solo define qué hacer con el evento (notificar a quién).

### Antipattern (NO hacer)
> Jordan: "Quiero que cuando se confeccione un terno, salte un alerta con texto 'Nuevo terno listo para LuceBien!'"

❌ NO metas "LuceBien" hardcodeado en el core. El core dispara evento `CONFECCION_COMPLETADA`. El adapter define el mensaje: `theme.copys.confeccionCompletada = "Nuevo terno listo para LuceBien!"`.

## Beneficios para ti

1. **Cambios rápidos sin scope creep.** Cambios cosméticos = 1 archivo, 1 línea, 5 min.
2. **Protección legal.** El **core genérico es know-how del oficio** (no es información confidencial específica del cliente per art. 3.1.a del NDA). El **adapter sí es propiedad de Jordan** (per Cl. 7ma de la locación). Si algún día reutilizas patrones del core en otro proyecto SaaS, tu defensa es: "esto es arquitectura genérica de gestión de inventario, no es código de Confecciones Aliaga". Si reutilizas adapter — violación directa.
3. **Refactor sin pánico.** Cambiar el core no rompe el adapter (si respetas las interfaces). Cambiar el adapter no rompe el core.
4. **Onboarding fácil.** Si en el futuro otro dev entra, sabe dónde mirar.

## Convenciones de commits para esta arquitectura

```
feat(core/inventario): registro de movimientos de stock
feat(adapter/lucebien): regla de cobro 50/50 para alquileres
fix(adapter/lucebien): copy del banner principal
refactor(core/pedidos): extraer cálculo de fechas a util
```

Esto facilita el reporte semanal (Claude clasifica mejor) y el cherry-pick (puedes filtrar por scope).
