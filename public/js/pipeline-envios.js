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

let pipelineView = 'kanban'; // 'kanban' o 'tabla'

// ── RENDER PRINCIPAL ──
async function renderPipeline() {
  // Stats
  const stats = await API.get('/pipeline/stats');
  if (stats) {
    const el = document.getElementById('pipeStats');
    if (el) {
      el.innerHTML = Object.entries(stats.stats).map(([k,v]) =>
        `<span class="badge" style="background:${ETAPA_COLORS[k]};color:#333;margin:2px">${stats.labels[k]||k}: <strong>${v}</strong></span>`
      ).join('') + `<span class="badge badge-navy" style="margin:2px">Total: ${stats.total}</span>`;
    }
  }
  if (pipelineView === 'kanban') await renderPipelineKanban();
  else await renderPipelineTabla();
}

function togglePipelineView(view) {
  pipelineView = view;
  document.getElementById('btnViewKanban')?.classList.toggle('btn-primary', view==='kanban');
  document.getElementById('btnViewKanban')?.classList.toggle('btn-ghost', view!=='kanban');
  document.getElementById('btnViewTabla')?.classList.toggle('btn-primary', view==='tabla');
  document.getElementById('btnViewTabla')?.classList.toggle('btn-ghost', view!=='tabla');
  renderPipeline();
}

// ── VISTA KANBAN ──
async function renderPipelineKanban() {
  const data = await API.get('/pipeline/kanban');
  if (!data) return;
  const container = document.getElementById('pipelineContent');
  if (!container) return;

  container.innerHTML = `<div class="kanban-board" style="display:flex;gap:10px;overflow-x:auto;padding-bottom:12px">
    ${data.etapas.map(et => `
      <div class="kanban-col" style="min-width:180px;max-width:220px;flex-shrink:0">
        <div style="padding:8px 10px;background:${ETAPA_COLORS[et]};border-radius:8px 8px 0 0;font-size:12px;font-weight:700;text-align:center">
          ${ETAPA_ICONS[et]||''} ${data.labels[et]} <span class="badge badge-navy" style="margin-left:4px;font-size:10px">${(data.kanban[et]||[]).length}</span>
        </div>
        <div class="kanban-cards" style="background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.08);border-top:0;border-radius:0 0 8px 8px;padding:6px;min-height:120px;max-height:60vh;overflow-y:auto">
          ${(data.kanban[et]||[]).length === 0 ? '<div style="font-size:11px;color:var(--text3);text-align:center;padding:20px">Vacío</div>' :
            (data.kanban[et]||[]).map(p => `
              <div class="kanban-card" style="background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:6px;padding:8px;margin-bottom:6px;cursor:pointer;font-size:12px;transition:box-shadow .15s" onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.12)'" onmouseout="this.style.boxShadow='none'" onclick="abrirDetallePrenda(${p.id})">
                <div style="font-weight:700;color:var(--navy)">${p.codigo}</div>
                <div style="font-size:10px;color:var(--text3)">${p.tipo} · ${p.color} · ${p.talla}</div>
                <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">
                  <span class="badge ${TIPO_LAV_BADGE[p.tipo_lavado]||'badge-gray'}" style="font-size:9px">${p.tipo_lavado||'?'}</span>
                  ${p.necesita_compostura ? '<span class="badge badge-red" style="font-size:9px">compostura</span>' : ''}
                  <span style="font-size:9px;color:var(--text3)">${SEDES[p.sede_origen]?.short||p.sede_origen}</span>
                </div>
                <div style="margin-top:6px;display:flex;gap:3px">
                  ${getAvanzarBtns(p, et)}
                </div>
              </div>
            `).join('')}
        </div>
      </div>
    `).join('')}
  </div>`;
}

// ── VISTA TABLA ──
async function renderPipelineTabla() {
  const prendas = await API.get('/pipeline?no_enviado=1&limit=300');
  if (!prendas) return;
  const container = document.getElementById('pipelineContent');
  if (!container) return;

  container.innerHTML = `<div style="overflow-x:auto"><table class="data-table">
    <thead><tr><th>Código</th><th>Prenda</th><th>Origen</th><th>Lavado</th><th>Etapa</th><th>Ingreso</th><th>Acciones</th></tr></thead>
    <tbody>${prendas.length === 0 ? '<tr><td class="empty-cell" colspan="7">Sin prendas en proceso</td></tr>' :
      prendas.map(p => `<tr>
        <td><span class="badge badge-navy">${p.codigo}</span></td>
        <td style="font-size:12px">${p.tipo} · ${p.color} · ${p.talla}</td>
        <td>${SEDES[p.sede_origen]?.short||p.sede_origen}</td>
        <td><span class="badge ${TIPO_LAV_BADGE[p.tipo_lavado]||'badge-gray'}">${p.tipo_lavado||'—'}</span></td>
        <td><span style="background:${ETAPA_COLORS[p.etapa]};padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600">${ETAPA_ICONS[p.etapa]||''} ${p.etapa}</span>
          ${p.necesita_compostura?'<span class="badge badge-red" style="font-size:9px;margin-left:3px">comp.</span>':''}
        </td>
        <td class="mono" style="font-size:10px">${p.fecha_ingreso}</td>
        <td><div style="display:flex;gap:3px;flex-wrap:wrap">${getAvanzarBtns(p, p.etapa)}</div></td>
      </tr>`).join('')}
    </tbody></table></div>`;
}

// Botones de acción según etapa
function getAvanzarBtns(p, etapa) {
  const btn = (label, destino, extra='') =>
    `<button class="btn btn-ghost btn-xs" style="font-size:10px;padding:2px 6px" onclick="event.stopPropagation();avanzarPrenda(${p.id},'${destino}'${extra})">${label}</button>`;
  switch(etapa) {
    case 'recepcion':
      return `<select class="inline-select" style="font-size:10px;width:80px" id="lav-${p.id}" onclick="event.stopPropagation()">
        <option value="normal">Normal</option><option value="seco">Seco</option><option value="especializado">Espec.</option>
      </select>${btn('→Lavar','lavado',`,{tipo_lavado:document.getElementById('lav-${p.id}')?.value}`)}`;
    case 'lavado': return btn('→Empatar','empatado');
    case 'empatado': return btn('→Revisar','revision');
    case 'revision': return btn('→Refacc.','refaccion') + btn('→Compost.','compostura');
    case 'refaccion': return btn('→Planchar','planchado');
    case 'compostura': return btn('→Planchar','planchado');
    case 'planchado': return btn('→Control','control_calidad');
    case 'control_calidad': return btn('✅Aprobado','listo') + `<button class="btn btn-ghost btn-xs" style="font-size:10px;padding:2px 6px;color:var(--red)" onclick="event.stopPropagation();rechazarPrenda(${p.id})">❌Rechazar</button>`;
    case 'listo': return `<input type="checkbox" class="prenda-envio-check" value="${p.id}" onclick="event.stopPropagation()" style="width:16px;height:16px">`;
    default: return '';
  }
}

async function avanzarPrenda(id, destino, extra) {
  const body = { etapa_destino: destino, responsable: STATE.user?.nombre };
  if (extra?.tipo_lavado) body.tipo_lavado = extra.tipo_lavado;
  if (destino === 'compostura') body.necesita_compostura = true;
  const r = await API.put('/pipeline/' + id + '/avanzar', body);
  if (r) renderPipeline();
}

async function rechazarPrenda(id) {
  const etapa = prompt('¿A qué etapa devolver? (refaccion / lavado / revision)', 'refaccion');
  if (!etapa) return;
  const obs = prompt('Observación del rechazo:', '');
  await API.put('/pipeline/' + id + '/rechazar', { etapa_destino: etapa, obs: obs||'' });
  renderPipeline();
}

function abrirDetallePrenda(id) {
  // TODO: modal con historial completo
  API.get('/pipeline/' + id + '/historial').then(hist => {
    if (!hist) return;
    const html = hist.map(h => `<div style="font-size:12px;padding:4px 0;border-bottom:1px solid rgba(0,0,0,0.05)">
      <strong>${h.etapa_nueva}</strong> ${h.etapa_anterior ? '← '+h.etapa_anterior : ''}
      <span style="color:var(--text3);font-size:10px;margin-left:8px">${h.fecha}</span>
      ${h.responsable ? '<span style="font-size:10px"> · '+h.responsable+'</span>' : ''}
      ${h.obs ? '<div style="font-size:11px;color:var(--text2);margin-top:2px">'+h.obs+'</div>' : ''}
    </div>`).join('');
    // Simple alert for now - can be replaced with modal
    const d = document.createElement('div');
    d.innerHTML = `<div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center" onclick="this.remove()">
      <div style="background:#fff;border-radius:12px;padding:24px;max-width:400px;max-height:80vh;overflow-y:auto" onclick="event.stopPropagation()">
        <h3 style="margin:0 0 12px">Historial de Prenda</h3>
        ${html || '<p style="color:var(--text3)">Sin historial</p>'}
        <button class="btn btn-ghost" style="margin-top:12px;width:100%" onclick="this.closest('[style*=fixed]').remove()">Cerrar</button>
      </div>
    </div>`;
    document.body.appendChild(d.firstElementChild);
  });
}

// ── INGRESO DESDE TIENDA ──
function abrirIngresoPipeline() {
  document.getElementById('pipeIngCodigo').value = '';
  document.getElementById('pipeIngTipo').value = 'Terno completo';
  document.getElementById('pipeIngColor').value = '';
  document.getElementById('pipeIngTalla').value = 'M';
  openModal('pipeIngresoModal');
}

async function ingresarPrendaPipeline() {
  const data = {
    codigo: document.getElementById('pipeIngCodigo').value.trim(),
    tipo: document.getElementById('pipeIngTipo').value,
    color: document.getElementById('pipeIngColor').value,
    talla: document.getElementById('pipeIngTalla').value,
    sede_origen: STATE.sede,
    tipo_lavado: 'normal',
  };
  if (!data.codigo) { showToast('Ingresa el código', 'error'); return; }
  const r = await API.post('/pipeline', data);
  if (!r) return;
  closeModal('pipeIngresoModal');
  showToast('✅ Prenda ingresada al pipeline', 'success');
  renderPipeline();
}

// ── ENVÍO A TIENDA ──
function prepararEnvio() {
  const checks = document.querySelectorAll('.prenda-envio-check:checked');
  if (!checks.length) { showToast('Selecciona prendas listas para enviar', 'error'); return; }
  const ids = Array.from(checks).map(c => parseInt(c.value));
  document.getElementById('envioCount').textContent = ids.length;
  document.getElementById('envioIds').value = JSON.stringify(ids);
  document.getElementById('envioDestino').value = '';
  openModal('envioModal');
}

async function ejecutarEnvio() {
  const ids = JSON.parse(document.getElementById('envioIds').value || '[]');
  const destino = document.getElementById('envioDestino').value;
  if (!destino) { showToast('Selecciona destino', 'error'); return; }
  const r = await API.post('/pipeline/enviar', { prenda_ids: ids, sede_destino: destino, responsable: STATE.user?.nombre });
  if (!r) return;
  closeModal('envioModal');
  showToast(`✅ Envío #${r.envio_id} creado — ${r.count} prendas`, 'success');
  renderPipeline();
}

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

// ── SOLICITUDES ──
async function renderSolicitudes() {
  const solis = await API.get('/solicitudes?sede=' + encodeURIComponent(STATE.sede));
  const body = document.getElementById('solicitudesBody');
  if (!body || !solis) return;
  if (!solis.length) { body.innerHTML = '<tr><td class="empty-cell" colspan="7">Sin solicitudes</td></tr>'; return; }
  const stBadge = { pendiente:'badge-gold', aprobada:'badge-green', rechazada:'badge-red', completada:'badge-navy' };
  body.innerHTML = solis.map(s => `
    <tr>
      <td class="mono" style="font-size:11px">${s.fecha}</td>
      <td>${SEDES[s.sede_solicitante]?.short||s.sede_solicitante}</td>
      <td>→ ${SEDES[s.sede_destino]?.short||s.sede_destino}</td>
      <td style="font-size:12px">${s.solicitante}</td>
      <td style="font-size:12px">${(s.items||[]).map(i=>`${i.tipo_prenda} ${i.color} ${i.talla}`).join(', ')||'—'}</td>
      <td><span class="badge ${stBadge[s.estado]||'badge-gray'}">${s.estado}</span></td>
      <td>${s.estado==='pendiente' && s.sede_destino===STATE.sede ? `
        <button class="btn btn-ghost btn-xs" onclick="responderSolicitud(${s.id},'aprobada')">✅</button>
        <button class="btn btn-ghost btn-xs" onclick="responderSolicitud(${s.id},'rechazada')">❌</button>` : ''}</td>
    </tr>`).join('');
}

async function responderSolicitud(id, estado) {
  await API.put('/solicitudes/' + id, { estado });
  renderSolicitudes();
  showToast(estado === 'aprobada' ? '✅ Solicitud aprobada' : '❌ Solicitud rechazada', 'success');
}

function abrirModalSolicitud() {
  document.getElementById('soliDestino').value = '';
  document.getElementById('soliObs').value = '';
  document.getElementById('soliItemsContainer').innerHTML = '';
  agregarItemSolicitud();
  openModal('soliModal');
}

function agregarItemSolicitud() {
  const c = document.getElementById('soliItemsContainer');
  const n = c.children.length;
  const div = document.createElement('div');
  div.className = 'grid-2';
  div.style.marginBottom = '8px';
  div.innerHTML = `
    <div class="field mb-0"><input type="text" id="soliTipo${n}" placeholder="Tipo prenda"></div>
    <div class="field mb-0" style="display:flex;gap:4px">
      <input type="text" id="soliColor${n}" placeholder="Color" style="flex:1">
      <input type="text" id="soliTalla${n}" placeholder="Talla" style="width:60px">
      <input type="number" id="soliCant${n}" value="1" min="1" style="width:50px">
    </div>`;
  c.appendChild(div);
}

async function enviarSolicitud() {
  const destino = document.getElementById('soliDestino').value;
  if (!destino) { showToast('Elige destino', 'error'); return; }
  const items = [];
  const c = document.getElementById('soliItemsContainer');
  for (let i = 0; i < c.children.length; i++) {
    const tipo = document.getElementById('soliTipo'+i)?.value;
    if (!tipo) continue;
    items.push({
      tipo_prenda: tipo,
      color: document.getElementById('soliColor'+i)?.value || '',
      talla: document.getElementById('soliTalla'+i)?.value || '',
      cantidad: parseInt(document.getElementById('soliCant'+i)?.value) || 1,
    });
  }
  if (!items.length) { showToast('Agrega al menos una prenda', 'error'); return; }
  const r = await API.post('/solicitudes', {
    sede_solicitante: STATE.sede, sede_destino: destino,
    solicitante: STATE.user?.nombre, items,
    obs: document.getElementById('soliObs')?.value || ''
  });
  if (!r) return;
  closeModal('soliModal');
  showToast('✅ Solicitud enviada', 'success');
  renderSolicitudes();
}
