# Diagnóstico del huellero

Comprueba que el terminal Hikvision del almacén se puede leer desde una PC de la red, antes de
construir nada. Solo lee: no escribe en el equipo, no toca la base de datos, no instala nada.

De paso exporta la lista de personas inscritas, que es lo que hace falta para mapear cada
identificador del equipo a un empleado real del ERP.

## Qué hace falta

Una PC con Windows que esté en la misma red que el huellero (la del almacén), y la contraseña de
administrador del equipo — la misma con la que se entra a su página web.

No hace falta instalar nada. PowerShell ya viene con Windows.

## Cómo se usa

Copiar la carpeta a la PC del almacén, abrir PowerShell ahí dentro y ejecutar:

```powershell
powershell -ExecutionPolicy Bypass -File .\Probar-Huellero.ps1
```

Pide la contraseña y hace el resto. Tarda menos de un minuto.

Para traer el histórico desde una fecha concreta — por ejemplo todo el año:

```powershell
powershell -ExecutionPolicy Bypass -File .\Probar-Huellero.ps1 -Desde 2026-01-01
```

Con muchos meses puede tardar varios minutos: va mostrando el avance. Si el equipo tiene otra
dirección, agregar `-Ip 192.168.1.221`.

## Qué deja

Tres archivos al lado del script:

- `huellero-marcas.csv` — todas las marcaciones del rango, con identificador, nombre, fecha y hora.
- `huellero-resumen.csv` — una fila por persona: cuántas marcas, cuántos días y en cuántos de esos
  días hay una sola marca (o sea, entrada sin salida).
- `huellero-personas.csv` — la lista de inscritos, si el equipo la entrega.

Los tres van para Alexander.

## Qué contraseña pide

La del **equipo**: la misma con la que se entra a `https://192.168.1.220` desde el navegador,
usuario `admin`. No es la cuenta de Hik-Connect (la app del celular, con correo), que este
proyecto no usa.

Importante: **no probar contraseñas al azar.** El equipo bloquea el acceso por unos minutos tras
varios intentos fallidos.

## Si algo falla

**"No se llegó al equipo"** — comprobar que la PC llega con `ping 192.168.1.220`. Si el ping
responde pero el script no, repetir agregando `-UsarHttp` al final del comando.

**"La clave no fue aceptada" (401)** — no es la contraseña correcta, o el equipo está bloqueado
por intentos previos. Esperar unos minutos antes de reintentar.

**Dice "Conectado" pero después falla** — la conexión y la clave están bien; el problema es leer
la respuesta. El script guarda lo que devolvió el equipo en `respuesta-cruda.txt`. Mandar ese
archivo a Alexander.

**Cero marcaciones** — el rango se quedó corto. Repetir con `-DiasAtras 30`.

## Después

Esto es solo el diagnóstico. El colector que sincroniza cada cinco minutos con el ERP es otra
cosa, y todavía no está construido. El diseño está en
[docs/superpowers/specs/2026-08-15-huellero-asistencias-design.md](../../docs/superpowers/specs/2026-08-15-huellero-asistencias-design.md).
