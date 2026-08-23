# Requerimientos del dueño — registro

Reemplaza a los documentos "ACTUALIZACIONES PARA SISTEMA SCI LB" resaltados con marcador.
Cada requerimiento tiene un código estable: el dueño puede decir "el R-042 sigue mal" y las dos partes
saben exactamente de qué se habla.

**Este archivo es la fuente de verdad del estado.** Los informes lo leen; no se duplica la lista
adentro de cada informe, sólo se muestra lo que se movió y lo que espera una decisión suya.

## Estados

| Estado | Equivalente antiguo | Significa |
|---|---|---|
| `listo` | Verde | Hecho y verificado contra el sistema |
| `curso` | — | Empezado, todavía no entregable |
| `problema` | Amarillo | Se intentó y algo falla o falta resolver |
| `apoyo` | Rojo | Bloqueado esperando una decisión, un dato o un acceso del dueño |
| `pendiente` | — | Revisado contra el código: todavía no está hecho |
| `revisar` | Sin resaltar | Registrado, todavía sin evaluar |

`pendiente` y `revisar` se parecen pero no son lo mismo, y la diferencia importa: `pendiente`
significa que se miró y falta; `revisar` significa que nadie lo miró todavía. En el sistema de
marcador antiguo los dos caían en "sin resaltar", y por eso no se sabía cuál era cuál.

## Contra qué sistema se verifica

Buena parte de estos requerimientos se escribió contra el **sistema viejo** (Express + SQLite):
las referencias a `#soliColorDD`, `#lavListBadge` o `btn-ghost` apuntan a `public/index.html`,
que está congelado. El estado de este registro se evalúa **contra el ERP nuevo**, que es el que
el equipo va a usar. Cuando la pantalla vieja tenía algo que la nueva todavía no reproduce, el
requerimiento queda `pendiente`, no `listo`.

**Nada pasa a `listo` sin verificación contra el código o contra la base** (no-negociable 7 de
`CLAUDE.md`). Coincidir con lo que dice otro documento no alcanza.

`Actualizado` es la fecha del último cambio de estado, en formato `AAAA-MM-DD`.

---

## General

| ID | Requerimiento | Estado | Actualizado | Nota |
|---|---|---|---|---|
| R-001 | Cambiar "trabajador" y "empleado" por "colaborador" en todo el sistema | pendiente | 2026-08-13 | Verificado: 33 pantallas del ERP siguen diciendo empleado o trabajador |
| R-002 | Eliminar las fuentes monospace y usar una tipografía más estética | pendiente | 2026-08-13 | Verificado: 69 archivos usan fuente monoespaciada |
| R-003 | Unificar colores, tipografías, estilos y animaciones con la paleta del logo | apoyo | 2026-08-13 | Conflicto de paleta: el ERP usa #2e3e6e y #b8a515; su documento pide #2E3F6F y #C7B400. Hace falta que confirme cuál es la buena |
| R-004 | Nunca guardar el código en los campos donde se digita: siempre volver a ingresarlo | listo | 2026-08-13 | Verificado: el ERP no guarda el código en el navegador |
| R-005 | Asumir que la cuenta queda abierta y varios colaboradores usan la misma computadora | revisar | 2026-08-13 | La cuenta da acceso; el código identifica a quien actúa |
| R-006 | En incidencias, nadie puede reportarse a sí mismo | revisar | 2026-08-13 | |
| R-007 | La evaluación falla al hacer clic: aparecen errores o hay que recargar la página | revisar | 2026-08-13 | Marcado como crítico por el dueño |
| R-008 | Opción de ver la contraseña en el login | revisar | 2026-08-13 | Requiere prueba en pantalla |
| R-009 | Entrar con nombre de usuario en vez de código, sin distinguir mayúsculas | listo | 2026-07-27 | El login pide usuario y contraseña reales (informe 04) |
| R-010 | Restringir computadoras por sede: unas sólo almacén, otras sólo tienda | curso | 2026-08-13 | Módulo Dispositivos construido; el control está apagado esperando que apruebe los equipos de cada sede |
| R-011 | Aviso de prender las luces exteriores a las 5:30pm y 6:30pm, sólo en tienda | pendiente | 2026-08-13 | Verificado: no existe ningún aviso de luces |
| R-012 | Todo editable por el administrador, sin tocar código para deshacer acciones | curso | 2026-08-13 | Configuración ya cubre actividades, permisos, sedes y tipos de incidencia y producto; falta el resto |
| R-013 | Reutilizar los diseños que ya existen en vez de crear nuevos | revisar | 2026-08-13 | Ejemplos del dueño: el calendario de gestión de actividades y los seleccionables de lavandería |

## Operaciones — Reporte de actividades

| ID | Requerimiento | Estado | Actualizado | Nota |
|---|---|---|---|---|
| R-014 | Un solo encargado por tienda: eliminar la opción de dos | listo | 2026-08-13 | El ERP nuevo maneja un solo encargado por reporte |
| R-015 | Las actividades extras no definidas las califica el admin en la evaluación del periodo | revisar | 2026-08-13 | |
| R-016 | Al registrar una actividad extra se pide el código, porque suma a favor de quien la hizo | revisar | 2026-08-13 | |
| R-017 | Bloquear el turno ya enviado en el día para evitar confusiones entre turnos | revisar | 2026-08-13 | |
| R-018 | Turno mañana habilitado hasta las 3pm; tarde y completo hasta las 11pm | pendiente | 2026-08-13 | Verificado: la lógica de reportes no tiene límite de hora por turno |
| R-019 | El resumen de actividades muestra 0 en completados | revisar | 2026-08-13 | Requiere prueba en pantalla para confirmarlo |
| R-020 | El código de envío debe ser del encargado; lista filtrada a encargados de tienda | revisar | 2026-08-13 | Con opción de elegir a otro colaborador si no hay encargado presente |
| R-021 | Envío automático del reporte al vencer la hora, con alerta a las 2pm y a las 8pm | revisar | 2026-08-13 | Depende del módulo de horarios |
| R-022 | Siempre debe existir un reporte enviado; si no se llenó nada, se envía el borrador | revisar | 2026-08-13 | |
| R-023 | El reporte se guarda con la fecha de envío, no con la de evaluación | revisar | 2026-08-13 | El dueño lo marcó como error crítico en abril |
| R-024 | Elegir al encargado antes de empezar a llenar el reporte | revisar | 2026-08-13 | |
| R-025 | Poder poner de encargado a un colaborador de menor rango cuando no hay encargado | revisar | 2026-08-13 | |
| R-026 | En evaluación de actividades apareció un reporte de almacén que no correspondía | revisar | 2026-08-13 | Requiere prueba en pantalla para confirmarlo |
| R-027 | Cada día se habilitan mañana, tarde y completo; del día anterior sólo queda su evaluación | revisar | 2026-08-13 | Regla de negocio que conviene confirmar antes de tocar el módulo |

## Operaciones — Evaluación de actividades

| ID | Requerimiento | Estado | Actualizado | Nota |
|---|---|---|---|---|
| R-028 | Puntajes con decimales larguísimos (37.400000000000006): máximo un decimal | revisar | 2026-08-13 | |
| R-029 | Al hacer clic en un elemento del layout no cambia a observado ni a rechazado | revisar | 2026-08-13 | Sólo se actualiza la lista inferior. Requiere prueba en pantalla para confirmarlo |
| R-030 | No funcionan "todo aprobado", "todo observado" ni "todo rechazado" | revisar | 2026-08-13 | Requiere prueba en pantalla para confirmarlo |
| R-031 | Debe verse la calificación por actividad | revisar | 2026-08-13 | Requiere prueba en pantalla para confirmarlo |
| R-032 | Reducir el ancho de la lista de calificación de limpieza | revisar | 2026-08-13 | Achica demasiado el layout. Requiere prueba en pantalla para confirmarlo |
| R-033 | La evaluación debe funcionar sin recargar la página | revisar | 2026-08-13 | Requiere prueba en pantalla para confirmarlo |

## Operaciones — Mi desempeño

| ID | Requerimiento | Estado | Actualizado | Nota |
|---|---|---|---|---|
| R-034 | Ver la lista de incidencias reportadas al colaborador | revisar | 2026-08-13 | |
| R-035 | Ver los resúmenes de las evaluaciones mensuales emitidas por el admin | revisar | 2026-08-13 | |
| R-036 | Ver por secciones separadas los reportes, las incidencias y las evaluaciones | revisar | 2026-08-13 | |
| R-037 | No debe verse quién hizo el reporte; sólo el administrador | revisar | 2026-08-13 | Coincide con el aislamiento ya exigido en Valores 360° |
| R-038 | Ver el avance y los puntos del colaborador en el pipeline de almacén | revisar | 2026-08-13 | |
| R-039 | Historial de evaluaciones mensuales, con indicadores que se reinician en el mes de cada uno | pendiente | 2026-08-13 | Verificado: Mi desempeño no tiene historial mensual |

## Prendas — Solicitudes

| ID | Requerimiento | Estado | Actualizado | Nota |
|---|---|---|---|---|
| R-040 | Corregir el formato de impresión de confirmación de entrega | revisar | 2026-08-13 | Mal estética y funcionalmente |
| R-041 | Columna de cantidad a llenar a mano en vez de la columna "Sí" | revisar | 2026-08-13 | La cantidad de pedido debe mostrar lo que sí se puede enviar |
| R-042 | Poner hora además de la fecha | revisar | 2026-08-13 | |
| R-043 | Imprimir por separado los formatos de solicitud de una misma sede | revisar | 2026-08-13 | |
| R-044 | "Formato de Pedidos" imprime sólo los pendientes seleccionados | revisar | 2026-08-13 | Si no hay selección, pedirla |
| R-045 | "Confirmación de Entregas" imprime sólo lo entregado recientemente | revisar | 2026-08-13 | Marcar "pendientes por imprimir" y evitar la doble impresión |
| R-046 | Restaurar los filtros de la lista de solicitudes | listo | 2026-08-13 | La lista de solicitudes del ERP tiene filtros |
| R-047 | "Confirmación de Pedidos" no imprime las solicitudes atendidas | revisar | 2026-08-13 | |
| R-048 | Entregar los pedidos digitando el código de la prenda | listo | 2026-08-13 | La entrega pide los códigos de prenda |
| R-049 | No guardar el código en ningún modal | revisar | 2026-08-13 | Ver R-004 |
| R-050 | Sólo la tienda que recepciona confirma la entrega; sólo almacén recepciona pedidos | revisar | 2026-08-13 | |
| R-051 | Al hacer clic en el campo de código se sale del modal | revisar | 2026-08-13 | Requiere prueba en pantalla para confirmarlo |
| R-052 | Guardar lo avanzado en el modal si el usuario sale | revisar | 2026-08-13 | Requiere prueba en pantalla para confirmarlo |
| R-053 | En la impresión, los códigos deben ir en la fila de la prenda que corresponde | revisar | 2026-08-13 | |
| R-054 | Antes de imprimir el formato, elegir a quién se le presenta (Margarita o Gloria) | revisar | 2026-08-13 | Sólo asignable a quienes tengan el rol de dueño de almacén |
| R-055 | Antes de entregar, elegir al colaborador que recibe y confirmar que está presente | revisar | 2026-08-13 | Para llenar bien las firmas de la impresión |
| R-056 | Nombre completo en los documentos impresos | revisar | 2026-08-13 | |
| R-057 | Definir el protocolo para cuando la tienda observa que no llegó lo que debía llegar | revisar | 2026-08-13 | Falta la regla de negocio |
| R-058 | Los ternos aceptados en solicitudes deben pasar a codificación en lavandería | revisar | 2026-08-13 | |

## Prendas — Solicitudes, modal "Nueva solicitud"

| ID | Requerimiento | Estado | Actualizado | Nota |
|---|---|---|---|---|
| R-059 | Corregir la digitación y la posición del campo de código del usuario | revisar | 2026-08-13 | Queda más arriba que el resto |
| R-060 | Duplicar debe copiar absolutamente todo del ítem original | revisar | 2026-08-13 | |
| R-061 | Agregar blazers y renombrar "Modelo" como "Modelo Prenda" en ternos, chalecos y blazers | listo | 2026-08-13 | Blazer está en el catálogo de prendas del pipeline |
| R-062 | Cambiar "Tela" por "Modelo Tela" y agregar "Tela/Material" con sus catálogos | listo | 2026-08-13 | Catálogos de tela y modelo de tela cargados en la migración 0056 |
| R-063 | El desplegable de color se corta al llegar al pie del modal | revisar | 2026-08-13 | Requiere prueba en pantalla para confirmarlo |
| R-064 | Replicar ese desplegable —escribible, con autocompletado— en talla, tela y modelos | revisar | 2026-08-13 | Al dueño le gusta ese diseño y quiere que se repita |
| R-065 | Quitar la palabra "niño" de las tallas de niño | revisar | 2026-08-13 | |
| R-066 | Cambiar "2XS" y "XXS" por "26" | pendiente | 2026-08-13 | Verificado: las tallas todavía no cambian 2XS por 26 |
| R-067 | Hacer más interactiva la parte de cantidad | revisar | 2026-08-13 | |
| R-068 | Permitir agregar opciones nuevas en color, tela y modelos, guardadas con inicial mayúscula | revisar | 2026-08-13 | |
| R-069 | Exigir que los seleccionables estén completos antes de enviar la solicitud | revisar | 2026-08-13 | |
| R-070 | No precargar el código al abrir el modal de nueva solicitud | revisar | 2026-08-13 | Ver R-004 |

## Prendas — Solicitudes, modal "Ver"

| ID | Requerimiento | Estado | Actualizado | Nota |
|---|---|---|---|---|
| R-071 | Evitar que aparezca la barra desplegable al pasar el mouse por la lista | revisar | 2026-08-13 | Requiere prueba en pantalla para confirmarlo |
| R-072 | Al entregar, especificar los códigos de prenda, también en la impresión | revisar | 2026-08-13 | Digitación siempre en mayúscula |

## Prendas — Préstamo y envío a lavandería

| ID | Requerimiento | Estado | Actualizado | Nota |
|---|---|---|---|---|
| R-073 | Las prendas dadas de baja deben quedar grabadas | revisar | 2026-08-13 | El dueño lo repitió tres veces, una en mayúsculas |
| R-074 | El código de prenda siempre en mayúscula al digitarlo | listo | 2026-08-13 | El envío a lavandería pasa los códigos a mayúscula |
| R-075 | Contar porta ternos y pares de zapatos además de camisas y corbatas | listo | 2026-08-10 | Verificado en la pantalla de envío a lavandería: el conteo por tipo incluye porta ternos y zapatos |
| R-076 | Botón "ver lista de envío" con los códigos agregados, en carrusel si son muchos | pendiente | 2026-08-13 | Verificado: el botón ver lista de envío no existe en el ERP |
| R-077 | Sólo los responsables de inventario y envío pueden poner su código | revisar | 2026-08-13 | |
| R-078 | Recordar los códigos ya ingresados para autocompletar las características de la prenda | revisar | 2026-08-13 | |

## Almacén — Pipeline y prendas recibidas

| ID | Requerimiento | Estado | Actualizado | Nota |
|---|---|---|---|---|
| R-079 | Hacer funcional el ingreso del código en el pipeline | revisar | 2026-08-13 | |
| R-080 | Dividir prendas (terno en saco y pantalón): cada actividad vale la mitad de puntos | curso | 2026-08-13 | El pipeline ya distingue saco y pantalón; falta confirmar que los puntos se dividan a la mitad |
| R-081 | En compostura no mostrar si fue lavado al seco | revisar | 2026-08-13 | |
| R-082 | En recepción no mostrar la etiqueta de tipo de lavado | revisar | 2026-08-13 | Todavía no está definido en esa etapa |
| R-083 | Mostrar el color del terno como un punto en las tarjetas del pipeline | revisar | 2026-08-13 | |
| R-084 | Lista diaria de prendas procesadas para que el admin revise | pendiente | 2026-08-13 | Verificado: no hay lista diaria de prendas procesadas |
| R-085 | Registrar prendas locales, que no vienen de tienda, con el mismo modelo de envío | listo | 2026-08-13 | El pipeline tiene registro local de prendas |
| R-086 | Puntajes del pipeline editables desde configuración | curso | 2026-08-13 | Configuración edita los puntos de actividades; faltan los del pipeline |
| R-087 | Cada colaborador ve su avance del día al ingresar su código | revisar | 2026-08-13 | |
| R-088 | En accesorios, permitir agregar camisas con registro y sustento | revisar | 2026-08-13 | Se registran en la propia lavandería, no vienen de tienda |
| R-089 | En accesorios, "producción" es en realidad ingreso de prendas a lavar | revisar | 2026-08-13 | El registro local va aparte y no suma a "pendiente por trabajar" |
| R-090 | Uniformizar el diseño del pipeline con el resto del sistema | revisar | 2026-08-13 | |
| R-091 | En Prendas Recibidas, la ventana para mover prendas aparece más abajo de lo debido | revisar | 2026-08-13 | Requiere prueba en pantalla para confirmarlo |
| R-092 | Registro de respaldo de las listas y prendas enviadas, para rastrear movimientos | revisar | 2026-08-13 | |
| R-093 | El pipeline reconoce la cuenta del administrador y hereda su código hasta cerrar sesión | revisar | 2026-08-13 | |
| R-094 | Envío de accesorios dentro de Prendas Recibidas, no como sección del menú | listo | 2026-08-13 | Accesorios vive dentro del pipeline, no como sección aparte del menú |
| R-095 | Historial del pipeline dentro de Prendas Recibidas, no como sección del menú | listo | 2026-08-13 | Envíos e historial viven dentro del pipeline |
| R-096 | Prendas Recibidas debe tener todo lo que el operario necesita: proceso, registro local y métricas | listo | 2026-08-13 | El pipeline reúne tablero, registro local, accesorios y métricas en una sola sección |
| R-097 | Estética de "Registrar prenda (local)" similar a la de Envío a lavandería | revisar | 2026-08-13 | |

## Administrador

| ID | Requerimiento | Estado | Actualizado | Nota |
|---|---|---|---|---|
| R-098 | Permitir la modificación completa de todo desde el sistema | revisar | 2026-08-13 | El dueño pidió especificar el alcance |
| R-099 | Crear nuevas sedes | listo | 2026-08-13 | Se pueden crear sedes desde Configuración |
| R-100 | Sección de configuración global: sedes, nombres de tienda y ajustes generales | revisar | 2026-08-13 | |
| R-101 | El admin puede ver contraseñas, usuarios y códigos de todos | apoyo | 2026-08-13 | No existe, y choca con el aislamiento de credenciales del sistema. Necesito que confirme si realmente quiere que el administrador vea las contraseñas de todos |
| R-102 | Anular el envío de un reporte, su evaluación o ambos, con justificación | pendiente | 2026-08-13 | Verificado: no existe la anulación de reportes ni de evaluaciones |
| R-103 | Tras anular una evaluación no se puede volver a evaluar | revisar | 2026-08-13 | Requiere prueba en pantalla para confirmarlo |
| R-104 | Los botones de anular deben ir juntos y su confirmación no debe quedar detrás del modal | revisar | 2026-08-13 | Y el cambio debe verse sin recargar. Requiere prueba en pantalla para confirmarlo |

## Administrador — Gestión de actividades

| ID | Requerimiento | Estado | Actualizado | Nota |
|---|---|---|---|---|
| R-105 | Vista de calendario de la lista de actividades | pendiente | 2026-08-13 | Verificado: no hay vista de calendario en la lista de actividades |
| R-106 | Filtros en la lista de actividades; al filtrar por fecha, sólo las activas de ese día | revisar | 2026-08-13 | |
| R-107 | Botones para ver extras, obligatorias o ambas | revisar | 2026-08-13 | |
| R-108 | Vista "general" además de las sedes, sin el layout | revisar | 2026-08-13 | El layout es propio de cada sede |
| R-109 | Modal de editar más compacto, sin espacios vacíos | revisar | 2026-08-13 | |
| R-110 | El código de la actividad se genera solo, nunca a mano | revisar | 2026-08-13 | |
| R-111 | No se pueden deseleccionar los días específicos en Periodicidad | revisar | 2026-08-13 | Requiere prueba en pantalla para confirmarlo |
| R-112 | Rediseñar los botones que están en negro y negrita | revisar | 2026-08-13 | |
| R-113 | Quitar "PO", "SO" e "IND" de los textos de categoría | revisar | 2026-08-13 | |
| R-114 | La categoría indispensable no debería relacionarse con "ternos" ni "software" | revisar | 2026-08-13 | |
| R-115 | Explicar mejor el concepto de "acumula si no se realiza" | revisar | 2026-08-13 | Falta la definición de negocio |
| R-116 | Separar las actividades extras y las obligatorias en listas distintas | revisar | 2026-08-13 | |

## Administrador — Layout de limpieza

| ID | Requerimiento | Estado | Actualizado | Nota |
|---|---|---|---|---|
| R-117 | Incorporar el layout de almacén | curso | 2026-08-13 | La edición de layout existe en Configuración; falta el layout de almacén |
| R-118 | Permitir editar el tamaño de los objetos | revisar | 2026-08-13 | |
| R-119 | Forma propia por tipo de objeto y puntaje según su complejidad | revisar | 2026-08-13 | Referencia del dueño: planchar vale 6 puntos. 13 tipos descritos: plancha, MC, CB, MT, PC, ME, MB, CT, MS, M, VI, VF, CO |
| R-120 | Agregar sectores: baño, pasadizo y escaleras | revisar | 2026-08-13 | Por ahora cuentan como extra |
| R-121 | Eliminar los modales nativos del navegador | listo | 2026-08-13 | El ERP nuevo no usa modales nativos del navegador |
| R-122 | Un mueble puesto encima de otro debe verse y poder seleccionarse al frente | revisar | 2026-08-13 | Hoy queda detrás y no se puede marcar en el reporte. Requiere prueba en pantalla para confirmarlo |
| R-123 | Doble clic sobre un elemento abre su edición | revisar | 2026-08-13 | Requiere prueba en pantalla para confirmarlo |
| R-124 | Quitar "traer al frente" y "enviar al fondo" del menú contextual | revisar | 2026-08-13 | Ya lo resuelve la opción "sobre mueble…" |
| R-125 | Quitar "seleccionar todo" y "deseleccionar todo" | revisar | 2026-08-13 | |

## Administrador — Gestión de colaboradores

| ID | Requerimiento | Estado | Actualizado | Nota |
|---|---|---|---|---|
| R-126 | Nombre completo además del nombre corto que muestra el sistema | pendiente | 2026-08-13 | Verificado: no existe nombre completo separado del nombre corto |
| R-127 | Contraseña además del código, ambas ocultas en el login | listo | 2026-07-27 | Empleados ya maneja contraseña además del código |
| R-128 | Adjuntar el Excel de horarios | apoyo | 2026-08-13 | El archivo lo tiene la empresa; sin él no se puede avanzar con horarios |
| R-129 | Configurar Accesos: sólo módulos existentes, funcional y separado por sector | curso | 2026-08-13 | La configuración de permisos existe y funciona; falta ordenarla por sector |
| R-130 | Permitir crear accesos nuevos | revisar | 2026-08-13 | |
| R-131 | Agregar puestos o rangos, y grupos de rangos | listo | 2026-07-27 | Se pueden crear roles derivados con permisos propios (informe 04) |
| R-132 | Agregar sedes nuevas | revisar | 2026-08-13 | Duplica a R-099 |
| R-133 | Uniformizar la estética de filtros y ordenamientos en todo el sistema | revisar | 2026-08-13 | |
| R-134 | "Pesos de evaluación" pasa a estar dentro de Evaluación mensual | revisar | 2026-08-13 | Sacarlo del menú lateral |
| R-135 | "Gestión de horarios" pasa a estar dentro de Colaboradores | revisar | 2026-08-13 | Sacarlo del menú lateral |

## Administrador — Incidencias

| ID | Requerimiento | Estado | Actualizado | Nota |
|---|---|---|---|---|
| R-136 | Filtros por colaborador, fecha y sede | listo | 2026-08-13 | Incidencias tiene filtros por sede y fecha |
| R-137 | Ver quién reportó y a quién se está reportando | revisar | 2026-08-13 | Desde "Agregar incidencia" se registra el código de quien envía; desde un reporte, el encargado del turno |
| R-138 | "Agregar incidencia" como botón del menú, no como página | revisar | 2026-08-13 | El colaborador no debe ver las incidencias recientes |
| R-139 | Quitar el botón "+ Registrar" | revisar | 2026-08-13 | |
| R-140 | Catálogo editable de incidencias con los puntos que descuenta cada una | listo | 2026-08-13 | Existe la configuración de tipos de incidencia |
| R-141 | Los descuentos por incidencia van automáticamente a la evaluación mensual | curso | 2026-08-13 | La evaluación ya considera incidencias; falta el descuento automático por tipo |
| R-142 | Que aparezcan todos los tipos posibles de incidencia en incidencias de turno | revisar | 2026-08-13 | |

## Evaluación mensual y sueldos

| ID | Requerimiento | Estado | Actualizado | Nota |
|---|---|---|---|---|
| R-143 | Descuentos por tardanzas y faltas, justificadas e injustificadas | curso | 2026-08-13 | La evaluación contempla tardanzas; faltan las faltas y su vínculo con horarios |
| R-144 | Incrementos por cumplimiento de metas y buena calificación de los clientes | revisar | 2026-08-13 | Faltan definir las metas y cómo se mide al cliente |
| R-145 | Sistema de exámenes con preguntas abiertas y de opción múltiple | revisar | 2026-08-13 | |
| R-146 | Competencias editables | listo | 2026-08-13 | Las competencias son editables (migración 0057) |
| R-147 | Evaluación de valores a compañeros desde "Mi desempeño", en fecha programada | curso | 2026-08-13 | Valores 360° entre compañeros ya funciona; falta la habilitación en fecha programada |
| R-148 | Incorporar los horarios para el control de puntajes y actividades | revisar | 2026-08-13 | Bloquea a R-021 y R-143 |
| R-149 | Impresión en PDF de la evaluación mensual de cada colaborador | pendiente | 2026-08-13 | Verificado: no existe la impresión en PDF de la evaluación mensual |
| R-150 | Planificar la sección de pagos y sueldos en base a la evaluación mensual | curso | 2026-08-13 | El módulo de pagos existe; falta atarlo a la evaluación mensual |

---

## Cómo se mantiene

1. Un requerimiento nuevo del dueño se agrega al final de su zona con el siguiente número libre.
2. El estado cambia junto con el trabajo, no antes: pasar algo a `listo` exige haberlo
   verificado contra el sistema, y la fecha de `Actualizado` deja constancia de cuándo.
3. Los informes leen este archivo. No hace falta copiar la lista adentro de cada informe.

_Origen: los tres documentos "ACTUALIZACIONES PARA SISTEMA SCI LB" (abril y mayo de 2026),
consolidados y deduplicados el 13 de agosto de 2026._
