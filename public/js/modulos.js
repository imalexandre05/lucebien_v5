// ═══════════════════════════════════════════════════════
// LUCEBIEN · public/js/modulos.js — Préstamos + Garantías
// ═══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════
// MÓDULO: PRÉSTAMO DE PRENDAS
// ══════════════════════════════════════════════════════

async function renderPrestamos() {
  const sede = STATE.sede;
  const lista = await API.get('/prestamos?sede=' + encodeURIComponent(sede));
  if (!lista) return;
  STATE.prestamosCache = lista;
  const body = document.getElementById('prestamosBody');
  if (!body) return;

  // Resumen
  const pend = lista.filter(p => p.estado === 'prestado').length;
  const alq  = lista.filter(p => p.estado === 'alquilado').length;
  const vend = lista.filter(p => p.estado === 'vendido').length;
  const el = document.getElementById('prestResumen');
  if (el) el.innerHTML = `<span class="badge badge-gold">${pend} prestados</span> <span class="badge badge-blue">${alq} alquilados</span> <span class="badge badge-green">${vend} vendidos</span>`;

  if (!lista.length) { body.innerHTML = '<tr><td class="empty-cell" colspan="10">Sin préstamos registrados</td></tr>'; return; }
  const stBadge = { prestado: 'badge-gold', alquilado: 'badge-blue', vendido: 'badge-green', devuelto: 'badge-navy' };
  body.innerHTML = lista.map(p => `
    <tr>
      <td class="mono" style="font-size:11px">${p.fecha}</td>
      <td><span class="badge badge-navy">${p.codigo}</span></td>
      <td style="font-size:12px">${p.tipo_prenda} · ${p.color} · ${p.talla}</td>
      <td>${SEDES[p.tienda_origen]?.short || p.tienda_origen}</td>
      <td>→ ${SEDES[p.tienda_destino]?.short || p.tienda_destino}</td>
      <td style="font-size:12px">${p.quien_lleva || '—'}</td>
      <td style="font-size:12px">${p.responsable || '—'}</td>
      <td><span class="badge ${stBadge[p.estado] || 'badge-gray'}">${p.estado}</span>
        ${p.devuelto ? '<span class="badge badge-green" style="margin-left:2px">devuelto</span>' : ''}
        ${p.para_lavanderia ? '<span class="badge badge-blue" style="margin-left:2px">→lav</span>' : ''}
      </td>
      <td>
        ${p.estado === 'prestado' ? `
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-xs" onclick="cambiarEstadoPrestamo(${p.id},'alquilado')">Alquilado</button>
            <button class="btn btn-ghost btn-xs" onclick="cambiarEstadoPrestamo(${p.id},'vendido')">Vendido</button>
          </div>` : ''}
        ${p.estado === 'alquilado' && !p.devuelto ? `
          <button class="btn btn-ghost btn-xs" onclick="marcarDevueltoPrestamo(${p.id})">✓ Devuelto</button>` : ''}
        ${p.devuelto && !p.para_lavanderia ? `
          <button class="btn btn-ghost btn-xs" onclick="marcarParaLavanderia(${p.id})">→ Lavandería</button>` : ''}
      </td>
    </tr>`).join('');
}

function abrirModalPrestamo() {
  document.getElementById('prestFecha').value = new Date().toISOString().slice(0, 10);
  document.getElementById('prestCodigo').value = '';
  document.getElementById('prestQuien').value = '';
  document.getElementById('prestTipo').value = 'Terno completo';
  document.getElementById('prestColor').value = '';
  document.getElementById('prestTalla').value = 'M';
  document.getElementById('prestObs').value = '';
  // Tienda origen = sede actual
  const selOrigen = document.getElementById('prestOrigen');
  if (selOrigen) selOrigen.value = STATE.sede;
  // Responsable = empleados de sede
  const selResp = document.getElementById('prestResp');
  if (selResp) {
    selResp.innerHTML = '<option value="">Seleccionar...</option>' +
      (STATE.empleadosCache || []).map(e => `<option value="${e.nombre}">${e.nombre}</option>`).join('');
  }
  openModal('prestModal');
}

async function guardarPrestamo() {
  const data = {
    fecha: document.getElementById('prestFecha').value,
    codigo: document.getElementById('prestCodigo').value.trim(),
    quien_lleva: document.getElementById('prestQuien').value.trim(),
    tienda_origen: document.getElementById('prestOrigen').value,
    tienda_destino: document.getElementById('prestDestino').value,
    tipo_prenda: document.getElementById('prestTipo').value,
    color: document.getElementById('prestColor').value,
    talla: document.getElementById('prestTalla').value,
    responsable: document.getElementById('prestResp').value,
    obs: document.getElementById('prestObs').value.trim(),
  };
  if (!data.codigo) { showToast('Ingresa el código de la prenda', 'error'); return; }
  if (!data.tienda_destino || data.tienda_destino === data.tienda_origen) { showToast('Elige una tienda de destino diferente', 'error'); return; }
  const r = await API.post('/prestamos', data);
  if (!r) return;
  closeModal('prestModal');
  await renderPrestamos();
  showToast('✅ Préstamo registrado', 'success');
}

async function cambiarEstadoPrestamo(id, estado) {
  const r = await API.put('/prestamos/' + id, { estado });
  if (!r) return;
  await renderPrestamos();
  if (estado === 'vendido') showToast('📋 Prenda registrada para dar de baja', 'info');
  else showToast('✅ Estado actualizado', 'success');
}

async function marcarDevueltoPrestamo(id) {
  await API.put('/prestamos/' + id, { devuelto: true });
  await renderPrestamos();
  showToast('✅ Prenda devuelta', 'success');
}

async function marcarParaLavanderia(id) {
  await API.put('/prestamos/' + id, { para_lavanderia: true });
  await renderPrestamos();
  showToast('✅ Marcada para lavandería', 'success');
}

// ── BAJAS ──
async function renderBajas() {
  const lista = await API.get('/prestamos/bajas?tienda=' + encodeURIComponent(STATE.sede));
  const body = document.getElementById('bajasBody');
  if (!body) return;
  if (!lista || !lista.length) { body.innerHTML = '<tr><td class="empty-cell" colspan="7">Sin prendas de baja</td></tr>'; return; }
  body.innerHTML = lista.map(b => `
    <tr>
      <td class="mono" style="font-size:11px">${b.fecha}</td>
      <td><span class="badge badge-navy">${b.codigo}</span></td>
      <td>${b.tipo_prenda} · ${b.color} · ${b.talla}</td>
      <td>${SEDES[b.tienda]?.short || b.tienda}</td>
      <td style="font-size:12px">${b.motivo || '—'}</td>
      <td style="font-size:12px">${b.responsable || '—'}</td>
    </tr>`).join('');
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

  // Resumen
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
        ${g.fecha_devolucion ? `<div style="font-size:10px;color:var(--text3);margin-top:2px">${g.fecha_devolucion}</div>` : ''}
      </td>
      <td>
        ${g.estado === 'pendiente' ? `
          <button class="btn btn-primary btn-xs" onclick="marcarGarantiaDevuelta(${g.id})">📱 Yapear</button>` : ''}
      </td>
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
