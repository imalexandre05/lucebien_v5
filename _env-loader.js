// ═══════════════════════════════════════════════════════════════════════
// LUCEBIEN · _env-loader.js
//
// Loader minimal para cargar variables desde .env sin depender de
// la librería dotenv. Hace lo mínimo:
//   - Lee .env en la raíz del proyecto
//   - Cada línea KEY=VALUE (ignora líneas vacías y las que empiezan con #)
//   - Setea process.env[KEY] solo si la variable aún NO está definida
//     (las variables del entorno real tienen prioridad)
//
// Uso: require('./_env-loader')();
// ═══════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

module.exports = function loadEnv(file) {
  const filePath = file || path.join(__dirname, '.env');
  if (!fs.existsSync(filePath)) {
    console.log('  [env] No .env found at', filePath, '— usando valores por defecto del código');
    return false;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/);
    let count = 0;
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx <= 0) return;
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      // Quitar comillas dobles o simples opcionales
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = val;
        count++;
      }
    });
    console.log('  [env] Cargadas', count, 'variable(s) desde .env');
    return true;
  } catch (e) {
    console.warn('  [env] No se pudo leer .env:', e.message);
    return false;
  }
};
