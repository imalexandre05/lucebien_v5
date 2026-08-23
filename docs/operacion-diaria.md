# Operación diaria de LuceBien

> Cómo funciona el negocio en la realidad, contado por Alexander (13-ago-2026) a partir de su
> experiencia trabajando en la empresa. Las respuestas del administrador siguen pendientes en
> varios puntos — están marcados.
>
> Este documento describe **la operación**, no el sistema. Es el insumo para decidir qué tiene
> que hacer el software.

---

## Las cuatro sedes

| Sede | Qué es | Personal |
|---|---|---|
| **LuceBien (LB)** | Tienda principal, la más grande, más ventas | 2 personas fuera de temporada, hasta 5 en temporada |
| **Stand 101-102 (ST)** | Dos stands en galería: uno de ternos de adulto, otro de niño. Compiten entre sí en ventas | 2 fuera de temporada, hasta 5 en temporada |
| **Trece (TR)** | Tienda chica, **no modernizada**. Vende con boleta física y el sistema TUXEDO. Recibe primero los productos de proveedores; las otras tiendas le piden prestado producto nuevo | 1 persona, de confianza (dueño, administrador, o familiar). A veces cerrada |
| **Almacén Central (AL)** | Al fondo de la misma galería que los stands. Lavandería, pipeline completo, confección, codificación. También guarda ternos, boletas antiguas, telas, cámaras y **el huellero de asistencia** | Confeccionista + operarios |

**Temporada:** arranca en noviembre y va hasta fines de diciembre. Ahí se triplica el personal
de tienda.

---

## Los roles

Los roles **no son fijos**: en tienda una persona puede rotar entre vendedor, cajero y refacción
según cuánta gente haya. La misma persona puede además moverse entre tiendas.

### Vendedor (casi todos hacen esto)

Su día:
1. Marca asistencia en el huellero **del almacén**
2. Abre la tienda (turno mañana), limpia lo que le toca; barre y trapea siempre, sea cual sea su turno
3. Revisa pendientes: ternos que turnos anteriores separaron para un cliente y a los que les falta algo (una compostura, un planchado)
4. Vende y alquila ternos y productos relacionados. Recepciona confecciones y servicios de lavandería o compostura
5. Revisa que los ternos del mostrador estén en buen estado. Si no: limpia, ordena, plancha o hace composturas simples — coser botones, subir o bajar basta, quitar hilos sueltos
6. Hace seguimiento a los ternos que **él mismo** separó o mandó a confeccionar
7. Envía su reporte de actividades del turno (limpieza + actividades), priorizando cumplir la mayor cantidad
8. Solicita lo que falta en tienda: productos de limpieza, agujas, hilo, arreglo de plancha, ternos, productos para vender
9. Manda los ternos sucios o en mal estado al almacén central
10. Cierra la tienda y apaga todo lo electrónico (turno tarde)

Detalles que importan para el sistema:
- Para confirmar si una confección o servicio es posible, hoy **consulta al almacén, al
  administrador o al inventario**. La meta es que lo consulte sólo a la base de datos.
- Puede **pedir prestado producto de otras tiendas o del almacén** para cerrar una venta.
- **Se premia vender varios productos en un mismo ticket**, no vender mucho en total. Eso es lo
  que hace comisionar más. *(Fórmula pendiente — ver `entrevista-dueno-2.md` N1.)*

### Cajero (a veces es el mismo vendedor)

- Está en caja y cobra
- Hace firmar el contrato a quien alquila
- Entrega boletas (notas de venta)
- Puede entregar el terno al cliente
- Explica al cliente las condiciones de alquiler o confección
- Registra todo en el sistema: producto, cliente, fecha de entrega, método de pago
- **Pide los requisitos de alquiler** (garantía, documentos) y vela por que el cliente devuelva lo alquilado

> **Sanción:** si un cliente no devuelve el alquiler, quien hizo de cajero **paga el costo del
> terno**. Hoy el sistema no registra esto. *(Ver `entrevista-dueno-2.md` N2.)*

### Encargado

Responsable de todo lo que pasa dentro de la tienda. Puede estar haciendo de vendedor, cajero o
refacción, pero si pasa algo grave se acude a él — o se le atribuye por no haber gestionado bien.

### Refacción / Planchado (en tienda, sólo cuando hay volumen)

Cuando hay mucha gente o es temporada, hay alguien dedicado a refaccionar lo que los vendedores
separan: si un cliente pide planchar o subir una basta, esta persona lo hace para que el vendedor
pueda seguir atendiendo.

> **No confundir con el almacén.** Cada tienda tiene su propia plancha, máquina de coser y
> materiales. Todos los colaboradores están capacitados para lo básico — subir bastas, planchar —
> justamente para no depender del almacén. Cuando no hay gente, lo hace el mismo vendedor.

### Operario / auxiliar de almacén

El layout del almacén está diseñado con áreas y separaciones para que se vea de un vistazo qué
ternos faltan planchar, cuáles falta codificar, cuáles necesitan compostura, cuáles están listos
para enviar a tienda, cuáles esperan control de calidad, cuáles perdieron una parte (saco o
pantalón), pantalones sueltos, ternos nuevos.

Su día:
1. Limpia el espacio del almacén al llegar
2. Hace su reporte de actividades del turno
3. Procesa ternos — todo menos costura compleja
4. Vela por que los ternos vuelvan y lleguen en buen estado
5. Recepciona los ternos que llegan de las tiendas y los deja **en su lugar**
6. Ordena y da apoyo a las tiendas en sus pedidos

> **El punto 5 es la clave del diseño.** Lo ideal es que todo quede en su sitio para que el turno
> siguiente sepa dónde se dejaron las cosas y qué hay que avanzar. **Eso es exactamente lo que el
> sistema tiene que reflejar**: el estado físico del almacén traducido a pantalla.

### Encargado de composturas

Hace lo mismo que un operario, pero además:
- Composturas complejas
- Confecciona piezas sencillas: chalecos, pañuelos, pantalones. **No hace el terno completo** —
  hace una parte del proceso, no entrega el producto final
- Ayuda a los vendedores con lo complejo

Hoy este rol lo cubre **Nicol** (confeccionista) y **Marilyn** (planchado, lavado, revisión).

### Encargado de confección

**Hoy no existe.** Lo gestiona el administrador. Las confecciones no se hacen desde cero acá: se
derivan a un tercero y los últimos detalles los hace el encargado de composturas.

### Administrador

Ve toda la empresa: administración, finanzas, logística. Suele estar en el almacén, pero muchas
veces no está presente. Sabe de todas las áreas — es confeccionista y sabe hacer composturas.

---

## El flujo de las prendas

### De tienda a almacén

**Antes:** cuando la canasta de prendas por enviar se llenaba, se hacía un checklist físico —
anotar código, color y demás de cada prenda — y se mandaba con el bulto. Era ineficiente: nadie
corroboraba que todo llegara bien ni que la tanda entera se lavara. Todo desordenado.

**Hoy:** con el SCI-LB viejo, la tienda envía las prendas sucias y sus códigos de forma digital al
pipeline. Después alguien del almacén pasa a recoger las limpias. Mapea mejor, pero **no es
automático**.

**Meta:** que el envío salga del inventario — los productos devueltos o los que hay que mandar al
almacén — sin que nadie tipee datos que el sistema ya tiene.

> **Decisión:** el envío manual desde tienda **se conserva** aunque llegue el sistema del otro
> programador. Le sirve al administrador para mapear el trabajo de las personas. Se automatiza
> recién cuando el inventario esté completo.

### De vuelta a tienda

El control de calidad está en lavandería y en teoría todo debería llegar bien. Si no: un vendedor
lo detecta al revisar antes de poner la prenda en el mostrador, lo reporta, y vuelve al almacén
para que lo corrijan. Si no tiene arreglo o es muy grave, se deriva al administrador.

### Flujos por tipo de prenda

**No todo pasa por los 9 pasos.**

| Prenda | Proceso |
|---|---|
| Ternos y chalecos | Pipeline completo |
| Zapatos de alquiler | Lavar o limpiar → lustrar → revisar (pasador bien, que brille) → enviar |
| Camisas de alquiler | Lavar → planchar → embolsar → enviar. **Se replancha en tienda** porque se dobla para embolsar. Si queda muy manchada, sale del inventario |
| Corbatas | Lavar → planchar. A veces coser, y eso lo puede hacer alguien de tienda |

---

## Pérdidas

Las prendas **no se pierden internamente** — eso prácticamente no pasa. Se pierden **por los
clientes**: no devuelven, o se les pierde a ellos.

- **5 a 8 al año** *(confirmado por el dueño, C4)*. La estimación previa de 1 a 3 por mes era
  entre 5 y 7 veces más alta que la realidad: **la pérdida de prendas no es el agujero principal
  del negocio.**
- Suelen ser sacos, pantalones, camisas o corbatas
- Representan un costo perdido, aunque a veces se compensa con los alquileres previos de esa prenda
- **El responsable paga el costo completo de la prenda**, se descuenta del sueldo, y el
  administrador decide si realmente fue responsable. **Si la prenda aparece, la sanción se
  revoca** *(N2, N3)*

---

## Qué duele hoy

**Lo que más plata hace perder** *(respuesta del dueño, A4 — define qué blindar primero)*:
1. **El control de inventario.** Se retienen productos, se estancan, no se ponen en su lugar
   (el mostrador). *Esto es del otro programador.*
2. **Que los colaboradores no hagan sus actividades.** *"Es requerido mapear bien las
   actividades."* **Esto es de este sistema, y ya existe: el problema es que nadie lo usa.**

**Lo que arreglaría si pudiera arreglar una sola cosa** *(A5)*: un inventariado de ternos más
rápido, y el mapeo correcto de los colaboradores.

**Lo que más tiempo hace perder:**
- Falta de comunicación en el equipo. No hay un sistema que mantenga a todos conectados sabiendo
  qué hacer.
- La gente se distrae porque **no sabe exactamente qué hacer cuando el administrador no está**
  para mandarles. La meta del sistema es indicarles su trabajo diario sin depender de él.
- **Falta una línea de carrera como incentivo** *(A3)*.
- El dueño quiere **jerarquizar**: supervisores o encargados, y comunicarse sólo con ellos en vez
  de con todos *(A3)*.

**Lo que se querría arreglar:**
- Reducir la rotación y la deserción de personal
- Mejorar la capacidad de contratación
- Mejorar el clima laboral: que la gente esté satisfecha con su trabajo
- Controlar el desempeño y poder distinguir a quién hace buen trabajo de quién no
- Controlar mejor los sueldos y los procesos

**Lo que hoy vive fuera del sistema:**
- **Los sueldos, en Excel**
- **Los horarios, en Excel** *(N8)*
- **Las prendas para dar de baja** *(A6)*
- Los proveedores, en un bloc de notas y en WhatsApp *(probablemente le corresponda al otro programador)*

El resto ya está digitalizado.

---

## Ya respondido por el administrador

La segunda ronda de preguntas se respondió el 13-ago-2026. Todo está en
**[respuestas-dueno-2.md](respuestas-dueno-2.md)**: puntos del pipeline, urgencias, tipos de
prenda, Valores 360°, horarios, sanciones, meta de puntos y las 9 preguntas de sueldos.

**Lo único que quedó sin responder:** qué se le descuenta a alguien del sueldo (S4). La pregunta
quedó en blanco en el PDF.

---

_Fuente: respuestas de Alexander al cuestionario del 13-ago-2026 (operación diaria) más las
respuestas del dueño a la segunda ronda._
