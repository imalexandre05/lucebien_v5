# Prompt para Claude de Producción — Corrección de datos reales en LuceBienWeb

---

## CONTEXTO

Estás trabajando en el proyecto **LuceBienWeb** (Next.js 14 + TypeScript + CSS Modules), el e-commerce de **LUCEBIEN / CASA DE LOS TERNOS**, empresa de alquiler y venta de ternos formales masculinos con sede en **Huancayo, Perú**.

El proyecto fue construido con datos de empresa completamente inventados. Ahora tenemos los datos reales y necesitas hacer los reemplazos en el código.

**Ruta del proyecto:** `C:\Users\...\LuceBienWeb` (la ruta donde tienes el proyecto)

---

## DATOS REALES DE LA EMPRESA (fuente: documentos internos de la empresa)

### Identidad
- **Nombre comercial:** LUCEBIEN / CASA DE LOS TERNOS
- **Ciudad:** Huancayo, Perú (NO Arequipa — ese dato estaba inventado)
- **Rubro:** Alquiler, venta y confección de ternos y formalwear masculino

### Sedes (3 tiendas + 1 almacén)
| ID | Nombre | Dirección real | Tipo |
|----|--------|----------------|------|
| LB | Lucebien | Real 380, cerca a 2 de Mayo | Tienda principal |
| ST | Stand 101-102 | Real 326, galería La Casa de los Ternos, cerca a 13 de Noviembre | Tienda |
| TR | Trece | [sin dirección exacta aún — dejar como `"Huancayo, Perú"`] | Tienda / Almacén secundario |
| — | Almacén Central | [no es sede de atención al cliente — no mostrar en web] | Solo interno |

### Servicios reales que ofrece la empresa
1. Alquiler de ternos
2. Venta de ternos (nuevos y usados)
3. Confección a medida
4. Refacción y compostura de prendas
5. Planchado
6. Accesorios (corbatas, moños, pañuelos, mancuernillas)

### Teléfonos / redes
- Los números de teléfono reales no están confirmados aún. **Deja los placeholders como están** (`+51 999 999 999`) pero marca cada uno con un comentario `// TODO: reemplazar con número real de sede`.
- WhatsApp en env: `NEXT_PUBLIC_WHATSAPP=51999999999` — mantener.
- Instagram/Facebook handles: no confirmados. Mantener las URLs actuales pero cambiar el dominio de `.pe` a `.ternos` o dejarlo como está — **no inventar nuevos**.

---

## ERRORES ESPECÍFICOS A CORREGIR

### CRÍTICOS (ciudad equivocada — Arequipa en vez de Huancayo)

**Archivo: `lib/data.ts`**
- Líneas 3-25: Las 3 sedes tienen `dirección: "Arequipa, Perú"` → cambiar a:
  - Sede LB → `"Real 380, Huancayo · cerca a 2 de Mayo"`
  - Sede ST → `"Real 326, Huancayo · Galería La Casa de los Ternos"`
  - Sede TR → `"Huancayo, Perú"`
- Línea 188: Banner `"Envíos a todo Arequipa · Reserva en línea y prueba en tienda"` → cambiar a `"Tres sedes en Huancayo · Reserva en línea y prueba en tienda"`

**Archivo: `components/home/LocalBusinessJsonLd.tsx`**
- Línea 25: Descripción de Schema.org dice `"en Arequipa"` → cambiar a `"en Huancayo"`
- Línea 36: priceRange mantener tal como está (S/ 40 – S/ 1100)

**Archivo: `components/layout/Footer.tsx`**
- Línea 50-51: `"Alquiler y venta de trajes formales en Arequipa. Décadas de oficio, tres tiendas a tu disposición."` → cambiar a `"Alquiler, venta y confección de ternos formales en Huancayo. Tres tiendas a tu disposición."`

**Archivo: `app/layout.tsx`**
- Línea 37: Metadata `"LuceBien — Para la Ocasión"` → cambiar a `"LUCEBIEN — Casa de los Ternos"` (o mantener el tagline si se prefiere)

### MODERADOS (referencias inventadas sobre antigüedad)

**Archivo: `components/home/WhySection.tsx`**
- Línea 13: `"30+"` años de oficio → cambiar a `"+"` sin número específico, o simplemente el valor de la stat a `"10+"` (es un placeholder más conservador hasta confirmar dato real). El label `"Años de oficio"` puede mantenerse.

**Archivo: `app/nosotros/page.tsx`**
- Línea 49: `"Hace décadas abrimos nuestra primera tienda"` → cambiar a `"Nació con la misión de vestir los momentos más importantes de Huancayo"`
- Líneas 15-36, valores de la empresa — el valor "Orgullo local" dice `"Arequipa. Perú. No imitamos, vestimos a nuestra ciudad."` → cambiar a `"Huancayo. Perú. No imitamos, vestimos a nuestra ciudad."`
- El valor "Confianza artesanal" dice `"Manos arequipeñas"` → cambiar a `"Manos huancaínas"`

**Archivo: `app/sedes\page.tsx`**
- Líneas 20-24: equipos por sede (`equipo: 6`, `equipo: 4`, `equipo: 5`) → **no tenemos datos reales, cambiar a `equipo: null` y ocultar ese dato en el render** (comentar la línea del JSX que muestra el número de equipo, con `{/* TODO: dato de equipo pendiente */}`).

### MENORES (datos placeholder que se quedan hasta confirmar)
- Precios de productos mock: **mantener** — son datos de ejemplo hasta conectar con ERP real.
- Productos mock (8 prendas en lib/data.ts): **mantener** — son datos de catálogo de demostración.
- Testimonios/reseñas mock: **mantener** — datos de demostración.
- Teléfonos +51 999 999 9XX: **mantener pero agregar comentario TODO** en cada uno.
- Redes sociales (@lucebien.pe): **mantener** — no tenemos handles reales confirmados.

---

## NUEVO ARCHIVO A CREAR

Crea el archivo `lib/empresa.ts` con las constantes reales de la empresa para que futuras referencias usen este único punto de verdad:

```typescript
// Datos reales de LUCEBIEN / CASA DE LOS TERNOS
// Actualizar aquí cuando cambien — no hardcodear en componentes

export const EMPRESA = {
  nombre: 'LUCEBIEN',
  nombreCompleto: 'LUCEBIEN / CASA DE LOS TERNOS',
  tagline: 'Casa de los Ternos',
  ciudad: 'Huancayo',
  pais: 'Perú',
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP ?? '51999999999',
  web: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lucebien.com',
  // TODO: confirmar handles reales de redes sociales
  instagram: 'https://instagram.com/lucebien.pe',
  facebook: 'https://facebook.com/lucebien.pe',
} as const

export const SEDES = [
  {
    id: 'LB',
    nombre: 'Lucebien',
    direccion: 'Real 380, Huancayo · cerca a 2 de Mayo',
    referencia: 'Cerca a 2 de Mayo',
    tipo: 'tienda-principal',
    // TODO: confirmar teléfono real
    telefono: '+51 999 999 999',
  },
  {
    id: 'ST',
    nombre: 'Stand 101-102',
    direccion: 'Real 326, Huancayo · Galería La Casa de los Ternos',
    referencia: 'Cerca a 13 de Noviembre',
    tipo: 'tienda',
    // TODO: confirmar teléfono real
    telefono: '+51 999 999 998',
  },
  {
    id: 'TR',
    nombre: 'Trece',
    direccion: 'Huancayo, Perú',
    referencia: '',
    tipo: 'tienda-almacen',
    // TODO: confirmar dirección y teléfono real
    telefono: '+51 999 999 997',
  },
] as const

export type SedeId = typeof SEDES[number]['id']
```

---

## PASOS A EJECUTAR

1. Corregir todos los archivos listados arriba (en el orden: `lib/data.ts` primero, luego componentes)
2. Crear `lib/empresa.ts` con las constantes reales
3. Verificar que el proyecto compila sin errores: `npm run build` (o `npm run dev` y revisar visualmente)
4. Corregir cualquier error de TypeScript que aparezca
5. Hacer commit con el mensaje:
   ```
   fix(empresa): reemplazar datos inventados con información real de Lucebien
   
   - Ciudad: Arequipa → Huancayo en todos los archivos
   - Sedes: direcciones reales (Real 380, Real 326 galería La Casa de los Ternos)
   - Descripción, tagline y copy actualizado a datos reales
   - Crear lib/empresa.ts como punto de verdad único
   - Marcar teléfonos/redes con TODO hasta confirmar datos reales
   ```
6. Push a `origin main`:
   ```bash
   git push origin main
   ```
7. Confirmar el SHA del commit con `git log --oneline -1` y reportarlo

---

## DESPUÉS DE HACER PUSH

La computadora ASUS hará `git pull` para sincronizar los cambios. No necesitas hacer nada más.

---

## RESTRICCIONES IMPORTANTES

- **NO inventar datos nuevos** — si no tenemos el dato real, usa placeholder o `null`
- **NO cambiar precios** — los precios son de demostración hasta conectar el ERP real
- **NO tocar archivos de lógica** (`carritoStore.ts`, `api.ts`, rutas de App Router, etc.)
- **NO modificar el CSS ni el diseño visual**
- **Solo corregir texto de datos de empresa** según las instrucciones de arriba
