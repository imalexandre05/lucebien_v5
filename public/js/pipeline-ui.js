// ═══════════════════════════════════════════════════════
// LUCEBIEN · public/js/pipeline-ui.js
// Pipeline de prendas: Vista Kanban + Tabla + Envíos
// ═══════════════════════════════════════════════════════

const ETAPA_COLORS = {
  recepcion:'#e3f2fd', lavado:'#e8eaf6', empatado:'#f3e5f5',
  revision:'#fff3e0', refaccion:'#fff8e1', compostura:'#fce4ec',
  planchado:'#e0f7fa', control_calidad:'#e8f5e9', listo:'#c8e6c9'
};
const ETAPA_ICONS = {
  recepcion:'📥', lavado:'🧼', empatado:'🔗', revision:'🔍',
  refaccion:'🧵', compostura:'✂️', planchado:'👔', control_calidad:'✅', listo:'📦'
};
const TIPO_LAV_BADGE = { normal:'badge-blue', seco:'badge-gold', especializado:'badge-purple' };

// ── ENVÍOS RECIBIDOS (vista tienda) ──
async function renderEnviosRecibidos() {
  const envios = await API.get('/pipeline/envios?sede_destino=' + encodeURIComponent(STATE.sede));
  const body = document.getElementById('enviosRecibidosBody');
  if (!body || !envios) return;
  const pendientes = envios.filter(e => !e.validado_tienda);
  document.getElementById('enviosPendBadge').textContent = pendientes.length ? pendientes.length + ' pendientes' : 'Todo validado';
  if (!envios.length) { body.innerHTML = '<tr><td class="empty-cell" colspan="6">Sin envíos</td></tr>'; return; }
  body.innerHTML = envios.map(e => `
    <tr style="${e.validado_tienda ? 'background:rgba(0,0,0,0.02);opacity:0.6' : ''}">
      <td class="mono">#${e.id}</td>
      <td class="mono" style="font-size:11px">${e.fecha}</td>
      <td>${e.count} prendas</td>
      <td style="font-size:12px">${e.responsable||'—'}</td>
      <td><span class="badge ${e.validado_tienda ? 'badge-green' : 'badge-gold'}">${e.validado_tienda ? '✓ Validado' : 'Pendiente'}</span></td>
      <td>${!e.validado_tienda ? `<button class="btn btn-primary btn-xs" onclick="calificarEnvio(${e.id})">Calificar</button>` : ''}</td>
    </tr>`).join('');
}

async function calificarEnvio(envioId) {
  const envios = await API.get('/pipeline/envios?sede_destino=' + encodeURIComponent(STATE.sede));
  const envio = envios?.find(e => e.id === envioId);
  if (!envio) return;
  const body = document.getElementById('calEnvioPrendas');
  document.getElementById('calEnvioId').value = envioId;
  body.innerHTML = envio.prendas.map(p => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid rgba(0,0,0,0.05)">
      <span class="badge badge-navy">${p.codigo}</span>
      <span style="flex:1;font-size:12px">${p.tipo} · ${p.color} · ${p.talla}</span>
      <select class="inline-select" id="cal-${p.id}" style="width:120px">
        <option value="1">✅ Bien</option>
        <option value="0">❌ Observado</option>
      </select>
      <input class="inline-input" id="cal-obs-${p.id}" placeholder="Obs." style="width:120px">
    </div>`).join('');
  openModal('calEnvioModal');
}

async function enviarCalificacionEnvio() {
  const envioId = document.getElementById('calEnvioId').value;
  const envios = await API.get('/pipeline/envios?sede_destino=' + encodeURIComponent(STATE.sede));
  const envio = envios?.find(e => e.id === parseInt(envioId));
  if (!envio) return;
  const calificaciones = envio.prendas.map(p => ({
    prenda_id: p.id,
    aceptada: document.getElementById('cal-'+p.id)?.value === '1',
    obs: document.getElementById('cal-obs-'+p.id)?.value || ''
  }));
  const r = await API.put('/pipeline/envios/' + envioId + '/calificar', { calificaciones });
  if (!r) return;
  closeModal('calEnvioModal');
  showToast(r.rechazos ? '⚠️ Prendas observadas devueltas al pipeline' : '✅ Envío validado', r.rechazos ? 'warning' : 'success');
  renderEnviosRecibidos();
}

