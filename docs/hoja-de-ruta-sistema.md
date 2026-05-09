# LuceBien · Hoja de ruta del sistema

> Cómo se conecta todo para que la **evaluación mensual de cada colaborador**
> sea automática, justa y trazable.

---

## 🎯 Objetivo

Que al final de cada **ciclo personal** (~30 días desde su fecha de ingreso),
cada colaborador reciba una nota /20 calculada **sin intervención manual**,
basada en datos objetivos de todo lo que pasó durante el periodo, y que
se traduzca en un **pago concreto con comprobante**.

---

## 📦 De dónde sale la nota mensual

```
                  ┌──────────────────────────┐
                  │   NOTA MENSUAL  /20      │
                  │   pesos editables        │
                  └────────────┬─────────────┘
                               │
   ┌──────────┬─────────┬──────┼──────┬──────────┬───────────┐
   ▼          ▼         ▼      ▼      ▼          ▼           ▼
COMPETENC. VALORES  OPERAC. SOFTW. LIMPIEZA  TARDANZAS   INCIDENCIAS
  (manual)  (peer    (auto    (auto   (auto    (auto       (auto
            review)   reps)   reps)   reps)   asistencia)  resta)
                                                      │
                                                      └─ + BONUS VENTAS
```

| Componente | Peso default | De dónde sale |
|---|---|---|
| Competencias | 25% | Admin lo califica manualmente (jefe 0-4) |
| Valores 360° | 25% | Promedio de evaluaciones anónimas de compañeros |
| Operaciones (PO) | 10% | Promedio de calificaciones de actividades AT/BT en sus reportes |
| Software (SO) | 10% | Promedio de actividades AS/BS en sus reportes |
| Limpieza (IND) | 10% | Promedio de actividades IND en sus reportes |
| Conocimientos | 15% | (futuro: módulo examen) |
| Tardanzas | 5% | `max(0, 20 − floor(min_total/15))` desde asistencia |
| **Descuento** | — | Suma de puntos de penalidad de incidencias |
| **Bonus** | — | Cumplimiento de meta de ventas (si aplica) |

Los pesos se editan en `Evaluación Mensual → Configuración`. Las
ediciones aplican a los **siguientes** cierres; los anteriores quedan
congelados con los pesos del momento (`pesos_usados` JSON por
evaluación).

---

## 🔄 Flujo automatizado mes a mes

```
DÍA 1 del ciclo                                       DÍA 30 del ciclo
   │                                                       │
   ▼                                                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  Trabajador inicia su turno                                      │
│       │                                                          │
│       ▼                                                          │
│  ► Reporte de actividades (al cerrar el turno)                   │
│       │                                                          │
│       ├─ AUTO: marca asistencia (fuente='reporte')              │
│       ├─ AUTO: actividades alimentan PO/SO/IND                   │
│       └─ Siguiente turno: evalúa el reporte (calificación 0-20) │
│                                                                  │
│  ► Cualquier turno con incidencia                                │
│       │                                                          │
│       └─ Queda en `incidencias` con puntos de penalidad          │
│                                                                  │
│  ► Almacén                                                       │
│       │                                                          │
│       └─ Pipeline → puntos en `pipeline_puntos` (ranking)       │
│                                                                  │
│  ► Día 25-28 (configurable en Colaboradores)                     │
│       │                                                          │
│       └─ AUTO: se habilita "Evaluar Compañeros" (Valores 360°)  │
│                                                                  │
│  ► Día del cierre                                                │
│       │                                                          │
│       ├─ Dashboard alerta: "X colaboradores cierran ciclo"      │
│       ├─ Admin entra a Evaluación Mensual del colaborador        │
│       ├─ Notas auto-pobladas desde reportes/asistencia/etc.      │
│       ├─ Admin completa Competencias y revisa                    │
│       ├─ Click "Cerrar y registrar pago →"                       │
│       └─ Pago queda persistido + comprobante PDF imprimible      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🧩 Módulos y su rol

| Módulo | Rol en la evaluación |
|---|---|
| **Reporte de Actividades** | Genera la base: cuántas tareas, calificaciones por categoría, asistencia automática |
| **Evaluación de Reporte** | El siguiente turno califica al anterior — alimenta `puntaje_eval` |
| **Asistencia diaria** | Edita manualmente quien faltó o llegó tarde — alimenta tardanzas |
| **Incidencias** | Cada incidencia resta puntos del componente "descuento" |
| **Pipeline (Almacén)** | Operarios ganan puntos por avanzar prendas — entra a la categoría Operaciones |
| **Evaluar Compañeros (Valores 360°)** | Habilitado en los días configurados — alimenta Valores |
| **Solicitudes** | No alimenta nota directa, pero genera incidencias si se ignoran |
| **Lavandería / Préstamos / Garantías** | No nota directa, pero generan incidencias si se manejan mal |
| **Horarios** | Define cuántos reportes esperar de cada colaborador (cumplimiento %) |
| **Empleados** | Datos críticos: salario_base (calcula monto de pago), fecha_ingreso (calcula ciclo) |
| **Evaluación Mensual** | El "horno" donde todo se cocina y se cierra |
| **Pagos** | Persiste el cierre del ciclo + comprobante imprimible |
| **Dashboard** | Vista ejecutiva: alertas, próximos cierres, salud del sistema |
| **Auditoría** | Registra TODO POST/PUT/DELETE con quién, cuándo, desde dónde |

---

## ✅ Checklist de "sistema listo para producción"

Para que la evaluación automática funcione bien en la PC del almacén,
asegurar antes:

- [ ] Cada colaborador tiene `fecha_ingreso` correcta (define su ciclo personal)
- [ ] Cada colaborador tiene `salario_base` (define el monto de pago sugerido)
- [ ] Cada colaborador tiene `dni` (aparece en el comprobante)
- [ ] Horarios cargados con `horario_slots` para todos (define reportes esperados)
- [ ] Pesos configurados al gusto del admin (Eval Mensual → Configuración)
- [ ] Tipificaciones de incidencias revisadas con sus puntos de penalidad
- [ ] Ventas con metas mensuales registradas (si se va a usar bonus)
- [ ] `JWT_SECRET` rotado en `.env` de producción
- [ ] Backup automático corriendo (verificar `database/backups/lucebien_auto_*.db`)

---

## 🚧 Lo que aún NO está conectado (para fases siguientes)

- **Examen de conocimientos** (alimentaría `nota_examenes`, hoy se ingresa manual)
- **Huellero digital** (reemplazará `fuente='reporte'` por `'huellero'` con tardanza real)
- **E-commerce público** (cuando esté, las ventas online alimentarán bonus)
- **Trazabilidad cliente-prenda** (vida útil de cada prenda)
- **Caja chica / gastos** (control financiero operativo, paralelo a pagos)

Estos módulos quedan para fases posteriores. El sistema está estructurado
para que cuando lleguen, **se conecten sin romper la lógica de evaluación
existente**.
