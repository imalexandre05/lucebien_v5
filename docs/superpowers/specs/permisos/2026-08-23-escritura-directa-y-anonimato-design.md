# SPEC — Cerrar la escritura directa y devolverle el anonimato a Valores 360°

> **Qué es.** Cinco agujeros de permisos que encontró la auditoría del 23-ago-2026 y que un agente
> adversarial confirmó uno por uno contra la base viva. Todos comparten la misma forma: la interfaz
> pide lo correcto, pero la base acepta cualquier cosa que le manden por fuera de la interfaz.
>
> **Por qué importa ahora.** El ERP está por entrar en producción con las once personas de
> LuceBien. La clave anónima de Supabase viaja dentro de cada página (es su función: el navegador
> la necesita), así que cualquiera con una sesión iniciada puede hablarle a PostgREST directamente
> desde la consola del navegador. Hasta hoy eso no era un riesgo real porque nadie usaba el
> sistema. A partir de que se use, sí lo es.
>
> **Zona de rigor:** spec completa. Toca permisos y aislamiento — dos de los siete no-negociables.
> Exige migración numerada, prueba de ataque, y verificador adversarial antes de mergear.

---

## 0. El principio que se rompe

El no-negociable 3 dice: *«Toda lectura de datos de personas pasa por RLS»*. La auditoría muestra
que la mitad que falta también importa: **toda escritura tiene que pasar por una regla, y la regla
no puede vivir sólo en la pantalla.**

Una pantalla es una sugerencia. La base es la ley.

---

## 1. Lo que está abierto hoy (verificado contra `pg_policies` el 23-ago-2026)

### A-1 — Cualquiera puede escribir su propia nota de reporte

```
reportes · política rep_rw · FOR ALL
qual = app_es_admin() OR app_es_almacen() OR sede_cod IN app_sedes()
```

`FOR ALL` con la misma condición para leer y para escribir. Como todas las personas de ventas
tienen las cuatro sedes en `empleado_tiendas`, la condición es verdadera para todas ellas en todos
los reportes. Un `PATCH /rest/v1/reportes?id=eq.<id>` con `{"puntaje":100,"puntaje_eval":100,
"evaluado":true}` entra sin que ninguna RPC lo mire.

Ese puntaje es el que alimenta la nota mensual, y la nota mensual es la que decide el pago.

Lo mismo vale para `reporte_actividades`, `reporte_trabajadores` y `reporte_extras`, que cuelgan de
la misma condición a través de la sede del reporte padre.

### A-2 — Cualquiera puede aprobar su propia solicitud al almacén

```
solicitudes · política solicitudes_rw · FOR ALL
qual = app_es_admin() OR app_es_almacen() OR sede_cod IN app_sedes()
```

Toda la autoridad de quién aprueba, quién entrega y quién rechaza vive en las RPC
(`solicitud_aprobar`, `solicitud_entregar`, `solicitud_rechazar`). Ninguna de esas reglas existe en
la base: un `PATCH` con `{"estado":"confirmada"}` salta el circuito entero.

### A-3 — Valores 360° no es anónimo en la base

```
evaluaciones_valores · política eval_valores_select
qual = app_es_admin() OR app_ve_datos_personas() OR evaluado_id = auth.uid() OR evaluador_id = auth.uid()
```

`evaluado_id = auth.uid()` deja leer **la fila completa**, y la fila incluye `evaluador_id`. El
anonimato lo sostiene únicamente que la aplicación no seleccione esa columna. Un
`GET /rest/v1/evaluaciones_valores?evaluado_id=eq.<mi id>&select=*` devuelve quién puntuó a quién.

El no-negociable 3 dice, con estas palabras: *«Nadie sabe quién lo puntuó en Valores 360° salvo el
administrador»*. Hoy lo sabe cualquiera que pregunte bien.

### A-4 — Una tabla de respaldo con datos de personas, sin RLS

`asistencias_respaldo_0075` está en el esquema `public`, expuesta por PostgREST, **con RLS
desactivada**. El linter de Supabase lo marca como ERROR. Contiene filas reales de asistencia con
`empleado_id`. `asistencias_respaldo_20260821` sí tiene RLS activada y ninguna política, que es el
comportamiento correcto (niega todo), pero tampoco debería seguir expuesta.

### A-5 — La nota mensual la ve el rol de almacén

```
evaluaciones_mensuales · política eval_select
qual = app_es_admin() OR app_es_almacen() OR empleado_id = auth.uid()
```

`private.app_es_almacen()` es verdadera para `encargado_almacen` **y para `confeccionista`**. Hoy
no hay nadie con esos roles, así que no filtra nada todavía; el día que se contrate a una
confeccionista para el pipeline —que es el uso previsto del rol— esa persona va a ver la nota de
las once.

---

## 2. Lo que NO cambia esta spec

- **No** toca el motor de sueldos ni ningún cálculo.
- **No** cambia quién puede hacer qué desde la interfaz: lo que la pantalla ya permitía sigue
  permitido, y lo que ya negaba sigue negado. Lo único que cambia es que ahora la base también lo
  niega.
- **No** resuelve que todas las personas tengan las cuatro sedes (§4): eso es un dato, y la
  decisión es del dueño.

---

## 3. El diseño

*(Se completa con el mapa de caminos de escritura antes de escribir la migración 0081.)*

---

## 4. Decisión que queda para el dueño

**¿Todo el equipo debe tener acceso a las cuatro sedes?** Hoy las nueve personas de ventas tienen
AL, LB y ST en `empleado_tiendas` (Jordan y Marylin además TR). Mientras eso sea así, el
aislamiento por sede no aísla: cualquiera ve los reportes y las notificaciones de todas las
tiendas. Puede ser correcto —la gente rota entre tiendas— o puede ser una herencia de la carga
inicial. La respuesta cambia cuánto protege cada una de las políticas de arriba.
