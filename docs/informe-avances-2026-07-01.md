# Informe de Avances — SCI‑LB (Plataforma Digital LuceBien)

**Fecha:** 1 de julio de 2026
**Alcance:** migración del sistema interno (SCI) a la nueva plataforma web
**Estado:** módulos internos completos · listo para despliegue de revisión

---

## 1. Resumen ejecutivo

La nueva plataforma reemplaza gradualmente al sistema interno actual con una interfaz
**más clara, grande y fácil** para el personal —incluso sin experiencia en computadoras—,
**manteniendo la misma forma de trabajar** que el equipo ya conoce del sistema anterior.

En esta etapa se **completó la migración de todos los módulos operativos internos**, con
**datos reales** de la empresa, y el sistema quedó **listo para publicarse en la nube** (Vercel)
en una URL privada para su revisión.

**En una línea:** lo que el equipo hace hoy en el sistema viejo, ya se puede hacer en la
plataforma nueva —más ordenado, más rápido y accesible desde cualquier navegador.

---

## 2. Estado general

| Área | Estado |
|---|---|
| Plataforma nueva (Next.js 14 + Supabase) | ✅ Operativa |
| Módulos internos (operación diaria) | ✅ Completos, con datos reales |
| Módulos comerciales (clientes/inventario/pedidos) | ✅ Base funcional |
| Verificación de compilación (build) | ✅ Sin errores |
| Seguridad de datos (acceso por rol/sede) | ✅ Aplicada en la base de datos |
| Despliegue a la nube | ⏳ Listo; falta crear el proyecto en Vercel (~5 min) |

---

## 3. Módulos entregados

### Operación interna (completos)

- **Reportes de Actividad (FR‑01).** Crear el reporte del turno (equipo, encargado, actividades,
  mapa de limpieza), evaluarlo con calificación de **3 estados** (aprobar / observar / rechazar)
  y consultar el **historial** con filtros. *Datos reales: 562 reportes (42 evaluados).*
- **Prendas / Pipeline de lavandería.** Tablero de las 9 etapas (Recepción → … → Listo p/ envío),
  con avance en vivo, deshacer, **puntos por operario**, filtros por sede y tipo de lavado.
  *Datos reales: 95 prendas en proceso.*
- **Incidencias.** Registro por tipo/nivel, responsable y penalidad; enlazadas a su reporte de
  origen. *14 registradas.*
- **Asistencias.** Entrada/salida, tardanzas y fuente (manual / reporte / huellero).
- **Evaluación mensual.** Nota por componentes con **pesos configurables**; cálculo automático
  desde la data de reportes.
- **Pagos.** Registro con **sugerido automático** (salario × nota) y comprobante.
- **Colaboradores (Empleados).** Gestión del equipo: perfiles, roles, sedes, estado,
  **suspender/reactivar** y edición de datos de contacto. *(Solo administradores.)*
- **Dashboard.** Indicadores en tiempo real (prendas, reportes, incidencias, inventario).
- **Configuración.** Parámetros del negocio **editables** (puntos del pipeline, pesos de
  evaluación) — sin necesidad de tocar el código.

### Comercial (base funcional)

- **Clientes, Inventario y Pedidos** operativos con sus tablas y flujos; se completan en la
  siguiente fase.

---

## 4. Diseño y experiencia de uso

- Se tomó la **disposición y la rapidez** del sistema antiguo (que el equipo ya domina) y se
  vistió con la **identidad visual formal de LuceBien** (navy / dorado, tipografías serias).
- Interfaz **grande, guiada y con animaciones sobrias**, pensada para el personal de tienda.
- Cambios de módulo **inmediatos** (con carga progresiva), sin esperas percibidas.

---

## 5. Migración de datos

- Migrados desde el sistema anterior: **empleados, 4 sedes** (LuceBien, Stand, Trece, Almacén),
  **reportes (562), prendas (95), incidencias, evaluaciones** y catálogos.
- **Login sin cambios para el personal:** el mismo **código + sede** que ya usan.

---

## 6. Seguridad

- **Acceso por rol y sede aplicado en la base de datos** (no solo en pantalla): cada usuario ve
  únicamente lo que le corresponde.
- **Datos sensibles protegidos** (salarios, DNI, códigos de acceso): nunca se exponen
  indebidamente; el código de login nunca se muestra.
- **El despliegue no incluye claves secretas** (verificado): la publicación en la nube usa solo
  claves públicas; las credenciales privadas quedan fuera del repositorio.
- La URL de revisión se protegerá con **acceso restringido** (solo personas autorizadas).

---

## 7. Despliegue (nube)

- **Compilación de producción verificada** (sin errores).
- **Código respaldado en GitHub.**
- Falta únicamente **crear el proyecto en Vercel** (operación de ~5 minutos) con las variables
  públicas de conexión y la **protección de acceso** activada. A partir de ahí, cada cambio se
  publica solo.

---

## 8. Próximos pasos

1. **Publicar** la plataforma en Vercel (URL privada de revisión).
2. **Cargar los salarios reales** del personal (habilita el módulo de Pagos por completo).
3. **Completar lo comercial** (fichas de clientes/pedidos) y las secciones adicionales del
   pipeline (registrar, accesorios, envíos a tienda, métricas).
4. **Confirmar reglas de negocio pendientes** para no asumir criterios (fórmulas y flujos
   específicos).

---

## Anexo técnico

- **Stack:** Next.js 14 (App Router), Supabase (PostgreSQL + Auth + reglas RLS), TypeScript,
  Tailwind; monorepo `core` (lógica del oficio) + `adapter` (config LuceBien) + `apps/erp-web`.
- **Base de datos:** proyecto Supabase en la nube; migraciones versionadas (esquema 0001–0034).
- **Trabajo de esta etapa:** rediseño y migración de los módulos internos a la disposición del
  sistema antiguo con el diseño nuevo, mejoras de rendimiento de navegación, evaluación con mapa
  interactivo, gestión de colaboradores y preparación de despliegue. Todo versionado en Git.
