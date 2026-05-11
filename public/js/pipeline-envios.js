// ═══════════════════════════════════════════════════════════════
// LUCEBIEN · public/js/pipeline-envios.js
// Vista de "Envíos Recibidos" en TIENDA + modal de calificación.
// (Antes vivía en pipeline-ui.js junto a la versión legacy del kanban
//  de almacén; esa versión fue reemplazada por almacen-kanban.jsx y
//  removida en `chore/limpiar-pipeline-legacy`.)
// ═══════════════════════════════════════════════════════════════

async function renderEnviosRecibidos() {
  // Cargar prendas + accesorios en paralelo
  await Promise.all([_renderEnviosPrendas(), _renderEnviosAccesorios()]);
}

async function _renderEnviosPrendas() {
  const envios = await API.get('/pipeline/envios?sede_destino=' + encodeURIComponent(STATE.sede));
  const body = document.getElementById('enviosRecibidosBody');
  if (!body || !envios) return;
  const pendientes = envios.filter(e => !e.validado_tienda);
  const badge = document.getElementById('enviosPendBadge');
  if (badge) {
    badge.textContent = 'Prendas: ' + (pendientes.length ? pendientes.length + ' pendientes' : 'al día');
    badge.className = 'badge ' + (pendientes.length ? 'badge-gold' : 'badge-green');
  }
  if (!envios.length) { body.innerHTML = '<tr><td class="empty-cell" colspan="6">Sin envíos de prendas</td></tr>'; return; }
  body.innerHTML = envios.map(e => `
    <tr class="envios-rec-row${e.validado_tienda ? ' calificado' : ''}">
      <td class="mono">#${e.id}</td>
      <td class="mono" style="font-size:11px">${e.fecha}</td>
      <td><strong>${e.count}</strong> prenda${e.count===1?'':'s'}</td>
      <td>${e.responsable||'—'}</td>
      <td><span class="badge ${e.validado_tienda ? 'badge-green' : 'badge-gold'}">${e.validado_tienda ? 'Validado' : 'Pendiente'}</span></td>
      <td>${!e.validado_tienda ? `<button class="btn btn-primary btn-xs" onclick="calificarEnvio(${e.id})">Calificar</button>` : '<span style="font-size:11px;color:var(--text3)">—</span>'}</td>
    </tr>`).join('');
}

// Caché de envíos de accesorios (para el modal de validación)
let _enviosAccCache = [];

async function _renderEnviosAccesorios() {
  const envios = await API.get('/pipeline/envios-accesorios?sede_destino=' + encodeURIComponent(STATE.sede));
  const body = document.getElementById('enviosAccRecibidosBody');
  if (!body) return;
  _enviosAccCache = envios || [];
  const pendientes = _enviosAccCache.filter(e => !e.validado_tienda);
  const badge = document.getElementById('enviosAccPendBadge');
  if (badge) {
    badge.textContent = 'Accesorios: ' + (pendientes.length ? pendientes.length + ' pendientes' : 'al día');
    badge.className = 'badge ' + (pendientes.length ? 'badge-gold' : 'badge-green');
  }
  if (!_enviosAccCache.length) { body.innerHTML = '<tr><td class="empty-cell" colspan="6">Sin envíos de accesorios</td></tr>'; return; }
  body.innerHTML = _enviosAccCache.map(e => {
    const items = e.items || [];
    const totalItems = items.reduce((s, i) => s + (i.cantidad || 0), 0);
    const resumen = items.length
      ? items.slice(0, 3).map(i => `${i.cantidad||0}× ${i.tipo||i.nombre||''}`).join(', ') + (items.length > 3 ? '…' : '')
      : '—';
    return `
    <tr class="envios-rec-row${e.validado_tienda ? ' calificado' : ''}">
      <td class="mono">#${e.id}</td>
      <td class="mono" style="font-size:11px">${e.fecha}</td>
      <td><strong>${totalItems}</strong> <span style="font-size:10px;color:var(--text3)">(${resumen})</span></td>
      <td>${e.responsable||'—'}</td>
      <td><span class="badge ${e.validado_tienda ? 'badge-green' : 'badge-gold'}">${e.validado_tienda ? 'Validado' : 'Pendiente'}</span></td>
      <td>${!e.validado_tienda ? `<button class="btn btn-primary btn-xs" onclick="abrirValidarEnvioAcc(${e.id})">Validar</button>` : '<span style="font-size:11px;color:var(--text3)">—</span>'}</td>
    </tr>`;
  }).join('');
}

function abrirValidarEnvioAcc(envioId) {
  const envio = _enviosAccCache.find(e => e.id === envioId);
  if (!envio) { showToast('Envío no encontrado', 'error'); return; }
  document.getElementById('valEnvioAccId').value = envioId;
  document.getElementById('valEnvioAccObs').value = envio.obs || '';
  const cont = document.getElementById('valEnvioAccItems');
  const items = envio.items || [];
  if (!items.length) {
    cont.innerHTML = '<div style="padding:14px;color:var(--text3);font-size:12px;text-align:center">Sin detalle de items</div>';
  } else {
    cont.innerHTML = '<table class="data-table" style="font-size:12px">' +
      '<thead><tr><th>Tipo</th><th style="text-align:right">Cantidad</th><th>Sustento</th></tr></thead><tbody>' +
      items.map(i => `<tr>
        <td>${i.tipo||i.nombre||'—'}</td>
        <td style="text-align:right;font-family:var(--font-m);font-weight:700">${i.cantidad||0}</td>
        <td style="font-size:11px;color:var(--text3)">${i.obs||i.sustento||i.detalle||'—'}</td>
      </tr>`).join('') +
      '</tbody></table>';
  }
  openModal('valEnvioAccModal');
}

async function validarEnvioAcc() {
  const envioId = document.getElementById('valEnvioAccId').value;
  const obs = document.getElementById('valEnvioAccObs').value || '';
  const r = await API.put('/pipeline/envios-accesorios/' + envioId + '/validar', { obs });
  if (!r) return;
  closeModal('valEnvioAccModal');
  showToast('Envío de accesorios validado', 'success');
  _renderEnviosAccesorios();
}

// Etapas a las que la tienda puede devolver una prenda observada.
// Por defecto vuelve a 'recepcion' (reinicia todo el proceso) pero la tienda
// puede acotar el retorno a la etapa donde estuvo el problema, evitando trabajo
// extra. Resuelve hallazgo B1 de la auditoría.
const CAL_ETAPAS_RETORNO = [
  ['control_calidad','Control Calidad'],
  ['planchado','Planchado'],
  ['compostura','Compostura'],
  ['refaccion','Refacción'],
  ['empatado','Empatado'],
  ['lavado','Lavado'],
  ['recepcion','Recepción (reiniciar)']
];

async function calificarEnvio(envioId) {
  const envios = await API.get('/pipeline/envios?sede_destino=' + encodeURIComponent(STATE.sede));
  const envio = envios?.find(e => e.id === envioId);
  if (!envio) return;
  const body = document.getElementById('calEnvioPrendas');
  document.getElementById('calEnvioId').value = envioId;
  const etapasOpts = CAL_ETAPAS_RETORNO
    .map(([v,l]) => `<button type="button" class="cal-ret-chip${v==='recepcion'?' active':''}" data-val="${v}" onclick="setCalRetorno(${envio.prendas.length?envio.prendas[0].id:0},this)">${l}</button>`)
    .join('');
  // El estado de cada prenda se guarda en data-attributes del row para que el render
  // sea independiente y se vea claro cuál botón está activo.
  body.innerHTML = envio.prendas.map((p,i) => `
    <div class="cal-row" data-pid="${p.id}" data-aceptada="1">
      <div class="cal-row-head">
        <span class="badge badge-navy mono cal-row-code">${p.codigo}</span>
        <span class="cal-row-info">${p.tipo} · ${p.color} · ${p.talla}</span>
        <div class="cal-row-toggle" role="group" aria-label="Calificar ${p.codigo}">
          <button type="button" class="cal-btn cal-btn-bien active" onclick="setCalEstado(${p.id},1)">
            <span class="cal-btn-icon">✓</span> Bien
          </button>
          <button type="button" class="cal-btn cal-btn-obs" onclick="setCalEstado(${p.id},0)">
            <span class="cal-btn-icon">!</span> Observado
          </button>
        </div>
      </div>
      <div class="cal-row-detail" style="display:none">
        <div class="cal-row-section">
          <div class="cal-row-label">¿A qué etapa vuelve?</div>
          <div class="cal-ret-chips" data-pid="${p.id}">
            ${CAL_ETAPAS_RETORNO.map(([v,l])=>`<button type="button" class="cal-ret-chip${v==='recepcion'?' active':''}" data-val="${v}" onclick="setCalRetorno(${p.id},this)">${l}</button>`).join('')}
          </div>
        </div>
        <div class="cal-row-section">
          <div class="cal-row-label">Observación</div>
          <input class="cal-row-obs" id="cal-obs-${p.id}" placeholder="Describe el problema (ej: mancha en solapa, costura suelta…)">
        </div>
      </div>
    </div>`).join('');
  openModal('calEnvioModal');
}

// Marca una prenda como Bien (1) u Observado (0). Cambia el estado del row,
// muestra/oculta el bloque de detalle (etapa destino + obs) y actualiza el active
// de los botones. Mucho más visual que un select.
function setCalEstado(prendaId, aceptada) {
  const row = document.querySelector(`.cal-row[data-pid="${prendaId}"]`);
  if (!row) return;
  row.dataset.aceptada = String(aceptada);
  row.querySelector('.cal-btn-bien')?.classList.toggle('active', aceptada === 1);
  row.querySelector('.cal-btn-obs')?.classList.toggle('active', aceptada === 0);
  const detail = row.querySelector('.cal-row-detail');
  if (detail) detail.style.display = aceptada === 0 ? '' : 'none';
}

// Marca el chip de etapa destino activo dentro del row de una prenda observada.
function setCalRetorno(prendaId, btn) {
  const chips = btn.parentElement;
  if (!chips) return;
  chips.querySelectorAll('.cal-ret-chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

async function enviarCalificacionEnvio() {
  const envioId = document.getElementById('calEnvioId').value;
  const calificaciones = Array.from(document.querySelectorAll('.cal-row')).map(row => {
    const pid = parseInt(row.dataset.pid);
    const aceptada = row.dataset.aceptada === '1';
    const out = {
      prenda_id: pid,
      aceptada: aceptada,
      obs: document.getElementById('cal-obs-' + pid)?.value || ''
    };
    if (!aceptada) {
      const activeChip = row.querySelector('.cal-ret-chip.active');
      out.etapa_destino = activeChip?.dataset.val || 'recepcion';
    }
    return out;
  });
  const r = await API.put('/pipeline/envios/' + envioId + '/calificar', { calificaciones });
  if (!r) return;
  closeModal('calEnvioModal');
  if (r.rechazos) {
    showToast(`${r.rechazos} prenda(s) observada(s) devueltas al pipeline`, 'warning');
  } else {
    showToast('Envío validado', 'success');
  }
  renderEnviosRecibidos();
}

// SOLICITUDES — el código moderno vive en /js/solicitudes.js (esquema multi-estado)
