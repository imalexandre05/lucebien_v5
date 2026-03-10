// ═══════════════════════════════════════════════════════
// LUCEBIEN · server.js v5.0
// ═══════════════════════════════════════════════════════
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { initDB } = require('./database/db');

const app  = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Rutas API ─────────────────────────────────────────
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/empleados',    require('./routes/empleados'));
app.use('/api/reportes',     require('./routes/reportes'));
app.use('/api/lavanderia',   require('./routes/lavanderia'));
app.use('/api/evaluaciones', require('./routes/evaluaciones'));
app.use('/api/incidencias',  require('./routes/incidencias'));
app.use('/api/valores',      require('./routes/valores'));
app.use('/api/actividades',  require('./routes/actividades'));
app.use('/api/prestamos',    require('./routes/prestamos'));
app.use('/api/garantias',    require('./routes/garantias'));
app.use('/api/pipeline',     require('./routes/pipeline'));
app.use('/api/solicitudes',  require('./routes/solicitudes'));
app.use('/api/config',       require('./routes/config'));

// ── API 404 ──────────────────────────────────────────
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada: ' + req.method + ' ' + req.originalUrl });
});

// ── SPA fallback ──────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Arranque ──────────────────────────────────────────
initDB();
app.listen(PORT, HOST, () => {
  const os = require('os');
  const nets = os.networkInterfaces();
  let localIP = 'localhost';
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) { localIP = iface.address; break; }
    }
  }
  console.log(`\n╔═══════════════════════════════════════════════╗`);
  console.log(`║   LUCEBIEN v5.0 · Servidor en línea ✓         ║`);
  console.log(`╠═══════════════════════════════════════════════╣`);
  console.log(`║  Local  →  http://localhost:${PORT}               ║`);
  console.log(`║  Red    →  http://${localIP}:${PORT}          ║`);
  console.log(`╚═══════════════════════════════════════════════╝\n`);
});
