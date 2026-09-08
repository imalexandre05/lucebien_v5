# Mi Talla — Medición corporal asistida por IA para LuceBien

**Fecha:** 2026-08-13 · **Estado:** validado con investigación técnica (workflow 6 agentes, fuentes primarias)
**Repo destino del código:** `LB-Web` (Next.js, Vercel) · **Este doc vive en:** SCI-LB/docs (repo de planificación)

---

## 1. Propósito

Que un cliente de LuceBien conozca sus medidas corporales y su talla de terno
sin ir a la tienda, y que esa información sirva para: (a) reservar con menos
cambios de talla, (b) captar clientes desde la web, (c) acelerar la ficha del
sastre en tienda, y (d) construir un historial de medidas por cliente que a
futuro alimente confección y disponibilidad de inventario.

**Meta de largo plazo declarada por Alexander:** llegar a un motor de visión
(fotos/video → medidas) propio o de proveedor, con precisión suficiente para
recomendar talla con confianza. El motor estadístico inicial es el andamio que
lo hace posible: entrega valor el día 1 y produce la vara contra la cual se
mide el motor de visión. La investigación de proveedores (§ 11.5) refuerza esta
estrategia: el mercado comercial quedó fuera del alcance de una PyME
(entrada real 3DLOOK: USD 499/mes) o murió.

### Lo que este proyecto NO es

- **No corta tela.** El estado del arte académico con 2 fotos guiadas + altura
  + peso es MAE ≈ 1.5 cm en laboratorio (BMnet, Amazon Science); la tolerancia
  de sastrería es 1–1.5 cm y el propio error entre medidores expertos es
  1.2 cm. La confección a medida sigue requiriendo cinta en tienda. El módulo
  entrega *pre-medidas* y talla sugerida — y los saltos de talla de saco son
  ~5 cm de pecho, así que para talla sí alcanza.
- **No depende del inventario comercial.** Ese sistema lo hará otro proveedor
  (decisión 13-ago-2026). Aquí se define el contrato de datos para conectarlo
  cuando exista (§9).

## 2. Decisiones ya tomadas (con Alexander, 13-ago-2026)

| Tema | Decisión |
|---|---|
| Estrategia | B (estadístico) primero → A (visión propia) encima → C (proveedor) solo si A no converge |
| Ubicación del código | LB-Web (Next.js). SCI-LB no se toca |
| Persistencia | Supabase Postgres proyecto `scilb` + Storage; fuente de verdad de medidas. ERP lee por API si algún día lo necesita, nunca al revés |
| Presupuesto | S/0 preferido; pagar lo mínimo solo si self-hosted se queda corto |
| Identidad pública | Anónimo + guardar opcional creando cuenta (Supabase Auth) |
| Captura en taller | Celulares del personal, iOS **y** Android, vía navegador |
| Consentimiento | Digital en la app (checkbox + nombre + DNI + timestamp); sin consentimiento no se guarda imagen |
| Sede piloto F2 | LB — Calle Real 380 |
| Entrada de medición pública | Escalera: formulario primero, foto/video como upgrade opcional |

## 3. Arquitectura

Todo motor detrás de una interfaz; la UI no sabe cuál corre.

```
LB-Web/lib/medidas/
  tipos.ts          Medidas, EntradaMedicion, ResultadoMedicion, Confianza, VectorRasgos
  motor.ts          interfaz MotorDeMedidas + selección por config
  motores/
    estadistico.ts  B — regresión ANSUR II recalibrada; cliente y servidor
    vision.ts       A — MediaPipe en navegador; solo cliente
    proveedor.ts    C — API externa; stub hasta F5
  calibracion.ts    factores k por medida, versionados (cal-YYYY-MM-lb-vN)
  tallas.ts         medidas → talla sugerida + alternativa (lógica pura, testeable)
```

### Contrato de datos

```ts
interface Medidas {
  altura_cm: number; pecho_cm: number; cintura_cm: number; cadera_cm: number
  hombros_cm: number; manga_cm: number; largo_saco_cm: number; entrepierna_cm: number
}

/** ±cm esperado por medida. Sin esto la UI no puede ser honesta. */
type Confianza = { global: number; porMedida: Partial<Record<keyof Medidas, number>> }

interface MotorDeMedidas {
  id: 'estadistico' | 'vision' | 'proveedor'
  requiere: 'formulario' | 'formulario+imagenes'
  estimar(entrada: EntradaMedicion): Promise<ResultadoMedicion>
}

interface ResultadoMedicion {
  medidas: Medidas
  confianza: Confianza
  motor: MotorDeMedidas['id']
  versionCalibracion: string
}

/** Rasgos derivados de la imagen; NO identifican a la persona. */
interface VectorRasgos {
  landmarks: [number, number, number][]   // 33 puntos pose, normalizados
  anchoFrontal: Record<string, number>    // px normalizados por altura
  profundidadLateral: Record<string, number>
  calidadPose: number
}
```

### Reglas invariantes

1. **La estimación nunca se sobreescribe con la medida real.** Se guardan ambas.
   El par estimación⟷cinta es el dataset de calibración — el activo del proyecto.
2. **Todo resultado lleva `motor` + `versionCalibracion`.** Permite comparar
   motores con números, no opiniones.
3. **En el flujo público las imágenes nunca salen del dispositivo.** MediaPipe
   corre en WASM en el navegador; al servidor sube solo el objeto `Medidas` +
   opcionalmente `VectorRasgos`. No existe endpoint público que acepte fotos.
4. **Nada de procesamiento de video en tiempo real.** Todo el pipeline de
   visión opera sobre frames sueltos (fotos, o frames extraídos de un video
   grabado). Elimina de raíz los problemas de FPS/throttling de Safari iOS
   (§ 11.1) y simplifica el motor.

## 4. Superficies

| Superficie | Ruta | Quién | Motor | Persiste |
|---|---|---|---|---|
| Medición pública | `/mi-talla` | cualquiera, anónimo | estadístico (F1) → visión (F4) | números; solo si el usuario opta por guardar |
| Taller | `/taller/medir` | sastre con login | captura + cinta (F2); visión (F3) | números + vector + imágenes (con consentimiento) |
| Ficha cliente | `/cuenta` | cliente con cuenta | — | historial de mediciones |

### Flujo público (escalera)

1. **Paso 1 — 10 segundos, sin cámara:** altura, peso, edad, sexo/contextura.
   Devuelve talla sugerida + alternativa + medidas estimadas con su ±cm.
   CTA: reservar / visitar tienda / guardar mi talla.
2. **Paso 2 — opcional, desde F4:** "¿Más precisión? Tómate 2 fotos o un video
   corto." Guía de captura en pantalla (ropa ceñida, fondo despejado, celular
   vertical apoyado, frontal + perfil; el patrón validado por la literatura es
   exactamente 2 fotos guiadas + altura y peso declarados). Procesa en el
   dispositivo, refina las medidas. Antes de F4 el paso 2 no se muestra.
3. **Guardar:** `signInAnonymously` al iniciar → el visitante ya tiene
   `auth.uid()` estable; "guardar mi talla" = convertir a cuenta permanente
   (`updateUser` con email + OTP, o `linkIdentity` OAuth) — mismo uid, sus
   mediciones quedan suyas sin migración (§ 11.3).

### Flujo taller (F2)

1. Sastre abre `/taller/medir` en su celular, busca/crea cliente.
2. Pantalla de consentimiento digital (checkbox + nombre + DNI). Si no acepta:
   solo se guardan números y vector, jamás imagen.
3. Captura frontal + lateral (o video giro corto). La app extrae y guarda
   `VectorRasgos` en el momento. **Regla de implementación iOS:** la captura
   vive en una sola ruta sin navegación SPA intermedia (cambiar el path con
   `pushState` mata el stream de cámara en iOS ≤17.3) y el procesamiento corre
   en el hilo principal (tasks-vision no soporta Web Workers en iOS, § 11.1).
4. Sastre mide con cinta como siempre y digita las medidas reales. El
   protocolo de cinta del taller define cintura = cintura natural de sastre
   (la diferencia con la definición omphalion de ANSUR II la absorben los
   factores de calibración, § 11.2).
5. Se guarda el par `medicion` (estimada) + `medicion_real` (cinta).

## 5. Persistencia (Supabase `scilb`)

Implementado en las migraciones **0068** (esquema, prefijo `mt_` para no
colisionar con las 53 tablas del ERP en el mismo proyecto), **0069** (bucket
`mi-talla` + policies de storage) y **0070** (endurecimiento tras el
verificador: aislamiento por sede/origen, timestamps no insertables, tamaños
acotados).

```sql
-- estimación del motor; inmutable una vez creada
mt_medicion (
  id uuid pk, cliente_id uuid null,          -- auth.uid() (anónimo o permanente)
  cliente_nombre text null, cliente_dni text null,  -- solo origen taller
  motor text, version_calibracion text,
  entrada jsonb,                             -- formulario: altura, peso, edad, sexo
  medidas jsonb, confianza jsonb,
  vector_rasgos jsonb null,
  origen text check (origen in ('web','taller')),
  sede text null, creada_en timestamptz default now()  -- no insertable (0070)
)

-- verdad de cinta métrica; tabla aparte a propósito
mt_medicion_real (
  id uuid pk, medicion_id uuid fk,
  tomada_por uuid,                           -- sastre (auth.users)
  medidas jsonb, observacion text null, tomada_en timestamptz default now()
)

-- consentimiento explícito, Ley 29733
mt_consentimiento (
  id uuid pk, nombre text, dni text,
  texto_version text, registrado_por uuid, aceptado_en timestamptz, sede text
)

-- solo taller, siempre con consentimiento
mt_medicion_imagen (
  id uuid pk, medicion_id uuid fk,
  storage_path text,                         -- bucket privado
  vista text check (vista in ('frontal','lateral','video')),
  consentimiento_id uuid fk not null,
  borrar_despues_de date not null            -- default +24 meses, no insertable
)

-- tallas y umbrales editables (lectura pública, escritura admin)
mt_config (clave text pk, valor jsonb, descripcion text)
```

**Patrón de acceso (validado contra doc oficial, § 11.3; RLS final en 0070):**

- Visitante web: `signInAnonymously` + Cloudflare Turnstile (anti-abuso) →
  RLS `with check (cliente_id = auth.uid())` para INSERT (tope 20/día por
  uid), `using (cliente_id = auth.uid())` para SELECT. Rol `anon` puro no
  inserta nada.
- Sastre: **empleado ACTIVO del ERP** (`private.app_es_empleado()`, mismo
  usuario Supabase que ya tiene; login en /taller con su código +
  contraseña) → SOLO mediciones de `origen='taller'` de SUS sedes
  (`private.app_sedes()`); admin/dueño ve todo. No existe rol nuevo.
- **Keys nuevas desde el día 1:** `sb_publishable_...` (cliente) y
  `sb_secret_...` (servidor). Las legacy anon/service_role quedan deprecadas
  a fines de 2026 — nacer con ellas es nacer con deuda.
- Auth por email OTP/magic link requiere **SMTP propio** (Resend o similar; el
  integrado permite 2 emails/hora). SMS OTP descartado: ~USD 0.25/SMS a +51.
- **Keep-alive:** el free tier se pausa tras ~1 semana sin actividad. Cron
  diario (GitHub Action o pg_cron) hasta que haya tráfico real; si el negocio
  lo justifica, Pro USD 25/mes.

**Imágenes:** bucket privado (AES-256 en reposo incluido), RLS sobre
`storage.objects`, URLs firmadas de 5–15 min generadas server-side, límite
free 50 MB/archivo y 1 GB total → fotos comprimidas (~200–500 KB c/u), video
solo si se comprime o se descartan frames tras extraer el vector. Retención
con `borrar_despues_de` + job de limpieza.

## 6. Motores

### Motor estadístico (F1)

Regresión lineal por sexo sobre ANSUR II (dominio público, uso comercial
permitido; 4 082 hombres + 1 986 mujeres, 93 medidas — § 11.2):
`altura + peso + BMI + interacción altura·peso → pecho, cintura, cadera,
hombros, manga, largo, entrepierna`. Réplica del diseño de Bartol et al. 2022
(Sensors 22(5):1885), cuya precisión publicada con entradas autorreportadas es:

| Medida | MAE esperado |
|---|---|
| pecho | ≈ 2.9 cm |
| cintura | ≈ 3.8 cm |
| cadera | ≈ 2.2 cm |

Los coeficientes se calculan offline (script en `tools/`) y se embeben como
constantes en `estadistico.ts` — sin servicio, sin latencia, corre también en
servidor. Trampas documentadas en el código: CSV en **milímetros**,
`weightkg` en **hectogramos** (855 = 85.5 kg), `waistcircumference` medida en
el ombligo (omphalion), `sleevelengthspinewrist` es espina–muñeca. Los CSV se
descargan por **https** (el enlace http publicado está roto) y se archiva
copia propia en backup — el dominio público lo permite.

Sesgo conocido: población militar de EE. UU. (más alta, más joven, menos
obesa que la civil; y que la población andina, con proporciones tronco/pierna
distintas) → sobreestimará tallas sin corrección. Corrección en dos niveles:
(1) offset global contrastando la distribución talla/peso/perímetro abdominal
local con microdatos públicos ENDES-INEI; (2) recalibración con los pares del
taller cuando existan (mismo mecanismo `versionCalibracion` que usará visión).
Precisión esperada peor en mujeres (menos muestra, más variación — la UI
comunica el ±cm por medida, no promete magia).

### Motor de visión (F3)

Librería: `@mediapipe/tasks-vision` **1.0.1+** (Apache 2.0; salió de la serie
0.10.x congelada en jul-2026). Decisiones fijadas por la investigación (§ 11.1):

- **Pose:** Pose Landmarker, modelo **full** (9.4 MB; lite 5.8 MB como
  fallback para conexiones lentas). 33 landmarks.
- **Silueta:** Image Segmenter con **selfie_segmenter binario (0.25 MB)** —
  máscara persona/fondo basta; el multiclass (16.4 MB, ~218 ms CPU) no aporta.
- **Delegate:** GPU (WebGL2) donde funcione; **CPU forzado para segmentación
  en iOS Safari** (issue #6142 abierto: GPU revuelve categorías en iOS). Como
  todo es frame-a-frame, CPU alcanza de sobra.
- **Carga:** lazy — el runtime WASM (~11.8 MB) + modelos se descargan solo al
  entrar al paso 2 / flujo taller, con spinner honesto (primera carga puede
  tardar decenas de segundos; issue #5171) y precacheo Cache API con
  validación (issue #4539: caché corrupta crasheaba en iOS — cache con
  fallback a red).
- **Escala:** altura declarada ÷ píxeles corona–talón.
- **Contornos:** ancho frontal + profundidad lateral a la altura anatómica de
  cada medida → perímetro por **esquema adaptativo Ramanujan** validado por la
  literatura (Montazerian & Fol Leymarie, 3DBODY.TECH 2022): eje mayor ≤ 3×
  eje menor → Ramanujan I; más achatado → Ramanujan II con
  `h = ((a−b)/(a+b))²` (la forma exacta importa: circula mal transcrita).
  Superelipse descartada: no existe exponente estándar publicado.
  Encima, factor k por medida aprendido del dataset del taller. Referencia de
  techo: ese esquema + corrección reporta 0.6–0.8 cm vs cinta en laboratorio.
- **Video:** se graba con MediaRecorder y se descomponen frames offline; se
  eligen mejor frontal y mejor perfil por score de pose. Nunca streaming.
- **Largos** (manga, largo de saco, entrepierna): directo de landmarks ×
  escala, sin elipse.

Nota de licencia: el paquete npm es Apache 2.0 confirmado; los archivos de
modelo `.task` no llevan licencia explícita adjunta (evidencia indirecta los
trata como Apache 2.0). Riesgo bajo, documentado (§12).

Plan B si MediaPipe falla en iOS en la práctica: **ONNX Runtime Web**
(desarrollo activo, WebGPU en Safari 26; requiere armar pre/post-procesamiento
propio). TensorFlow.js descartado: pose-detection sin releases desde 2023.

### Motor proveedor (F5, contingencia)

El mercado 2026 casi elimina esta vía (§ 11.5): 3DLOOK entrada real
USD 499/mes sin API; MySize sin precios públicos y app deslistada; Bold
Metrics enterprise-only y sin fotos; Presize (Meta) y Meepl muertas. Única
opción <USD 100: **TrueToForm** USD 40/mes (10 escaneos, sin API, app iOS).
Uso plausible: piloto de 5 escaneos gratis para benchmark contra el motor
propio y la cinta. La interfaz `MotorDeMedidas` deja el enchufe listo, pero
F5 se considera improbable — razón adicional para que A converja.

## 7. Tallas (`tallas.ts`)

Sistema de salida alineado al retail peruano (§ 11.4): **pantalón en pulgadas
US** (28–38, por cintura); **saco en pulgadas US de pecho** (34–52 pares) con
equivalencia a letras XS–XL y EU (=US+10) en tablas de conversión editables.

Algoritmo:

1. Talla de saco = pecho en pulgadas redondeado al par superior + largo
   S/R/L por estatura.
2. Corte por drop corporal (pecho − cintura): **≥7 slim · 5–6 regular · ≤4
   executive** — umbrales en config editable (varían por marca; filosofía
   "todo configurable").
3. Pantalón por cintura en pulgadas US; la basta es el ajuste barato y se
   asume siempre.
4. **Entre dos tallas: primero filtra el hombro (tolerancia ±1 cm), y de las
   que asientan, la mayor.** El hombro manda porque es la alteración
   imposible; el pecho del saco solo se ajusta ~1.3 cm. Nunca "la mayor" a
   ciegas.
5. Devuelve siempre: talla sugerida + alternativa + **qué medida mandó la
   decisión** (transparencia para el sastre y para la UI).

Tablas semilla desde la actual `TallasGuia.tsx` de LB-Web, movidas a config.

## 8. Fases

| Fase | Entrega | Criterio de avance |
|---|---|---|
| **F0 Contrato** | tipos, interfaz, `tallas.ts` + tests; descarga y archivo de ANSUR II | lógica pura aprobada en tests |
| **F1 Estadístico** | regresión entrenada + `/mi-talla` público + Supabase (schema, RLS, anónimo→cuenta) | en producción en Vercel |
| **F2 Taller** | `/taller/medir` en sede LB: captura con extracción de `VectorRasgos` + consentimiento + cinta (MediaPipe ya corre aquí, pero solo extrae rasgos; aún no estima) | ≥80 pares foto⟷cinta (señal), ≥250 (confianza) |
| **F3 Visión v1** | motor calibrado, evaluado offline contra `medicion_real` | MAE por medida publicado internamente |
| **F4 Publicación** | visión reemplaza a estadístico en `/mi-talla` paso 2 | MAE(visión) < MAE(estadístico) en pecho **y** cintura |
| **F5 Proveedor** | benchmark TrueToForm (5 escaneos gratis) o integración | solo si F4 no se alcanza con el dataset completo |

A ~10 clientes/día medidos en sede LB, F2 tarda ~1 mes de captura constante.
**Riesgo principal del proyecto:** si el sastre no captura, todo se queda en
F1. Mitigación: la captura debe costar <60 s por cliente y estar dentro del
flujo que el sastre ya hace (la cinta la toma igual); el dueño debe respaldar
el hábito.

## 9. Conexión con el inventario — IMPLEMENTADA (corrección del 15-ago-2026)

> **Corrección.** La versión anterior de esta sección decía que el inventario
> no existía y dejaba la conexión como contrato futuro. Era falso: se escribió
> contra la nota del 13-ago sobre el cambio de alcance, sin verificar la base.
> Exactamente el error que prohíbe el no-negociable 7. Verificado el
> 15-ago-2026 contra `scilb`: **`inventario_activo` existe**, con `talla`,
> `color`, `estado`, `sede_cod`, precios, `foto_url`, `publicable` y
> `descripcion_publica`; y una vista interna `v_activo_disponible` que ya
> calcula el bloqueo por pieza hermana.

**Lo que el dueño quería desde el principio** (confirmado por Alexander el
15-ago): el cliente se mide en la web, ve qué hay disponible **en su talla**,
reserva, y el pedido aterriza en SCI-LB para preparar la prenda. La medición
no es un fin: es la puerta del catálogo.

Implementación (migración **0074**): la vista `v_catalogo_publico` expone al
rol `anon` un subconjunto explícito de `inventario_activo` — solo filas
`publicable = true`, `estado = 'disponible'` y sin pieza hermana alquilada; y
solo columnas públicas. **No** expone `precio_base` (costo interno) ni
`usos_acumulados` (desgaste). Las policies del ERP (`inv_select`/`inv_write`,
que limitan todo a admin o empleado de la sede) quedan intactas: la web lee la
vista, nunca la tabla.

Encaje afortunado: `inventario_activo.talla` guarda pulgadas US (`'38'`,
`'40'`, `'42'`), el mismo formato que produce `tallas.ts`. Sin traducción.

En LB-Web, `lib/supabase/catalogo.ts` busca por talla y `DisponibleEnTuTalla`
lo muestra bajo el resultado. Regla del filtro (con test): el número significa
cosas distintas según la prenda — 40 es pecho en un saco y cintura en un
pantalón —, así que jamás se ofrece un pantalón de cintura 40 a quien usa saco
40 (le corresponde 34).

**Lo que falta y no es código:** hoy `inventario_activo` tiene 4 filas de
prueba y ninguna con `publicable = true`, sin fotos ni descripciones. Mientras
no se cargue stock real desde el ERP, la web dice con honestidad "todavía no
tenemos el catálogo publicado en línea" e invita a la tienda.

**Pendiente para asignación fina:** el hombro por prenda. Hoy el inventario
guarda talla nominal pero no medidas reales de cada saco; el filtro duro de
hombro (§7) no puede aplicarse hasta que existan. Ese sigue siendo el pedido
al dueño de la tabla.

## 10. Métricas

- **Del motor:** MAE por medida, por motor, por `versionCalibracion`, contra
  `medicion_real`. Query SQL directa, sin tooling extra.
- **De negocio:** % de reservas con talla correcta al llegar a tienda; nº de
  mediciones web/mes; % que pasa de medición a reserva.

## 11. Resultados de la investigación técnica (13-ago-2026)

Workflow de 6 agentes con verificación adversarial del frente crítico iOS
(veredicto: parcial — núcleo confirmado, correcciones integradas aquí).
Registro completo: journal del workflow `wf_f1af3dac-286`.

1. **MediaPipe web:** tasks-vision 1.0.1 (31-jul-2026), Apache 2.0. Corre en
   Safari iOS (SIMD desde 16.4, fallback no-SIMD automático). GPU delegate =
   WebGL2 (WebGPU ni se usa ni hace falta). Segmentación GPU rota en iOS
   (#6142, abierto) → CPU. Sin Web Workers en iOS (#5292). Primera carga
   lenta (#5171) y caché de modelo frágil en iOS (#4539). getUserMedia iOS:
   `pushState` mataba la cámara (fix feb-2024), segunda gUM con otra cámara
   detiene la primera por diseño. Descarga peor caso ~21.5 MB.
   No hay benchmark oficial de FPS móvil — irrelevante con pipeline
   frame-a-frame.
2. **ANSUR II:** CSVs verificados (https, 4 082 M + 1 986 F, 108 columnas),
   dominio público con uso comercial. Todas las columnas necesarias
   existen. MAE de regresión publicado (Bartol 2022): 2.4–3.8 cm hombres.
   No hay microdato público peruano con pecho/cadera; ENDES-INEI da
   talla/peso/perímetro abdominal para contraste local.
3. **Supabase:** patrón oficial `signInAnonymously` (rate limit 30/h/IP,
   CAPTCHA recomendado) + RLS por `auth.uid()` + conversión a cuenta con el
   mismo uid. Keys nuevas obligatorias (legacy deprecadas fin 2026). Email
   OTP necesita SMTP propio; SMS caro. Free: 500 MB BD, 1 GB storage,
   50 MB/archivo, pausa tras ~1 semana inactiva (keep-alive o Pro $25).
4. **Tallaje:** talla saco = pecho en pulgadas (pares) + S/R/L; EU = US+10;
   Perú mezcla sistemas (pantalón casi siempre pulgadas US). Drop clasifica
   el corte, umbrales varían por marca → config. Entre tallas manda el
   hombro. Perímetro: Ramanujan adaptativo I/II, superelipse sin respaldo.
   Estado del arte foto: MAE ~1.5 cm (2 fotos lab); 1 foto casual 4–5× peor.
5. **Proveedores:** mortandad alta (Meepl †, Presize→Meta, Aistetic pivotó);
   3DLOOK $499/mes real; TrueToForm $40/mes única <$100, sin API. Claims de
   precisión de vendors = marketing sin metodología.

## 12. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Sastre no captura pares en F2 | proyecto muere en F1 | captura <60 s, respaldo del dueño, meta visible (80/250) |
| Fricción iOS Safari (caché, workers, gUM) | F2/F3 inestables en iPhone | reglas de implementación fijadas (§4, §6): frame-a-frame, sin workers, sin navegación SPA en captura, caché con fallback; plan B ONNX Runtime Web |
| Filtración de imágenes corporales | daño legal (Ley 29733) y reputacional | imágenes solo taller + consentimiento, bucket privado AES-256, URLs firmadas 5–15 min, retención con borrado, vector como alternativa sin imagen |
| Sesgo ANSUR II (militar EE. UU. vs andino) | tallas sobreestimadas en F1 | offset con ENDES-INEI, ±cm visible en UI, recalibración con pares del taller, regla "la mayor que asiente del hombro" |
| Error mayor en mujeres | sugerencias peores para clientas | comunicado en UI; priorizar recalibración femenina si el negocio lo pide |
| Licencia de modelos .task sin confirmación oficial | riesgo legal bajo | documentado; evidencia indirecta Apache 2.0; alternativa ONNX si cambiara |
| Supabase free se pausa por inactividad | web deja de guardar en silencio | keep-alive diario programado; upgrade Pro $25/mes si hay tráfico |
| Spam de inserciones anónimas | BD llena de basura | Turnstile + rate limits de Supabase + constraints |
| Alcance: inventario no existe | "ver disponibilidad" no se puede cumplir aún | §9 define el contrato; la promesa de UI en F1 es talla, no stock |

## 13. Fuentes principales

- MediaPipe: registry npm 1.0.1 · issues #6142, #6296, #5171, #5292, #4539 ·
  webkit.org/blog/13966 (SIMD 16.4) · WebKit PR #24971 (gUM/pushState)
- ANSUR II: openlab.psu.edu/ansur2 (CSV https verificados) · Gordon et al.
  2014 NATICK/TR-15/007 · Bartol et al. 2022, Sensors 22(5):1885
- Contornos: Montazerian & Fol Leymarie, 3DBODY.TECH 2022 (DOI 10.15221/22.12)
  · BMnet arXiv 2210.05667 · SHAPY CVPR 2022
- Supabase: docs auth-anonymous · api-keys · rate-limits · free-project-pausing
  · storage serving/downloads · supabase.com/security · supabase.com/pricing
- Tallaje: oliverwicks.com/article/suit-size · tiendasadams.com.pe (asesor
  tallas) · tiendasel.com · johnholden.com.pe
- Proveedores: 3dlook.ai/pricing · truetoform.fit/pricing · crunchbase
  (Presize/Meta) · meepl.com (dominio en venta)
