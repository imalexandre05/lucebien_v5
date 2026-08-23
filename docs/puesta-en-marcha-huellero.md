# Poner en marcha el huellero

Los pasos para pasar de "está programado" a "está andando". En orden, y ninguno se saltea.

Diseño completo en
[superpowers/specs/2026-08-15-huellero-asistencias-design.md](superpowers/specs/2026-08-15-huellero-asistencias-design.md).

---

## Antes de empezar

Hace falta tener a mano:

- La **contraseña de administrador del huellero** — la misma con la que se entra a
  `https://192.168.1.220` desde el navegador. No es la cuenta de Hik-Connect.
- Acceso al **panel de Supabase** del proyecto `scilb`, para crear un usuario.
- La **computadora del almacén**, que es la que ve al huellero por la red. No es la del sistema
  viejo.

---

## 1. Backup de la base

La migración sólo agrega tablas y funciones: no modifica ni borra ninguna fila existente. Aun
así el backup va, porque lo que se agrega escribe en `asistencias` y eso se paga.

Desde el panel de Supabase: **Database → Backups**. Anotá la hora del backup por si hay que
volver.

---

## 2. Aplicar la migración 0075

El archivo es `packages/db/migrations/0075_huellero_asistencias.sql`. Crea cuatro tablas, ocho
funciones, las políticas de acceso y dos parámetros de configuración.

Es idempotente: si se aplica dos veces no falla.

---

## 3. Correr la prueba

```bash
bash tools/probar-migracion.sh 0075
```

Son 18 casos, y cada uno es un error que ya se cometió o que costaría plata si volviera. La
salida esperada es un error que empieza con `RESULTADO`: **todo `ok` significa que pasa**, y
cualquier `FALLA` es una promesa de la migración que no se cumple.

La prueba se descarta sola: no deja ni una fila.

Si no hay `psql` a mano, el script imprime el archivo para correrlo desde el panel de Supabase.

---

## 4. Crear el usuario del colector

En el panel de Supabase, **Authentication → Users → Add user**. Correo y contraseña propios, sólo
para esto. No es una persona: es la computadora del almacén.

Copiá su identificador (el `uid`) y registralo:

```sql
insert into huellero_colectores (user_id, nombre)
values ('<el uid que copiaste>', 'PC del almacén');
```

Ese usuario **no puede leer sueldos, ni notas, ni datos personales**. Lo único que puede hacer es
insertar marcas de asistencia. Es a propósito: si alguien se lleva el archivo de configuración de
esa computadora, eso es todo lo que consigue.

---

## 5. Dar de alta el huellero

Desde el ERP, en **Asistencias → Huellero → Agregar equipo**: nombre ("Almacén") y dirección
(`192.168.1.220`).

La contraseña del equipo **no se guarda ahí**. Va en el archivo de configuración del colector, en
la computadora del almacén, y en ningún otro lado.

---

## 6. Instalar el colector

En la computadora del almacén:

1. Instalar Node.js LTS.
2. Copiar la carpeta `tools/colector-huellero/`.
3. Completar el archivo `.env` con la dirección y contraseña del huellero, y con las credenciales
   del usuario del paso 4.
4. Arrancarlo con PM2 y dejarlo con arranque automático de Windows, para que sobreviva a los
   apagones.

El README de esa carpeta lo explica paso a paso.

---

## 7. Comprobar que funciona

En **Asistencias → Huellero**, el equipo tiene que aparecer con "Al día" y una última señal de
hace pocos minutos. Si dice "Sin señal", el colector no está corriendo o no llega a internet.

Después van a empezar a aparecer identificadores en la cola de sin asignar. Ahí se asigna cada
uno a su persona, con la fecha desde la que vale.

**Cuidado con los identificadores reutilizados.** El equipo reasigna los números: el `00000013`
fue de una persona hasta el 28 de enero y de otra desde el 29. La pantalla avisa cuando detecta
un número con más de un nombre en el histórico, y en ese caso hay que asignarlo por tramos de
fecha, uno por cada persona. Asignarlo de una sola vez le paga a una los días de la otra.

---

## 8. Antes de la primera liquidación con estos datos

Tres cosas que conviene revisar con el dueño, y que están anotadas en
[pendientes-negocio.md](pendientes-negocio.md):

- **Los parámetros de tardanza.** `sueldo_tolerancia_minutos`, `sueldo_tardanzas_libres` y
  `sueldo_penalidad_tardanza` se eligieron para un mundo donde la tardanza se cargaba a ojo. Con
  marcación real se aplican al minuto, y la cuenta del periodo va a subir. No están mal; hay que
  mirarlos. Que la primera persona se entere por su recibo sería la peor manera.
- **Los horarios contratados.** Los turnos reales observados (mañana 08:00–14:00, tarde
  14:00–20:00, jornada larga 08:00–19:00) no coinciden con lo que asume el sistema. Si a alguien
  de turno mañana se le carga un horario que empieza a las 09:00, su tardanza sale mal.
- **Los días sin hora de salida.** Son el 17% del histórico y se concentran en tres personas con
  explicación propia. Cada uno bloquea el cálculo del mes hasta que se completa a mano desde la
  pantalla.

---

_Escrito el 17 de agosto de 2026, al terminar la migración `0075`._
