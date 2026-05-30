# GRUPO 3 — Componentes ERP (SCI-LB)
## Prompt A: Componentes Base del Sistema Interno

```
Diseña la librería de componentes UI del SCI-LB (Sistema de Control Interno de LuceBien):

CONTEXTO REAL DEL SISTEMA:
- SCI-LB es el ERP interno de LUCEBIEN / CASA DE LOS TERNOS, empresa de alquiler y venta de ternos formales con 4 sedes en Huancayo, Perú
- Lo usan colaboradores en tienda y almacén durante su turno laboral
- Sedes: Lucebien (Real 380), Stand 101-102 (Real 326), Trece, Almacén Central
- Stack: Node.js + Express, interfaz web, acceso por roles (colaborador / administrador)
- NO es una app pública — es interna, de uso operativo diario

PALETA: navy #0A1628, gold #C8A24B, cream #F5F0E8, gray #6B7280, white #FFFFFF
TIPOGRAFÍA: Montserrat (body/UI), texto small y medium predominante

COMPONENTES A DISEÑAR (un artboard por componente, todos los estados):

1. BOTONES
   - Primary: fondo navy, texto blanco (hover: más claro, disabled: opacidad 40%)
   - Secondary: borde navy, texto navy, fondo transparente
   - Accent/CTA: fondo gold, texto navy
   - Danger: para acciones irreversibles (eliminar, rechazar incidencia)
   - Icon-only: circular, para acciones compactas en tablas
   - Loading state: spinner inline
   Tamaños: sm (32px), md (40px), lg (48px)

2. BADGES DE ESTADO (para prendas en flujo de almacén)
   Estados reales del proceso: Recepción → Lavado → Empatado → Vacío → Refacción → Compostura/Codificación → Planchado → Control Calidad → Listo p/ Envío
   - Cada estado con color diferenciado, ícono y texto
   - Estados de incidencia: Aprobado (verde), Observado (ámbar), Rechazado (rojo)
   - Niveles de incidencia: Alto (rojo), Medio (naranja), Bajo (amarillo)

3. INPUTS Y FORMULARIOS
   - Text input: default, focused (borde gold), error (borde rojo), disabled
   - Select/Dropdown: para seleccionar sede, turno, tipo de actividad
   - Checkbox y Radio: para formularios de reporte de actividades
   - Textarea: para descripción de incidencias
   - Search input: con ícono lupa, para búsqueda de prendas por código
   - Date picker: para filtros de reportes y evaluaciones mensuales

4. CARDS
   - Card de turno activo: muestra sede, horario, colaboradores del turno, botón "Iniciar Reporte"
   - Card de notificación de solicitud: badge "NUEVA SOLICITUD", tienda origen, artículos pedidos, botones Aprobar/Observar
   - Card de evaluación pendiente: nombre del reporte a calificar, turno, colaboradores, botón "Evaluar"

5. TABLAS
   - Fila de prenda: código, descripción, talla, color, tela, estado (badge), sede actual, acciones
   - Fila de colaborador: nombre, sede, turno, puntos del mes, nivel evaluación, acciones
   - Fila de incidencia: ID, tipo, nivel (badge), responsable, fecha, estado, ver detalle
   - Paginación y controles de tabla (filtros, orden, búsqueda)
   Header de tabla: navy, texto blanco; filas: alternadas cream/white

6. SIDEBAR DE NAVEGACIÓN
   Secciones reales del SCI-LB:
   - Operaciones: Reporte de Actividades, Evaluación de Reporte, Mi Desempeño, Agregar Incidencia, Solicitudes
   - Prendas: Envío a Lavandería, Envíos Recibidos, Prendas Recibidas (almacén), Lista de Préstamo
   - Administrador: Dashboard, Gestión de Colaboradores, Gestión de Incidencias, Evaluación Mensual, Gestión de Actividades, Reportes BD, Auditoría
   - Selector de sede en la parte superior del sidebar
   - Avatar + nombre del colaborador + rol en la parte inferior
   - Items con ícono + label, estado activo con acento gold en borde izquierdo
```

---

## Prompt B: Pantallas Clave del ERP

```
Diseña mockups de alta fidelidad de las pantallas principales del SCI-LB (ERP interno de LUCEBIEN):

CONTEXTO:
- SCI-LB: Sistema de Control Interno de LuceBien — gestión de colaboradores, prendas y operaciones
- 4 sedes reales: Lucebien (Real 380), Stand 101-102 (Real 326), Trece, Almacén Central (Huancayo, Perú)
- Roles: colaborador de tienda, colaborador de almacén, administrador
- Resolución objetivo: 1280×800px (laptop de la tienda)

PALETA: navy #0A1628, gold #C8A24B, cream #F5F0E8
LAYOUT: sidebar fijo 240px | contenido principal fluido

PANTALLAS A DISEÑAR:

1. REPORTE DE ACTIVIDADES (colaborador de tienda)
   - Header: "Reporte de Turno — Sede Lucebien | Turno Mañana 9:00–13:00"
   - Sección Indispensable: grid del layout de la tienda con elementos clickeables (mostrador, probadores, vidriera, etc.)
   - Sección Primer Orden AS/AT: lista de actividades con checkbox, etiqueta de puntaje por actividad
   - Sección Segundo Orden BS/BT: similar
   - Sección Incidencias: listado de incidencias del turno con badges de nivel
   - Botón "Enviar Reporte" prominente en gold al final
   - Indicador de puntaje acumulado del turno (live, en el header)

2. PRENDAS RECIBIDAS — ALMACÉN CENTRAL
   - Tabla de prendas recibidas con columnas: código, tipo, tela, color, proceso actual (badge), acciones
   - Pipeline visual horizontal: Recepción → Lavado → Empatado → Vacío → Refacción → Compostura → Planchado → Control Calidad → Listo p/ Envío
   - Cada prenda tiene un punto en el pipeline que muestra su etapa actual
   - Filtros: por proceso, por fecha de recepción, por tienda origen
   - Botones de acción: "Avanzar proceso", "Observar", "Ver historial"

3. DASHBOARD ADMINISTRADOR
   - KPIs en tarjetas: total prendas en proceso hoy, solicitudes pendientes, reportes enviados esta semana, colaboradores activos
   - Gráfico de barras: puntaje promedio por sede (últimos 30 días)
   - Tabla de top colaboradores del mes con puntuación
   - Alertas recientes: incidencias nivel Alto (rojo), solicitudes sin responder +48h (naranja)
   - Distribución de prendas por proceso (donut chart)

4. SOLICITUDES (vista almacén)
   - Lista de solicitudes activas con: tienda solicitante, fecha, artículos pedidos, estado (Pendiente/Aprobada/Parcial/Rechazada)
   - Modal de respuesta: confirmar cantidad disponible a entregar por ítem, campo de observaciones
   - Historial de solicitudes completadas con filtro por tienda y fecha

NOTAS DE DISEÑO:
- El sistema debe verse profesional y funcional, no decorativo
- Priorizar densidad de información útil (es software de gestión)
- Usar navy para headers/sidebar, cream para fondo de contenido, gold solo para CTAs y estados positivos
- Tipografía Montserrat, tamaño base 14px para tablas, 16px para body
```
