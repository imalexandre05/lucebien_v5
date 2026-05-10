# FIX #14 · 32 console.log/warn/error sueltos en código de producción

## Contexto

Hay 32 invocaciones a `console.X` en archivos JS frontend. Algunas son
útiles (logs de carga `[LuceBien] X cargado`), otras son ruido en la
consola del navegador en cada navegación.

## Reproducción

```bash
grep -rcE "console\\.(log|error|warn)" public/js/*.js public/js/*.jsx | sort -t: -k2 -n -r
```

Resultado:
```
public/js/app.js:           18
public/js/patches-v5.js:     6
public/js/horarios-v2.js:    2
public/js/admin.js:          2
public/js/solicitudes.js:    1
public/js/patches-v4.js:     1
public/js/patches-v3.js:     1
public/js/api.js:            1
```

## Fix sugerido

### Estrategia: helper de log condicional

```js
// Al inicio de cada archivo grande:
const DEBUG = window.location.hostname === 'localhost' || window.location.search.includes('debug=1');
const log = DEBUG ? console.log.bind(console, '[lb]') : function(){};
const warn = console.warn.bind(console, '[lb]'); // siempre activo
const err = console.error.bind(console, '[lb]'); // siempre activo
```

Reemplazar `console.log(...)` por `log(...)` excepto los que reportan
errores reales.

### Estrategia más simple: dejar los log de carga, eliminar los de loop

Mantener:
```js
console.log('[LuceBien] X v4 loaded');  // info útil de versionado
```

Eliminar:
```js
console.log('[Layout] loading for sede:', s);   // ruido en cada nav
console.log('[Layout] got 58 zonas');            // ruido
```

## Validar

Abrir DevTools → Console. Navegar entre 5 módulos. Contar líneas. Antes:
~30+. Después: <10.

## Reglas

- No tocar `console.error` ni `console.warn` (son útiles para diagnóstico).
- Solo limpiar `console.log` de loops o navegaciones frecuentes.
- Commit: `chore(ux): reducir console.log en navegación rutinaria`.
