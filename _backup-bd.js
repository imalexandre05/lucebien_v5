// ═══════════════════════════════════════════════════════════════════════
// LUCEBIEN · _backup-bd.js
//
// Backup automático de database/lucebien.db hacia database/backups/
//   - Frecuencia configurable (env BACKUP_INTERVAL_HOURS, default 24)
//   - Máximo de backups a conservar (env BACKUP_MAX_KEEP, default 14)
//   - Usa SQLite VACUUM INTO si está disponible (snapshot consistente
//     incluso con la BD en uso); si falla, fallback a copia de archivo
//   - Rota: borra los backups más viejos cuando excede el máximo
//   - Logging mínimo a consola con prefijo [backup]
// ═══════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

function nowStamp() {
  const d = new Date();
  return d.getFullYear()
    + String(d.getMonth()+1).padStart(2,'0')
    + String(d.getDate()).padStart(2,'0')
    + '_'
    + String(d.getHours()).padStart(2,'0')
    + String(d.getMinutes()).padStart(2,'0')
    + String(d.getSeconds()).padStart(2,'0');
}

function ejecutarBackup(getDB) {
  try {
    const dbPath = path.join(__dirname, 'database', 'lucebien.db');
    const backupDir = path.join(__dirname, 'database', 'backups');
    if (!fs.existsSync(dbPath)) {
      console.warn('[backup] No existe la BD en', dbPath);
      return null;
    }
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const stamp = nowStamp();
    const destFile = path.join(backupDir, `lucebien_auto_${stamp}.db`);

    let metodo = 'copy';
    try {
      // Preferimos VACUUM INTO porque hace un snapshot consistente
      // aunque la BD esté en uso (write skew safe).
      const db = getDB();
      db.exec(`VACUUM INTO '${destFile.replace(/'/g, "''").replace(/\\/g, '/')}'`);
      metodo = 'vacuum_into';
    } catch (eVacuum) {
      // Fallback: copia plana del archivo (puede capturar mid-write,
      // pero es mejor que nada si VACUUM no está disponible)
      try {
        fs.copyFileSync(dbPath, destFile);
      } catch (eCopy) {
        console.warn('[backup] Falló VACUUM y copia:', eCopy.message);
        return null;
      }
    }

    const sizeMB = (fs.statSync(destFile).size / (1024 * 1024)).toFixed(2);
    console.log('[backup] OK ·', metodo, '·', path.basename(destFile), '·', sizeMB, 'MB');

    // Rotación
    rotar(backupDir);
    return destFile;
  } catch (e) {
    console.warn('[backup] error:', e.message);
    return null;
  }
}

function rotar(backupDir) {
  try {
    const max = parseInt(process.env.BACKUP_MAX_KEEP) || 14;
    // Solo rotar los backups creados por este módulo (prefijo lucebien_auto_)
    // para no borrar backups manuales que el admin haya hecho.
    const archivos = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('lucebien_auto_') && f.endsWith('.db'))
      .map(f => ({ f, mtime: fs.statSync(path.join(backupDir, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);
    if (archivos.length > max) {
      const aBorrar = archivos.slice(max);
      aBorrar.forEach(({ f }) => {
        try { fs.unlinkSync(path.join(backupDir, f)); console.log('[backup] rotado:', f); }
        catch (e) {}
      });
    }
  } catch (e) {
    console.warn('[backup] rotación falló:', e.message);
  }
}

function iniciarSchedulerBackup(getDB) {
  const horas = parseFloat(process.env.BACKUP_INTERVAL_HOURS) || 24;
  const intervaloMs = horas * 60 * 60 * 1000;
  console.log('  Backup auto BD: ACTIVO (cada', horas, 'h, máx', (parseInt(process.env.BACKUP_MAX_KEEP) || 14), 'backups)');

  // Primer backup tras 30s del arranque, así no compite con la
  // inicialización ni la primera petición del usuario
  setTimeout(() => ejecutarBackup(getDB), 30 * 1000);
  setInterval(() => ejecutarBackup(getDB), intervaloMs);
}

module.exports = { iniciarSchedulerBackup, ejecutarBackup };
