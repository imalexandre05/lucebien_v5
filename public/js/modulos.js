// ═══════════════════════════════════════════════════════
// LUCEBIEN · public/js/modulos.js v5.4
// Préstamos por lote + Garantías Yape
// ═══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════
// PRÉSTAMO DE PRENDAS — Por lote, estado por prenda
// ══════════════════════════════════════════════════════
const EST_PREST = {
  prestada:  { label:'Prestada',  badge:'badge-gold',  icon:'📦' },
  alquilada: { label:'Alquilada (pend. retorno)', badge:'badge-blue', icon:'🔄' },
  devuelta:  { label:'Devuelta',  badge:'badge-green', icon:'✅' },
  vendida:   { label:'Vendida (baja)', badge:'badge-red', icon:'💰' },
  perdida:   { label:'Perdida/Extraviada', badge:'badge-red', icon:'❌' },
};

async function renderPrestamos() {
  const sede = STATE.sede;
  const lotes = await API.get('/prestamos?sede=' + encodeURIComponent(sede));
  if (!lotes) return;
  STATE.prestamosCache = lotes;

  // KPIs
  let totalItems=0, pendientes=0, alquiladas=0, vendidas=0;
  lotes.forEach(l => { totalItems += l.total_items||0; pendientes += l.pendientes||0;
    (l.items||[]).forEach(i => { if(i.estado==='alquilada') alquiladas++; if(i.estado==='vendida') vendidas++; });
  });
  const kpis = document.getElementById('prestKpis');
  if (kpis) kpis.innerHTML = `
    <div class="stat-card accent-navy"><div class="stat-label">Total lotes</div><div class="stat-val">${lotes.length}</div></div>
    <div class="stat-card accent-gold"><div class="stat-label">Pendientes</div><div class="stat-val" style="color:var(--gold-d)">${pendientes}</div></div>
    <div class="stat-card accent-blue"><div class="stat-label">Alquiladas</div><div class="stat-val" style="color:var(--blue)">${alquiladas}</div></div>
    <div class="stat-card accent-red"><div class="stat-label">Vendidas/Baja</div><div class="stat-val" style="color:var(--red)">${vendidas}</div></div>`;

  const badge = document.getElementById('prestPendBadge');
  if (badge) badge.textContent = pendientes + ' pendientes';

  // Lotes table
  const body = document.getElementById('prestLotesBody');
  if (!body) return;
  if (!lotes.length) { body.innerHTML = '<tr><td class="empty-cell" colspan="8">Sin préstamos registrados</td></tr>'; return; }

  var hoy = hoyLocal();
  body.innerHTML = lotes.filter(l => l.pendientes > 0 || l.fecha === hoy).map(l => {
    var esMiSede = (l.sede_origen === sede);
    var completo = l.pendientes === 0;
    return `<tr style="${completo ? 'opacity:.45;' : ''}${esMiSede && !completo ? 'background:rgba(59,130,246,.06);border-left:3px solid var(--navy)' : ''}">
      <td class="mono" style="font-size:11px">#${l.id}</td>
      <td class="mono" style="font-size:11px">${l.fecha}</td>
      <td>${SEDES[l.sede_origen]?.short || l.sede_origen}${esMiSede ? ' <span style="font-size:9px;color:var(--navy)">⬤ tu sede</span>' : ''}</td>
      <td>→ ${l.sede_destino === 'OTROS' ? '<span class="badge badge-gold">Externo</span>' : (SEDES[l.sede_destino]?.short || l.sede_destino)}</td>
      <td style="font-size:12px">${l.quien_lleva}</td>
      <td style="text-align:center;font-weight:700">${l.total_items}</td>
      <td style="text-align:center">${completo ? '<span class="badge badge-green">✅ Listo</span>' : '<span class="badge badge-gold">'+l.pendientes+'</span>'}</td>
      <td><button class="btn btn-ghost btn-xs" onclick="verDetallePrestamo(${l.id})">Ver detalle</button></td>
    </tr>`;
  }).join('') || '<tr><td class="empty-cell" colspan="8">Sin préstamos pendientes</td></tr>';

  // Bajas
  await renderBajas();
}

async function verDetallePrestamo(loteId) {
  const lote = await API.get('/prestamos/' + loteId);
  if (!lote) return;
  const wrap = document.getElementById('prestDetalleWrap');
  if (!wrap) return;
  wrap.classList.remove('hidden');

  const sede = STATE.sede;
  const esOrigenODest = (lote.sede_origen === sede || lote.sede_destino === sede);
  const esAdmin = STATE.user?.rol === 'admin' || STATE.user?.rol === 'dueno' || STATE.user?.rol === 'encargado_almacen';

  let h = `<div class="card">
    <div class="card-header">
      <span class="card-title">📦 Lote #${lote.id} — ${lote.fecha}</span>
      <button class="btn btn-ghost btn-xs" onclick="document.getElementById('prestDetalleWrap').classList.add('hidden')">✕ Cerrar</button>
    </div>
    <div class="card-body">
      <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;margin-bottom:14px">
        <div><strong>Origen:</strong> ${SEDES[lote.sede_origen]?.label || lote.sede_origen}</div>
        <div><strong>Destino:</strong> ${lote.sede_destino === 'OTROS' ? 'Externo' : (SEDES[lote.sede_destino]?.label || lote.sede_destino)}</div>
        <div><strong>Lleva:</strong> ${lote.quien_lleva}</div>
        <div><strong>Registró:</strong> ${lote.responsable_registro}</div>
        ${lote.obs ? '<div><strong>Obs:</strong> ' + lote.obs + '</div>' : ''}
      </div>
      <table class="data-table">
        <thead><tr><th>Código</th><th>Descripción</th><th>Estado</th><th>Fecha cambio</th><th>Obs.</th>${esOrigenODest ? '<th>Acciones</th>' : ''}</tr></thead>
        <tbody>`;

  (lote.items || []).forEach(i => {
    const est = EST_PREST[i.estado] || { label: i.estado, badge: 'badge-gray', icon: '?' };
    h += `<tr>
      <td><span class="badge badge-navy mono">${i.codigo}</span></td>
      <td style="font-size:12px">${i.descripcion || '—'}</td>
      <td><span class="badge ${est.badge}">${est.icon} ${est.label}</span></td>
      <td class="mono" style="font-size:10px;color:var(--text3)">${i.fecha_estado || '—'}</td>
      <td style="font-size:11px;color:var(--text3)">${i.obs_estado || '—'}${i.cambiado_por ? ' <span style="font-size:9px">('+i.cambiado_por+')</span>' : ''}</td>`;

    if (esOrigenODest) {
      h += '<td><div style="display:flex;gap:3px;flex-wrap:wrap">';
      if (i.estado === 'prestada') {
        h += `<button class="btn btn-ghost btn-xs" onclick="cambiarEstadoItem(${i.id},'alquilada')">🔄 Alquilado</button>`;
        h += `<button class="btn btn-ghost btn-xs" onclick="cambiarEstadoItem(${i.id},'devuelta')">✅ Devuelta</button>`;
        h += `<button class="btn btn-ghost btn-xs" style="color:var(--red)" onclick="cambiarEstadoItem(${i.id},'vendida')">💰 Vendida</button>`;
      }
      if (i.estado === 'alquilada') {
        h += `<button class="btn btn-ghost btn-xs" onclick="cambiarEstadoItem(${i.id},'devuelta')">✅ Devuelta</button>`;
        h += `<button class="btn btn-ghost btn-xs" style="color:var(--red)" onclick="cambiarEstadoItem(${i.id},'vendida')">💰 Vendida</button>`;
        h += `<button class="btn btn-ghost btn-xs" style="color:var(--red)" onclick="cambiarEstadoItem(${i.id},'perdida')">❌ Perdida</button>`;
      }
      if (i.estado === 'prestada') {
        h += `<button class="btn btn-ghost btn-xs" style="color:var(--red)" onclick="cambiarEstadoItem(${i.id},'perdida')">❌ Perdida</button>`;
      }
      h += '</div></td>';
    }
    h += '</tr>';
  });

  h += '</tbody></table></div></div>';
  wrap.innerHTML = h;
}

async function cambiarEstadoItem(itemId, estado) {
  if (estado === 'vendida' || estado === 'perdida') {
    var prev = document.getElementById('prestObsModal'); if (prev) prev.remove();
    var label = estado === 'vendida' ? '💰 Marcar como Vendida' : '❌ Marcar como Perdida';
    var h = '<div id="prestObsModal" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px" onclick="this.remove()">';
    h += '<div style="background:#fff;border-radius:14px;padding:24px;width:95%;max-width:400px" onclick="event.stopPropagation()">';
    h += '<div class="modal-header"><h2>' + label + '</h2><button class="modal-close" onclick="document.getElementById(\'prestObsModal\').remove()">✕</button></div>';
    h += '<div style="padding:16px 0"><div class="field"><label>Observación</label>';
    h += '<textarea id="prestObsInput" placeholder="Detalla el motivo..." style="width:100%;min-height:60px;padding:10px;border-radius:8px;border:1.5px solid var(--border);font-size:13px;box-sizing:border-box;resize:vertical"></textarea></div></div>';
    h += '<div style="display:flex;gap:8px"><button class="btn btn-ghost" style="flex:1" onclick="document.getElementById(\'prestObsModal\').remove()">Cancelar</button>';
    h += '<button class="btn btn-primary" style="flex:1;background:#dc2626" onclick="confirmarCambioEstadoItem(' + itemId + ',\'' + estado + '\')">Confirmar</button></div>';
    h += '</div></div>';
    document.body.insertAdjacentHTML('beforeend', h);
    return;
  }
  const r = await API.put('/prestamos/item/' + itemId + '/estado', { estado: estado, obs: '', sede: STATE.sede });
  if (!r || !r.ok) { showToast('Error: ' + (r?.error || 'desconocido'), 'error'); return; }
  showToast('✅ → ' + (EST_PREST[estado]?.label || estado), 'success');
  const loteId = STATE.prestamosCache?.find(l => (l.items||[]).some(i => i.id === itemId))?.id;
  if (loteId) await verDetallePrestamo(loteId);
  await renderPrestamos();
}

async function confirmarCambioEstadoItem(itemId, estado) {
  var obs = document.getElementById('prestObsInput')?.value || '';
  document.getElementById('prestObsModal')?.remove();
  const r = await API.put('/prestamos/item/' + itemId + '/estado', { estado: estado, obs: obs, sede: STATE.sede });
  if (!r || !r.ok) { showToast('Error: ' + (r?.error || 'desconocido'), 'error'); return; }
  showToast(estado === 'vendida' ? '💰 Vendida → Lista de baja' : '❌ Perdida → Lista de baja', 'success');
  const loteId = STATE.prestamosCache?.find(l => (l.items||[]).some(i => i.id === itemId))?.id;
  if (loteId) await verDetallePrestamo(loteId);
  await renderPrestamos();
}

function abrirModalPrestamo() {
  document.getElementById('prestFecha').value = hoyLocal();
  document.getElementById('prestDestino').value = '';
  document.getElementById('prestObs').value = '';

  // Populate quien lleva — all employees + "Otro"
  const sel = document.getElementById('prestQuien');
  sel.innerHTML = '<option value="">— Seleccionar —</option>';
  (STATE.empleadosCache || []).forEach(e => {
    const o = document.createElement('option');
    o.value = e.nombre;
    o.textContent = e.nombre + ' (' + ((e.tiendas || [])[0] || '—') + ')';
    sel.appendChild(o);
  });
  const oOtro = document.createElement('option');
  oOtro.value = '__otro__'; oOtro.textContent = '— Otro (escribir nombre) —';
  sel.appendChild(oOtro);
  sel.onchange = function() {
    if (sel.value === '__otro__') {
      const nombre = prompt('Nombre de quien se lleva las prendas:');
      if (nombre) { const o = document.createElement('option'); o.value = nombre; o.textContent = nombre + ' (externo)'; sel.insertBefore(o, sel.lastChild); sel.value = nombre; }
      else sel.value = '';
    }
  };

  // Items list — start with one empty
  document.getElementById('prestItemsWrap').innerHTML = '';
  addPrestItem();
  openModal('prestModal');
}

function addPrestItem() {
  const wrap = document.getElementById('prestItemsWrap');
  const idx = wrap.children.length;
  const div = document.createElement('div');
  div.className = 'prest-item-row';
  div.style.cssText = 'display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-s)';
  div.innerHTML = `
    <input type="text" class="pi-codigo inline-input" placeholder="Código" style="width:100px;font-weight:700">
    <input type="text" class="pi-desc inline-input" placeholder="Descripción (color, talla, tipo)" style="flex:1">
    <button class="btn btn-danger btn-xs" onclick="this.parentElement.remove()" style="flex-shrink:0">✕</button>`;
  wrap.appendChild(div);
  div.querySelector('.pi-codigo').focus();
}

async function guardarPrestamo() {
  const destino = document.getElementById('prestDestino').value;
  const quien = document.getElementById('prestQuien').value;
  const obs = document.getElementById('prestObs').value.trim();
  const fecha = document.getElementById('prestFecha').value;

  if (!destino) { showToast('Selecciona tienda destino', 'error'); return; }
  if (!quien) { showToast('Selecciona quién se lleva las prendas', 'error'); return; }

  const items = [];
  document.querySelectorAll('.prest-item-row').forEach(row => {
    const codigo = row.querySelector('.pi-codigo')?.value?.trim();
    const desc = row.querySelector('.pi-desc')?.value?.trim();
    if (codigo) items.push({ codigo, descripcion: desc || '' });
  });

  if (!items.length) { showToast('Agrega al menos una prenda', 'error'); return; }

  const r = await API.post('/prestamos', {
    sede_origen: STATE.sede,
    sede_destino: destino,
    quien_lleva: quien,
    items: items,
    obs: obs,
    fecha: fecha
  });

  if (!r || !r.ok) { showToast('Error: ' + (r?.error || ''), 'error'); return; }
  closeModal('prestModal');
  await renderPrestamos();
  showToast('✅ Préstamo #' + r.id + ' registrado — ' + items.length + ' prendas', 'success');
}

// ── BAJAS ──
async function renderBajas() {
  const lista = await API.get('/prestamos/bajas/list');
  const body = document.getElementById('bajasBody');
  if (!body) return;

  const pend = (lista || []).filter(b => !b.procesada).length;
  const badge = document.getElementById('bajaPendBadge');
  if (badge) badge.textContent = pend + ' pendientes';

  if (!lista || !lista.length) { body.innerHTML = '<tr><td class="empty-cell" colspan="8">Sin prendas de baja</td></tr>'; return; }

  const esAdmin = STATE.user?.rol === 'admin' || STATE.user?.rol === 'dueno' || STATE.user?.rol === 'encargado_almacen';

  body.innerHTML = lista.map(b => `
    <tr style="${b.procesada ? 'opacity:.5' : ''}">
      <td><span class="badge badge-navy mono">${b.codigo}</span></td>
      <td style="font-size:12px">${b.descripcion || '—'}</td>
      <td>${SEDES[b.sede_origen]?.short || b.sede_origen}</td>
      <td>→ ${SEDES[b.sede_destino]?.short || b.sede_destino || '—'}</td>
      <td><span class="badge ${b.motivo === 'perdida' ? 'badge-red' : 'badge-gold'}">${b.motivo === 'perdida' ? '❌ Perdida' : '💰 Vendida'}</span></td>
      <td class="mono" style="font-size:11px">${b.fecha}</td>
      <td>${b.procesada
        ? '<span class="badge badge-green">✅ Procesada</span><div style="font-size:9px;color:var(--text3)">' + (b.procesada_por||'') + ' · ' + (b.fecha_procesada||'') + '</div>'
        : '<span class="badge badge-gold">Pendiente</span>'}</td>
      <td>${!b.procesada && esAdmin ? '<button class="btn btn-primary btn-xs" onclick="procesarBaja(' + b.id + ')">Dar de baja en Tuxedo</button>' : ''}</td>
    </tr>`).join('');
}

async function procesarBaja(id) {
  showConfirm('¿Confirmar baja en Tuxedo?', 'Se marcará como procesada', async () => {
    const r = await API.put('/prestamos/bajas/' + id + '/procesar', {});
    if (!r || !r.ok) { showToast('Error', 'error'); return; }
    await renderBajas();
    showToast('✅ Prenda dada de baja', 'success');
  }, '🗑️');
}

// ══════════════════════════════════════════════════════
// MÓDULO: DEVOLUCIÓN DE GARANTÍA (YAPE)
// ══════════════════════════════════════════════════════

async function renderGarantias() {
  const sede = STATE.sede;
  const [lista, resumen] = await Promise.all([
    API.get('/garantias?tienda=' + encodeURIComponent(sede)),
    API.get('/garantias/resumen?tienda=' + encodeURIComponent(sede)),
  ]);
  if (!lista) return;
  STATE.garantiasCache = lista;

  const el = document.getElementById('garResumen');
  if (el && resumen) el.innerHTML = `
    <span class="badge badge-gold">📱 ${resumen.pendientes.n} pendientes · S/${resumen.pendientes.total.toFixed(2)}</span>
    <span class="badge badge-green">✅ ${resumen.devueltos.n} devueltos · S/${resumen.devueltos.total.toFixed(2)}</span>`;

  const body = document.getElementById('garantiasBody');
  if (!body) return;
  if (!lista.length) { body.innerHTML = '<tr><td class="empty-cell" colspan="9">Sin devoluciones registradas</td></tr>'; return; }

  body.innerHTML = lista.map(g => `
    <tr style="${g.estado === 'devuelto' ? 'opacity:0.5' : ''}">
      <td class="mono" style="font-size:11px">${g.fecha_registro}</td>
      <td style="font-weight:600">${g.nombre_cliente}</td>
      <td class="mono">${g.celular}</td>
      <td class="mono" style="font-size:11px">${g.num_boleta || '—'}</td>
      <td style="font-weight:700;color:var(--navy)">S/${Number(g.monto).toFixed(2)}</td>
      <td>${SEDES[g.tienda]?.short || g.tienda}</td>
      <td style="font-size:12px">${g.responsable || '—'}</td>
      <td><span class="badge ${g.estado === 'pendiente' ? 'badge-gold' : 'badge-green'}">${g.estado}</span>
        ${g.fecha_devolucion ? '<div style="font-size:10px;color:var(--text3);margin-top:2px">' + g.fecha_devolucion + '</div>' : ''}
      </td>
      <td>${g.estado === 'pendiente' ? '<button class="btn btn-primary btn-xs" onclick="marcarGarantiaDevuelta(' + g.id + ')">📱 Yapear</button>' : ''}</td>
    </tr>`).join('');
}

function abrirModalGarantia() {
  document.getElementById('garNombre').value = '';
  document.getElementById('garCelular').value = '';
  document.getElementById('garBoleta').value = '';
  document.getElementById('garMonto').value = '';
  document.getElementById('garObs').value = '';
  document.getElementById('garTienda').value = STATE.sede;
  const selResp = document.getElementById('garResp');
  if (selResp) {
    selResp.innerHTML = '<option value="">Seleccionar...</option>' +
      (STATE.empleadosCache || []).map(e => `<option value="${e.nombre}">${e.nombre}</option>`).join('');
  }
  openModal('garModal');
}

async function guardarGarantia() {
  const data = {
    nombre_cliente: document.getElementById('garNombre').value.trim(),
    celular: document.getElementById('garCelular').value.trim(),
    num_boleta: document.getElementById('garBoleta').value.trim(),
    monto: parseFloat(document.getElementById('garMonto').value) || 0,
    tienda: document.getElementById('garTienda').value,
    responsable: document.getElementById('garResp').value,
    obs: document.getElementById('garObs').value.trim(),
  };
  if (!data.nombre_cliente) { showToast('Ingresa el nombre del cliente', 'error'); return; }
  if (!data.celular) { showToast('Ingresa el número de celular', 'error'); return; }
  if (!data.monto || data.monto <= 0) { showToast('Ingresa el monto', 'error'); return; }
  const r = await API.post('/garantias', data);
  if (!r) return;
  closeModal('garModal');
  await renderGarantias();
  showToast('✅ Devolución de garantía registrada', 'success');
}

async function marcarGarantiaDevuelta(id) {
  showConfirm('¿Confirmar Yape enviado?', 'Se marcará como devuelto', async () => {
    const r = await API.put('/garantias/' + id, { estado: 'devuelto', responsable: STATE.user?.nombre });
    if (!r) return;
    await renderGarantias();
    showToast('✅ Garantía devuelta por Yape', 'success');
  }, '📱');
}
